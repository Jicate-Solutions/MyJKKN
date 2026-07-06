'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserX } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { useLeaveBalance } from '@/hooks/hr/use-leave';
import { useCurrentEmployee } from '@/hooks/hr/use-regularization';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { useAcademicYears } from '@/hooks/use-academic-years';

export default function BalancePage() {
  // Auto-resolve the employee from the logged-in user (same pattern as Apply —
  // BUG-003319: never expose raw UUID inputs to end users).
  const { data: employee, isLoading: employeeLoading } = useCurrentEmployee();
  const { institutionIdByOrg, isLoading: mappingsLoading } = useHrOrgMappings();

  const institutionId = employee?.hr_organization_id
    ? institutionIdByOrg.get(employee.hr_organization_id)
    : undefined;

  // Academic years scoped to the employee's own institution. Ignore results
  // until the institution scope is resolved — an unscoped fetch returns years
  // across ALL institutions.
  const { data: academicYearsResp, isLoading: yearsFetching } = useAcademicYears(institutionId);
  const yearsLoading = yearsFetching || mappingsLoading;
  const academicYears = useMemo(
    () => (institutionId ? academicYearsResp?.data ?? [] : []),
    [academicYearsResp, institutionId],
  );

  const [selectedYearId, setSelectedYearId] = useState('');
  const academicYearId = selectedYearId || academicYears[0]?.id || '';

  const { data, isLoading } = useLeaveBalance(
    employee?.id,
    academicYearId || undefined,
  );
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

      {employeeLoading ? (
        <div className="mt-6 text-sm text-muted-foreground">Loading your profile…</div>
      ) : !employee ? (
        <div className="mt-6 max-w-2xl">
          <EmptyState
            icon={<UserX className="h-10 w-10 text-muted-foreground" />}
            title="No HR employee profile linked"
            description="Leave balance is available for staff with an HR employee record. Please contact HR if you believe this is an error."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4 max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Balance by Leave Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-md">
                <Label htmlFor="academicYear">Academic Year</Label>
                {yearsLoading ? (
                  <p className="text-xs text-muted-foreground mt-1">Loading academic years…</p>
                ) : academicYears.length === 0 ? (
                  <p className="text-xs text-amber-700 mt-1">
                    No active academic year configured for your institution. Please contact HR.
                  </p>
                ) : (
                  <Select value={academicYearId} onValueChange={setSelectedYearId}>
                    <SelectTrigger id="academicYear" className="mt-1">
                      <SelectValue placeholder="Select academic year" />
                    </SelectTrigger>
                    <SelectContent>
                      {academicYears.map((y) => (
                        <SelectItem key={y.id} value={y.id}>
                          {y.academic_year_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

              {!isLoading && academicYearId && balances.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No leave balance configured for this academic year. Please contact HR to set up your entitlements.
                </p>
              )}

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
      )}
    </ContentLayout>
  );
}
