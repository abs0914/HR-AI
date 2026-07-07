-- Company policy knowledge base — grounds "What is our policy on X?" chat answers.
-- ponytail: Postgres full-text search, not pgvector; add embeddings when keyword search measurably falls short.
create table company_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  category text default 'general',
  content text not null,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) stored
);

create index idx_policies_company on company_policies(company_id);
create index idx_policies_search on company_policies using gin(search_vector);

alter table company_policies enable row level security;

-- every member of the company may read policies (that's the point of a handbook)
create policy policies_select on company_policies for select
  using (company_id = get_current_company_id());
create policy policies_write on company_policies for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));
