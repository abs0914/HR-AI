"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext, requireSession } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { executeApprovedAction } from "@/lib/agent/tools";

type ActionResult = { ok: boolean; message: string };

const fail = (message: string): ActionResult => ({ ok: false, message });
const done = (message: string): ActionResult => ({ ok: true, message });

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// ============ ONBOARDING ============

export async function createCompany(fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Please log in first.");

  const schema = z.object({ name: z.string().min(2, "Company name is required") });
  const parsed = schema.safeParse({ name: str(fd, "name") ?? "" });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const admin = createAdminClient();
  const { data: existing } = await admin.from("company_users").select("id").eq("user_id", user.id).limit(1);
  if (existing?.length) return fail("You already belong to a company.");

  const { data: company, error } = await admin.from("companies").insert({
    name: parsed.data.name,
    business_type: str(fd, "business_type"),
    industry: str(fd, "industry"),
    address: str(fd, "address"),
    branches_note: str(fd, "branches"),
    payroll_cycle: str(fd, "payroll_cycle") ?? "semi-monthly",
    work_schedule: str(fd, "work_schedule"),
    employee_count: str(fd, "employee_count"),
    timezone: "Asia/Manila",
  }).select("id").single();
  if (error) return fail(error.message);

  const { error: cuErr } = await admin.from("company_users").insert({
    company_id: company.id, user_id: user.id, role: "owner", status: "active",
  });
  if (cuErr) return fail(cuErr.message);

  await logAudit({ companyId: company.id, userId: user.id, module: "settings", action: "company_created", details: { name: parsed.data.name } });
  redirect("/dashboard");
}

// ============ EMPLOYEES ============

export async function saveEmployee(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "employees.write"); } catch (e: any) { return fail(e.message); }
  const supabase = await createClient();

  const id = str(fd, "id");
  const first_name = str(fd, "first_name");
  const last_name = str(fd, "last_name");
  if (!first_name || !last_name) return fail("First and last name are required.");

  const record: Record<string, unknown> = {
    company_id: session.companyId,
    first_name, last_name,
    middle_name: str(fd, "middle_name"),
    email: str(fd, "email"), phone: str(fd, "phone"), address: str(fd, "address"),
    emergency_contact_name: str(fd, "emergency_contact_name"),
    emergency_contact_phone: str(fd, "emergency_contact_phone"),
    employee_number: str(fd, "employee_number"),
    branch_id: str(fd, "branch_id"), department_id: str(fd, "department_id"),
    position_id: str(fd, "position_id"), supervisor_id: str(fd, "supervisor_id"),
    employment_status: str(fd, "employment_status") ?? "probationary",
    employment_type: str(fd, "employment_type"),
    hire_date: str(fd, "hire_date"),
    regularization_date: str(fd, "regularization_date"),
    separation_date: str(fd, "separation_date"),
    notes: str(fd, "notes"),
    updated_at: new Date().toISOString(),
  };
  if (can(session.role, "employees.write_salary")) {
    record.salary_type = str(fd, "salary_type");
    record.salary_amount = str(fd, "salary_amount") ? Number(str(fd, "salary_amount")) : null;
  }

  const { error } = id
    ? await supabase.from("employees").update(record).eq("id", id).eq("company_id", session.companyId)
    : await supabase.from("employees").insert(record);
  if (error) return fail(error.message);

  await logAudit({
    companyId: session.companyId, userId: session.userId, employeeId: id,
    module: "employees", action: id ? "employee_updated" : "employee_created",
    details: { name: `${first_name} ${last_name}` },
  });
  revalidatePath("/employees");
  return done(id ? "Employee updated." : "Employee added.");
}

export async function archiveEmployee(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== "owner") return fail("Only the Owner can archive employees.");
  const id = str(fd, "id");
  if (!id) return fail("Missing employee id.");
  const supabase = await createClient();
  const { error } = await supabase.from("employees")
    .update({ employment_status: "inactive", updated_at: new Date().toISOString() })
    .eq("id", id).eq("company_id", session.companyId);
  if (error) return fail(error.message);
  await logAudit({ companyId: session.companyId, userId: session.userId, employeeId: id, module: "employees", action: "employee_archived" });
  revalidatePath("/employees");
  return done("Employee archived.");
}

// ============ ATTENDANCE ============

export async function saveAttendance(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "attendance.write"); } catch (e: any) { return fail(e.message); }
  const employee_id = str(fd, "employee_id");
  const attendance_date = str(fd, "attendance_date");
  if (!employee_id || !attendance_date) return fail("Employee and date are required.");
  const supabase = await createClient();
  const timeVal = (key: string) => {
    const t = str(fd, key);
    return t ? new Date(`${attendance_date}T${t}:00+08:00`).toISOString() : null;
  };
  const { error } = await supabase.from("attendance_records").upsert({
    company_id: session.companyId, employee_id, attendance_date,
    time_in: timeVal("time_in"), time_out: timeVal("time_out"),
    break_minutes: Number(str(fd, "break_minutes") ?? 0),
    late_minutes: Number(str(fd, "late_minutes") ?? 0),
    undertime_minutes: Number(str(fd, "undertime_minutes") ?? 0),
    overtime_minutes: Number(str(fd, "overtime_minutes") ?? 0),
    status: str(fd, "status") ?? "present",
    remarks: str(fd, "remarks"), source: "manual",
    approved_by: session.userId, updated_at: new Date().toISOString(),
  }, { onConflict: "employee_id,attendance_date" });
  if (error) return fail(error.message);
  await logAudit({
    companyId: session.companyId, userId: session.userId, employeeId: employee_id,
    module: "attendance", action: "attendance_edited", details: { attendance_date },
  });
  revalidatePath("/attendance");
  return done("Attendance saved.");
}

// ============ LEAVE ============

export async function createLeaveRequest(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createClient();
  let employee_id = str(fd, "employee_id");
  if (session.role === "employee" || !employee_id) {
    const { data: me } = await supabase.from("employees")
      .select("id").eq("user_id", session.userId).eq("company_id", session.companyId).maybeSingle();
    if (!me && session.role === "employee") return fail("Your login is not linked to an employee record. Ask HR to link it.");
    if (session.role === "employee") employee_id = me!.id;
  }
  if (!employee_id) return fail("Select an employee.");
  const leave_type = str(fd, "leave_type");
  const start_date = str(fd, "start_date");
  const end_date = str(fd, "end_date");
  if (!leave_type || !start_date || !end_date) return fail("Leave type and dates are required.");
  if (end_date < start_date) return fail("End date cannot be before start date.");
  const { error } = await supabase.from("leave_requests").insert({
    company_id: session.companyId, employee_id, leave_type, start_date, end_date,
    reason: str(fd, "reason"), status: "pending",
  });
  if (error) return fail(error.message);
  await logAudit({
    companyId: session.companyId, userId: session.userId, employeeId: employee_id,
    module: "leave", action: "leave_requested", details: { leave_type, start_date, end_date },
  });
  revalidatePath("/leave");
  return done("Leave request submitted.");
}

export async function decideLeaveRequest(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "leave.approve"); } catch (e: any) { return fail(e.message); }
  const id = str(fd, "id");
  const decision = str(fd, "decision"); // approved | rejected
  if (!id || !decision) return fail("Missing request or decision.");
  const supabase = await createClient();
  const update: Record<string, unknown> = {
    status: decision, approver_id: session.userId, updated_at: new Date().toISOString(),
  };
  if (decision === "approved") update.approved_at = new Date().toISOString();
  else update.rejection_reason = str(fd, "reason") ?? "Rejected";
  const { error } = await supabase.from("leave_requests").update(update)
    .eq("id", id).eq("company_id", session.companyId).eq("status", "pending");
  if (error) return fail(error.message);

  // deduct balance on approval
  if (decision === "approved") {
    const admin = createAdminClient();
    const { data: lr } = await admin.from("leave_requests").select("employee_id, leave_type, start_date, end_date").eq("id", id).single();
    if (lr) {
      const days = Math.round((new Date(lr.end_date).getTime() - new Date(lr.start_date).getTime()) / 86400000) + 1;
      const year = new Date(lr.start_date).getFullYear();
      const { data: bal } = await admin.from("leave_balances").select("id, used")
        .eq("employee_id", lr.employee_id).eq("leave_type", lr.leave_type).eq("year", year).maybeSingle();
      if (bal) await admin.from("leave_balances").update({ used: Number(bal.used) + days }).eq("id", bal.id);
    }
  }
  await logAudit({
    companyId: session.companyId, userId: session.userId,
    module: "leave", action: `leave_${decision}`, details: { leave_request_id: id },
  });
  revalidatePath("/leave");
  return done(`Leave request ${decision}.`);
}

// ============ PAYROLL ============

export async function createPayrollPeriod(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "payroll.write"); } catch (e: any) { return fail(e.message); }
  const start_date = str(fd, "start_date");
  const end_date = str(fd, "end_date");
  if (!start_date || !end_date) return fail("Start and end dates are required.");
  const supabase = await createClient();
  const name = str(fd, "name") ?? `${start_date} to ${end_date}`;
  const { data: period, error } = await supabase.from("payroll_periods").insert({
    company_id: session.companyId, name, start_date, end_date, status: "draft", created_by: session.userId,
  }).select("id").single();
  if (error) return fail(error.message);

  // build items from attendance
  const { data: records } = await supabase.from("attendance_records")
    .select("employee_id, status, late_minutes, undertime_minutes, overtime_minutes")
    .eq("company_id", session.companyId).gte("attendance_date", start_date).lte("attendance_date", end_date);
  const byEmp = new Map<string, any>();
  for (const r of records ?? []) {
    const s = byEmp.get(r.employee_id) ?? { days: 0, abs: 0, late: 0, ut: 0, ot: 0 };
    if (r.status === "absent") s.abs++;
    else if (["present", "late", "undertime"].includes(r.status)) s.days++;
    s.late += r.late_minutes ?? 0; s.ut += r.undertime_minutes ?? 0; s.ot += r.overtime_minutes ?? 0;
    byEmp.set(r.employee_id, s);
  }
  if (byEmp.size > 0) {
    const admin = createAdminClient();
    await admin.from("payroll_items").insert([...byEmp.entries()].map(([empId, s]) => ({
      company_id: session.companyId, payroll_period_id: period.id, employee_id: empId,
      days_worked: s.days, absences: s.abs, late_minutes: s.late,
      undertime_minutes: s.ut, overtime_minutes: s.ot,
    })));
  }
  await logAudit({
    companyId: session.companyId, userId: session.userId,
    module: "payroll", action: "payroll_period_created", details: { name, employees: byEmp.size },
  });
  revalidatePath("/payroll");
  return done(`Payroll period created with ${byEmp.size} employee line items.`);
}

export async function updatePayrollItem(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "payroll.write"); } catch (e: any) { return fail(e.message); }
  const id = str(fd, "id");
  if (!id) return fail("Missing item id.");
  const supabase = await createClient();
  const { error } = await supabase.from("payroll_items").update({
    allowances: Number(str(fd, "allowances") ?? 0),
    deductions: Number(str(fd, "deductions") ?? 0),
    cash_advances: Number(str(fd, "cash_advances") ?? 0),
    notes: str(fd, "notes"), updated_at: new Date().toISOString(),
  }).eq("id", id).eq("company_id", session.companyId);
  if (error) return fail(error.message);
  revalidatePath("/payroll");
  return done("Payroll item updated.");
}

export async function approvePayrollPeriod(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!["owner", "hr_admin"].includes(session.role)) return fail("Only Owner or HR Admin can approve payroll.");
  const id = str(fd, "id");
  if (!id) return fail("Missing period id.");
  const supabase = await createClient();
  const { error } = await supabase.from("payroll_periods").update({
    status: "approved", approved_by: session.userId, approved_at: new Date().toISOString(),
  }).eq("id", id).eq("company_id", session.companyId);
  if (error) return fail(error.message);
  await logAudit({ companyId: session.companyId, userId: session.userId, module: "payroll", action: "payroll_approved", details: { period_id: id } });
  revalidatePath("/payroll");
  return done("Payroll period approved. You can now export it.");
}

// ============ AI APPROVALS ============

export async function decideAiAction(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "approvals.decide"); } catch (e: any) { return fail(e.message); }
  const id = str(fd, "id");
  const decision = str(fd, "decision"); // approve | reject
  if (!id || !decision) return fail("Missing action or decision.");
  const admin = createAdminClient();
  const { data: action } = await admin.from("ai_actions").select("*")
    .eq("id", id).eq("company_id", session.companyId).eq("status", "pending").maybeSingle();
  if (!action) return fail("Pending action not found (it may already be decided).");

  if (decision === "reject") {
    await admin.from("ai_actions").update({
      status: "rejected", rejected_by: session.userId,
      rejected_at: new Date().toISOString(), rejection_reason: str(fd, "reason") ?? "Rejected by approver",
    }).eq("id", id);
    await logAudit({
      companyId: session.companyId, userId: session.userId,
      module: "ai", action: "ai_action_rejected", details: { action_id: id, tool: action.tool_name },
    });
    revalidatePath("/approvals");
    return done("AI action rejected.");
  }

  const result = await executeApprovedAction(action);
  await admin.from("ai_actions").update({
    status: result.ok ? "executed" : "failed",
    approved_by: session.userId, approved_at: new Date().toISOString(),
    output: { message: result.message, ...(result.output ? { result: result.output } : {}) },
  }).eq("id", id);
  await logAudit({
    companyId: session.companyId, userId: session.userId,
    module: "ai", action: result.ok ? "ai_action_approved" : "ai_action_failed",
    details: { action_id: id, tool: action.tool_name, message: result.message },
  });
  revalidatePath("/approvals");
  return result.ok ? done(`Approved and executed: ${result.message}`) : fail(`Approved but execution failed: ${result.message}`);
}

// ============ DOCUMENTS ============

export async function approveDocument(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "documents.approve"); } catch (e: any) { return fail(e.message); }
  const id = str(fd, "id");
  const status = str(fd, "status") ?? "approved"; // approved | archived
  if (!id) return fail("Missing document id.");
  const supabase = await createClient();
  const { error } = await supabase.from("employee_documents").update({
    status, approved_by: status === "approved" ? session.userId : undefined,
    approved_at: status === "approved" ? new Date().toISOString() : undefined,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("company_id", session.companyId);
  if (error) return fail(error.message);
  await logAudit({
    companyId: session.companyId, userId: session.userId,
    module: "documents", action: `document_${status}`, details: { document_id: id },
  });
  revalidatePath("/documents");
  return done(`Document ${status}.`);
}

// ============ RECRUITMENT ============

export async function updateApplicantStatus(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "recruitment.manage"); } catch (e: any) { return fail(e.message); }
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || !status) return fail("Missing applicant or status.");
  const supabase = await createClient();
  const { error } = await supabase.from("applicants").update({ status, updated_at: new Date().toISOString() })
    .eq("id", id).eq("company_id", session.companyId);
  if (error) return fail(error.message);
  await logAudit({
    companyId: session.companyId, userId: session.userId,
    module: "recruitment", action: "applicant_status_changed", details: { applicant_id: id, status },
  });
  revalidatePath("/recruitment");
  return done("Applicant status updated.");
}

// ============ COMPLIANCE ============

export async function updateReminderStatus(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "compliance.write"); } catch (e: any) { return fail(e.message); }
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || !status) return fail("Missing reminder or status.");
  const supabase = await createClient();
  const { error } = await supabase.from("compliance_reminders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id).eq("company_id", session.companyId);
  if (error) return fail(error.message);
  revalidatePath("/compliance");
  return done("Reminder updated.");
}

export async function createReminder(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "compliance.write"); } catch (e: any) { return fail(e.message); }
  const title = str(fd, "title");
  const due_date = str(fd, "due_date");
  if (!title || !due_date) return fail("Title and due date are required.");
  const supabase = await createClient();
  const { error } = await supabase.from("compliance_reminders").insert({
    company_id: session.companyId, reminder_type: str(fd, "reminder_type") ?? "other",
    title, description: str(fd, "description"), due_date, status: "open",
  });
  if (error) return fail(error.message);
  revalidatePath("/compliance");
  return done("Reminder created.");
}

// ============ SETTINGS ============

export async function updateCompany(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "settings.manage"); } catch (e: any) { return fail(e.message); }
  const supabase = await createClient();
  // only update fields the submitting form actually contained
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (str(fd, "name")) update.name = str(fd, "name");
  for (const f of ["business_type", "industry", "address", "payroll_cycle", "work_schedule"]) {
    if (fd.has(f)) update[f] = str(fd, f);
  }
  const plan = str(fd, "plan");
  if (plan && ["free", "premium", "enterprise"].includes(plan)) {
    if (session.role !== "owner") return fail("Only the Owner can change the plan.");
    update.plan = plan;
    update.plan_expires_at = null; // manual dev-mode change has no expiry
  }
  const { error } = await supabase.from("companies").update(update).eq("id", session.companyId);
  if (error) return fail(error.message);
  await logAudit({ companyId: session.companyId, userId: session.userId, module: "settings", action: "company_updated" });
  revalidatePath("/settings");
  return done("Company profile updated.");
}

export async function addOrgItem(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "settings.manage"); } catch (e: any) { return fail(e.message); }
  const kind = str(fd, "kind"); // branch | department | position | holiday
  const name = str(fd, "name");
  if (!kind || !name) return fail("Name is required.");
  const supabase = await createClient();
  let error;
  if (kind === "branch") ({ error } = await supabase.from("branches").insert({ company_id: session.companyId, name, address: str(fd, "address") }));
  else if (kind === "department") ({ error } = await supabase.from("departments").insert({ company_id: session.companyId, name }));
  else if (kind === "position") ({ error } = await supabase.from("positions").insert({ company_id: session.companyId, title: name }));
  else if (kind === "holiday") {
    const d = str(fd, "holiday_date");
    if (!d) return fail("Holiday date required.");
    ({ error } = await supabase.from("company_holidays").insert({ company_id: session.companyId, name, holiday_date: d, holiday_type: str(fd, "holiday_type") ?? "regular" }));
  } else return fail("Unknown item kind.");
  if (error) return fail(error.message);
  revalidatePath("/settings");
  return done(`${kind[0].toUpperCase()}${kind.slice(1)} added.`);
}

export async function inviteUser(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "users.manage"); } catch (e: any) { return fail(e.message); }
  const email = str(fd, "email");
  const role = str(fd, "role");
  if (!email || !role) return fail("Email and role are required.");
  if (!["owner", "hr_admin", "manager", "accountant", "employee"].includes(role)) return fail("Invalid role.");
  const admin = createAdminClient();
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.APP_URL ?? "http://localhost:3000"}/login`,
  });
  // if the user already exists, look them up instead
  let userId = invited?.user?.id;
  if (error && !userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (!userId) return fail(`Could not invite: ${error.message}`);
  }
  const { error: cuErr } = await admin.from("company_users").upsert(
    { company_id: session.companyId, user_id: userId!, role, status: "active" },
    { onConflict: "company_id,user_id" });
  if (cuErr) return fail(cuErr.message);

  // auto-link to an employee record with the same email (enables self-service:
  // own profile, leave requests, own documents)
  const { data: linked } = await admin.from("employees")
    .update({ user_id: userId! })
    .eq("company_id", session.companyId)
    .ilike("email", email)
    .is("user_id", null)
    .select("id, first_name, last_name");

  await logAudit({
    companyId: session.companyId, userId: session.userId,
    module: "settings", action: "user_invited",
    details: { email, role, linked_employee: linked?.[0]?.id ?? null },
  });
  revalidatePath("/settings");
  const linkNote = linked?.length
    ? ` Linked to employee record: ${linked[0].first_name} ${linked[0].last_name}.`
    : " No employee record matched this email — link one manually in Settings if needed.";
  return done(`Invited ${email} as ${role.replace("_", " ")}.${linkNote}`);
}

export async function linkUserToEmployee(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "users.manage"); } catch (e: any) { return fail(e.message); }
  const userId = str(fd, "user_id");
  const employeeId = str(fd, "employee_id"); // empty = unlink
  if (!userId) return fail("Missing user.");
  const admin = createAdminClient();
  // one login maps to at most one employee record — clear any previous link first
  await admin.from("employees").update({ user_id: null })
    .eq("company_id", session.companyId).eq("user_id", userId);
  if (employeeId) {
    const { error } = await admin.from("employees").update({ user_id: userId })
      .eq("id", employeeId).eq("company_id", session.companyId);
    if (error) return fail(error.message);
  }
  await logAudit({
    companyId: session.companyId, userId: session.userId, employeeId,
    module: "settings", action: employeeId ? "user_linked_to_employee" : "user_unlinked_from_employee",
    details: { linked_user_id: userId },
  });
  revalidatePath("/settings");
  return done(employeeId ? "Login linked to employee record." : "Login unlinked from employee record.");
}

export async function updateUserRole(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "users.manage"); } catch (e: any) { return fail(e.message); }
  const id = str(fd, "id");
  const role = str(fd, "role");
  if (!id || !role) return fail("Missing user or role.");
  const supabase = await createClient();
  const { error } = await supabase.from("company_users").update({ role, updated_at: new Date().toISOString() })
    .eq("id", id).eq("company_id", session.companyId);
  if (error) return fail(error.message);
  await logAudit({
    companyId: session.companyId, userId: session.userId,
    module: "settings", action: "permission_changed", details: { company_user_id: id, role },
  });
  revalidatePath("/settings");
  return done("Role updated.");
}

// ============ COMPANY POLICIES ============

export async function savePolicy(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "settings.manage"); } catch (e: any) { return fail(e.message); }
  const title = str(fd, "title");
  const content = str(fd, "content");
  if (!title || !content) return fail("Title and policy text are required.");
  const supabase = await createClient();
  const id = str(fd, "id");
  const record = {
    company_id: session.companyId, title,
    category: str(fd, "category") ?? "general",
    content, created_by: session.userId, updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await supabase.from("company_policies").update(record).eq("id", id).eq("company_id", session.companyId)
    : await supabase.from("company_policies").insert(record);
  if (error) return fail(error.message);
  await logAudit({
    companyId: session.companyId, userId: session.userId,
    module: "settings", action: id ? "policy_updated" : "policy_created", details: { title },
  });
  revalidatePath("/settings");
  return done(`Policy "${title}" saved. Kawani AI will now use it to answer policy questions.`);
}

export async function deletePolicy(fd: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try { assertCan(session.role, "settings.manage"); } catch (e: any) { return fail(e.message); }
  const id = str(fd, "id");
  if (!id) return fail("Missing policy id.");
  const supabase = await createClient();
  const { error } = await supabase.from("company_policies").delete()
    .eq("id", id).eq("company_id", session.companyId);
  if (error) return fail(error.message);
  await logAudit({
    companyId: session.companyId, userId: session.userId,
    module: "settings", action: "policy_deleted", details: { policy_id: id },
  });
  revalidatePath("/settings");
  return done("Policy deleted.");
}

// ============ DEMO SEED ============

export async function seedDemoData(): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== "owner") return fail("Only the Owner can load demo data.");
  const admin = createAdminClient();
  const cid = session.companyId;

  const { data: existing } = await admin.from("employees").select("id").eq("company_id", cid).limit(1);
  if (existing?.length) return fail("Demo data skipped: this company already has employees.");

  const { data: branch } = await admin.from("branches").insert({ company_id: cid, name: "Main Branch", address: "Cebu City" }).select("id").single();
  const { data: dept } = await admin.from("departments").insert({ company_id: cid, name: "Operations" }).select("id").single();
  const positions: Record<string, string> = {};
  for (const title of ["Cashier", "Sales Associate", "Branch Supervisor", "Warehouse Staff", "HR Admin"]) {
    const { data: p } = await admin.from("positions").insert({ company_id: cid, department_id: dept!.id, title }).select("id").single();
    positions[title] = p!.id;
  }

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const monthsAgo = (n: number) => { const d = new Date(today); d.setMonth(d.getMonth() - n); return d; };

  const demoEmps = [
    { first_name: "Maria", last_name: "Santos", pos: "Cashier", status: "probationary", salary: 16000, hire: monthsAgo(4) },
    { first_name: "Juan", last_name: "Dela Cruz", pos: "Sales Associate", status: "regular", salary: 18000, hire: monthsAgo(20) },
    { first_name: "Ana", last_name: "Reyes", pos: "Branch Supervisor", status: "regular", salary: 28000, hire: monthsAgo(36) },
    { first_name: "Mark", last_name: "Villanueva", pos: "Warehouse Staff", status: "probationary", salary: 15000, hire: monthsAgo(5) },
    { first_name: "Carla", last_name: "Lopez", pos: "HR Admin", status: "regular", salary: 25000, hire: monthsAgo(28) },
  ];
  const empIds: Record<string, string> = {};
  for (const [i, e] of demoEmps.entries()) {
    const reg = new Date(e.hire); reg.setMonth(reg.getMonth() + 6);
    const { data: row } = await admin.from("employees").insert({
      company_id: cid, branch_id: branch!.id, department_id: dept!.id, position_id: positions[e.pos],
      employee_number: `EMP-${String(i + 1).padStart(3, "0")}`,
      first_name: e.first_name, last_name: e.last_name,
      email: `${e.first_name.toLowerCase()}.${e.last_name.toLowerCase().replace(/\s/g, "")}@demo.ph`,
      employment_status: e.status, employment_type: "full_time",
      salary_type: "monthly", salary_amount: e.salary,
      hire_date: iso(e.hire), regularization_date: e.status === "regular" ? iso(reg) : null,
    }).select("id").single();
    empIds[`${e.first_name} ${e.last_name}`] = row!.id;
  }
  // supervisor: Ana supervises Maria, Juan, Mark
  const anaId = empIds["Ana Reyes"];
  for (const n of ["Maria Santos", "Juan Dela Cruz", "Mark Villanueva"]) {
    await admin.from("employees").update({ supervisor_id: anaId }).eq("id", empIds[n]);
  }
  await admin.from("branches").update({ manager_id: anaId }).eq("id", branch!.id);

  // attendance: last 10 weekdays, mixed statuses
  const attRows: any[] = [];
  const day = new Date(today);
  let added = 0;
  while (added < 10) {
    day.setDate(day.getDate() - 1);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    added++;
    const d = iso(day);
    Object.entries(empIds).forEach(([name, id], idx) => {
      const late = name === "Maria Santos" && added % 2 === 0 ? 25 : name === "Mark Villanueva" && added % 3 === 0 ? 15 : 0;
      const absent = name === "Juan Dela Cruz" && added === 4;
      const undertime = name === "Carla Lopez" && added === 2 ? 60 : 0;
      attRows.push({
        company_id: cid, employee_id: id, attendance_date: d,
        time_in: absent ? null : new Date(`${d}T0${8 + (late > 0 ? 1 : 0)}:${late > 0 ? "25" : "00"}:00+08:00`).toISOString(),
        time_out: absent ? null : new Date(`${d}T17:00:00+08:00`).toISOString(),
        break_minutes: absent ? 0 : 60, late_minutes: late, undertime_minutes: undertime,
        overtime_minutes: name === "Ana Reyes" && added === 1 ? 120 : 0,
        status: absent ? "absent" : late > 0 ? "late" : undertime > 0 ? "undertime" : "present",
        source: "manual",
      });
    });
  }
  await admin.from("attendance_records").insert(attRows);

  // leave balances + requests
  const year = today.getFullYear();
  const balances = Object.values(empIds).flatMap((id) => [
    { company_id: cid, employee_id: id, leave_type: "vacation", balance: 10, used: 0, year },
    { company_id: cid, employee_id: id, leave_type: "sick", balance: 10, used: 0, year },
    { company_id: cid, employee_id: id, leave_type: "service_incentive", balance: 5, used: 0, year },
  ]);
  await admin.from("leave_balances").insert(balances);
  const soon = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
  await admin.from("leave_requests").insert([
    { company_id: cid, employee_id: empIds["Maria Santos"], leave_type: "vacation", start_date: soon(7), end_date: soon(8), reason: "Family event", status: "pending" },
    { company_id: cid, employee_id: empIds["Mark Villanueva"], leave_type: "sick", start_date: soon(1), end_date: soon(1), reason: "Fever", status: "pending" },
    { company_id: cid, employee_id: empIds["Juan Dela Cruz"], leave_type: "vacation", start_date: soon(14), end_date: soon(16), reason: "Province trip", status: "approved", approver_id: session.userId, approved_at: new Date().toISOString() },
    { company_id: cid, employee_id: empIds["Carla Lopez"], leave_type: "emergency", start_date: soon(2), end_date: soon(2), reason: "Personal matter", status: "rejected", approver_id: session.userId, rejection_reason: "Critical payroll week; please reschedule" },
  ]);

  // compliance reminders
  await admin.from("compliance_reminders").insert([
    { company_id: cid, reminder_type: "regularization_due", title: "Maria Santos regularization evaluation", description: "Probationary evaluation due before 6-month mark.", due_date: soon(30), related_employee_id: empIds["Maria Santos"], status: "open" },
    { company_id: cid, reminder_type: "regularization_due", title: "Mark Villanueva regularization evaluation", description: "Probationary evaluation due before 6-month mark.", due_date: soon(20), related_employee_id: empIds["Mark Villanueva"], status: "open" },
    { company_id: cid, reminder_type: "payroll_cutoff", title: "Semi-monthly payroll cutoff", description: "Prepare attendance summary and payroll draft.", due_date: soon(5), status: "open" },
    { company_id: cid, reminder_type: "13th_month", title: "13th month pay accrual review", description: "Review 13th month accruals (due December 24 per PD 851).", due_date: `${year}-11-30`, status: "open" },
    { company_id: cid, reminder_type: "government_contributions", title: "SSS / PhilHealth / Pag-IBIG remittance", description: "Template-based reminder. Verify actual deadlines with the agencies.", due_date: soon(10), status: "open" },
  ]);

  // demo documents (metadata only; generate real files via Kawani AI)
  await admin.from("employee_documents").insert([
    { company_id: cid, employee_id: empIds["Juan Dela Cruz"], document_type: "employment_contract", title: "Employment Contract — Juan Dela Cruz", status: "approved", content: "Demo seeded record. Ask Kawani AI to generate a real contract.", created_by: session.userId },
    { company_id: cid, employee_id: empIds["Juan Dela Cruz"], document_type: "certificate_of_employment", title: "COE — Juan Dela Cruz", status: "draft", generated_by_ai: true, content: "Demo seeded record. Ask Kawani AI: 'Generate a COE for Juan Dela Cruz.'", created_by: session.userId },
    { company_id: cid, document_type: "company_memo", title: "Memo — Attendance Policy", status: "approved", content: "Demo seeded record.", created_by: session.userId },
    { company_id: cid, employee_id: empIds["Maria Santos"], document_type: "onboarding_checklist", title: "Onboarding Checklist — Maria Santos", status: "draft", generated_by_ai: true, content: "Demo seeded record.", created_by: session.userId },
  ]);

  // demo policies — ground Kawani AI's policy answers
  await admin.from("company_policies").insert([
    {
      company_id: cid, title: "Attendance and Tardiness Policy", category: "attendance", created_by: session.userId,
      content: "Work hours are Monday to Saturday, 8:00 AM to 5:00 PM with a 1-hour unpaid lunch break. Employees must clock in via the timekeeping system. A grace period of 10 minutes applies; arrival after 8:10 AM is recorded as tardiness. Three (3) or more instances of tardiness within one payroll cutoff will result in a verbal reminder; five (5) or more will trigger a written Notice to Explain. Habitual tardiness (three consecutive cutoffs with 5+ instances) may result in progressive discipline. Undertime must be approved by the immediate supervisor in advance and is deducted from pay unless offset by approved leave credits.",
    },
    {
      company_id: cid, title: "Leave Policy", category: "leave", created_by: session.userId,
      content: "Regular employees earn 10 days of vacation leave and 10 days of sick leave per year, plus the 5-day Service Incentive Leave mandated by the Labor Code. Vacation leave must be filed at least 3 working days in advance and is subject to supervisor approval. Sick leave of 2 or more consecutive days requires a medical certificate. Unused vacation leave up to 5 days may be carried over to the next year; unused sick leave is convertible to cash at year-end at basic daily rate. Emergency leave is charged to vacation leave credits. Maternity, paternity, and solo parent leaves follow statutory rules (RA 11210, RA 8187, RA 8972).",
    },
  ]);

  await logAudit({ companyId: cid, userId: session.userId, module: "settings", action: "demo_data_seeded" });
  revalidatePath("/dashboard");
  return done("Demo data loaded: 5 employees, 10 days of attendance, leave requests, reminders, and documents.");
}
