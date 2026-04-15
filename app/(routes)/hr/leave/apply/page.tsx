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
import { AlertCircle } from 'lucide-react';
import { useApplyLeave, useLeaveBalance } from '@/hooks/hr/use-leave';
import type { LeaveDurationType } from '@/types/hr';

export default function ApplyLeavePage() {
  const router = useRouter();
  const mutation = useApplyLeave();

  // Context (v1 — accepted as form input; Sprint 3.1 will auto-resolve from logged-in user)
  const [hrOrgId, setHrOrgId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  // Request
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
    academicYearId || undefined,
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hrOrgId || !employeeId || !leaveTypeId || !startDate || !endDate || !reason) return;

    await mutation.mutateAsync({
      hr_organization_id: hrOrgId,
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      academic_year_id: academicYearId || null,
      start_date: startDate,
      end_date: endDate,
      duration_type: durationType,
      start_time: durationType === 'hourly' ? (startTime || null) : null,
      end_time: durationType === 'hourly' ? (endTime || null) : null,
      reason,
      is_emergency: isEmergency,
      documents: [],
      applied_by: '', // server fills from user.id
      department_id: departmentId || null,
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

      <form onSubmit={onSubmit} className="mt-6 space-y-4 max-w-3xl">
        <Card>
          <CardHeader><CardTitle className="text-base">Who & Where</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="hrOrgId">HR Organization ID</Label>
                <Input id="hrOrgId" value={hrOrgId} onChange={(e) => setHrOrgId(e.target.value)} required placeholder="uuid" />
              </div>
              <div>
                <Label htmlFor="employeeId">Employee (staff.id)</Label>
                <Input id="employeeId" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required placeholder="uuid" />
              </div>
              <div>
                <Label htmlFor="academicYearId">Academic Year ID</Label>
                <Input id="academicYearId" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} placeholder="uuid (optional)" />
              </div>
              <div>
                <Label htmlFor="departmentId">Department ID</Label>
                <Input id="departmentId" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} placeholder="uuid (optional, for dept-scoped approvers)" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Sprint 3.1 will auto-resolve these from your logged-in profile. For now paste the UUIDs.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Leave Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="leaveTypeId">Leave Type ID</Label>
              <Input id="leaveTypeId" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} required placeholder="uuid from leave_types (scope=staff)" />
              {selectedBalance && (
                <p className="text-xs text-muted-foreground mt-1">
                  <strong>{selectedBalance.leave_type_name}</strong> — {available} days available (entitled {selectedBalance.entitled}, used {selectedBalance.used}, carried {selectedBalance.carried_forward})
                </p>
              )}
              {balanceLoading && <p className="text-xs text-muted-foreground mt-1">Loading balance…</p>}
              {balances && balances.length > 0 && !selectedBalance && leaveTypeId && (
                <p className="text-xs text-muted-foreground mt-1">Paste a leave_type_id from the list below to see balance.</p>
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
                    <div>
                      <span className="font-medium">{b.leave_type_name}</span>
                      <span className="text-xs text-muted-foreground ml-2 font-mono">{b.leave_type_id}</span>
                    </div>
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
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Submitting…' : 'Submit Application'}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/hr/leave">Cancel</Link>
          </Button>
        </div>
      </form>
    </ContentLayout>
  );
}
