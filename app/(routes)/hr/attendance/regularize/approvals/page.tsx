'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { usePendingRegularizations } from '@/hooks/hr/use-regularization';
import type {
  RegularizationRequest,
  RegularizationStatus,
} from '@/lib/services/hr/regularization-service';
import { ApprovalRowActions } from './_components/approval-row-actions';

type FilterStatus = RegularizationStatus | 'all';

const FILTERS: { key: FilterStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const STATUS_VARIANT: Record<
  RegularizationStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
};

const fmt = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd MMM yyyy');
  } catch {
    return iso;
  }
};

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
};

const employeeLabel = (req: RegularizationRequest) => {
  const e = req.employee;
  if (!e) return '—';
  const name = [e.first_name, e.last_name].filter(Boolean).join(' ').trim();
  if (name) return e.employee_code ? `${name} (${e.employee_code})` : name;
  return e.employee_code || e.email || '—';
};

export default function RegularizationApprovalsPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const { can, isSuperAdmin, isLoading: permLoading } = usePermissions();
  const [status, setStatus] = useState<FilterStatus>('pending');

  const canApprove =
    isSuperAdmin ||
    can('hr.attendance.regularize_approve') ||
    can('hr.attendance.approve_team') ||
    can('hr.attendance.edit') ||
    can('hr.attendance.override');

  const { data, isLoading } = usePendingRegularizations({ status });

  const approverProfileId = profile?.id ?? '';

  const rows = useMemo<RegularizationRequest[]>(
    () => (data ?? []) as RegularizationRequest[],
    [data]
  );

  return (
    <ContentLayout title="Regularization Approvals">
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
            <BreadcrumbLink asChild>
              <Link href="/hr/attendance/regularize">Regularize</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Approvals</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 space-y-6">
        <PageHeader
          title="Regularization Approvals"
          description="Review attendance regularization requests submitted by employees."
        />

        {authLoading || permLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !canApprove ? (
          <EmptyState
            title="Permission required"
            description="You don't have permission to review regularization requests."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={status === f.key ? 'default' : 'outline'}
                  onClick={() => setStatus(f.key)}
                >
                  {f.label}
                </Button>
              ))}
            </div>

            {isLoading ? (
              <div className="text-sm text-muted-foreground">
                Loading requests…
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                title="No requests in this view"
                description="There are no regularization requests matching the selected filter."
              />
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>For date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Proposed status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell>{employeeLabel(req)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {fmt(req.for_date)}
                        </TableCell>
                        <TableCell>
                          {req.reason?.label || req.reason_text || '—'}
                        </TableCell>
                        <TableCell>
                          {req.proposed_status?.label ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {fmtDateTime(req.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[req.status]}>
                            {req.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <ApprovalRowActions
                              request={req}
                              approverProfileId={approverProfileId}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
