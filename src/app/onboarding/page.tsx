import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getPlatformAdmin } from "@/lib/platform-admin";
import { createCompany } from "@/lib/actions";
import { ActionForm, Toaster } from "@/components/action-form";
import { Button, Input, Label, Select } from "@/components/ui";
import { Bot } from "lucide-react";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = await getPlatformAdmin();
  if (admin) redirect("/admin");
  const existing = await getSessionContext();
  if (existing) redirect("/dashboard");

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <Toaster />
      <div className="glass-card rise-in w-full max-w-lg rounded-[32px] p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="orb flex h-11 w-11 items-center justify-center"><Bot size={22} className="relative z-10 text-white drop-shadow" /></span>
          <div>
            <h1 className="text-lg font-bold">Set up your company</h1>
            <p className="text-sm text-gray-500">Create a Free workspace or start a PayMongo subscription for a paid plan.</p>
          </div>
        </div>
        <ActionForm action={createCompany} className="space-y-4" resetOnSuccess={false}>
          <div>
            <Label>Company name *</Label>
            <Input name="name" required placeholder="Your Company Inc." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Business type</Label>
              <Select name="business_type" defaultValue="">
                <option value="">Select…</option>
                <option>Sole Proprietorship</option>
                <option>Partnership</option>
                <option>Corporation</option>
                <option>One Person Corporation</option>
                <option>Cooperative</option>
              </Select>
            </div>
            <div>
              <Label>Industry</Label>
              <Input name="industry" placeholder="Retail and Services" />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input name="address" placeholder="Business address" />
          </div>
          <div>
            <Label>Branches (comma-separated)</Label>
            <Input name="branches" placeholder="Main, Cebu, Davao" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Payroll cycle</Label>
              <Select name="payroll_cycle" defaultValue="semi-monthly">
                <option value="weekly">Weekly</option>
                <option value="semi-monthly">Semi-monthly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </div>
            <div>
              <Label>Number of employees</Label>
              <Select name="employee_count" defaultValue="">
                <option value="">Select…</option>
                <option>1-3</option>
                <option>10-50</option>
                <option>51-150</option>
                <option>151-300</option>
                <option>301+</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Plan interest</Label>
            <Select name="plan_interest" defaultValue="free">
              <option value="free">Free - testing Kawani AI</option>
              <option value="core">Core - 10-50 employees</option>
              <option value="business">Business - 51-150 employees</option>
              <option value="pro">Pro - 151-300 employees</option>
              <option value="enterprise">Enterprise - custom</option>
            </Select>
          </div>
          <div>
            <Label>Work schedule</Label>
            <Input name="work_schedule" placeholder="Mon-Sat, 8:00 AM - 5:00 PM, 1-hour break" />
          </div>
          <p className="text-xs text-gray-400">Timezone: Asia/Manila (default)</p>
          <Button type="submit" className="w-full">Create company workspace</Button>
        </ActionForm>
      </div>
    </div>
  );
}
