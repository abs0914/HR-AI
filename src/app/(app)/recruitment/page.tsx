import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { updateApplicantStatus } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Table, Th, Td, Badge, Button, EmptyState, Select } from "@/components/ui";
import { UploadButton } from "@/components/upload-button";
import { Bot } from "lucide-react";

const STATUSES = ["new", "reviewed", "shortlisted", "interview_scheduled", "offered", "hired", "rejected"];

export default async function RecruitmentPage() {
  const session = await requireSession();
  if (!can(session.role, "recruitment.manage")) redirect("/dashboard");
  const supabase = await createClient();
  const { data: applicants } = await supabase.from("applicants")
    .select("*").eq("company_id", session.companyId).order("created_at", { ascending: false }).limit(100);

  return (
    <>
      <PageHeader title="Recruitment" subtitle={`${applicants?.length ?? 0} applicant(s)`}>
        <UploadButton purpose="resume" label="Upload resume" accept=".pdf,.docx,.txt" />
        <Link href="/console?q=Create a job description. Ask me for the role and requirements.">
          <Button variant="outline"><Bot size={15} /> Job description</Button>
        </Link>
        <Link href="/console?q=Generate interview questions. Ask me for the role.">
          <Button variant="outline"><Bot size={15} /> Interview questions</Button>
        </Link>
      </PageHeader>

      {!applicants?.length ? (
        <EmptyState title="No applicants yet" hint="Upload a resume — Kawani AI can analyze it, score the candidate, and draft interview questions." />
      ) : (
        <Table>
          <thead><tr><Th>Applicant</Th><Th>Position</Th><Th>AI Score</Th><Th>AI Summary</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {applicants.map((a: any) => (
              <tr key={a.id}>
                <Td className="font-medium">{a.first_name} {a.last_name}<p className="text-xs text-gray-400">{a.email ?? ""}</p></Td>
                <Td>{a.applied_position ?? "—"}</Td>
                <Td>{a.ai_score != null ? <span className="font-semibold text-primary">{a.ai_score}/10</span> : "—"}</Td>
                <Td className="max-w-md"><p className="line-clamp-3 text-xs text-gray-600">{a.ai_summary ?? "Not analyzed yet — ask Kawani AI to analyze this applicant."}</p></Td>
                <Td><Badge status={a.status}>{a.status.replace(/_/g, " ")}</Badge></Td>
                <Td>
                  <div className="space-y-1.5">
                    <ActionForm action={updateApplicantStatus} className="flex items-center gap-1.5" resetOnSuccess={false}>
                      <input type="hidden" name="id" value={a.id} />
                      <Select name="status" defaultValue={a.status} className="w-40 text-xs">
                        {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                      </Select>
                      <Button type="submit" size="sm" variant="outline">Set</Button>
                    </ActionForm>
                    <Link
                      href={`/console?q=${encodeURIComponent(`Analyze applicant ${a.first_name} ${a.last_name} (applicant_id: ${a.id}) for the ${a.applied_position ?? "open"} role.`)}`}
                      className="block text-xs text-primary hover:underline"
                    >
                      Analyze with AI →
                    </Link>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
