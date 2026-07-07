-- HR AI (Kawani AI) — full schema, helpers, RLS, storage, default templates
create extension if not exists "uuid-ossp";

-- ============ TABLES ============

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text,
  industry text,
  address text,
  branches_note text,
  work_schedule text,
  employee_count text,
  timezone text default 'Asia/Manila',
  payroll_cycle text default 'semi-monthly',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','hr_admin','manager','accountant','employee')),
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, user_id)
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  address text,
  manager_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  title text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  position_id uuid references positions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null, -- link to login account for self-service
  employee_number text,
  first_name text not null,
  middle_name text,
  last_name text not null,
  email text,
  phone text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  supervisor_id uuid references employees(id) on delete set null,
  employment_status text default 'probationary' check (employment_status in
    ('applicant','probationary','regular','project_based','contractual','consultant','resigned','terminated','inactive')),
  employment_type text,
  salary_type text check (salary_type in ('monthly','semi_monthly','daily','hourly') or salary_type is null),
  salary_amount numeric,
  hire_date date,
  regularization_date date,
  separation_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table employee_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  document_type text not null,
  title text not null,
  file_url text,
  file_type text,
  content text, -- generated document body (plain text) for re-export
  status text default 'draft' check (status in ('draft','approved','archived')),
  version int default 1,
  generated_by_ai boolean default false,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  attendance_date date not null,
  time_in timestamptz,
  time_out timestamptz,
  break_minutes int default 0,
  late_minutes int default 0,
  undertime_minutes int default 0,
  overtime_minutes int default 0,
  status text default 'present' check (status in ('present','late','absent','undertime','on_leave','rest_day','holiday')),
  source text default 'manual' check (source in ('manual','import','biometric','ai_generated')),
  remarks text,
  approved_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (employee_id, attendance_date)
);

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  reason text,
  attachment_url text,
  status text default 'pending' check (status in ('draft','pending','approved','rejected','cancelled')),
  approver_id uuid,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table leave_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  leave_type text not null,
  balance numeric default 0,
  used numeric default 0,
  year int not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (employee_id, leave_type, year)
);

create table payroll_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status text default 'draft' check (status in ('draft','for_approval','approved','exported')),
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table payroll_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  payroll_period_id uuid not null references payroll_periods(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  days_worked numeric default 0,
  absences numeric default 0,
  late_minutes int default 0,
  undertime_minutes int default 0,
  overtime_minutes int default 0,
  allowances numeric default 0,
  deductions numeric default 0,
  cash_advances numeric default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (payroll_period_id, employee_id)
);

create table applicants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  applied_position text,
  resume_url text,
  resume_text text,
  ai_summary text,
  ai_score numeric,
  status text default 'new' check (status in ('new','reviewed','shortlisted','interview_scheduled','offered','hired','rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table document_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade, -- null = global default
  template_type text not null,
  title text not null,
  content text not null,
  variables jsonb default '[]',
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null,
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid,
  role text not null check (role in ('user','assistant','tool','system')),
  content text,
  metadata jsonb,
  created_at timestamptz default now()
);

create table ai_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  conversation_id uuid references ai_conversations(id) on delete set null,
  user_id uuid not null,
  action_type text not null,
  tool_name text not null,
  input jsonb,
  output jsonb,
  status text default 'pending' check (status in ('pending','approved','rejected','executed','failed')),
  requires_approval boolean default false,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid,
  employee_id uuid references employees(id) on delete set null,
  module text not null,
  action text not null,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create table compliance_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  reminder_type text not null,
  title text not null,
  description text,
  due_date date,
  status text default 'open' check (status in ('open','done','dismissed')),
  related_employee_id uuid references employees(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table company_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  holiday_date date not null,
  holiday_type text default 'regular',
  created_at timestamptz default now()
);

-- ============ INDEXES ============
create index idx_company_users_user on company_users(user_id);
create index idx_employees_company on employees(company_id);
create index idx_employees_supervisor on employees(supervisor_id);
create index idx_employees_user on employees(user_id);
create index idx_docs_company on employee_documents(company_id);
create index idx_docs_employee on employee_documents(employee_id);
create index idx_att_company_date on attendance_records(company_id, attendance_date);
create index idx_att_employee on attendance_records(employee_id);
create index idx_leave_company on leave_requests(company_id, status);
create index idx_leave_employee on leave_requests(employee_id);
create index idx_payroll_items_period on payroll_items(payroll_period_id);
create index idx_ai_messages_conv on ai_messages(conversation_id);
create index idx_ai_actions_company on ai_actions(company_id, status);
create index idx_audit_company_date on audit_logs(company_id, created_at);
create index idx_reminders_company on compliance_reminders(company_id, status);
create index idx_applicants_company on applicants(company_id, status);

-- ============ HELPER FUNCTIONS ============

create or replace function get_current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from company_users
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function get_current_user_role() returns text
language sql stable security definer set search_path = public as $$
  select role from company_users
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function is_owner() returns boolean
language sql stable as $$ select get_current_user_role() = 'owner' $$;

create or replace function is_hr_admin() returns boolean
language sql stable as $$ select get_current_user_role() = 'hr_admin' $$;

create or replace function is_manager() returns boolean
language sql stable as $$ select get_current_user_role() = 'manager' $$;

create or replace function is_accountant() returns boolean
language sql stable as $$ select get_current_user_role() = 'accountant' $$;

create or replace function is_employee() returns boolean
language sql stable as $$ select get_current_user_role() = 'employee' $$;

-- employee row ids the current user manages (direct reports + branch managed)
create or replace function managed_employee_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.id from employees e
  where e.company_id = get_current_company_id()
    and (
      e.supervisor_id in (select id from employees where user_id = auth.uid())
      or e.branch_id in (
        select b.id from branches b
        join employees me on me.id = b.manager_id
        where me.user_id = auth.uid()
      )
    );
$$;

create or replace function own_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from employees
  where user_id = auth.uid() and company_id = get_current_company_id()
  limit 1;
$$;

-- ============ ROW LEVEL SECURITY ============

alter table companies enable row level security;
alter table company_users enable row level security;
alter table branches enable row level security;
alter table departments enable row level security;
alter table positions enable row level security;
alter table employees enable row level security;
alter table employee_documents enable row level security;
alter table attendance_records enable row level security;
alter table leave_requests enable row level security;
alter table leave_balances enable row level security;
alter table payroll_periods enable row level security;
alter table payroll_items enable row level security;
alter table applicants enable row level security;
alter table document_templates enable row level security;
alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;
alter table ai_actions enable row level security;
alter table audit_logs enable row level security;
alter table compliance_reminders enable row level security;
alter table company_holidays enable row level security;

-- companies
create policy companies_select on companies for select
  using (id = get_current_company_id());
create policy companies_update on companies for update
  using (id = get_current_company_id() and (is_owner() or is_hr_admin()));
create policy companies_insert on companies for insert
  with check (auth.uid() is not null); -- onboarding: any authed user may create a company

-- company_users
create policy company_users_select on company_users for select
  using (company_id = get_current_company_id() or user_id = auth.uid());
create policy company_users_insert on company_users for insert
  with check (
    user_id = auth.uid() -- self-join during onboarding (first user becomes owner in app code)
    or (company_id = get_current_company_id() and is_owner())
  );
create policy company_users_update on company_users for update
  using (company_id = get_current_company_id() and is_owner());
create policy company_users_delete on company_users for delete
  using (company_id = get_current_company_id() and is_owner());

-- simple org tables: all members read, owner/hr_admin write
create policy branches_select on branches for select using (company_id = get_current_company_id());
create policy branches_write on branches for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));
create policy departments_select on departments for select using (company_id = get_current_company_id());
create policy departments_write on departments for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));
create policy positions_select on positions for select using (company_id = get_current_company_id());
create policy positions_write on positions for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));
create policy holidays_select on company_holidays for select using (company_id = get_current_company_id());
create policy holidays_write on company_holidays for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));

-- employees: owner/hr_admin/accountant full read; manager team read; employee own read.
-- NOTE: salary column masking for accountant/manager is enforced in the app layer
-- (server queries select explicit columns per role).
create policy employees_select on employees for select
  using (
    company_id = get_current_company_id() and (
      is_owner() or is_hr_admin() or is_accountant()
      or (is_manager() and (id in (select managed_employee_ids()) or user_id = auth.uid()))
      or user_id = auth.uid()
    )
  );
create policy employees_write on employees for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));

-- employee_documents
create policy docs_select on employee_documents for select
  using (
    company_id = get_current_company_id() and (
      is_owner() or is_hr_admin()
      or (is_manager() and employee_id in (select managed_employee_ids()))
      or employee_id = own_employee_id()
    )
  );
create policy docs_write on employee_documents for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));

-- attendance
create policy att_select on attendance_records for select
  using (
    company_id = get_current_company_id() and (
      is_owner() or is_hr_admin() or is_accountant()
      or (is_manager() and employee_id in (select managed_employee_ids()))
      or employee_id = own_employee_id()
    )
  );
create policy att_write on attendance_records for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));

-- leave requests: employees create/read own; managers read+update team; hr/owner all
create policy leave_select on leave_requests for select
  using (
    company_id = get_current_company_id() and (
      is_owner() or is_hr_admin()
      or (is_manager() and employee_id in (select managed_employee_ids()))
      or employee_id = own_employee_id()
    )
  );
create policy leave_insert on leave_requests for insert
  with check (
    company_id = get_current_company_id()
    and (is_owner() or is_hr_admin() or employee_id = own_employee_id())
  );
create policy leave_update on leave_requests for update
  using (
    company_id = get_current_company_id() and (
      is_owner() or is_hr_admin()
      or (is_manager() and employee_id in (select managed_employee_ids()))
      or (employee_id = own_employee_id() and status in ('draft','pending')) -- cancel own
    )
  );

-- leave balances
create policy lb_select on leave_balances for select
  using (
    company_id = get_current_company_id() and (
      is_owner() or is_hr_admin()
      or (is_manager() and employee_id in (select managed_employee_ids()))
      or employee_id = own_employee_id()
    )
  );
create policy lb_write on leave_balances for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));

-- payroll: owner/hr_admin/accountant only
create policy pp_select on payroll_periods for select
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin() or is_accountant()));
create policy pp_write on payroll_periods for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin() or is_accountant()));
create policy pi_select on payroll_items for select
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin() or is_accountant()));
create policy pi_write on payroll_items for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin() or is_accountant()));

-- applicants: owner/hr_admin only
create policy applicants_all on applicants for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));

-- templates: global defaults readable by all; company templates by members
create policy templates_select on document_templates for select
  using (company_id is null or company_id = get_current_company_id());
create policy templates_write on document_templates for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));

-- AI conversations/messages: own only
create policy conv_all on ai_conversations for all
  using (company_id = get_current_company_id() and user_id = auth.uid());
create policy msg_all on ai_messages for all
  using (company_id = get_current_company_id() and user_id = auth.uid());

-- ai_actions: requester reads own; approvers (owner/hr_admin) read+update all
create policy actions_select on ai_actions for select
  using (company_id = get_current_company_id() and (user_id = auth.uid() or is_owner() or is_hr_admin()));
create policy actions_insert on ai_actions for insert
  with check (company_id = get_current_company_id() and user_id = auth.uid());
create policy actions_update on ai_actions for update
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));

-- audit logs: owner/hr_admin read; inserts are done via service role (server only)
create policy audit_select on audit_logs for select
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));

-- compliance reminders
create policy reminders_select on compliance_reminders for select
  using (company_id = get_current_company_id() and not is_employee());
create policy reminders_write on compliance_reminders for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin()));

-- ============ STORAGE ============
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

-- path convention: company_id/employee_id|general/document_type/filename
create policy storage_docs_select on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = get_current_company_id()::text);
create policy storage_docs_insert on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = get_current_company_id()::text);
create policy storage_docs_delete on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = get_current_company_id()::text
         and (is_owner() or is_hr_admin()));

-- ============ DEFAULT DOCUMENT TEMPLATES (global, company_id = null) ============
insert into document_templates (company_id, template_type, title, content, variables, is_default) values
(null, 'employment_contract', 'Probationary Employment Contract',
$tpl$PROBATIONARY EMPLOYMENT CONTRACT

This Employment Contract is entered into on {{document_date}} between:

{{company_name}}, with business address at {{company_address}} (the "Employer"), and {{employee_name}} (the "Employee").

1. POSITION. The Employee is hired as {{position}} in the {{department}} department, {{branch}} branch, reporting to {{supervisor}}.

2. PROBATIONARY PERIOD. The Employee shall serve a probationary period of six (6) months from {{hire_date}}, during which performance shall be evaluated against reasonable standards made known at the time of engagement, consistent with Article 296 of the Labor Code of the Philippines.

3. COMPENSATION. The Employee shall receive a salary of PHP {{salary}} ({{salary_type}}), payable in accordance with the company payroll schedule.

4. WORK SCHEDULE. {{work_schedule}}

5. REGULARIZATION. Upon satisfactory completion of the probationary period, the Employee may be considered for regular employment effective {{regularization_date}}.

6. COMPANY POLICIES. The Employee agrees to comply with all company policies, rules, and regulations.

This document is a DRAFT template and must be reviewed by qualified HR or legal counsel before execution.

Prepared by: {{prepared_by}}

_________________________          _________________________
Employer                            Employee$tpl$,
'["company_name","company_address","employee_name","position","department","branch","supervisor","hire_date","salary","salary_type","work_schedule","regularization_date","document_date","prepared_by"]', true),

(null, 'employment_contract_regular', 'Regular Employment Contract',
$tpl$REGULAR EMPLOYMENT CONTRACT

This Employment Contract is entered into on {{document_date}} between {{company_name}}, with address at {{company_address}} (the "Employer"), and {{employee_name}} (the "Employee").

1. POSITION AND STATUS. The Employee is engaged as a REGULAR employee in the position of {{position}}, {{department}} department, {{branch}} branch, effective {{regularization_date}}, reporting to {{supervisor}}.

2. COMPENSATION. Salary: PHP {{salary}} ({{salary_type}}), payable per the company payroll schedule, plus benefits mandated by Philippine law (SSS, PhilHealth, Pag-IBIG, 13th month pay, service incentive leave).

3. WORK SCHEDULE. {{work_schedule}}

4. DUTIES. The Employee shall perform duties of the position and other reasonable tasks assigned.

5. TERMINATION. Employment may be terminated only for just or authorized causes under the Labor Code of the Philippines, with due process.

This document is a DRAFT template and must be reviewed by qualified HR or legal counsel before execution.

Prepared by: {{prepared_by}}

_________________________          _________________________
Employer                            Employee$tpl$,
'["company_name","company_address","employee_name","position","department","branch","supervisor","regularization_date","salary","salary_type","work_schedule","document_date","prepared_by"]', true),

(null, 'job_offer', 'Job Offer Letter',
$tpl$JOB OFFER

{{document_date}}

Dear {{employee_name}},

We are pleased to offer you the position of {{position}} at {{company_name}}, {{branch}} branch, with a starting date of {{hire_date}}.

Compensation: PHP {{salary}} ({{salary_type}})
Department: {{department}}
Reporting to: {{supervisor}}
Work schedule: {{work_schedule}}

This offer is contingent on completion of pre-employment requirements. Please sign below to signify acceptance.

We look forward to working with you.

Sincerely,
{{prepared_by}}
{{company_name}}

Accepted by: _________________________  Date: _____________$tpl$,
'["employee_name","position","company_name","branch","hire_date","salary","salary_type","department","supervisor","work_schedule","document_date","prepared_by"]', true),

(null, 'certificate_of_employment', 'Certificate of Employment',
$tpl$CERTIFICATE OF EMPLOYMENT

{{document_date}}

TO WHOM IT MAY CONCERN:

This is to certify that {{employee_name}} is/was employed by {{company_name}} as {{position}} in the {{department}} department, {{branch}} branch, from {{hire_date}} to present.

This certification is issued upon the request of the above-named employee for whatever legal purpose it may serve.

Issued at {{company_address}}.

{{prepared_by}}
{{company_name}}$tpl$,
'["employee_name","company_name","position","department","branch","hire_date","company_address","document_date","prepared_by"]', true),

(null, 'notice_to_explain', 'Notice to Explain',
$tpl$NOTICE TO EXPLAIN

{{document_date}}

TO: {{employee_name}}
POSITION: {{position}}
DEPARTMENT: {{department}}

Subject: Notice to Explain

You are hereby directed to explain in writing, within five (5) calendar days from receipt of this notice, why no disciplinary action should be taken against you for the following alleged act(s) or omission(s):

{{incident_details}}

This directive is issued in observance of the twin-notice rule and procedural due process under Philippine labor law. You may be assisted by a representative of your choice. A hearing or conference may be scheduled if warranted.

Your failure to submit a written explanation within the stated period shall be deemed a waiver of your right to be heard.

DRAFT — This disciplinary document must be reviewed by qualified HR or legal counsel before issuance.

{{prepared_by}}
{{company_name}}

Received by: _________________________  Date: _____________$tpl$,
'["employee_name","position","department","incident_details","document_date","prepared_by","company_name"]', true),

(null, 'written_warning', 'Written Warning',
$tpl$WRITTEN WARNING

{{document_date}}

TO: {{employee_name}}
POSITION: {{position}}

This serves as a formal written warning regarding: {{incident_details}}

Continued or repeated violation may result in further disciplinary action, up to and including termination, subject to due process under Philippine labor law.

DRAFT — Review by qualified HR or legal counsel is recommended before issuance.

{{prepared_by}}
{{company_name}}

Received by: _________________________  Date: _____________$tpl$,
'["employee_name","position","incident_details","document_date","prepared_by","company_name"]', true),

(null, 'company_memo', 'Company Memo',
$tpl$MEMORANDUM

DATE: {{document_date}}
FROM: {{prepared_by}}, {{company_name}}
TO: All Employees
SUBJECT: {{memo_subject}}

{{memo_body}}

For strict compliance.

{{prepared_by}}
{{company_name}}$tpl$,
'["document_date","prepared_by","company_name","memo_subject","memo_body"]', true),

(null, 'data_privacy_consent', 'Data Privacy Consent',
$tpl$DATA PRIVACY CONSENT FORM

I, {{employee_name}}, hereby give my consent to {{company_name}} to collect, process, store, and retain my personal data for legitimate employment purposes, in accordance with the Data Privacy Act of 2012 (RA 10173) and its implementing rules.

Data covered includes personal information, employment records, government-mandated numbers, payroll data, and related HR records. I understand my rights as a data subject, including the right to access, correct, and object to processing of my data.

Signed: _________________________  Date: {{document_date}}$tpl$,
'["employee_name","company_name","document_date"]', true),

(null, 'policy_acknowledgment', 'Policy Acknowledgment',
$tpl$POLICY ACKNOWLEDGMENT

I, {{employee_name}}, acknowledge that I have received, read, and understood the following company policy of {{company_name}}:

{{policy_title}}

I agree to comply with this policy. I understand that violations may subject me to disciplinary action in accordance with company rules and Philippine labor law.

Signed: _________________________  Date: {{document_date}}$tpl$,
'["employee_name","company_name","policy_title","document_date"]', true),

(null, 'onboarding_checklist', 'Onboarding Checklist',
$tpl$ONBOARDING CHECKLIST — {{employee_name}}
Position: {{position}} | Start date: {{hire_date}} | Prepared: {{document_date}}

PRE-EMPLOYMENT REQUIREMENTS
[ ] Signed employment contract
[ ] Signed job offer
[ ] NBI clearance
[ ] Medical certificate / pre-employment medical exam
[ ] SSS number (E-1/E-4)
[ ] PhilHealth number (MDR)
[ ] Pag-IBIG number (MDF)
[ ] TIN / BIR Form 2305 or 1902
[ ] Photocopy of government-issued ID
[ ] Birth certificate (PSA)
[ ] 2x2 ID photos

FIRST DAY
[ ] Data privacy consent signed
[ ] Employee handbook received and acknowledged
[ ] Company ID issued
[ ] Workstation / tools / uniform issued
[ ] Introduction to team and supervisor ({{supervisor}})
[ ] Timekeeping / attendance system enrollment

FIRST WEEK
[ ] Job orientation completed
[ ] Payroll enrollment confirmed
[ ] Emergency contact information on file

Prepared by: {{prepared_by}}$tpl$,
'["employee_name","position","hire_date","supervisor","document_date","prepared_by"]', true),

(null, 'clearance_form', 'Clearance Form',
$tpl$EMPLOYEE CLEARANCE FORM

Employee: {{employee_name}}
Position: {{position}}
Department: {{department}}
Last day of employment: {{separation_date}}
Date: {{document_date}}

DEPARTMENT SIGN-OFF
[ ] Immediate supervisor — accountabilities cleared
[ ] IT / assets — equipment, ID, access returned
[ ] Finance — cash advances / liabilities settled
[ ] HR — 201 file complete, exit interview done

Final pay and Certificate of Employment shall be released in accordance with DOLE Labor Advisory No. 06-20 (within 30 days from date of separation, unless a more favorable company policy applies).

Cleared by: {{prepared_by}}$tpl$,
'["employee_name","position","department","separation_date","document_date","prepared_by"]', true),

(null, 'resignation_acceptance', 'Resignation Acceptance',
$tpl$ACCEPTANCE OF RESIGNATION

{{document_date}}

Dear {{employee_name}},

This confirms that {{company_name}} has received and accepted your resignation as {{position}}, effective {{separation_date}}.

Please coordinate with HR for clearance processing, turnover of accountabilities, and release of your final pay and Certificate of Employment in accordance with applicable DOLE guidelines.

We thank you for your service and wish you success in your future endeavors.

Sincerely,
{{prepared_by}}
{{company_name}}$tpl$,
'["employee_name","company_name","position","separation_date","document_date","prepared_by"]', true),

(null, 'performance_evaluation', 'Performance Evaluation',
$tpl$PERFORMANCE EVALUATION FORM

Employee: {{employee_name}}
Position: {{position}}
Department: {{department}}
Evaluation period: {{evaluation_period}}
Evaluator: {{prepared_by}}
Date: {{document_date}}

RATING SCALE: 5 Outstanding | 4 Exceeds Expectations | 3 Meets Expectations | 2 Needs Improvement | 1 Unsatisfactory

1. Quality of work        [ ]
2. Productivity           [ ]
3. Attendance/punctuality [ ]
4. Initiative             [ ]
5. Teamwork               [ ]
6. Adherence to policies  [ ]

Strengths:
_________________________________________

Areas for improvement:
_________________________________________

Overall recommendation:
[ ] For regularization  [ ] Extend probation (with legal review)  [ ] For performance improvement plan  [ ] Others: _______

Employee signature: ____________  Evaluator signature: ____________$tpl$,
'["employee_name","position","department","evaluation_period","document_date","prepared_by"]', true);
