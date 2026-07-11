-- Kawani AI SaaS plans and billing metadata.
-- Converts legacy premium/enterprise billing into the new Free/Core/Business/Pro/Enterprise model.

alter table companies drop constraint if exists companies_plan_check;

alter table companies
  add column if not exists billing_employee_count int,
  add column if not exists billing_reference text,
  add column if not exists paid_until timestamptz,
  add column if not exists billing_status text default 'free'
    check (billing_status in ('free','checkout_pending','active','expired','custom'));

update companies
set plan = case
  when plan = 'premium' then 'business'
  when plan in ('free','core','business','pro','enterprise') then plan
  else 'free'
end;

update companies
set paid_until = coalesce(paid_until, plan_expires_at)
where plan_expires_at is not null;

update companies
set billing_status = case
  when plan = 'free' then 'free'
  when plan = 'enterprise' then 'custom'
  when coalesce(paid_until, plan_expires_at) is not null
    and coalesce(paid_until, plan_expires_at) < now() then 'expired'
  else 'active'
end
where billing_status is null or billing_status = 'free';

alter table companies
  alter column plan set default 'free',
  add constraint companies_plan_check
    check (plan in ('free','core','business','pro','enterprise'));

create index if not exists idx_companies_plan on companies(plan);
create index if not exists idx_companies_paid_until on companies(paid_until);
