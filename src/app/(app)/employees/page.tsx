import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can, employeeColumns } from "@/lib/rbac";
import { PageHeader, Table, Th, Td, Badge, Button, EmptyState, Input, Select } from "@/components/ui";
import { UserPlus } from "lucide-react";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const session = await requireSession();
  const { q, status } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("employees")
    .select(`${employeeColumns(session.role)}, positions(title), departments(name), branches(name)`)
    .eq("company_id", session.companyId)
    .order("last_name");
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,employee_number.ilike.%${q}%`);
  if (status) query = query.eq("employment_status", status);
  const { data: employees } = await query;
  const showSalary = can(session.role, "employees.read_salary");

  return (
    <>
      <PageHeader title="Employees" subtitle={`${employees?.length ?? 0} record(s)`}>
        {can(session.role, "employees.write") && (
          <Link href="/employees/new"><Button><UserPlus size={15} /> Add Employee</Button></Link>
        )}
      </PageHeader>

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <Input name="q" defaultValue={q} placeholder="Search name or employee #" className="max-w-xs" />
        <Select name="status" defaultValue={status ?? ""} className="max-w-[180px]">
          <option value="">All statuses</option>
          {["probationary", "regular", "project_based", "contractual", "consultant", "resigned", "terminated", "inactive"].map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      {!employees?.length ? (
        <EmptyState title="No employees found" hint="Add your first employee or load demo data from the dashboard." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Employee</Th><Th>Position</Th><Th>Branch</Th><Th>Status</Th>
              {showSalary && <Th>Salary</Th>}
              <Th>Hire Date</Th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e: any) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <Td>
                  <Link href={`/employees/${e.id}`} className="font-medium text-primary hover:underline">
                    {e.first_name} {e.last_name}
                  </Link>
                  <p className="text-xs text-gray-400">{e.employee_number ?? "—"}</p>
                </Td>
                <Td>{e.positions?.title ?? "—"}<p className="text-xs text-gray-400">{e.departments?.name ?? ""}</p></Td>
                <Td>{e.branches?.name ?? "—"}</Td>
                <Td><Badge status={e.employment_status}>{e.employment_status?.replace("_", " ")}</Badge></Td>
                {showSalary && <Td>{e.salary_amount ? `₱${Number(e.salary_amount).toLocaleString("en-PH")} (${e.salary_type ?? ""})` : "—"}</Td>}
                <Td>{e.hire_date ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
