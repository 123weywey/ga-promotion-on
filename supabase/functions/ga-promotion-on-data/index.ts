const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const adminPassword = Deno.env.get("GA_PROMOTION_ADMIN_PASSWORD") ?? "1111";
const bucketName = "ga-promotion-on";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

function decodeBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function safeStorageName(name: string) {
  const fallback = "upload";
  const safe = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || fallback;
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return response;
}

async function upsertJsonRow(table: string, row: Record<string, unknown>, conflict: string) {
  const response = await supabaseFetch(`/rest/v1/${table}?on_conflict=${conflict}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(row),
  });
  return await response.json();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Supabase function environment is not configured." }, { status: 500 });
    }

    const url = new URL(request.url);
    const month = Number(url.searchParams.get("month") || "6");
    const downloadKind = url.searchParams.get("kind");

    if (request.method === "GET") {
      if (downloadKind) {
        const fileResponse = await supabaseFetch(
          `/rest/v1/ga_promotion_month_files?month=eq.${month}&kind=eq.${encodeURIComponent(downloadKind)}&select=*`
        );
        const [fileRow] = await fileResponse.json();
        if (!fileRow?.storage_path) {
          return jsonResponse({ error: "Uploaded file not found." }, { status: 404 });
        }
        const objectResponse = await supabaseFetch(
          `/storage/v1/object/${bucketName}/${encodeURIComponent(fileRow.storage_path).replaceAll("%2F", "/")}`
        );
        const bytes = await objectResponse.arrayBuffer();
        return new Response(bytes, {
          headers: {
            ...corsHeaders,
            "Content-Type": fileRow.mime_type || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(fileRow.file_name || "download")}"`,
            "Cache-Control": "no-store",
          },
        });
      }

      const bundleResponse = await supabaseFetch(`/rest/v1/ga_promotion_month_bundles?month=eq.${month}&select=*`);
      const filesResponse = await supabaseFetch(`/rest/v1/ga_promotion_month_files?month=eq.${month}&select=*`);
      const bundleRows = await bundleResponse.json();
      const fileRows = await filesResponse.json();
      return jsonResponse({ month, bundle: bundleRows[0] ?? null, files: fileRows });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, { status: 405 });
    }

    const body = await request.json();
    if (body.password !== adminPassword) {
      return jsonResponse({ error: "Invalid admin password" }, { status: 401 });
    }

    const targetMonth = Number(body.month || month);
    const savedFiles = [];

    for (const file of body.files ?? []) {
      if (!file?.kind || !file?.name || !file?.base64) continue;
      const storagePath = `2026-${String(targetMonth).padStart(2, "0")}/${file.kind}/${safeStorageName(file.name)}`;
      const bytes = decodeBase64(file.base64);
      await supabaseFetch(`/storage/v1/object/${bucketName}/${encodeURIComponent(storagePath).replaceAll("%2F", "/")}`, {
        method: "POST",
        headers: {
          "Content-Type": file.mimeType || "application/octet-stream",
          "x-upsert": "true",
        },
        body: bytes,
      });

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${encodeURIComponent(storagePath).replaceAll("%2F", "/")}`;
      const [saved] = await upsertJsonRow("ga_promotion_month_files", {
        month: targetMonth,
        kind: file.kind,
        file_name: file.name,
        mime_type: file.mimeType || "application/octet-stream",
        storage_path: storagePath,
        public_url: publicUrl,
        size_bytes: bytes.byteLength,
        updated_at: new Date().toISOString(),
      }, "month,kind");
      savedFiles.push(saved);
    }

    const existingBundleResponse = await supabaseFetch(`/rest/v1/ga_promotion_month_bundles?month=eq.${targetMonth}&select=*`);
    const existingBundleRows = await existingBundleResponse.json();
    const existingBundle = existingBundleRows[0] ?? {};

    let savedBundle = null;
    if (body.branchData || body.promotionRows || body.officeMap || body.sourceMeta) {
      const [bundle] = await upsertJsonRow("ga_promotion_month_bundles", {
        month: targetMonth,
        branch_data: body.branchData ?? existingBundle.branch_data ?? {},
        promotion_rows: body.promotionRows ?? existingBundle.promotion_rows ?? [],
        office_map: body.officeMap ?? existingBundle.office_map ?? {},
        source_meta: {
          ...(existingBundle.source_meta ?? {}),
          ...(body.sourceMeta ?? {}),
        },
        updated_at: new Date().toISOString(),
      }, "month");
      savedBundle = bundle;
    }

    return jsonResponse({ ok: true, month: targetMonth, bundle: savedBundle, files: savedFiles });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
