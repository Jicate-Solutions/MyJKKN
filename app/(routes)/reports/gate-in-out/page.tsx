'use client';

/**
 * /reports/gate-in-out — the CAO's view of who went out and came in.
 *
 * Learner rows are gate passes (one per pass: OUT time, IN time, approver,
 * status) — this includes passes issued via Service Requests AND passes
 * issued by wardens in Campus Living, since both live in hostel_gate_passes.
 * Staff rows are gate movements (one per OUT or IN, with reason).
 *
 * Data comes from the SECURITY DEFINER RPC gate_in_out_report, which checks
 * gate_security.reports.view itself. Export is the shared ExportService
 * (xlsx), gated on gate_security.reports.export.
 */

import { useMemo, useState } from 'react';
import { Download, Filter, ShieldAlert } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useGateReport } from '@/hooks/gate-security/use-gate-security';
import { ExportService } from '@/lib/services/export-service';
import { todayIsoIndia } from '@/lib/gate-security/gate-pass-form-fields';
import type { ReportRow } from '@/lib/services/gate-security/gate-security-service';

const ALL = '__all__';

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
const fmtDate = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

function statusClass(s: string | null) {
  if (!s) return '';
  if (s.startsWith('Outside')) return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
  if (s === 'Completed' || s === 'Inside') return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200';
  return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100';
}

export default function GateInOutReportPage() {
  const { canAccess, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const canView = isSuperAdmin || canAccess('gate_security.reports', 'view');
  const canExport = isSuperAdmin || canAccess('gate_security.reports', 'export');

  const today = todayIsoIndia();
  const [preset, setPreset] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [personType, setPersonType] = useState<'learner' | 'staff'>('learner');
  const [institutionId, setInstitutionId] = useState(ALL);
  const [departmentId, setDepartmentId] = useState(ALL);
  const [state, setState] = useState<'all' | 'outside' | 'completed'>('all');
  const [passStatus, setPassStatus] = useState(ALL);

  const { institutions } = useInstitutionsWithAccess();
  const { data: departments } = useDepartments({
    institution_id: institutionId === ALL ? undefined : institutionId,
    limit: 500,
    isActive: true,
  });

  const filters = useMemo(
    () => ({
      from,
      to,
      personType,
      institutionId: institutionId === ALL ? null : institutionId,
      departmentId: departmentId === ALL ? null : departmentId,
      state: state === 'all' ? null : state,
    }),
    [from, to, personType, institutionId, departmentId, state]
  );
  const report = useGateReport(filters, canView && !permsLoading);

  const rows = useMemo(() => {
    const all = report.data ?? [];
    if (personType === 'learner' && passStatus !== ALL) {
      return all.filter((r) => r.pass_status === passStatus);
    }
    return all;
  }, [report.data, personType, passStatus]);

  const applyPreset = (p: typeof preset) => {
    setPreset(p);
    if (p === 'today') {
      setFrom(today);
      setTo(today);
    } else if (p === 'yesterday') {
      const y = shiftDays(today, -1);
      setFrom(y);
      setTo(y);
    }
  };

  const exportExcel = () => {
    if (personType === 'learner') {
      const data = rows.map((r: ReportRow) => ({
        date: fmtDate(r.movement_date),
        name: r.person_name ?? '',
        roll: r.code ?? '',
        department: r.department ?? '',
        pass: r.pass_number ?? '',
        reason: r.reason ?? '',
        approved_by: r.approved_by ?? '',
        out_time: fmtTime(r.out_time),
        in_time: fmtTime(r.in_time),
        status: r.current_status ?? '',
      }));
      ExportService.exportToExcel(
        data,
        {
          date: 'Date',
          name: 'Learner Name',
          roll: 'Roll Number',
          department: 'Department',
          pass: 'Gate Pass ID',
          reason: 'Reason',
          approved_by: 'Approved By',
          out_time: 'OUT Time',
          in_time: 'IN Time',
          status: 'Current Status',
        },
        `gate-in-out-learners-${from}_${to}`,
        'Learners'
      );
    } else {
      const data = rows.map((r: ReportRow) => ({
        date: fmtDate(r.movement_date),
        name: r.person_name ?? '',
        staff_id: r.code ?? '',
        department: r.department ?? '',
        designation: r.designation ?? '',
        in_time: fmtTime(r.in_time),
        out_time: fmtTime(r.out_time),
        reason: r.reason ?? '',
        status: r.current_status ?? '',
      }));
      ExportService.exportToExcel(
        data,
        {
          date: 'Date',
          name: 'Team Member',
          staff_id: 'Staff ID',
          department: 'Department',
          designation: 'Designation',
          in_time: 'IN Time',
          out_time: 'OUT Time',
          reason: 'Reason',
          status: 'Current Status',
        },
        `gate-in-out-team-${from}_${to}`,
        'Team'
      );
    }
  };

  if (!permsLoading && !canView) {
    return (
      <ContentLayout title="Gate In/Out Report">
        <Card className="mt-4">
          <CardContent className="p-8 text-center">
            <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium">You cannot view this report</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This report needs the “View Gate In/Out Report” permission.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const outsideCount = rows.filter((r) => (r.current_status ?? '').startsWith('Outside')).length;

  return (
    <ContentLayout title="Gate In/Out Report">
      <div className="space-y-4 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Gate In/Out Report</h1>
            <p className="text-sm text-muted-foreground">Learner gate passes and team-member movements at the campus gate.</p>
          </div>
          {canExport && (
            <Button onClick={exportExcel} disabled={!rows.length} className="gap-2">
              <Download className="h-4 w-4" /> Export to Excel
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={personType} onValueChange={(v) => setPersonType(v as 'learner' | 'staff')}>
              <TabsList>
                <TabsTrigger value="learner">Learners</TabsTrigger>
                <TabsTrigger value="staff">Team members</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label>Period</Label>
                <Select value={preset} onValueChange={(v) => applyPreset(v as typeof preset)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="custom">Custom range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>From</Label>
                <Input type="date" value={from} max={to} disabled={preset !== 'custom'} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Input type="date" value={to} min={from} disabled={preset !== 'custom'} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Institution</Label>
                <Select value={institutionId} onValueChange={(v) => { setInstitutionId(v); setDepartmentId(ALL); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All institutions</SelectItem>
                    {institutions.map((i: { id: string; name: string }) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All departments</SelectItem>
                    {(departments?.data ?? []).map((d: { id: string; department_name: string }) => (
                      <SelectItem key={d.id} value={d.id}>{d.department_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Where are they</Label>
                <Select value={state} onValueChange={(v) => setState(v as typeof state)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="outside">Currently outside</SelectItem>
                    <SelectItem value="completed">Completed / inside</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {personType === 'learner' && (
                <div className="space-y-1">
                  <Label>Gate pass status</Label>
                  <Select value={passStatus} onValueChange={setPassStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Any</SelectItem>
                      <SelectItem value="issued">Approved (not out)</SelectItem>
                      <SelectItem value="active">Out</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="returned">Returned</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">{rows.length} rows</Badge>
          <Badge variant="secondary">{outsideCount} currently outside</Badge>
          {report.isFetching && <Badge variant="outline">Refreshing…</Badge>}
          {report.error && <Badge variant="destructive">{(report.error as Error).message}</Badge>}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              {personType === 'learner' ? (
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Learner</th>
                      <th className="p-3">Roll No</th>
                      <th className="p-3">Gate Pass ID</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Approved by</th>
                      <th className="p-3">OUT</th>
                      <th className="p-3">IN</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r) => (
                      <tr key={r.gate_pass_id ?? `${r.code}-${r.movement_date}`}>
                        <td className="whitespace-nowrap p-3">{fmtDate(r.movement_date)}</td>
                        <td className="p-3 font-medium">{r.person_name}<div className="text-xs text-muted-foreground">{r.department}</div></td>
                        <td className="p-3 font-mono text-xs">{r.code}</td>
                        <td className="p-3 font-mono text-xs">{r.pass_number}</td>
                        <td className="max-w-[240px] truncate p-3">{r.reason}</td>
                        <td className="p-3">{r.approved_by}</td>
                        <td className="whitespace-nowrap p-3">{fmtTime(r.out_time)}</td>
                        <td className="whitespace-nowrap p-3">{fmtTime(r.in_time)}</td>
                        <td className="p-3"><Badge variant="secondary" className={statusClass(r.current_status)}>{r.current_status}</Badge></td>
                      </tr>
                    ))}
                    {!rows.length && !report.isLoading && (
                      <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No gate passes in this period.</td></tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Team member</th>
                      <th className="p-3">Staff ID</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Designation</th>
                      <th className="p-3">IN</th>
                      <th className="p-3">OUT</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r) => (
                      <tr key={r.movement_id ?? `${r.code}-${r.movement_date}`}>
                        <td className="whitespace-nowrap p-3">{fmtDate(r.movement_date)}</td>
                        <td className="p-3 font-medium">{r.person_name}</td>
                        <td className="p-3 font-mono text-xs">{r.code}</td>
                        <td className="p-3">{r.department}</td>
                        <td className="p-3">{r.designation}</td>
                        <td className="whitespace-nowrap p-3">{fmtTime(r.in_time)}</td>
                        <td className="whitespace-nowrap p-3">{fmtTime(r.out_time)}</td>
                        <td className="p-3">
                          {r.reason}
                          {r.reason_updated_at && <div className="text-[10px] text-muted-foreground">updated {fmtTime(r.reason_updated_at)}</div>}
                        </td>
                        <td className="p-3"><Badge variant="secondary" className={statusClass(r.current_status)}>{r.current_status}</Badge></td>
                      </tr>
                    ))}
                    {!rows.length && !report.isLoading && (
                      <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No team-member movements in this period.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
