import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { effectivePlan, hasFeature, PLAN_CONFIG } from "@/lib/billing";
import * as XLSX from "xlsx";

export const maxDuration = 60;

async function extractText(file: File): Promise<string | null> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".txt") || name.endsWith(".csv")) return buf.toString("utf-8");
    if (name.endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
    }
    if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value;
    }
    if (name.endsWith(".xlsx")) {
      const wb = XLSX.read(buf, { type: "buffer" });
      return wb.SheetNames.map((s) => XLSX.utils.sheet_to_csv(wb.Sheets[s])).join("\n");
    }
  } catch (e: any) {
    console.error("text extraction failed:", e.message);
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = rateLimit(`upload:${session.userId}`, LIMITS.upload.limit, LIMITS.upload.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many uploads — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  }

  const form = await req.formData();
  const file = form.get("file");
  const purpose = String(form.get("purpose") ?? "general"); // resume | attendance_import | employee_document | company_logo | general
  const employeeId = form.get("employeeId") ? String(form.get("employeeId")) : null;
  const documentType = String(form.get("documentType") ?? "other");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Max file size is 10 MB" }, { status: 400 });

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies")
    .select("plan, paid_until, plan_expires_at")
    .eq("id", session.companyId)
    .single();
  const plan = effectivePlan(company ?? {});
  if (purpose === "resume" && !hasFeature(plan, "resume_analysis")) {
    return NextResponse.json({ error: `${PLAN_CONFIG[plan].name} does not include resume analysis AI. Upgrade to Business or higher.` }, { status: 403 });
  }
  if (purpose === "attendance_import" && !hasFeature(plan, "attendance_import")) {
    return NextResponse.json({ error: `${PLAN_CONFIG[plan].name} does not include attendance import. Upgrade to Core or higher.` }, { status: 403 });
  }

  const admin = createAdminClient();

  // ---- company document logo ----
  if (purpose === "company_logo") {
    if (!can(session.role, "settings.manage")) {
      return NextResponse.json({ error: "Not permitted" }, { status: 403 });
    }
    const allowed = new Set(["image/png", "image/jpeg"]);
    if (!allowed.has(file.type)) {
      return NextResponse.json({ error: "Logo must be a PNG or JPEG image." }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Logo must be 2 MB or smaller." }, { status: 400 });
    }
    const extension = file.type === "image/png" ? "png" : "jpg";
    const path = `${session.companyId}/branding/document-logo.${extension}`;
    const { error: logoError } = await admin.storage.from("documents").upload(
      path,
      Buffer.from(await file.arrayBuffer()),
      { contentType: file.type, upsert: true }
    );
    if (logoError) return NextResponse.json({ error: logoError.message }, { status: 500 });
    const { error: companyError } = await supabase.from("companies")
      .update({ document_logo_path: path, updated_at: new Date().toISOString() })
      .eq("id", session.companyId);
    if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 });
    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      module: "settings",
      action: "document_logo_updated",
      details: { path, filename: file.name, size: file.size },
    });
    return NextResponse.json({ ok: true, path });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${session.companyId}/${employeeId ?? "general"}/${purpose === "resume" ? "resume" : documentType}/${Date.now()}_${safeName}`;
  const { error: upErr } = await admin.storage.from("documents")
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "application/octet-stream" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await logAudit({
    companyId: session.companyId, userId: session.userId, employeeId,
    module: "documents", action: "file_uploaded",
    details: { path, purpose, filename: file.name, size: file.size },
  });

  // ---- resume: create applicant with extracted text ----
  if (purpose === "resume") {
    if (!can(session.role, "recruitment.manage")) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
    const text = await extractText(file);
    const guessName = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").trim().split(/\s+/);
    const { data: applicant, error } = await supabase.from("applicants").insert({
      company_id: session.companyId,
      first_name: String(form.get("firstName") ?? guessName[0] ?? "Unknown"),
      last_name: String(form.get("lastName") ?? guessName.slice(1).join(" ") ?? "Applicant"),
      applied_position: form.get("position") ? String(form.get("position")) : null,
      resume_url: path, resume_text: text, status: "new",
    }).select("id, first_name, last_name").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      ok: true, path, applicantId: applicant.id,
      fileContext: {
        kind: "resume", applicant_id: applicant.id,
        applicant_name: `${applicant.first_name} ${applicant.last_name}`,
        note: "Resume uploaded. Use the analyze_resume tool with this applicant_id to analyze it.",
      },
    });
  }

  // ---- attendance import: parse CSV/XLSX rows ----
  if (purpose === "attendance_import") {
    if (!can(session.role, "attendance.write")) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
    const buf = Buffer.from(await file.arrayBuffer());
    let rows: any[] = [];
    try {
      const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    } catch {
      return NextResponse.json({ error: "Could not parse file. Use CSV or XLSX with headers: employee_number, date, time_in, time_out, late_minutes, undertime_minutes, overtime_minutes, status, remarks" }, { status: 400 });
    }
    const { data: emps } = await supabase.from("employees")
      .select("id, employee_number, first_name, last_name").eq("company_id", session.companyId);
    const byNumber = new Map((emps ?? []).map((e) => [String(e.employee_number ?? "").toLowerCase(), e.id]));
    const byName = new Map((emps ?? []).map((e) => [`${e.first_name} ${e.last_name}`.toLowerCase(), e.id]));
    let imported = 0; const skipped: string[] = [];
    for (const r of rows) {
      const key = String(r.employee_number ?? r.employee ?? r.name ?? "").toLowerCase();
      const empId = byNumber.get(key) ?? byName.get(key);
      const dateRaw = r.date ?? r.attendance_date;
      if (!empId || !dateRaw) { skipped.push(key || "(blank row)"); continue; }
      const date = dateRaw instanceof Date ? dateRaw.toISOString().slice(0, 10) : String(dateRaw).slice(0, 10);
      const { error } = await admin.from("attendance_records").upsert({
        company_id: session.companyId, employee_id: empId, attendance_date: date,
        late_minutes: Number(r.late_minutes ?? 0) || 0,
        undertime_minutes: Number(r.undertime_minutes ?? 0) || 0,
        overtime_minutes: Number(r.overtime_minutes ?? 0) || 0,
        break_minutes: Number(r.break_minutes ?? 0) || 0,
        status: String(r.status ?? ((Number(r.late_minutes ?? 0) > 0) ? "late" : "present")),
        remarks: r.remarks ? String(r.remarks) : null,
        source: "import",
      }, { onConflict: "employee_id,attendance_date" });
      if (!error) imported++;
    }
    await logAudit({
      companyId: session.companyId, userId: session.userId,
      module: "attendance", action: "attendance_imported",
      details: { imported, skipped: skipped.length, file: file.name },
    });
    return NextResponse.json({
      ok: true, imported, skipped,
      fileContext: { kind: "attendance_import", imported, skipped_rows: skipped.slice(0, 10) },
    });
  }

  // ---- employee document / general upload ----
  const { data: doc, error } = await supabase.from("employee_documents").insert({
    company_id: session.companyId, employee_id: employeeId,
    document_type: documentType, title: file.name, file_url: path,
    file_type: file.name.split(".").pop() ?? "bin", status: "approved",
    generated_by_ai: false, created_by: session.userId,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const text = await extractText(file);
  return NextResponse.json({
    ok: true, path, documentId: doc.id,
    fileContext: {
      kind: "document", document_id: doc.id, filename: file.name, document_type: documentType,
      extracted_text_preview: text ? text.slice(0, 4000) : null,
    },
  });
}
