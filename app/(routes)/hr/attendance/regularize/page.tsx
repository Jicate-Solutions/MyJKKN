'use client';

import Link from 'next/link';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { ShieldCheck, UserX } from 'lucide-react';

import { usePermissions } from '@/hooks/use-permissions';
import { useCurrentEmployee } from '@/hooks/hr/use-regularization';
import { RegularizeForm } from './_components/regularize-form';
import { MyRequestsTable } from './_components/my-requests-table';

export default function RegularizePage() {
  const { can, isSuperAdmin, isLoading: permLoading } = usePermissions();
  const { data: employee, isLoading: empLoading } = useCurrentEmployee();

  const canApprove =
    isSuperAdmin ||
    can('hr.attendance.regularize_approve') ||
    can('hr.attendance.approve_team') ||
    can('hr.attendance.edit') ||
    can('hr.attendance.override');

  const canSubmitSelf =
    isSuperAdmin || can('hr.attendance.regularize_self');

  const isLoading = permLoading || empLoading;

  return (
    <ContentLayout title="Attendance Regularization">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Regularize Attendance</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 space-y-6">
        <PageHeader
          title="Regularize Attendance"
          description="Request a correction for a missed punch or device failure. HR will review your request."
          actions={
            canApprove ? (
              <Button asChild variant="outline">
                <Link href="/hr/attendance/regularize/approvals">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Approval queue
                </Link>
              </Button>
            ) : null
          }
        />

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !employee ? (
          <EmptyState
            icon={<UserX className="h-10 w-10 text-muted-foreground" />}
            title="No employee profile linked"
            description="Self-service regularization is available for staff with an HR employee record. Contact HR if you believe this is an error."
          />
        ) : !canSubmitSelf ? (
          <EmptyState
            title="Permission required"
            description="You don't have permission to submit attendance regularization requests."
          />
        ) : (
          <>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                New request
              </h2>
              <RegularizeForm employeeId={employee.id} />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                My recent requests
              </h2>
              <MyRequestsTable employeeId={employee.id} />
            </section>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
