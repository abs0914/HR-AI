import { saveEmployee } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { Button, Input, Label, Select, Textarea, Card, CardContent } from "@/components/ui";

const STATUSES = ["applicant", "probationary", "regular", "project_based", "contractual", "consultant", "resigned", "terminated", "inactive"];

export function EmployeeForm({ employee, options, showSalary }: {
  employee?: any;
  options: { branches: any[]; departments: any[]; positions: any[]; supervisors: any[] };
  showSalary: boolean;
}) {
  const e = employee ?? {};
  return (
    <Card>
      <CardContent className="pt-5">
        <ActionForm action={saveEmployee} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" resetOnSuccess={!employee}>
          {e.id && <input type="hidden" name="id" value={e.id} />}
          <div><Label>First name *</Label><Input name="first_name" required defaultValue={e.first_name} /></div>
          <div><Label>Middle name</Label><Input name="middle_name" defaultValue={e.middle_name ?? ""} /></div>
          <div><Label>Last name *</Label><Input name="last_name" required defaultValue={e.last_name} /></div>
          <div><Label>Employee #</Label><Input name="employee_number" defaultValue={e.employee_number ?? ""} /></div>
          <div><Label>Email</Label><Input name="email" type="email" defaultValue={e.email ?? ""} /></div>
          <div><Label>Phone</Label><Input name="phone" defaultValue={e.phone ?? ""} /></div>
          <div className="sm:col-span-2"><Label>Address</Label><Input name="address" defaultValue={e.address ?? ""} /></div>
          <div><Label>Emergency contact</Label><Input name="emergency_contact_name" defaultValue={e.emergency_contact_name ?? ""} /></div>
          <div><Label>Emergency phone</Label><Input name="emergency_contact_phone" defaultValue={e.emergency_contact_phone ?? ""} /></div>
          <div>
            <Label>Branch</Label>
            <Select name="branch_id" defaultValue={e.branch_id ?? ""}>
              <option value="">—</option>
              {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Department</Label>
            <Select name="department_id" defaultValue={e.department_id ?? ""}>
              <option value="">—</option>
              {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Position</Label>
            <Select name="position_id" defaultValue={e.position_id ?? ""}>
              <option value="">—</option>
              {options.positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
          </div>
          <div>
            <Label>Supervisor</Label>
            <Select name="supervisor_id" defaultValue={e.supervisor_id ?? ""}>
              <option value="">—</option>
              {options.supervisors.filter((s) => s.id !== e.id).map((s) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Employment status</Label>
            <Select name="employment_status" defaultValue={e.employment_status ?? "probationary"}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </Select>
          </div>
          <div>
            <Label>Employment type</Label>
            <Select name="employment_type" defaultValue={e.employment_type ?? "full_time"}>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
            </Select>
          </div>
          {showSalary && (
            <>
              <div>
                <Label>Salary type</Label>
                <Select name="salary_type" defaultValue={e.salary_type ?? ""}>
                  <option value="">—</option>
                  <option value="monthly">Monthly</option>
                  <option value="semi_monthly">Semi-monthly</option>
                  <option value="daily">Daily</option>
                  <option value="hourly">Hourly</option>
                </Select>
              </div>
              <div><Label>Salary amount (PHP)</Label><Input name="salary_amount" type="number" step="0.01" defaultValue={e.salary_amount ?? ""} /></div>
            </>
          )}
          <div><Label>Hire date</Label><Input name="hire_date" type="date" defaultValue={e.hire_date ?? ""} /></div>
          <div><Label>Regularization date</Label><Input name="regularization_date" type="date" defaultValue={e.regularization_date ?? ""} /></div>
          <div><Label>Separation date</Label><Input name="separation_date" type="date" defaultValue={e.separation_date ?? ""} /></div>
          <div className="sm:col-span-2 lg:col-span-3"><Label>Notes</Label><Textarea name="notes" rows={2} defaultValue={e.notes ?? ""} /></div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit">{e.id ? "Save changes" : "Add employee"}</Button>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
