-- Per-company branding used on generated document headers.
alter table companies
  add column if not exists document_logo_path text;

