import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "@/components/employee-form";

export default async function NewEmployeePage() {
  const session = await requireSession();
  if (!can(session.role, "employees.write")) redirect("/employees");
  const supabase = await createClient();
  const [branches, departments, positions, supervisors] = await Promise.all([
    supabase.from("branches").select("id, name").eq("company_id", session.companyId),
    supabase.from("departments").select("id, name").eq("company_id", session.companyId),
    supabase.from("positions").select("id, title").eq("company_id", session.companyId),
    supabase.from("employees").select("id, first_name, last_name").eq("company_id", session.companyId),
  ]);
  return (
    <>
      <PageHeader title="Add Employee" subtitle="Create a new employee record" />
      <EmployeeForm
        options={{
          branches: branches.data ?? [], departments: departments.data ?? [],
          positions: positions.data ?? [], supervisors: supervisors.data ?? [],
        }}
        showSalary={can(session.role, "employees.write_salary")}
      />
    </>
  );
}
