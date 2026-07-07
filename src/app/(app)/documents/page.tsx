import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { approveDocument } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Table, Th, Td, Badge, Button, EmptyState, Select } from "@/components/ui";
import { UploadButton } from "@/components/upload-button";
import Link from "next/link";
import { Bot } from "lucide-react";

const DOC_TYPES = [
  "employment_contract", "job_offer", "certificate_of_employment", "notice_to_explain",
  "written_warning", "company_memo", "data_privacy_consent", "policy_acknowledgment",
  "clearance_form", "onboarding_checklist", "performance_evaluation", "resignation_acceptance",
  "employee_handbook", "payroll_report", "attendance_report", "resume", "government_id",
  "medical_certificate", "other",
];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string }> }) {
  const session = await requireSession();
  const { type, status } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("employee_documents")
    .select("id, title, document_type, status, version, generated_by_ai, created_at, employees(first_name, last_name)")
    .eq("company_id", session.companyId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (type) query = query.eq("document_type", type);
  if (status) query = query.eq("status", status);
  const { data: docs } = await query;
  const canApprove = can(session.role, "documents.approve");

  return (
    <>
      <PageHeader title="Documents & 201 Files" subtitle="Uploaded and AI-generated HR documents">
        {can(session.role, "documents.generate") && (
          <>
            <UploadButton purpose="general" label="Upload document" accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg" />
            <Link href="/console?q=Generate an HR document. Ask me which type and for which employee.">
              <Button><Bot size={15} /> Generate with AI</Button>
            </Link>
          </>
        )}
      </PageHeader>

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <Select name="type" defaultValue={type ?? ""} className="max-w-[240px]">
          <option value="">All document types</option>
          {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </Select>
        <Select name="status" defaultValue={status ?? ""} className="max-w-[160px]">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="archived">Archived</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      {!docs?.length ? (
        <EmptyState title="No documents yet" hint='Ask Kawani AI: "Generate a COE for Juan Dela Cruz."' />
      ) : (
        <Table>
          <thead>
            <tr><Th>Title</Th><Th>Employee</Th><Th>Type</Th><Th>Status</Th><Th>Created</Th><Th>Actions</Th></tr>
          </thead>
          <tbody>
            {docs.map((d: any) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <Td className="font-medium">{d.title}{d.generated_by_ai && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary">AI</span>}</Td>
                <Td>{d.employees ? `${d.employees.first_name} ${d.employees.last_name}` : "—"}</Td>
                <Td className="capitalize">{d.document_type.replace(/_/g, " ")}</Td>
                <Td><Badge status={d.status}>{d.status}</Badge> <span className="text-xs text-gray-400">v{d.version}</span></Td>
                <Td>{new Date(d.created_at).toLocaleDateString("en-PH")}</Td>
                <Td>
                  <span className="flex items-center gap-2 text-xs">
                    <a className="text-primary hover:underline" href={`/api/documents/${d.id}/download?fmt=docx`}>DOCX</a>
                    <a className="text-primary hover:underline" href={`/api/documents/${d.id}/download?fmt=pdf`}>PDF</a>
                    {canApprove && d.status === "draft" && (
                      <ActionForm action={approveDocument} className="inline">
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="status" value="approved" />
                        <Button type="submit" size="sm" variant="outline">Approve</Button>
                      </ActionForm>
                    )}
                    {canApprove && d.status !== "archived" && (
                      <ActionForm action={approveDocument} className="inline">
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="status" value="archived" />
                        <Button type="submit" size="sm" variant="ghost">Archive</Button>
                      </ActionForm>
                    )}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
