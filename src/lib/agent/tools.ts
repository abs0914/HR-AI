import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth";
import { can, employeeColumns, type Permission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { effectivePlan, hasFeature, PLAN_CONFIG, type Plan, type PlanFeature } from "@/lib/billing";
import {
  fillTemplate, missingVariables, textToDocx, textToPdf, rowsToXlsx, saveToStorage,
} from "@/lib/docgen";

export type ToolContext = {
  session: SessionContext;
  supabase: SupabaseClient; // user-scoped, RLS enforced
  conversationId: string | null;
};

export type FileCard = { documentId: string; title: string; type: string };
export type ApprovalCard = { actionId: string; toolName: string; summary: string };

export type ToolResult = {
  ok: boolean;
  message: string;
  data?: unknown;
  file?: FileCard;
  approval?: ApprovalCard;
};

type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  permission?: Permission;
  execute: (args: any, tc: ToolContext) => Promise<ToolResult>;
};

const deny = (msg = "You do not have permission to do this."): ToolResult => ({ ok: false, message: msg });

const TOOL_FEATURES: Partial<Record<string, PlanFeature>> = {
  create_employee_draft: "agentic_workflows",
  update_employee_draft: "agentic_workflows",
  generate_document: "document_generation",
  save_document_content: "document_generation",
  generate_payroll_summary: "payroll_summary",
  export_payroll_xlsx: "payroll_export",
  create_leave_request: "leave_workflows",
  approve_leave_request: "leave_workflows",
  reject_leave_request: "leave_workflows",
  analyze_resume: "resume_analysis",
  create_compliance_reminder: "compliance_dashboard",
  list_compliance_reminders: "compliance_dashboard",
  compute_final_pay: "payroll_summary",
  list_final_pay: "payroll_summary",
};

const PREMIUM_DOCUMENT_TYPES = new Set([
  "notice_to_explain", "written_warning", "resignation_acceptance", "quitclaim",
  "employment_contract_regular", "performance_evaluation",
]);

async function currentPlan(tc: ToolContext): Promise<Plan> {
  const admin = createAdminClient();
  const { data } = await admin.from("companies")
    .select("plan, paid_until, plan_expires_at")
    .eq("id", tc.session.companyId)
    .single();
  return effectivePlan(data ?? {});
}

async function enforceToolPlan(name: string, args: any, tc: ToolContext): Promise<ToolResult | null> {
  const feature = TOOL_FEATURES[name];
  if (!feature) return null;
  const plan = await currentPlan(tc);
  if (!hasFeature(plan, feature)) {
    return deny(`${PLAN_CONFIG[plan].name} does not include ${feature.replace(/_/g, " ")}. Upgrade to use this workflow.`);
  }
  if (name === "generate_document" && PREMIUM_DOCUMENT_TYPES.has(String(args?.template_type ?? "")) && !hasFeature(plan, "premium_document_generation")) {
    return deny(`${PLAN_CONFIG[plan].name} includes basic HR document generation only. Upgrade to Business or higher for premium or sensitive document drafting.`);
  }
  return null;
}

async function employeeLimitReached(companyId: string): Promise<{ reached: boolean; message?: string }> {
  const admin = createAdminClient();
  const { data: company } = await admin.from("companies")
    .select("plan, paid_until, plan_expires_at")
    .eq("id", companyId)
    .single();
  const plan = effectivePlan(company ?? {});
  const max = PLAN_CONFIG[plan].employeeRange.max;
  if (max === null) return { reached: false };
  const { count, error } = await admin.from("employees")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .not("employment_status", "in", "(resigned,terminated,inactive,applicant)");
  if (error) return { reached: true, message: error.message };
  if ((count ?? 0) >= max) {
    return { reached: true, message: `${PLAN_CONFIG[plan].name} allows up to ${max} active employee records. Upgrade before adding more employees.` };
  }
  return { reached: false };
}

// ---------- shared helpers ----------

async function findEmployee(tc: ToolContext, nameOrId: string) {
  const cols = employeeColumns(tc.session.role);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(nameOrId)) {
    const { data } = await tc.supabase.from("employees").select(cols).eq("id", nameOrId).maybeSingle();
    return data as any;
  }
  const parts = nameOrId.trim().split(/\s+/);
  let q = tc.supabase.from("employees").select(cols).eq("company_id", tc.session.companyId);
  if (parts.length >= 2) {
    q = q.ilike("first_name", `%${parts[0]}%`).ilike("last_name", `%${parts[parts.length - 1]}%`);
  } else {
    q = q.or(`first_name.ilike.%${nameOrId}%,last_name.ilike.%${nameOrId}%`);
  }
  const { data } = await q.limit(2);
  const rows = (data ?? []) as any[];
  return rows.length === 1 ? rows[0] : rows.length > 1 ? { ambiguous: rows } : null;
}

// Create a pending approval record. The action executes only when a human
// with approvals.decide approves it (see executeApprovedAction below).
async function createPendingApproval(
  tc: ToolContext,
  toolName: string,
  actionType: string,
  input: Record<string, unknown>,
  summary: string
): Promise<ToolResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_actions")
    .insert({
      company_id: tc.session.companyId,
      conversation_id: tc.conversationId,
      user_id: tc.session.userId,
      action_type: actionType,
      tool_name: toolName,
      input,
      status: "pending",
      requires_approval: true,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: `Could not create approval request: ${error.message}` };
  await logAudit({
    companyId: tc.session.companyId, userId: tc.session.userId,
    module: "ai", action: "approval_requested",
    details: { tool: toolName, summary, action_id: data.id },
  });
  return {
    ok: true,
    message: `Created a pending approval request (${summary}). An Owner or HR Admin must approve it on the Approvals page before it takes effect.`,
    approval: { actionId: data.id, toolName, summary },
  };
}

async function generateAndSaveDocument(
  tc: ToolContext,
  opts: {
    templateType: string;
    title: string;
    employeeId?: string | null;
    vars: Record<string, string | null | undefined>;
    rawContent?: string; // when the model wrote the content itself
    documentType?: string;
  }
): Promise<ToolResult> {
  if (!can(tc.session.role, "documents.generate")) return deny("Only Owners and HR Admins can generate HR documents.");
  const admin = createAdminClient();
  let content = opts.rawContent;
  if (!content) {
    // company template overrides global default
    const { data: templates } = await admin
      .from("document_templates")
      .select("content, company_id")
      .eq("template_type", opts.templateType)
      .or(`company_id.eq.${tc.session.companyId},company_id.is.null`);
    const tpl = templates?.find((t) => t.company_id) ?? templates?.[0];
    if (!tpl) return { ok: false, message: `No template found for type "${opts.templateType}".` };
    const missing = missingVariables(tpl.content, opts.vars);
    if (missing.length > 0) {
      return { ok: false, message: `Missing required fields before this document can be generated: ${missing.join(", ")}. Please ask the user for them.` };
    }
    content = fillTemplate(tpl.content, opts.vars);
  }

  const [docxBuf, pdfBuf] = await Promise.all([
    textToDocx(opts.title, content),
    textToPdf(opts.title, content),
  ]);
  const docType = opts.documentType ?? opts.templateType;
  const docxPath = await saveToStorage({
    companyId: tc.session.companyId, employeeId: opts.employeeId, documentType: docType,
    filename: opts.title, buffer: docxBuf, ext: "docx",
  });
  await saveToStorage({
    companyId: tc.session.companyId, employeeId: opts.employeeId, documentType: docType,
    filename: opts.title, buffer: pdfBuf, ext: "pdf",
  });

  const { data: doc, error } = await admin
    .from("employee_documents")
    .insert({
      company_id: tc.session.companyId,
      employee_id: opts.employeeId ?? null,
      document_type: docType,
      title: opts.title,
      file_url: docxPath,
      file_type: "docx",
      content,
      status: "draft",
      generated_by_ai: true,
      created_by: tc.session.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: `Failed to save document record: ${error.message}` };

  await logAudit({
    companyId: tc.session.companyId, userId: tc.session.userId, employeeId: opts.employeeId,
    module: "documents", action: "ai_generated_document",
    details: { document_id: doc.id, type: docType, title: opts.title },
  });
  return {
    ok: true,
    message: `Generated "${opts.title}" as a DRAFT (DOCX + PDF saved). It appears in Documents and can be downloaded there. Recommend HR/legal review before official use.`,
    file: { documentId: doc.id, title: opts.title, type: docType },
  };
}

function employeeVars(emp: any, company: any, extra: Record<string, string> = {}) {
  return {
    company_name: company?.name,
    company_address: company?.address,
    employee_name: emp ? `${emp.first_name} ${emp.last_name}` : undefined,
    position: emp?.position_title,
    department: emp?.department_name,
    branch: emp?.branch_name,
    salary: emp?.salary_amount ? Number(emp.salary_amount).toLocaleString("en-PH") : undefined,
    salary_type: emp?.salary_type,
    hire_date: emp?.hire_date,
    regularization_date: emp?.regularization_date,
    supervisor: emp?.supervisor_name,
    work_schedule: company?.work_schedule ?? "Monday to Saturday, 8:00 AM - 5:00 PM with 1-hour break",
    document_date: new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" }),
    prepared_by: extra.prepared_by ?? "HR Department",
    separation_date: emp?.separation_date,
    ...extra,
  };
}

async function enrichEmployee(tc: ToolContext, emp: any) {
  if (!emp) return emp;
  const admin = createAdminClient();
  const [pos, dept, branch, sup] = await Promise.all([
    emp.position_id ? admin.from("positions").select("title").eq("id", emp.position_id).maybeSingle() : null,
    emp.department_id ? admin.from("departments").select("name").eq("id", emp.department_id).maybeSingle() : null,
    emp.branch_id ? admin.from("branches").select("name").eq("id", emp.branch_id).maybeSingle() : null,
    emp.supervisor_id ? admin.from("employees").select("first_name,last_name").eq("id", emp.supervisor_id).maybeSingle() : null,
  ]);
  return {
    ...emp,
    position_title: pos?.data?.title,
    department_name: dept?.data?.name,
    branch_name: branch?.data?.name,
    supervisor_name: sup?.data ? `${sup.data.first_name} ${sup.data.last_name}` : undefined,
  };
}

async function getCompany(tc: ToolContext) {
  const { data } = await tc.supabase.from("companies").select("*").eq("id", tc.session.companyId).single();
  return data;
}

const REQUIRED_DOC_TYPES = ["employment_contract", "data_privacy_consent", "government_id"];

async function attendanceSummary(tc: ToolContext, startDate: string, endDate: string) {
  const { data: records } = await tc.supabase
    .from("attendance_records")
    .select("employee_id, status, late_minutes, undertime_minutes, overtime_minutes, attendance_date")
    .eq("company_id", tc.session.companyId)
    .gte("attendance_date", startDate)
    .lte("attendance_date", endDate);
  const { data: emps } = await tc.supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("company_id", tc.session.companyId);
  const names = new Map((emps ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  const byEmp = new Map<string, any>();
  for (const r of records ?? []) {
    const s = byEmp.get(r.employee_id) ?? {
      employee: names.get(r.employee_id) ?? r.employee_id,
      employee_id: r.employee_id,
      days_present: 0, absences: 0, late_count: 0, late_minutes: 0,
      undertime_minutes: 0, overtime_minutes: 0, on_leave: 0,
    };
    if (r.status === "absent") s.absences++;
    else if (r.status === "on_leave") s.on_leave++;
    else if (["present", "late", "undertime"].includes(r.status)) s.days_present++;
    if ((r.late_minutes ?? 0) > 0) { s.late_count++; s.late_minutes += r.late_minutes; }
    s.undertime_minutes += r.undertime_minutes ?? 0;
    s.overtime_minutes += r.overtime_minutes ?? 0;
    byEmp.set(r.employee_id, s);
  }
  return [...byEmp.values()];
}

// ---------- executors for approved actions (called from approval flow) ----------
// These run with the service role AFTER a human with approvals.decide approved.

export async function executeApprovedAction(action: {
  id: string; company_id: string; tool_name: string; input: any; user_id: string;
}): Promise<{ ok: boolean; message: string; output?: unknown }> {
  const admin = createAdminClient();
  const input = action.input ?? {};
  try {
    switch (action.tool_name) {
      case "create_employee_draft": {
        const limit = await employeeLimitReached(action.company_id);
        if (limit.reached) return { ok: false, message: limit.message ?? "Employee limit reached." };
        const { data, error } = await admin.from("employees").insert({
          company_id: action.company_id,
          first_name: input.first_name, last_name: input.last_name,
          middle_name: input.middle_name ?? null,
          email: input.email ?? null, phone: input.phone ?? null,
          employment_status: input.employment_status ?? "probationary",
          salary_type: input.salary_type ?? null,
          salary_amount: input.salary_amount ?? null,
          hire_date: input.hire_date ?? null,
          employee_number: input.employee_number ?? null,
          notes: input.notes ?? null,
        }).select("id").single();
        if (error) throw error;
        return { ok: true, message: `Employee ${input.first_name} ${input.last_name} created.`, output: { employee_id: data.id } };
      }
      case "update_employee_draft": {
        const { error } = await admin.from("employees").update(input.fields).eq("id", input.employee_id).eq("company_id", action.company_id);
        if (error) throw error;
        return { ok: true, message: "Employee record updated.", output: input.fields };
      }
      case "approve_leave_request": {
        const { error } = await admin.from("leave_requests").update({
          status: "approved", approver_id: action.user_id, approved_at: new Date().toISOString(),
        }).eq("id", input.leave_request_id).eq("company_id", action.company_id);
        if (error) throw error;
        return { ok: true, message: "Leave request approved." };
      }
      case "reject_leave_request": {
        const { error } = await admin.from("leave_requests").update({
          status: "rejected", approver_id: action.user_id,
          rejection_reason: input.reason ?? "Rejected via AI approval workflow",
        }).eq("id", input.leave_request_id).eq("company_id", action.company_id);
        if (error) throw error;
        return { ok: true, message: "Leave request rejected." };
      }
      case "export_payroll_xlsx": {
        const { data: period } = await admin.from("payroll_periods").select("*").eq("id", input.payroll_period_id).single();
        const { data: items } = await admin.from("payroll_items")
          .select("*, employees(first_name, last_name, employee_number, salary_type, salary_amount)")
          .eq("payroll_period_id", input.payroll_period_id);
        const rows = (items ?? []).map((i: any) => ({
          "Employee #": i.employees?.employee_number ?? "",
          Employee: `${i.employees?.first_name} ${i.employees?.last_name}`,
          "Days Worked": i.days_worked, Absences: i.absences,
          "Late (min)": i.late_minutes, "Undertime (min)": i.undertime_minutes,
          "Overtime (min)": i.overtime_minutes, Allowances: i.allowances,
          Deductions: i.deductions, "Cash Advances": i.cash_advances,
          "Salary Type": i.employees?.salary_type ?? "",
          "Base Salary": i.employees?.salary_amount ?? "",
          Notes: i.notes ?? "",
        }));
        const buf = rowsToXlsx(rows, "Payroll");
        const path = await saveToStorage({
          companyId: action.company_id, documentType: "payroll_report",
          filename: `payroll_${period?.name ?? "export"}`, buffer: buf, ext: "xlsx",
        });
        const { data: doc, error } = await admin.from("employee_documents").insert({
          company_id: action.company_id, document_type: "payroll_report",
          title: `Payroll Export — ${period?.name}`, file_url: path, file_type: "xlsx",
          status: "approved", generated_by_ai: true, created_by: action.user_id,
          approved_by: action.user_id, approved_at: new Date().toISOString(),
        }).select("id").single();
        if (error) throw error;
        await admin.from("payroll_periods").update({ status: "exported" }).eq("id", input.payroll_period_id);
        return { ok: true, message: "Payroll XLSX exported and saved in Documents.", output: { document_id: doc.id } };
      }
      default:
        return { ok: false, message: `No executor registered for tool "${action.tool_name}".` };
    }
  } catch (e: any) {
    return { ok: false, message: e.message ?? "Execution failed" };
  }
}

// ---------- tool registry ----------

export const TOOLS: ToolDef[] = [
  {
    name: "search_employee",
    description: "Search employees by name. Returns basic profile info (RLS limits results to what the user may see).",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    execute: async ({ query }, tc) => {
      const cols = employeeColumns(tc.session.role);
      const parts = String(query).trim().split(/\s+/);
      let q = tc.supabase.from("employees").select(cols).eq("company_id", tc.session.companyId);
      q = parts.length >= 2
        ? q.ilike("first_name", `%${parts[0]}%`).ilike("last_name", `%${parts[parts.length - 1]}%`)
        : q.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`);
      const { data, error } = await q.limit(10);
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: `Found ${data?.length ?? 0} employee(s).`, data };
    },
  },
  {
    name: "get_employee_profile",
    description: "Get one employee's full profile by name or id, including position, department, branch, supervisor.",
    parameters: { type: "object", properties: { employee: { type: "string", description: "name or uuid" } }, required: ["employee"] },
    execute: async ({ employee }, tc) => {
      const emp = await findEmployee(tc, employee);
      if (!emp) return { ok: false, message: `No employee found matching "${employee}".` };
      if (emp.ambiguous) return { ok: false, message: "Multiple employees match. Ask the user which one.", data: emp.ambiguous };
      return { ok: true, message: "Employee found.", data: await enrichEmployee(tc, emp) };
    },
  },
  {
    name: "create_employee_draft",
    description: "Request creation of a new employee. Creates a PENDING APPROVAL — the employee is only created after an Owner/HR Admin approves. Required: first_name, last_name. Ask the user for position, salary, hire_date if not provided.",
    parameters: {
      type: "object",
      properties: {
        first_name: { type: "string" }, last_name: { type: "string" },
        middle_name: { type: "string" }, email: { type: "string" }, phone: { type: "string" },
        position_title: { type: "string" }, branch_name: { type: "string" },
        employment_status: { type: "string", enum: ["probationary", "regular", "project_based", "contractual", "consultant"] },
        salary_type: { type: "string", enum: ["monthly", "semi_monthly", "daily", "hourly"] },
        salary_amount: { type: "number" }, hire_date: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
      },
      required: ["first_name", "last_name"],
    },
    permission: "employees.write",
    execute: async (args, tc) =>
      createPendingApproval(tc, "create_employee_draft", "create_employee", args,
        `Create employee ${args.first_name} ${args.last_name}${args.position_title ? ` (${args.position_title})` : ""}`),
  },
  {
    name: "update_employee_draft",
    description: "Request an update to an employee record (status change, salary change, contact info, etc.). Creates a PENDING APPROVAL. Pass employee (name/id) and fields to change.",
    parameters: {
      type: "object",
      properties: {
        employee: { type: "string" },
        fields: { type: "object", description: "column:value pairs to update on the employees table" },
      },
      required: ["employee", "fields"],
    },
    permission: "employees.write",
    execute: async ({ employee, fields }, tc) => {
      const emp = await findEmployee(tc, employee);
      if (!emp || emp.ambiguous) return { ok: false, message: "Could not uniquely identify that employee." };
      if (("salary_amount" in fields || "salary_type" in fields) && !can(tc.session.role, "employees.write_salary"))
        return deny("Only Owners and HR Admins can change salary.");
      if (fields.employment_status === "terminated" && tc.session.role !== "owner")
        return deny("Marking an employee as terminated requires the Owner.");
      return createPendingApproval(tc, "update_employee_draft", "update_employee",
        { employee_id: emp.id, fields },
        `Update ${emp.first_name} ${emp.last_name}: ${Object.keys(fields).join(", ")}`);
    },
  },
  {
    name: "list_missing_documents",
    description: "List employees missing required 201-file documents (contract, data privacy consent, government ID).",
    parameters: { type: "object", properties: {} },
    permission: "documents.read_all",
    execute: async (_args, tc) => {
      const { data: emps } = await tc.supabase.from("employees")
        .select("id, first_name, last_name, employment_status")
        .eq("company_id", tc.session.companyId)
        .not("employment_status", "in", "(resigned,terminated,inactive,applicant)");
      const { data: docs } = await tc.supabase.from("employee_documents")
        .select("employee_id, document_type").eq("company_id", tc.session.companyId);
      const have = new Set((docs ?? []).map((d) => `${d.employee_id}:${d.document_type}`));
      const result = (emps ?? []).map((e) => ({
        employee: `${e.first_name} ${e.last_name}`,
        missing: REQUIRED_DOC_TYPES.filter((t) => !have.has(`${e.id}:${t}`)),
      })).filter((r) => r.missing.length > 0);
      return { ok: true, message: `${result.length} employee(s) have missing documents.`, data: result };
    },
  },
  {
    name: "list_regularization_due",
    description: "List probationary employees whose 6-month regularization date is near or past.",
    parameters: { type: "object", properties: { within_days: { type: "number", description: "default 45" } } },
    permission: "employees.read_all",
    execute: async ({ within_days = 45 }, tc) => {
      const { data: emps } = await tc.supabase.from("employees")
        .select("id, first_name, last_name, hire_date, regularization_date")
        .eq("company_id", tc.session.companyId).eq("employment_status", "probationary");
      const now = Date.now();
      const horizon = now + within_days * 86400000;
      const due = (emps ?? []).map((e) => {
        const regDate = e.regularization_date
          ? new Date(e.regularization_date)
          : e.hire_date ? new Date(new Date(e.hire_date).setMonth(new Date(e.hire_date).getMonth() + 6)) : null;
        return { employee: `${e.first_name} ${e.last_name}`, hire_date: e.hire_date, regularization_date: regDate?.toISOString().slice(0, 10) };
      }).filter((e) => e.regularization_date && new Date(e.regularization_date).getTime() <= horizon);
      return { ok: true, message: `${due.length} employee(s) due for regularization within ${within_days} days.`, data: due };
    },
  },
  {
    name: "generate_document",
    description: "Generate an HR document from a template. template_type is one of: employment_contract, employment_contract_regular, job_offer, certificate_of_employment, notice_to_explain, written_warning, company_memo, data_privacy_consent, policy_acknowledgment, onboarding_checklist, clearance_form, resignation_acceptance, performance_evaluation. Pass employee for employee documents. Pass extra_vars for template-specific fields (memo_subject, memo_body, incident_details, policy_title, evaluation_period, prepared_by).",
    parameters: {
      type: "object",
      properties: {
        template_type: { type: "string" },
        employee: { type: "string", description: "employee name or id (omit for company-wide docs like memos)" },
        title: { type: "string", description: "document title" },
        extra_vars: { type: "object" },
      },
      required: ["template_type"],
    },
    permission: "documents.generate",
    execute: async ({ template_type, employee, title, extra_vars = {} }, tc) => {
      let emp: any = null;
      if (employee) {
        emp = await findEmployee(tc, employee);
        if (!emp) return { ok: false, message: `No employee found matching "${employee}". Ask the user to confirm the name.` };
        if (emp.ambiguous) return { ok: false, message: "Multiple employees match — ask the user which one.", data: emp.ambiguous };
        emp = await enrichEmployee(tc, emp);
      }
      const company = await getCompany(tc);
      return generateAndSaveDocument(tc, {
        templateType: template_type,
        title: title ?? `${template_type.replace(/_/g, " ")}${emp ? ` — ${emp.first_name} ${emp.last_name}` : ""}`,
        employeeId: emp?.id ?? null,
        vars: employeeVars(emp, company, extra_vars),
      });
    },
  },
  {
    name: "save_document_content",
    description: "Save content you (the AI) wrote yourself as a document (DOCX+PDF), e.g. a job description or interview questions. Pass full plain-text content.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" }, content: { type: "string" },
        document_type: { type: "string", description: "e.g. job_description, interview_questions, company_memo, other" },
        employee: { type: "string", description: "optional employee name/id to attach to" },
      },
      required: ["title", "content", "document_type"],
    },
    permission: "documents.generate",
    execute: async ({ title, content, document_type, employee }, tc) => {
      let emp: any = null;
      if (employee) {
        emp = await findEmployee(tc, employee);
        if (emp?.ambiguous) emp = null;
      }
      return generateAndSaveDocument(tc, {
        templateType: document_type, title, employeeId: emp?.id ?? null,
        vars: {}, rawContent: content, documentType: document_type,
      });
    },
  },
  {
    name: "summarize_attendance",
    description: "Summarize attendance per employee for a date range: days present, absences, lates, undertime, overtime.",
    parameters: {
      type: "object",
      properties: { start_date: { type: "string", description: "YYYY-MM-DD" }, end_date: { type: "string" } },
      required: ["start_date", "end_date"],
    },
    execute: async ({ start_date, end_date }, tc) => {
      if (!["owner", "hr_admin", "accountant", "manager"].includes(tc.session.role))
        return deny("Employees can only view their own attendance on the Attendance page.");
      const summary = await attendanceSummary(tc, start_date, end_date);
      return { ok: true, message: `Attendance summary for ${start_date} to ${end_date} (${summary.length} employees).`, data: summary };
    },
  },
  {
    name: "list_late_employees",
    description: "List employees late more than N times within a date range.",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string" }, end_date: { type: "string" },
        min_times: { type: "number", description: "minimum late count, default 1" },
      },
      required: ["start_date", "end_date"],
    },
    execute: async ({ start_date, end_date, min_times = 1 }, tc) => {
      if (!["owner", "hr_admin", "accountant", "manager"].includes(tc.session.role)) return deny();
      const summary = await attendanceSummary(tc, start_date, end_date);
      const late = summary.filter((s) => s.late_count >= min_times)
        .sort((a, b) => b.late_count - a.late_count)
        .map((s) => ({ employee: s.employee, late_count: s.late_count, total_late_minutes: s.late_minutes }));
      return { ok: true, message: `${late.length} employee(s) late ${min_times}+ times between ${start_date} and ${end_date}.`, data: late };
    },
  },
  {
    name: "generate_payroll_summary",
    description: "Build a DRAFT payroll summary for a date range from attendance records. Creates a payroll period with per-employee items. Export to XLSX requires separate approval (export_payroll_xlsx).",
    parameters: {
      type: "object",
      properties: { start_date: { type: "string" }, end_date: { type: "string" }, name: { type: "string" } },
      required: ["start_date", "end_date"],
    },
    permission: "payroll.write",
    execute: async ({ start_date, end_date, name }, tc) => {
      const summary = await attendanceSummary(tc, start_date, end_date);
      const admin = createAdminClient();
      const periodName = name ?? `${start_date} to ${end_date}`;
      const { data: period, error } = await admin.from("payroll_periods").insert({
        company_id: tc.session.companyId, name: periodName,
        start_date, end_date, status: "draft", created_by: tc.session.userId,
      }).select("id").single();
      if (error) return { ok: false, message: error.message };
      if (summary.length > 0) {
        await admin.from("payroll_items").insert(summary.map((s) => ({
          company_id: tc.session.companyId, payroll_period_id: period.id, employee_id: s.employee_id,
          days_worked: s.days_present, absences: s.absences,
          late_minutes: s.late_minutes, undertime_minutes: s.undertime_minutes, overtime_minutes: s.overtime_minutes,
        })));
      }
      await logAudit({
        companyId: tc.session.companyId, userId: tc.session.userId,
        module: "payroll", action: "ai_generated_payroll_draft",
        details: { period_id: period.id, name: periodName, employees: summary.length },
      });
      return {
        ok: true,
        message: `DRAFT payroll period "${periodName}" created with ${summary.length} employee line items (visible on the Payroll Prep page). Ask me to export it to XLSX to request approval.`,
        data: { payroll_period_id: period.id, items: summary },
      };
    },
  },
  {
    name: "export_payroll_xlsx",
    description: "Request an XLSX export of a payroll period. Creates a PENDING APPROVAL; the file is generated only after a human approves.",
    parameters: { type: "object", properties: { payroll_period_id: { type: "string" } }, required: ["payroll_period_id"] },
    permission: "payroll.read",
    execute: async ({ payroll_period_id }, tc) => {
      const { data: period } = await tc.supabase.from("payroll_periods").select("name").eq("id", payroll_period_id).maybeSingle();
      if (!period) return { ok: false, message: "Payroll period not found (or not accessible)." };
      return createPendingApproval(tc, "export_payroll_xlsx", "payroll_export",
        { payroll_period_id }, `Export payroll "${period.name}" to XLSX`);
    },
  },
  {
    name: "create_leave_request",
    description: "File a leave request for an employee. Leave types: vacation, sick, emergency, maternity, paternity, solo_parent, bereavement, service_incentive, unpaid, other.",
    parameters: {
      type: "object",
      properties: {
        employee: { type: "string" }, leave_type: { type: "string" },
        start_date: { type: "string" }, end_date: { type: "string" }, reason: { type: "string" },
      },
      required: ["employee", "leave_type", "start_date", "end_date"],
    },
    execute: async ({ employee, leave_type, start_date, end_date, reason }, tc) => {
      const emp = await findEmployee(tc, employee);
      if (!emp || emp.ambiguous) return { ok: false, message: "Could not uniquely identify that employee." };
      // employees may only file for themselves — RLS also enforces this
      const { error } = await tc.supabase.from("leave_requests").insert({
        company_id: tc.session.companyId, employee_id: emp.id,
        leave_type, start_date, end_date, reason: reason ?? null, status: "pending",
      });
      if (error) return { ok: false, message: `Could not file leave: ${error.message}` };
      await logAudit({
        companyId: tc.session.companyId, userId: tc.session.userId, employeeId: emp.id,
        module: "leave", action: "leave_requested_via_ai", details: { leave_type, start_date, end_date },
      });
      return { ok: true, message: `Leave request filed for ${emp.first_name} ${emp.last_name} (${leave_type}, ${start_date} to ${end_date}). Status: pending approval.` };
    },
  },
  {
    name: "approve_leave_request",
    description: "Request approval of a pending leave request. Creates a PENDING APPROVAL for human sign-off.",
    parameters: { type: "object", properties: { leave_request_id: { type: "string" } }, required: ["leave_request_id"] },
    permission: "leave.approve",
    execute: async ({ leave_request_id }, tc) => {
      const { data: lr } = await tc.supabase.from("leave_requests")
        .select("id, leave_type, start_date, end_date, employees(first_name, last_name)")
        .eq("id", leave_request_id).maybeSingle();
      if (!lr) return { ok: false, message: "Leave request not found or not accessible to you." };
      const e: any = lr.employees;
      return createPendingApproval(tc, "approve_leave_request", "leave_approval",
        { leave_request_id }, `Approve ${e?.first_name} ${e?.last_name}'s ${lr.leave_type} leave (${lr.start_date}–${lr.end_date})`);
    },
  },
  {
    name: "reject_leave_request",
    description: "Request rejection of a pending leave request (with reason). Creates a PENDING APPROVAL.",
    parameters: {
      type: "object",
      properties: { leave_request_id: { type: "string" }, reason: { type: "string" } },
      required: ["leave_request_id"],
    },
    permission: "leave.approve",
    execute: async ({ leave_request_id, reason }, tc) => {
      const { data: lr } = await tc.supabase.from("leave_requests")
        .select("id, leave_type, employees(first_name, last_name)").eq("id", leave_request_id).maybeSingle();
      if (!lr) return { ok: false, message: "Leave request not found or not accessible to you." };
      const e: any = lr.employees;
      return createPendingApproval(tc, "reject_leave_request", "leave_rejection",
        { leave_request_id, reason }, `Reject ${e?.first_name} ${e?.last_name}'s ${lr.leave_type} leave`);
    },
  },
  {
    name: "get_leave_balance",
    description: "Get an employee's leave balances for the current year.",
    parameters: { type: "object", properties: { employee: { type: "string" } }, required: ["employee"] },
    execute: async ({ employee }, tc) => {
      const emp = await findEmployee(tc, employee);
      if (!emp || emp.ambiguous) return { ok: false, message: "Could not uniquely identify that employee (or you lack access)." };
      const { data } = await tc.supabase.from("leave_balances")
        .select("leave_type, balance, used, year").eq("employee_id", emp.id)
        .eq("year", new Date().getFullYear());
      return { ok: true, message: `Leave balances for ${emp.first_name} ${emp.last_name}.`, data };
    },
  },
  {
    name: "list_pending_leaves",
    description: "List pending leave requests visible to the user.",
    parameters: { type: "object", properties: {} },
    execute: async (_args, tc) => {
      const { data } = await tc.supabase.from("leave_requests")
        .select("id, leave_type, start_date, end_date, reason, employees(first_name, last_name)")
        .eq("company_id", tc.session.companyId).eq("status", "pending").order("created_at");
      const rows = (data ?? []).map((r: any) => ({
        id: r.id, employee: `${r.employees?.first_name} ${r.employees?.last_name}`,
        leave_type: r.leave_type, start_date: r.start_date, end_date: r.end_date, reason: r.reason,
      }));
      return { ok: true, message: `${rows.length} pending leave request(s).`, data: rows };
    },
  },
  {
    name: "analyze_resume",
    description: "Analyze an applicant's uploaded resume against a role. Pass applicant_id (from an upload confirmation or the applicant list) and the target role. Saves AI summary and score to the applicant.",
    parameters: {
      type: "object",
      properties: { applicant_id: { type: "string" }, role: { type: "string", description: "target position" } },
      required: ["applicant_id", "role"],
    },
    permission: "recruitment.manage",
    execute: async ({ applicant_id, role }, tc) => {
      const { data: app } = await tc.supabase.from("applicants").select("*").eq("id", applicant_id).maybeSingle();
      if (!app) return { ok: false, message: "Applicant not found." };
      if (!app.resume_text) return { ok: false, message: "No readable resume text stored for this applicant. Upload a PDF/DOCX/TXT resume first." };
      // resume analysis is a premium task -> OpenAI when configured, Groq otherwise
      const { openaiClient, groqClient, hasOpenAI, OPENAI_MODEL, GROQ_CHAT_MODEL } = await import("@/lib/agent/providers");
      const client = hasOpenAI() ? openaiClient() : groqClient();
      const completion = await client.chat.completions.create({
        model: hasOpenAI() ? OPENAI_MODEL : GROQ_CHAT_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are an HR recruitment analyst for a Philippine SME. Respond in JSON: {\"summary\": string (strengths, gaps, fit assessment, ~150 words), \"score\": number 1-10, \"interview_questions\": string[5]}." },
          { role: "user", content: `Role: ${role}\n\nResume:\n${String(app.resume_text).slice(0, 8000)}` },
        ],
      });
      const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
      const admin = createAdminClient();
      await admin.from("applicants").update({
        ai_summary: parsed.summary ?? null, ai_score: parsed.score ?? null,
        applied_position: app.applied_position ?? role, status: app.status === "new" ? "reviewed" : app.status,
      }).eq("id", applicant_id);
      await logAudit({
        companyId: tc.session.companyId, userId: tc.session.userId,
        module: "recruitment", action: "ai_resume_analysis", details: { applicant_id, role, score: parsed.score },
      });
      return { ok: true, message: "Resume analyzed and saved to the applicant profile.", data: parsed };
    },
  },
  {
    name: "list_applicants",
    description: "List applicants and their status/scores.",
    parameters: { type: "object", properties: { status: { type: "string" } } },
    permission: "recruitment.manage",
    execute: async ({ status }, tc) => {
      let q = tc.supabase.from("applicants")
        .select("id, first_name, last_name, applied_position, status, ai_score")
        .eq("company_id", tc.session.companyId);
      if (status) q = q.eq("status", status);
      const { data } = await q.order("created_at", { ascending: false }).limit(25);
      return { ok: true, message: `${data?.length ?? 0} applicant(s).`, data };
    },
  },
  {
    name: "create_compliance_reminder",
    description: "Create a compliance reminder (e.g. regularization due, contract expiration, 13th month prep, government contributions).",
    parameters: {
      type: "object",
      properties: {
        reminder_type: { type: "string" }, title: { type: "string" },
        description: { type: "string" }, due_date: { type: "string", description: "YYYY-MM-DD" },
        employee: { type: "string", description: "optional related employee" },
      },
      required: ["reminder_type", "title", "due_date"],
    },
    permission: "compliance.write",
    execute: async ({ reminder_type, title, description, due_date, employee }, tc) => {
      let empId: string | null = null;
      if (employee) {
        const emp = await findEmployee(tc, employee);
        if (emp && !emp.ambiguous) empId = emp.id;
      }
      const { error } = await tc.supabase.from("compliance_reminders").insert({
        company_id: tc.session.companyId, reminder_type, title,
        description: description ?? null, due_date, related_employee_id: empId, status: "open",
      });
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: `Compliance reminder "${title}" created, due ${due_date}. (Reminders are guidance only, not legal advice.)` };
    },
  },
  {
    name: "list_compliance_reminders",
    description: "List open compliance reminders.",
    parameters: { type: "object", properties: {} },
    permission: "compliance.read",
    execute: async (_args, tc) => {
      const { data } = await tc.supabase.from("compliance_reminders")
        .select("id, reminder_type, title, description, due_date, status")
        .eq("company_id", tc.session.companyId).eq("status", "open").order("due_date");
      return { ok: true, message: `${data?.length ?? 0} open reminder(s).`, data };
    },
  },
  {
    name: "search_company_policies",
    description: "Search the company's policy knowledge base (handbook, memos-as-policy, house rules). Use this to ground any answer about company policy — do not answer policy questions from general knowledge. Pass an empty query to list all policy titles.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "keywords, e.g. 'attendance tardiness' — or empty to list all" } },
    },
    execute: async ({ query }, tc) => {
      const q = String(query ?? "").trim();
      let request = tc.supabase.from("company_policies")
        .select("id, title, category, content")
        .eq("company_id", tc.session.companyId);
      if (q) {
        // websearch FTS with an ilike fallback for terms the parser drops
        request = request.or(`search_vector.wfts.${q.replace(/[(),]/g, " ")},title.ilike.%${q}%`);
      }
      const { data, error } = await request.limit(5);
      if (error) return { ok: false, message: error.message };
      if (!data?.length) {
        return { ok: true, message: q ? `No company policy found matching "${q}". Tell the user no policy is on file for this topic and suggest HR add one in Settings.` : "No policies recorded yet. Owners/HR Admins can add them in Settings > Company policies." };
      }
      return {
        ok: true,
        message: `Found ${data.length} polic${data.length === 1 ? "y" : "ies"}.`,
        data: data.map((p) => ({ title: p.title, category: p.category, content: String(p.content).slice(0, 3000) })),
      };
    },
  },
  {
    name: "list_pending_approvals",
    description: "List AI actions waiting for human approval.",
    parameters: { type: "object", properties: {} },
    execute: async (_args, tc) => {
      const { data } = await tc.supabase.from("ai_actions")
        .select("id, tool_name, action_type, input, created_at")
        .eq("company_id", tc.session.companyId).eq("status", "pending")
        .order("created_at", { ascending: false }).limit(20);
      return { ok: true, message: `${data?.length ?? 0} pending approval(s). They can be approved on the Approvals page.`, data };
    },
  },
  {
    name: "compute_final_pay",
    description: "Compute a DRAFT final pay (last pay) for a separated employee: unpaid last salary, pro-rated 13th month, unused leave conversion, minus deductions/cash advances/liabilities. Creates a draft on the Final Pay page that requires human approval before release. Ask the user for separation_date; days_worked and unused_leave_days default to 0 if unknown.",
    parameters: {
      type: "object",
      properties: {
        employee: { type: "string", description: "employee name or id" },
        separation_date: { type: "string", description: "YYYY-MM-DD" },
        reason: { type: "string", enum: ["resignation", "end_of_contract", "termination", "retirement", "redundancy", "closure", "other"] },
        days_worked: { type: "number", description: "unpaid days worked in the final cutoff" },
        unused_leave_days: { type: "number", description: "convertible leave credits (days)" },
        cash_advances: { type: "number" },
        deductions: { type: "number" },
      },
      required: ["employee", "separation_date"],
    },
    permission: "payroll.write",
    execute: async ({ employee, separation_date, reason, days_worked, unused_leave_days, cash_advances, deductions }, tc) => {
      const found = await findEmployee(tc, employee);
      if (!found) return { ok: false, message: `No employee found matching "${employee}".` };
      if (found.ambiguous) return { ok: false, message: "Multiple employees match — ask the user which one.", data: found.ambiguous };
      const admin0 = createAdminClient();
      // salary may be masked for accountants in the user-scoped read — fetch via admin (payroll-authorized)
      const { data: emp } = await admin0.from("employees")
        .select("id, first_name, last_name, salary_type, salary_amount, hire_date")
        .eq("id", found.id).eq("company_id", tc.session.companyId).single();
      if (!emp) return { ok: false, message: "Employee not found." };
      if (emp.salary_amount == null)
        return { ok: false, message: `No salary on file for ${emp.first_name} ${emp.last_name}. Final pay needs a salary — ask HR to set it first.` };
      const { computeFinalPay } = await import("@/lib/finalpay");
      const c = computeFinalPay({
        salaryType: emp.salary_type, salaryAmount: Number(emp.salary_amount),
        daysWorked: Number(days_worked ?? 0), unusedLeaveDays: Number(unused_leave_days ?? 0),
        hireDate: emp.hire_date, separationDate: separation_date,
        cashAdvances: Number(cash_advances ?? 0), deductions: Number(deductions ?? 0),
      });
      const admin = createAdminClient();
      const { error } = await admin.from("final_pay").insert({
        company_id: tc.session.companyId, employee_id: emp.id, separation_date,
        reason: reason ?? "resignation", days_worked: Number(days_worked ?? 0),
        unused_leave_days: Number(unused_leave_days ?? 0),
        last_salary: c.lastSalary, pro_rated_13th: c.proRated13th, leave_conversion: c.leaveConversion,
        allowances: c.allowances, deductions: c.deductions, cash_advances: c.cashAdvances,
        other_liabilities: c.otherLiabilities, net_final_pay: c.net, status: "draft", created_by: tc.session.userId,
      });
      if (error) return { ok: false, message: error.message };
      await logAudit({
        companyId: tc.session.companyId, userId: tc.session.userId, employeeId: emp.id,
        module: "payroll", action: "ai_final_pay_draft", details: { separation_date, net: c.net },
      });
      return {
        ok: true,
        message: `Draft final pay for ${emp.first_name} ${emp.last_name} (separated ${separation_date}): last salary ₱${c.lastSalary.toLocaleString("en-PH")}, pro-rated 13th month ₱${c.proRated13th.toLocaleString("en-PH")}, leave conversion ₱${c.leaveConversion.toLocaleString("en-PH")}, less deductions ₱${c.totalDeductions.toLocaleString("en-PH")} → NET ₱${c.net.toLocaleString("en-PH")}. It's a DRAFT on the Final Pay page and needs Owner/HR Admin approval before release. Estimate excludes statutory final withholding.`,
        data: c,
      };
    },
  },
  {
    name: "list_final_pay",
    description: "List final pay (last pay) records and their status.",
    parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "approved", "released", "exported"] } } },
    permission: "payroll.read",
    execute: async ({ status }, tc) => {
      let q = tc.supabase.from("final_pay")
        .select("id, separation_date, reason, net_final_pay, status, employees(first_name, last_name)")
        .eq("company_id", tc.session.companyId);
      if (status) q = q.eq("status", status);
      const { data } = await q.order("created_at", { ascending: false }).limit(25);
      const rows = (data ?? []).map((r: any) => ({
        employee: `${r.employees?.first_name} ${r.employees?.last_name}`,
        separation_date: r.separation_date, reason: r.reason, net_final_pay: r.net_final_pay, status: r.status,
      }));
      return { ok: true, message: `${rows.length} final pay record(s).`, data: rows };
    },
  },
];

// Read/query tools — the "front desk" (Groq) set. Fewer + simpler schemas keep
// small models reliable at tool calling; write/generate tools live in the task lane.
export const READ_TOOL_NAMES = [
  "search_employee", "get_employee_profile", "list_missing_documents", "list_regularization_due",
  "summarize_attendance", "list_late_employees", "get_leave_balance", "list_pending_leaves",
  "search_company_policies", "list_compliance_reminders", "list_pending_approvals", "list_applicants",
  "list_final_pay",
  "create_leave_request", // employees file leave conversationally — safe, always ends pending
];

export function toolSchemas(names?: string[]) {
  return TOOLS.filter((t) => !names || names.includes(t.name)).map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export async function runTool(name: string, args: any, tc: ToolContext): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, message: `Unknown tool: ${name}` };
  const planBlock = await enforceToolPlan(name, args ?? {}, tc);
  if (planBlock) return planBlock;
  if (tool.permission && !can(tc.session.role, tool.permission)) {
    return deny(`Your role (${tc.session.role.replace("_", " ")}) does not permit this action.`);
  }
  try {
    return await tool.execute(args ?? {}, tc);
  } catch (e: any) {
    console.error(`tool ${name} failed:`, e);
    return { ok: false, message: `Tool error: ${e.message ?? "unexpected failure"}` };
  }
}
