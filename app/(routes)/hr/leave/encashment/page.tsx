'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, UserX } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { useLeaveBalance, useMyEncashments, useRequestEncashment } from '@/hooks/hr/use-leave';
import { useCurrentEmployee } from '@/hooks/hr/use-regularization';
import {
  useCurrentHRAcademicYear,
  useHRAcademicYears,
} from '@/hooks/hr/use-hr-academic-years';

export default function EncashmentPage() {
  // Auto-resolve the employee from the logged-in user (same pattern as Apply —
  // BUG-003319: never expose raw UUID inputs to end users).
  const { data: employee, isLoading: employeeLoading } = useCurrentEmployee();

  const hrOrgId = employee?.hr_organization_id ?? '';
  const employeeId = employee?.id ?? '';

  // HR years are group-wide, so there is no institution to scope by and no
  // hr_organization_id -> institution_id lookup to wait on first.
  const { data: academicYears = [], isLoading: yearsFetching } = useHRAcademicYears({
    isActive: true,
  });
  // Default selection is the year that CONTAINS today, resolved by date bracket
  // — active HR years cannot overlap, so exactly one matches.
  const { data: currentYear, isLoading: currentYearFetching } = useCurrentHRAcademicYear();
  const yearsLoading = yearsFetching || currentYearFetching;

  const [selectedYearId, setSelectedYearId] = useState('');
  const hrAcademicYearId = selectedYearId || currentYear?.id || '';

  // Leave types come from the employee's balances (same source as Apply) so the
  // dropdown shows how many days are actually available to encash.
  const { data: balances, isLoading: balanceLoading } = useLeaveBalance(
    employeeId || undefined,
    hrAcademicYearId || undefined,
  );

  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [days, setDays] = useState('');
  const [rate, setRate] = useState('');

  const { data: encashments } = useMyEncashments(employeeId || undefined);
  const request = useRequestEncashment();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hrOrgId || !employeeId || !hrAcademicYearId || !leaveTypeId || !days || !rate) return;

    await request.mutateAsync({
      hr_organization_id: hrOrgId,
      employee_id: employeeId,
      hr_academic_year_id: hrAcademicYearId,
      leave_type_id: leaveTypeId,
      days_encashed: Number(days),
      per_diem_rate: Number(rate),
    });

    setDays('');
    setRate('');
    setLeaveTypeId('');
  };

  const totalPreview = Number(days) * Number(rate);

  return (
    <ContentLayout title="Leave Encashment">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/leave">Leave</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Encashment</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {employeeLoading ? (
        <div className="mt-6 text-sm text-muted-foreground">Loading your profile…</div>
      ) : !employee ? (
        <div className="mt-6 max-w-2xl">
          <EmptyState
            icon={<UserX className="h-10 w-10 text-muted-foreground" />}
            title="No HR employee profile linked"
            description="Leave encashment is available for staff with an HR employee record. Please contact HR if you believe this is an error."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4 max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Request Year-End Encashment</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="academicYear">HR Academic Year</Label>
                    {yearsLoading ? (
                      <p className="text-xs text-muted-foreground mt-1">Loading HR academic years…</p>
                    ) : academicYears.length === 0 ? (
                      <p className="text-xs text-amber-700 mt-1">
                        No active HR academic year is configured. Please contact HR.
                      </p>
                    ) : (
                      <Select value={hrAcademicYearId} onValueChange={setSelectedYearId}>
                        <SelectTrigger id="academicYear" className="mt-1">
                          <SelectValue placeholder="Select HR academic year" />
                        </SelectTrigger>
                        <SelectContent>
                          {academicYears.map((y) => (
                            <SelectItem key={y.id} value={y.id}>
                              {y.year_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
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
                            // Read, not recomputed: days held by a request
                            // awaiting approval are not encashable either.
                            const available = b.available.toFixed(1);
                            return (
                              <SelectItem key={b.leave_type_id} value={b.leave_type_id}>
                                {b.leave_type_name} — {available} day(s) available
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">
                        No leave balance configured for this academic year.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="days">Days to Encash</Label>
                    <Input id="days" type="number" step="0.5" min="0.5" value={days} onChange={(e) => setDays(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="rate">Per-Diem Rate (₹)</Label>
                    <Input id="rate" type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} required placeholder="from hr_pay_scales" />
                  </div>
                </div>

                {days && rate && (
                  <p className="text-sm text-muted-foreground">
                    Total: <span className="font-semibold text-foreground">₹{totalPreview.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </p>
                )}

                {request.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{(request.error as Error).message}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" disabled={request.isPending || !hrAcademicYearId || !leaveTypeId}>
                  {request.isPending ? 'Submitting…' : 'Request Encashment'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {encashments && encashments.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Your Encashment History</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {encashments.map((e) => (
                    <div key={e.id} className="border rounded-md p-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">
                          {e.days_encashed} days × ₹{Number(e.per_diem_rate).toLocaleString('en-IN')} = ₹{Number(e.total_amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</div>
                        {e.rejection_reason && (
                          <p className="text-xs text-red-700 dark:text-red-400 mt-1">Rejection: {e.rejection_reason}</p>
                        )}
                      </div>
                      <span className="text-xs px-2 py-1 rounded bg-muted capitalize">{e.status}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </ContentLayout>
  );
}
