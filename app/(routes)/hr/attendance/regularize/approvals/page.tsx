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
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePendingRegularizations } from '@/hooks/hr/use-regularization';
import type {
  RegularizationRequest,
  RegularizationStatus,
} from '@/lib/services/hr/regularization-service';
import {
  PeriodFilter, allTimePeriod, type PeriodRange,
} from '../../../leave/_components/period-filter';
import { ApprovalRowActions } from './_components/approval-row-actions';

type FilterStatus = RegularizationStatus | 'all';

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

  // One fetch, filtered in memory — the same architecture as the leave /
  // short-time-off / comp-off approval queues: every toolbar narrowing is
  // instant, and the "N of M" count can be honest about what it hides.
  const [status, setStatus] = useState<FilterStatus>('pending');
  const [search, setSearch] = useState('');
  const [reasonId, setReasonId] = useState('any');
  const [institutionId, setInstitutionId] = useState('any');
  const [period, setPeriod] = useState<PeriodRange>(allTimePeriod());

  const canApprove =
    isSuperAdmin ||
    can('hr.attendance.regularize_approve') ||
    can('hr.attendance.approve_team') ||
    can('hr.attendance.edit') ||
    can('hr.attendance.override');

  const { data, isLoading, refetch, isFetching } = usePendingRegularizations({
    status: 'all',
    limit: 500,
  });

  const approverProfileId = profile?.id ?? '';

  const rows = useMemo<RegularizationRequest[]>(
    () => (data ?? []) as RegularizationRequest[],
    [data]
  );

  // Options come from the rows actually in the queue, so an approver never
  // sees a filter that can only ever return nothing.
  const reasons = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.reason?.id) m.set(r.reason.id, r.reason.label);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  /**
   * Every institution the approver may scope to, NOT only the ones that happen
   * to have a request today — deriving the list from the rows alone left this
   * filter permanently hidden while the queue held a single institution, which
   * is exactly when an approver still wants to narrow a growing queue.
   *
   * accessibleInstitutions comes from the shared access hook (never a branch on
   * isSuperAdmin — that silently strips scope='all' secondary roles), and the
   * rows are unioned in so a request whose institution sits outside that list
   * can never become unreachable by filtering.
   */
  const { institutions: accessibleInstitutions } = useInstitutionsWithAccess();

  const institutions = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of accessibleInstitutions) m.set(i.id, i.name);
    for (const r of rows) {
      if (r.employee?.institution_id && !m.has(r.employee.institution_id)) {
        m.set(r.employee.institution_id, r.employee.institution?.name ?? 'Unnamed institution');
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [accessibleInstitutions, rows]);

  const filtersActive =
    status !== 'pending' || search.trim() !== '' || reasonId !== 'any' ||
    institutionId !== 'any' || period.preset !== 'all';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      // The period brackets the day being CORRECTED, not the day the request
      // was filed — an approver clears a month, not a submission window.
      if (period.preset !== 'all' && !(r.for_date >= period.from && r.for_date <= period.to)) {
        return false;
      }
      if (reasonId !== 'any' && r.reason?.id !== reasonId) return false;
      if (institutionId !== 'any' && r.employee?.institution_id !== institutionId) return false;
      if (q) {
        const hay = [
          r.employee?.first_name, r.employee?.last_name, r.employee?.employee_code,
          r.employee?.email, r.employee?.institution?.name,
          r.reason?.label, r.reason_text, r.proposed_status?.label,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, status, search, reasonId, institutionId, period]);

  const resetFilters = () => {
    setStatus('pending'); setSearch(''); setReasonId('any');
    setInstitutionId('any'); setPeriod(allTimePeriod());
  };

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
            <PeriodFilter
              value={period}
              onChange={setPeriod}
              onRefresh={() => refetch()}
              isRefreshing={isFetching}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, staff ID or reason…"
                className="h-8 w-full sm:w-[240px]"
                aria-label="Search requests"
              />

              <Select value={status} onValueChange={(v) => setStatus(v as FilterStatus)}>
                <SelectTrigger className="h-8 w-full sm:w-[140px]" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="all">All statuses</SelectItem>
                </SelectContent>
              </Select>

              {reasons.length > 1 && (
                <Select value={reasonId} onValueChange={setReasonId}>
                  <SelectTrigger className="h-8 w-full sm:w-[190px]" aria-label="Filter by reason">
                    <SelectValue placeholder="All reasons" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">All reasons</SelectItem>
                    {reasons.map(([id, label]) => (
                      <SelectItem key={id} value={id}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {institutions.length > 0 && (
                <Select value={institutionId} onValueChange={setInstitutionId}>
                  <SelectTrigger className="h-8 w-full sm:w-[210px]" aria-label="Filter by institution">
                    <SelectValue placeholder="All institutions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">All institutions</SelectItem>
                    {institutions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <span className="text-xs text-muted-foreground">
                {filtered.length} of {rows.length} request{rows.length === 1 ? '' : 's'}
              </span>

              {filtersActive && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetFilters}>
                  Reset filters
                </Button>
              )}
            </div>

            {isLoading ? (
              <div className="text-sm text-muted-foreground">
                Loading requests…
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No requests in this view"
                description={
                  rows.length === 0
                    ? 'No regularization requests have been submitted yet.'
                    : 'No regularization requests match the current filters.'
                }
              />
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead>For date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Proposed status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell>{employeeLabel(req)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {req.employee?.institution?.name ?? '—'}
                        </TableCell>
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
