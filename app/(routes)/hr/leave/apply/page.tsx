'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertCircle, UserX } from 'lucide-react';
import { useApplyLeave, useLeaveBalance } from '@/hooks/hr/use-leave';
import { useCurrentEmployee } from '@/hooks/hr/use-regularization';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { EmptyState } from '@/components/empty-state';
import type { LeaveDurationType } from '@/types/hr';

export default function ApplyLeavePage() {
  const router = useRouter();
  const mutation = useApplyLeave();

  // Auto-resolve identifiers from the logged-in user (BUG-003319 fix —
  // the previous v1 form exposed 5 raw UUID Inputs that the COO could not fill).
  const { data: employee, isLoading: employeeLoading } = useCurrentEmployee();

  // Scope academic years to the employee's own institution (via the
  // hr_organization → institution mapping) so a year from another JKKN
  // institution can never be picked silently.
  const { institutionIdByOrg, isLoading: mappingsLoading } = useHrOrgMappings();
  const institutionId = employee?.hr_organization_id
    ? institutionIdByOrg.get(employee.hr_organization_id)
    : undefined;
  const { data: academicYearsResp, isLoading: yearsFetching } = useAcademicYears(institutionId);
  const yearsLoading = yearsFetching || mappingsLoading;

  // Pick the first active academic year by name-desc (matches use-academic-years).
  // Ignore results until the institution scope is resolved — an unscoped fetch
  // returns years across ALL institutions.
  const activeAcademicYearId = useMemo(
    () => (institutionId ? academicYearsResp?.data?.[0]?.id ?? '' : ''),
    [academicYearsResp, institutionId],
  );

  const hrOrgId = employee?.hr_organization_id ?? '';
  const employeeId = employee?.id ?? '';

  // Request fields
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [durationType, setDurationType] = useState<LeaveDurationType>('full');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);

  // Live balance (decision 15 — show balance before submit)
  const { data: balances, isLoading: balanceLoading } = useLeaveBalance(
    employeeId || undefined,
    activeAcademicYearId || undefined,
  );

  const selectedBalance = useMemo(
    () => (balances ?? []).find((b) => b.leave_type_id === leaveTypeId),
    [balances, leaveTypeId],
  );

  // Sync end_date to start_date when full-day same-day (minor UX aid)
  useEffect(() => {
    if (startDate && !endDate) setEndDate(startDate);
  }, [startDate, endDate]);

  const available = selectedBalance
    ? (selectedBalance.entitled + selectedBalance.carried_forward - selectedBalance.used).toFixed(1)
    : null;

  const employeeFullName = employee
    ? [employee.first_name, employee.last_name].filter(Boolean).join(' ').trim() || (employee.email ?? 'You')
    : '';

  const isLoading = employeeLoading || yearsLoading;
  const canSubmit =
    !!hrOrgId &&
    !!employeeId &&
    !!leaveTypeId &&
    !!startDate &&
    !!endDate &&
    !!reason;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    await mutation.mutateAsync({
      hr_organization_id: hrOrgId,
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      academic_year_id: activeAcademicYearId || null,
      start_date: startDate,
      end_date: endDate,
      duration_type: durationType,
      start_time: durationType === 'hourly' ? (startTime || null) : null,
      end_time: durationType === 'hourly' ? (endTime || null) : null,
      reason,
      is_emergency: isEmergency,
      documents: [],
      applied_by: '', // server fills from user.id
      department_id: null,
    });

    router.push('/hr/leave/my-applications');
  };

  return (
    <ContentLayout title="Apply Leave">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/leave">Leave</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Apply</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {isLoading ? (
        <div className="mt-6 text-sm text-muted-foreground">Loading your profile…</div>
      ) : !employee ? (
        <div className="mt-6 max-w-2xl">
          <EmptyState
            icon={<UserX className="h-10 w-10 text-muted-foreground" />}
            title="No HR employee profile linked"
            description="Apply Leave is available for staff with an HR employee record. Please contact HR if you believe this is an error."
          />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4 max-w-3xl">
          <Card>
            <CardHeader><CardTitle className="text-base">Submitting as</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm">
                <strong>{employeeFullName}</strong>
                {employee.employee_code ? <span className="text-muted-foreground"> ({employee.employee_code})</span> : null}
              </p>
              {employee.email ? (
                <p className="text-xs text-muted-foreground">{employee.email}</p>
              ) : null}
              {!activeAcademicYearId && (
                <p className="text-xs text-amber-700">
                  No active academic year configured. Please contact HR — the application cannot be submitted yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Leave Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="leaveTypeId">Leave Type</Label>
                {balanceLoading ? (
                  <p className="text-xs text-muted-foreground mt-1">Loading leave types…</p>
                ) : balances && balances.length > 0 ? (
                  <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                    <SelectTrigger id="leaveTypeId" className="mt-1">
                      <SelectValue placeholder="Select a leave type" />
                    </SelectTrigger>
                    <SelectContent>
                      {balances.map((b) => {
                        const balanceAvailable = (b.entitled + b.carried_forward - b.used).toFixed(1);
                        return (
                          <SelectItem key={b.leave_type_id} value={b.leave_type_id}>
                            {b.leave_type_name} — {balanceAvailable} day(s) available
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <Alert variant="default" className="mt-1">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No leave balance configured for this academic year. Please contact HR to set up your entitlements.
                    </AlertDescription>
                  </Alert>
                )}
                {selectedBalance && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <strong>{selectedBalance.leave_type_name}</strong> — {available} days available (entitled {selectedBalance.entitled}, used {selectedBalance.used}, carried {selectedBalance.carried_forward})
                  </p>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                </div>
              </div>

              <div>
                <Label htmlFor="durationType">Duration Type</Label>
                <select
                  id="durationType"
                  value={durationType}
                  onChange={(e) => setDurationType(e.target.value as LeaveDurationType)}
                  className="w-full border rounded-md h-10 px-3 bg-background"
                >
                  <option value="full">Full day</option>
                  <option value="first_half">First half (AM)</option>
                  <option value="second_half">Second half (PM)</option>
                  <option value="hourly">Hourly</option>
                </select>
              </div>

              {durationType === 'hourly' && (
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="startTime">Start Time</Label>
                    <Input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="endTime">End Time</Label>
                    <Input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="reason">Reason</Label>
                <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} placeholder="Explain the reason for your leave" />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="isEmergency" checked={isEmergency} onCheckedChange={(v) => setIsEmergency(v === true)} />
                <Label htmlFor="isEmergency" className="text-sm font-normal cursor-pointer">
                  Emergency leave (bypass advance-notice; documents required within 48h)
                </Label>
              </div>
            </CardContent>
          </Card>

          {balances && balances.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Your Current Balance</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {balances.map((b) => (
                    <div key={b.leave_type_id} className="flex items-center justify-between py-1 border-b last:border-b-0">
                      <span className="font-medium">{b.leave_type_name}</span>
                      <span className="text-sm">
                        {(b.entitled + b.carried_forward - b.used).toFixed(1)} / {b.entitled}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {mutation.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{(mutation.error as Error).message}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={mutation.isPending || !canSubmit}>
              {mutation.isPending ? 'Submitting…' : 'Submit Application'}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/hr/leave">Cancel</Link>
            </Button>
          </div>
        </form>
      )}
    </ContentLayout>
  );
}
