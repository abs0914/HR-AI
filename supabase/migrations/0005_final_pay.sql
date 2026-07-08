-- Final pay (last pay) for separated employees. Sensitive money data:
-- owner / hr_admin / accountant only, mirroring payroll access.
create table final_pay (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  separation_date date not null,
  reason text default 'resignation',
  days_worked numeric default 0,
  unused_leave_days numeric default 0,
  last_salary numeric default 0,
  pro_rated_13th numeric default 0,
  leave_conversion numeric default 0,
  allowances numeric default 0,
  deductions numeric default 0,
  cash_advances numeric default 0,
  other_liabilities numeric default 0,
  net_final_pay numeric default 0,
  status text default 'draft' check (status in ('draft','approved','released','exported')),
  notes text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  released_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_final_pay_company on final_pay(company_id, status);
create index idx_final_pay_employee on final_pay(employee_id);

alter table final_pay enable row level security;

create policy final_pay_select on final_pay for select
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin() or is_accountant()));
create policy final_pay_write on final_pay for all
  using (company_id = get_current_company_id() and (is_owner() or is_hr_admin() or is_accountant()));

-- Quitclaim & Release template (part of the last-pay process) for the document generator.
insert into document_templates (company_id, template_type, title, content, variables, is_default) values
(null, 'quitclaim', 'Quitclaim and Release',
$tpl$RELEASE, WAIVER AND QUITCLAIM

KNOW ALL MEN BY THESE PRESENTS:

I, {{employee_name}}, of legal age, hereby acknowledge receipt from {{company_name}} of the sum of PHP {{net_final_pay}} representing the full and final settlement of my final pay arising from my separation effective {{separation_date}} ({{reason}}).

In consideration of the foregoing, I hereby release and forever discharge {{company_name}}, its officers and representatives, from any and all claims, demands, or causes of action, whether monetary or otherwise, arising from or in connection with my employment and its cessation.

I confirm that I have no further claim of whatever nature against the Company, and that the amount received constitutes complete payment of all wages, benefits, and other emoluments due to me.

DRAFT — This quitclaim must be reviewed by qualified HR or legal counsel and voluntarily signed by the employee before a competent officer. A quitclaim will not bar recovery of benefits the employee is legally entitled to.

Signed this {{document_date}}.

_________________________
{{employee_name}}

Received / witnessed by: {{prepared_by}}
{{company_name}}$tpl$,
'["employee_name","company_name","net_final_pay","separation_date","reason","document_date","prepared_by"]', true);
