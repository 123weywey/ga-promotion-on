(() => {
  const decoder = new TextDecoder("utf-8");

  function readUInt16(view, offset) {
    return view.getUint16(offset, true);
  }

  function readUInt32(view, offset) {
    return view.getUint32(offset, true);
  }

  function findEndOfCentralDirectory(view) {
    const minOffset = Math.max(0, view.byteLength - 0xffff - 22);
    for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
      if (readUInt32(view, offset) === 0x06054b50) return offset;
    }
    throw new Error("엑셀 파일 구조를 읽을 수 없습니다. .xlsx 총괄판 파일인지 확인해주세요.");
  }

  async function inflateRaw(bytes) {
    if (!("DecompressionStream" in window)) {
      throw new Error("현재 브라우저가 엑셀 압축 해제를 지원하지 않습니다. 최신 Edge/Chrome에서 다시 열어주세요.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzipEntries(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const eocdOffset = findEndOfCentralDirectory(view);
    const entryCount = readUInt16(view, eocdOffset + 10);
    let centralOffset = readUInt32(view, eocdOffset + 16);
    const entries = new Map();

    for (let index = 0; index < entryCount; index += 1) {
      if (readUInt32(view, centralOffset) !== 0x02014b50) break;
      const compression = readUInt16(view, centralOffset + 10);
      const compressedSize = readUInt32(view, centralOffset + 20);
      const fileNameLength = readUInt16(view, centralOffset + 28);
      const extraLength = readUInt16(view, centralOffset + 30);
      const commentLength = readUInt16(view, centralOffset + 32);
      const localHeaderOffset = readUInt32(view, centralOffset + 42);
      const fileNameBytes = new Uint8Array(arrayBuffer, centralOffset + 46, fileNameLength);
      const fileName = decoder.decode(fileNameBytes).replaceAll("\\", "/");

      const localNameLength = readUInt16(view, localHeaderOffset + 26);
      const localExtraLength = readUInt16(view, localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(arrayBuffer, dataOffset, compressedSize);
      let content;
      if (compression === 0) content = compressed;
      else if (compression === 8) content = await inflateRaw(compressed);
      else throw new Error(`${fileName} 압축 방식을 지원하지 않습니다.`);

      entries.set(fileName, content);
      centralOffset += 46 + fileNameLength + extraLength + commentLength;
    }
    return entries;
  }

  function xmlText(entries, path) {
    const content = entries.get(path);
    if (!content) return "";
    return decoder.decode(content);
  }

  function parseXml(xml) {
    return new DOMParser().parseFromString(xml, "application/xml");
  }

  function normalizePath(path) {
    const parts = [];
    path.split("/").forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") parts.pop();
      else parts.push(part);
    });
    return parts.join("/");
  }

  function columnIndexFromRef(ref) {
    const letters = String(ref || "").match(/[A-Z]+/i)?.[0] || "";
    let index = 0;
    for (const letter of letters.toUpperCase()) {
      index = index * 26 + letter.charCodeAt(0) - 64;
    }
    return Math.max(index - 1, 0);
  }

  function readSharedStrings(entries) {
    const xml = xmlText(entries, "xl/sharedStrings.xml");
    if (!xml) return [];
    return [...parseXml(xml).querySelectorAll("si")].map((item) =>
      [...item.querySelectorAll("t")].map((node) => node.textContent || "").join("")
    );
  }

  function readWorkbookSheets(entries) {
    const workbook = parseXml(xmlText(entries, "xl/workbook.xml"));
    const rels = parseXml(xmlText(entries, "xl/_rels/workbook.xml.rels"));
    const relTargets = {};
    rels.querySelectorAll("Relationship").forEach((rel) => {
      relTargets[rel.getAttribute("Id")] = normalizePath(`xl/${rel.getAttribute("Target") || ""}`);
    });
    return [...workbook.querySelectorAll("sheet")].map((sheet) => {
      const id = sheet.getAttribute("r:id") || sheet.getAttribute("id");
      return {
        name: sheet.getAttribute("name") || "Sheet",
        path: relTargets[id]
      };
    }).filter((sheet) => sheet.path);
  }

  function readCellValue(cell, sharedStrings) {
    const type = cell.getAttribute("t");
    if (type === "inlineStr") {
      return [...cell.querySelectorAll("t")].map((node) => node.textContent || "").join("");
    }

    const raw = cell.querySelector("v")?.textContent ?? "";
    if (type === "s") return sharedStrings[Number(raw)] ?? "";
    if (type === "b") return raw === "1";
    if (type === "str") return raw;
    if (raw === "") return "";
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : raw;
  }

  function readSheetRows(entries, sheetPath, sharedStrings) {
    const xml = xmlText(entries, sheetPath);
    if (!xml) return [];
    const sheet = parseXml(xml);
    return [...sheet.querySelectorAll("sheetData row")].map((row) => {
      const values = [];
      row.querySelectorAll("c").forEach((cell, fallbackIndex) => {
        const index = cell.getAttribute("r") ? columnIndexFromRef(cell.getAttribute("r")) : fallbackIndex;
        values[index] = readCellValue(cell, sharedStrings);
      });
      return values;
    });
  }

  async function readWorkbook(file) {
    if (!/\.xlsx$/i.test(file.name)) {
      throw new Error("ZIP이 아닌 .xlsx 총괄판 파일을 업로드해주세요.");
    }
    const entries = await unzipEntries(await file.arrayBuffer());
    const sharedStrings = readSharedStrings(entries);
    return readWorkbookSheets(entries).map((sheet) => ({
      name: sheet.name,
      rows: readSheetRows(entries, sheet.path, sharedStrings)
    }));
  }

  async function readZipEntries(file) {
    return unzipEntries(await file.arrayBuffer());
  }

  window.XlsxLite = { readWorkbook, readZipEntries };
})();
