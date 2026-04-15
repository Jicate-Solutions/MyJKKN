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
import { Badge } from '@/components/ui/badge';
import { useMyApplications, useWithdrawApplication, useCancelApplication } from '@/hooks/hr/use-leave';
import { LEAVE_STATUS_LABELS, LEAVE_DURATION_LABELS, type LeaveApplicationStatus } from '@/types/hr';

const STATUS_COLORS: Record<LeaveApplicationStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200',
  approved: 'bg-green-100 text-green-900 dark:bg-green-900/20 dark:text-green-200',
  rejected: 'bg-red-100 text-red-900 dark:bg-red-900/20 dark:text-red-200',
  cancelled: 'bg-gray-100 text-gray-900 dark:bg-gray-900/20 dark:text-gray-200',
  withdrawn: 'bg-gray-100 text-gray-900 dark:bg-gray-900/20 dark:text-gray-200',
  escalated: 'bg-orange-100 text-orange-900 dark:bg-orange-900/20 dark:text-orange-200',
};

export default function MyApplicationsPage() {
  const [employeeId, setEmployeeId] = useState('');
  const { data, isLoading } = useMyApplications(employeeId || undefined);
  const withdraw = useWithdrawApplication();
  const cancel = useCancelApplication();

  const applications = data?.data ?? [];

  return (
    <ContentLayout title="My Leave Applications">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/leave">Leave</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>My Applications</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Your Leave History</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-md">
              <Label htmlFor="employeeId">Employee ID (staff.id)</Label>
              <Input id="employeeId" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="uuid — paste your staff.id" />
              <p className="text-xs text-muted-foreground mt-1">
                Sprint 3.1 will auto-resolve this from your logged-in profile.
              </p>
            </div>

            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

            {!isLoading && applications.length === 0 && employeeId && (
              <p className="text-sm text-muted-foreground">No applications yet.</p>
            )}

            {applications.length > 0 && (
              <div className="space-y-2">
                {applications.map((app) => (
                  <div key={app.id} className="border rounded-md p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {app.start_date} → {app.end_date}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {LEAVE_DURATION_LABELS[app.duration_type]} · {app.total_days} day(s)
                          </span>
                        </div>
                        <p className="text-sm mt-1">{app.reason}</p>
                        {app.is_emergency && (
                          <Badge variant="outline" className="mt-1 border-orange-500 text-orange-700 dark:text-orange-300">Emergency</Badge>
                        )}
                        {app.rejection_reason && (
                          <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                            Rejection: {app.rejection_reason}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[app.status]}`}>
                          {LEAVE_STATUS_LABELS[app.status]}
                        </span>
                        {app.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => withdraw.mutate(app.id)}
                            disabled={withdraw.isPending}
                          >
                            Withdraw
                          </Button>
                        )}
                        {app.status === 'approved' && !app.superseded_by && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancel.mutate(app.id)}
                            disabled={cancel.isPending}
                          >
                            Cancel
                          </Button>
                        )}
                        <Link href={`/hr/leave/${app.id}`} className="text-xs text-primary hover:underline">
                          View detail
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button asChild>
            <Link href="/hr/leave/apply">Apply New Leave</Link>
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
