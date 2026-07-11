-- Platform-admin control plane for Kawani AI.

create table if not exists platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'super_admin'
    check (role in ('super_admin','support_admin','billing_admin')),
  status text not null default 'active'
    check (status in ('active','disabled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into platform_admins (user_id, email, role, status)
select id, 'admin@kawaniai.com', 'super_admin', 'active'
from auth.users
where lower(email) = 'admin@kawaniai.com'
on conflict (email) do update set
  user_id = coalesce(excluded.user_id, platform_admins.user_id),
  role = 'super_admin',
  status = 'active',
  updated_at = now();

create table if not exists payment_gateway_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique default 'paymongo'
    check (provider in ('paymongo')),
  status text not null default 'active'
    check (status in ('active','paused','disabled')),
  mode text not null default 'test'
    check (mode in ('test','live')),
  webhook_url text,
  notes text,
  last_webhook_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into payment_gateway_settings (provider, status, mode, webhook_url)
values ('paymongo', 'active', 'test', 'https://kawaniai.com/api/billing/webhook')
on conflict (provider) do nothing;

create table if not exists api_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  token_prefix text not null unique,
  token_hash text not null,
  status text not null default 'active'
    check (status in ('active','paused','revoked')),
  monthly_quota_tokens int not null default 0 check (monthly_quota_tokens >= 0),
  used_tokens int not null default 0 check (used_tokens >= 0),
  allowed_origins text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_platform_admins_email on platform_admins(lower(email));
create index if not exists idx_api_subscriptions_company on api_subscriptions(company_id);
create index if not exists idx_api_subscriptions_status on api_subscriptions(status);

alter table platform_admins enable row level security;
alter table payment_gateway_settings enable row level security;
alter table api_subscriptions enable row level security;
