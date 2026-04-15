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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useMyEncashments, useRequestEncashment } from '@/hooks/hr/use-leave';

export default function EncashmentPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [hrOrgId, setHrOrgId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [days, setDays] = useState('');
  const [rate, setRate] = useState('');

  const { data: encashments } = useMyEncashments(employeeId || undefined);
  const request = useRequestEncashment();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hrOrgId || !employeeId || !academicYearId || !leaveTypeId || !days || !rate) return;

    await request.mutateAsync({
      hr_organization_id: hrOrgId,
      employee_id: employeeId,
      academic_year_id: academicYearId,
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

      <div className="mt-6 space-y-4 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request Year-End Encashment</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="hrOrgId">HR Organization ID</Label>
                  <Input id="hrOrgId" value={hrOrgId} onChange={(e) => setHrOrgId(e.target.value)} required placeholder="uuid" />
                </div>
                <div>
                  <Label htmlFor="employeeId">Employee ID</Label>
                  <Input id="employeeId" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required placeholder="staff.id uuid" />
                </div>
                <div>
                  <Label htmlFor="academicYearId">Academic Year ID</Label>
                  <Input id="academicYearId" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} required placeholder="uuid" />
                </div>
                <div>
                  <Label htmlFor="leaveTypeId">Leave Type ID</Label>
                  <Input id="leaveTypeId" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} required placeholder="uuid" />
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

              <Button type="submit" disabled={request.isPending}>
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
    </ContentLayout>
  );
}
