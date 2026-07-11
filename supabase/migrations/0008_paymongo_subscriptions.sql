-- PayMongo recurring subscription support.

alter table companies drop constraint if exists companies_billing_status_check;

alter table companies
  add column if not exists pending_billing_plan text
    check (pending_billing_plan is null or pending_billing_plan in ('core','business','pro','enterprise')),
  add column if not exists paymongo_customer_id text,
  add column if not exists paymongo_subscription_id text,
  add column if not exists paymongo_plan_id text,
  add column if not exists paymongo_subscription_status text,
  add column if not exists subscription_current_period_end timestamptz,
  add constraint companies_billing_status_check
    check (billing_status in (
      'free','checkout_pending','subscription_pending','active','past_due',
      'unpaid','expired','cancelled','custom'
    ));

create table if not exists paymongo_subscription_plans (
  id uuid primary key default gen_random_uuid(),
  plan text not null check (plan in ('core','business','pro')),
  employee_count int not null check (employee_count > 0),
  amount_centavos int not null check (amount_centavos > 0),
  paymongo_plan_id text not null unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (plan, employee_count)
);

create table if not exists paymongo_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  paymongo_subscription_id text not null unique,
  paymongo_customer_id text,
  paymongo_plan_id text,
  plan text not null check (plan in ('core','business','pro')),
  employee_count int not null check (employee_count > 0),
  amount_centavos int not null check (amount_centavos > 0),
  billing_reference text not null unique,
  status text not null default 'incomplete',
  current_period_end timestamptz,
  latest_invoice_id text,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_paymongo_subscriptions_company on paymongo_subscriptions(company_id);
create index if not exists idx_paymongo_subscriptions_status on paymongo_subscriptions(status);
create index if not exists idx_companies_paymongo_subscription on companies(paymongo_subscription_id);
create index if not exists idx_companies_paymongo_customer on companies(paymongo_customer_id);

alter table paymongo_subscription_plans enable row level security;
alter table paymongo_subscriptions enable row level security;
