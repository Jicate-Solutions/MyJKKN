'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLeaveCalendar } from '@/hooks/hr/use-leave';
import { LEAVE_DURATION_LABELS } from '@/types/hr';

function firstDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
}
function lastDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
}

export default function TeamCalendarPage() {
  const [hrOrgId, setHrOrgId] = useState('');
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(lastDayOfMonth());

  const { data, isLoading } = useLeaveCalendar(hrOrgId || undefined, startDate, endDate);
  const entries = data ?? [];

  return (
    <ContentLayout title="Team Leave Calendar">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/leave">Leave</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Calendar</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Who&apos;s on Leave</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="hrOrgId">HR Organization ID</Label>
                <Input id="hrOrgId" value={hrOrgId} onChange={(e) => setHrOrgId(e.target.value)} placeholder="uuid" />
              </div>
              <div>
                <Label htmlFor="startDate">From</Label>
                <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="endDate">To</Label>
                <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Privacy: leave type is hidden from peers — entries show only name + &quot;On Leave&quot;. Managers and HR see full detail on the application page.
            </p>

            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && entries.length === 0 && hrOrgId && (
              <p className="text-sm text-muted-foreground">No approved leave in this range.</p>
            )}

            {entries.length > 0 && (
              <div className="space-y-2">
                {entries.map((e) => (
                  <div key={e.application_id} className="border rounded-md p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{e.employee_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.start_date} → {e.end_date} · {LEAVE_DURATION_LABELS[e.duration_type]}
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-muted">{e.display_label}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
