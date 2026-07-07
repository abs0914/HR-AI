import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { updateCompany, addOrgItem, inviteUser, updateUserRole, linkUserToEmployee, savePolicy, deletePolicy } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Button, Input, Label, Select, Card, CardContent, CardHeader, CardTitle, Badge, Textarea } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPayMongo, effectivePlan } from "@/lib/billing";

export default async function SettingsPage() {
  const session = await requireSession();
  if (!can(session.role, "settings.manage")) redirect("/dashboard");
  const supabase = await createClient();

  const [{ data: company }, { data: branches }, { data: departments }, { data: positions }, { data: holidays }, { data: users }, { data: templates }, { data: employees }, { data: policies }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", session.companyId).single(),
    supabase.from("branches").select("id, name, address").eq("company_id", session.companyId),
    supabase.from("departments").select("id, name").eq("company_id", session.companyId),
    supabase.from("positions").select("id, title").eq("company_id", session.companyId),
    supabase.from("company_holidays").select("id, name, holiday_date, holiday_type").eq("company_id", session.companyId).order("holiday_date"),
    supabase.from("company_users").select("id, user_id, role, status").eq("company_id", session.companyId),
    supabase.from("document_templates").select("id, title, template_type, company_id").or(`company_id.eq.${session.companyId},company_id.is.null`),
    supabase.from("employees").select("id, first_name, last_name, user_id").eq("company_id", session.companyId).order("last_name"),
    supabase.from("company_policies").select("id, title, category, created_at").eq("company_id", session.companyId).order("title"),
  ]);
  const employeeByUser = new Map((employees ?? []).filter((e) => e.user_id).map((e) => [e.user_id as string, e]));
  const billingEnabled = hasPayMongo();
  const currentPlan = effectivePlan(company ?? {});

  // emails for members (service role; page already owner/hr_admin gated)
  const admin = createAdminClient();
  const emails = new Map<string, string>();
  for (const u of users ?? []) {
    const { data } = await admin.auth.admin.getUserById(u.user_id);
    if (data.user?.email) emails.set(u.user_id, data.user.email);
  }
  const isOwner = session.role === "owner";

  return (
    <>
      <PageHeader title="Settings" subtitle="Company profile, organization, users, and templates" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Company profile</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={updateCompany} className="space-y-3" resetOnSuccess={false}>
              <div><Label>Name</Label><Input name="name" defaultValue={company?.name} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Business type</Label><Input name="business_type" defaultValue={company?.business_type ?? ""} /></div>
                <div><Label>Industry</Label><Input name="industry" defaultValue={company?.industry ?? ""} /></div>
              </div>
              <div><Label>Address</Label><Input name="address" defaultValue={company?.address ?? ""} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Payroll cycle</Label>
                  <Select name="payroll_cycle" defaultValue={company?.payroll_cycle ?? "semi-monthly"}>
                    <option value="weekly">Weekly</option>
                    <option value="semi-monthly">Semi-monthly</option>
                    <option value="monthly">Monthly</option>
                  </Select>
                </div>
                <div><Label>Work schedule</Label><Input name="work_schedule" defaultValue={company?.work_schedule ?? ""} /></div>
              </div>
              <p className="text-xs text-gray-400">Timezone: {company?.timezone}</p>
              <Button type="submit">Save profile</Button>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Billing & plan</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-700">
              Current plan: <Badge status={currentPlan === "free" ? "inactive" : "active"}>{currentPlan}</Badge>
              {company?.plan_expires_at && (
                <span className="ml-2 text-xs text-gray-400">
                  {new Date(company.plan_expires_at).getTime() < Date.now() ? "expired" : "renews/expires"}{" "}
                  {new Date(company.plan_expires_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500">
              Free: Groq Q&A and data lookups only. Premium (₱1,499/30 days): AI document generation, resume analysis, payroll exports, Claude drafting. Enterprise (₱6,999/30 days): everything, priority support.
            </p>
            {isOwner && billingEnabled && (
              <div className="flex gap-2">
                <a href="/api/billing/checkout?plan=premium"><Button>Upgrade to Premium — GCash/Maya/Card</Button></a>
                <a href="/api/billing/checkout?plan=enterprise"><Button variant="outline">Enterprise</Button></a>
              </div>
            )}
            {isOwner && !billingEnabled && (
              <ActionForm action={updateCompany} className="flex items-end gap-2" resetOnSuccess={false}>
                <input type="hidden" name="name" value={company?.name ?? ""} />
                <div className="flex-1">
                  <Label>Plan (dev mode — PayMongo not configured)</Label>
                  <Select name="plan" defaultValue={company?.plan ?? "premium"}>
                    <option value="free">Free</option>
                    <option value="premium">Premium</option>
                    <option value="enterprise">Enterprise</option>
                  </Select>
                </div>
                <Button type="submit" variant="outline">Set plan</Button>
              </ActionForm>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Users & roles {isOwner ? "" : "(view only — Owner manages roles)"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(users ?? []).map((u) => {
              const linked = employeeByUser.get(u.user_id);
              return (
                <div key={u.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-800">{emails.get(u.user_id) ?? u.user_id.slice(0, 8)}</p>
                      <Badge status={u.status}>{u.status}</Badge>
                    </div>
                    {isOwner ? (
                      <ActionForm action={updateUserRole} className="flex items-center gap-1.5" resetOnSuccess={false}>
                        <input type="hidden" name="id" value={u.id} />
                        <Select name="role" defaultValue={u.role} className="w-32 text-xs">
                          {["owner", "hr_admin", "manager", "accountant", "employee"].map((r) => (
                            <option key={r} value={r}>{r.replace("_", " ")}</option>
                          ))}
                        </Select>
                        <Button type="submit" size="sm" variant="outline">Set</Button>
                      </ActionForm>
                    ) : (
                      <Badge>{u.role.replace("_", " ")}</Badge>
                    )}
                  </div>
                  {isOwner && (
                    <ActionForm action={linkUserToEmployee} className="mt-1.5 flex items-center gap-1.5" resetOnSuccess={false}>
                      <input type="hidden" name="user_id" value={u.user_id} />
                      <span className="text-xs text-gray-400">Employee record:</span>
                      <Select name="employee_id" defaultValue={linked?.id ?? ""} className="w-44 text-xs">
                        <option value="">Not linked</option>
                        {(employees ?? []).map((e) => (
                          <option key={e.id} value={e.id} disabled={!!e.user_id && e.user_id !== u.user_id}>
                            {e.first_name} {e.last_name}{e.user_id && e.user_id !== u.user_id ? " (linked)" : ""}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" size="sm" variant="outline">Link</Button>
                    </ActionForm>
                  )}
                </div>
              );
            })}
            {isOwner && (
              <ActionForm action={inviteUser} className="mt-4 flex items-end gap-2 border-t border-line pt-4">
                <div className="flex-1"><Label>Invite by email</Label><Input name="email" type="email" required placeholder="teammate@company.ph" /></div>
                <div>
                  <Label>Role</Label>
                  <Select name="role" defaultValue="employee" className="w-32">
                    {["hr_admin", "manager", "accountant", "employee"].map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
                  </Select>
                </div>
                <Button type="submit">Invite</Button>
              </ActionForm>
            )}
          </CardContent>
        </Card>

        {(["branch", "department", "position"] as const).map((kind) => {
          const list = kind === "branch" ? branches : kind === "department" ? departments : positions;
          return (
            <Card key={kind}>
              <CardHeader><CardTitle className="capitalize">{kind === "branch" ? "Branches" : kind === "department" ? "Departments" : "Positions"}</CardTitle></CardHeader>
              <CardContent>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {(list ?? []).map((item: any) => (
                    <span key={item.id} className="rounded-full border border-line bg-muted-bg px-3 py-1 text-xs text-gray-700">
                      {item.name ?? item.title}
                    </span>
                  ))}
                  {!list?.length && <p className="text-xs text-gray-400">None yet.</p>}
                </div>
                <ActionForm action={addOrgItem} className="flex items-end gap-2">
                  <input type="hidden" name="kind" value={kind} />
                  <div className="flex-1"><Label>Add {kind}</Label><Input name="name" required /></div>
                  <Button type="submit" variant="outline">Add</Button>
                </ActionForm>
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardHeader><CardTitle>Holidays</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 max-h-40 space-y-1 overflow-y-auto">
              {(holidays ?? []).map((h) => (
                <p key={h.id} className="text-xs text-gray-600">{h.holiday_date} — {h.name} <span className="text-gray-400">({h.holiday_type})</span></p>
              ))}
              {!holidays?.length && <p className="text-xs text-gray-400">No holidays configured.</p>}
            </div>
            <ActionForm action={addOrgItem} className="flex items-end gap-2">
              <input type="hidden" name="kind" value="holiday" />
              <div className="flex-1"><Label>Name</Label><Input name="name" required placeholder="Independence Day" /></div>
              <div><Label>Date</Label><Input type="date" name="holiday_date" required /></div>
              <Button type="submit" variant="outline">Add</Button>
            </ActionForm>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Company policies (Kawani AI knowledge base)</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-4 space-y-1.5">
              {(policies ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <p className="text-sm text-gray-800">{p.title} <Badge>{p.category}</Badge></p>
                  <ActionForm action={deletePolicy} confirmText={`Delete policy "${p.title}"?`}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" size="sm" variant="ghost">Delete</Button>
                  </ActionForm>
                </div>
              ))}
              {!policies?.length && (
                <p className="text-xs text-gray-400">
                  No policies yet. Add your house rules here — Kawani AI quotes them when anyone asks &ldquo;What is our policy on…?&rdquo;
                </p>
              )}
            </div>
            <ActionForm action={savePolicy} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2"><Label>Policy title</Label><Input name="title" required placeholder="Attendance and Tardiness Policy" /></div>
              <div>
                <Label>Category</Label>
                <Select name="category" defaultValue="general">
                  {["general", "attendance", "leave", "conduct", "compensation", "safety", "data_privacy"].map((c) => (
                    <option key={c} value={c}>{c.replace("_", " ")}</option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-3">
                <Label>Policy text</Label>
                <Textarea name="content" required rows={5} placeholder="Paste the full policy text here…" />
              </div>
              <div className="sm:col-span-3"><Button type="submit">Save policy</Button></div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Document templates</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {(templates ?? []).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-0.5">
                  <p className="text-xs text-gray-700">{t.title}</p>
                  <Badge>{t.company_id ? "custom" : "default"}</Badge>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Global defaults ship with HR AI. Kawani AI uses your company template when one exists for the same type.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
