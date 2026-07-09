import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { saveAttendance } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Table, Th, Td, Badge, Button, EmptyState, Input, Label, Select, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { UploadButton } from "@/components/upload-button";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const defaultStart = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const start = sp.start ?? defaultStart;
  const end = sp.end ?? today;
  const supabase = await createClient();

  const [{ data: records }, { data: employees }] = await Promise.all([
    supabase.from("attendance_records")
      .select("*, employees(first_name, last_name, employee_number)")
      .eq("company_id", session.companyId)
      .gte("attendance_date", start).lte("attendance_date", end)
      .order("attendance_date", { ascending: false }).limit(300),
    supabase.from("employees").select("id, first_name, last_name")
      .eq("company_id", session.companyId).order("last_name"),
  ]);
  const canWrite = can(session.role, "attendance.write");
  const fmtTime = (t: string | null) =>
    t ? new Date(t).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <>
      <PageHeader title="Attendance" subtitle={`${records?.length ?? 0} record(s), ${start} to ${end}`}>
        {canWrite && (
          <>
            <UploadButton purpose="attendance_import" label="Import CSV/XLSX" accept=".csv,.xlsx" />
            <a href={`/api/export/attendance?start=${start}&end=${end}&fmt=xlsx`}><Button variant="outline">Export XLSX</Button></a>
            <a href={`/api/export/attendance?start=${start}&end=${end}&fmt=csv`}><Button variant="outline">Export CSV</Button></a>
          </>
        )}
      </PageHeader>

      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <div><Label>From</Label><Input type="date" name="start" defaultValue={start} /></div>
        <div><Label>To</Label><Input type="date" name="end" defaultValue={end} /></div>
        <Button type="submit" variant="outline">Apply</Button>
      </form>

      {canWrite && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Manual entry</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={saveAttendance} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <div className="col-span-2">
                <Label>Employee</Label>
                <Select name="employee_id" required>
                  <option value="">Select…</option>
                  {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                </Select>
              </div>
              <div><Label>Date</Label><Input type="date" name="attendance_date" required defaultValue={today} /></div>
              <div><Label>Time in</Label><Input type="time" name="time_in" /></div>
              <div><Label>Time out</Label><Input type="time" name="time_out" /></div>
              <div><Label>Late (min)</Label><Input type="number" name="late_minutes" min={0} defaultValue={0} /></div>
              <div><Label>OT (min)</Label><Input type="number" name="overtime_minutes" min={0} defaultValue={0} /></div>
              <div>
                <Label>Status</Label>
                <Select name="status" defaultValue="present">
                  {["present", "late", "absent", "undertime", "on_leave", "rest_day", "holiday"].map((s) => (
                    <option key={s} value={s}>{s.replace("_", " ")}</option>
                  ))}
                </Select>
              </div>
              <div className="col-span-2 flex items-end"><Button type="submit">Save</Button></div>
            </ActionForm>
            <p className="mt-2 text-xs text-gray-400">
              Import columns: employee_number (or name), date, time_in, time_out, late_minutes, undertime_minutes, overtime_minutes, status, remarks.
            </p>
          </CardContent>
        </Card>
      )}

      {!records?.length ? (
        <EmptyState title="No attendance records in this range" hint="Add a manual entry, import a file, or load sample data." />
      ) : (
        <Table>
          <thead>
            <tr><Th>Date</Th><Th>Employee</Th><Th>In / Out</Th><Th>Late</Th><Th>UT</Th><Th>OT</Th><Th>Status</Th><Th>Source</Th></tr>
          </thead>
          <tbody>
            {records.map((r: any) => (
              <tr key={r.id}>
                <Td>{r.attendance_date}</Td>
                <Td className="font-medium">{r.employees?.first_name} {r.employees?.last_name}</Td>
                <Td>{fmtTime(r.time_in)} / {fmtTime(r.time_out)}</Td>
                <Td>{r.late_minutes || "—"}</Td>
                <Td>{r.undertime_minutes || "—"}</Td>
                <Td>{r.overtime_minutes || "—"}</Td>
                <Td><Badge status={r.status}>{r.status.replace("_", " ")}</Badge></Td>
                <Td className="text-xs text-gray-400">{r.source}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
