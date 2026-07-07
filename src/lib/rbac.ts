import type { Role } from "@/lib/auth";

// Central permission map. Every server action / API route / agent tool checks here.
export type Permission =
  | "employees.read_all"
  | "employees.read_team"
  | "employees.write"
  | "employees.read_salary"
  | "employees.write_salary"
  | "documents.read_all"
  | "documents.generate"
  | "documents.approve"
  | "attendance.read_all"
  | "attendance.write"
  | "leave.approve"
  | "leave.request"
  | "payroll.read"
  | "payroll.write"
  | "payroll.export"
  | "recruitment.manage"
  | "compliance.read"
  | "compliance.write"
  | "approvals.decide"
  | "audit.read"
  | "settings.manage"
  | "users.manage";

const GRANTS: Record<Role, Permission[]> = {
  owner: [
    "employees.read_all", "employees.read_team", "employees.write",
    "employees.read_salary", "employees.write_salary",
    "documents.read_all", "documents.generate", "documents.approve",
    "attendance.read_all", "attendance.write",
    "leave.approve", "leave.request",
    "payroll.read", "payroll.write", "payroll.export",
    "recruitment.manage", "compliance.read", "compliance.write",
    "approvals.decide", "audit.read", "settings.manage", "users.manage",
  ],
  hr_admin: [
    "employees.read_all", "employees.read_team", "employees.write",
    "employees.read_salary", "employees.write_salary",
    "documents.read_all", "documents.generate", "documents.approve",
    "attendance.read_all", "attendance.write",
    "leave.approve", "leave.request",
    "payroll.read", "payroll.write",
    "recruitment.manage", "compliance.read", "compliance.write",
    "approvals.decide", "audit.read",
  ],
  manager: ["employees.read_team", "leave.approve", "leave.request", "compliance.read"],
  accountant: ["attendance.read_all", "payroll.read", "payroll.write", "payroll.export", "compliance.read", "leave.request"],
  employee: ["leave.request"],
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new PermissionError(`Your role (${role.replace("_", " ")}) is not allowed to: ${permission}`);
  }
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

// Columns each role may select from employees (salary masking happens here,
// since Postgres RLS is row-level, not column-level).
export function employeeColumns(role: Role): string {
  const base =
    "id, company_id, branch_id, department_id, position_id, employee_number, first_name, middle_name, last_name, email, phone, address, emergency_contact_name, emergency_contact_phone, supervisor_id, employment_status, employment_type, hire_date, regularization_date, separation_date, notes, user_id, created_at, updated_at";
  return can(role, "employees.read_salary") ? `${base}, salary_type, salary_amount` : base;
}
