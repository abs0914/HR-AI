-- Paid plans expire; an expired premium/enterprise behaves as free (checked in app code).
alter table companies add column if not exists plan_expires_at timestamptz;
