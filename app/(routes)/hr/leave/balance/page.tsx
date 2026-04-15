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
import { useLeaveBalance } from '@/hooks/hr/use-leave';

export default function BalancePage() {
  const [employeeId, setEmployeeId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');

  const { data, isLoading } = useLeaveBalance(employeeId || undefined, academicYearId || undefined);
  const balances = data ?? [];

  return (
    <ContentLayout title="My Leave Balance">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/leave">Leave</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Balance</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Balance by Leave Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="employeeId">Employee ID</Label>
                <Input id="employeeId" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="staff.id uuid" />
              </div>
              <div>
                <Label htmlFor="academicYearId">Academic Year ID</Label>
                <Input id="academicYearId" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} placeholder="uuid (Apr 1 – Mar 31)" />
              </div>
            </div>

            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

            {balances.length > 0 && (
              <div className="grid md:grid-cols-2 gap-3">
                {balances.map((b) => {
                  const available = b.entitled + b.carried_forward - b.used;
                  const pct = b.entitled > 0 ? (available / (b.entitled + b.carried_forward)) * 100 : 0;
                  return (
                    <div key={b.leave_type_id} className="border rounded-md p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">{b.leave_type_name}</div>
                        <span className="text-xs font-mono text-muted-foreground">{b.leave_type_code}</span>
                      </div>
                      <div className="mt-2 text-2xl font-semibold">{available.toFixed(1)}</div>
                      <div className="text-xs text-muted-foreground">days available</div>
                      <div className="mt-2 h-2 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                      </div>
                      <div className="grid grid-cols-3 gap-1 mt-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Entitled</div>
                          <div className="font-medium">{b.entitled}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Used</div>
                          <div className="font-medium">{b.used}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Carried</div>
                          <div className="font-medium">{b.carried_forward}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
