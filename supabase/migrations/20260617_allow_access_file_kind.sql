alter table public.ga_promotion_month_files
drop constraint if exists ga_promotion_month_files_kind_check;

alter table public.ga_promotion_month_files
add constraint ga_promotion_month_files_kind_check
check (kind = any (array['workbook'::text, 'office'::text, 'template'::text, 'access'::text]));
