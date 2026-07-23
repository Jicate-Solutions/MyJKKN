'use client';

/**
 * /hr/admin/payroll/periods — payroll period list page (T4.3 PR 3).
 *
 * Spec: specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md (Q1 + Q7 + E10 + E13)
 *
 * - Default scope: most-recent 50 periods (RLS scopes server-side; Director
 *   sees all 11 orgs, HR Officer sees their own). Note: a "current FY" hard
 *   filter is deferred to a follow-up — Indian FY spans 2 calendar years
 *   while `PayrollPeriodFilters.period_year` is a single int.
 * - Filter chips: Institution dropdown + Status dropdown. URL-persisted via
 *   ?institution_id=...&status=... query params (browser back/forward works).
 * - "Create period" CTA navigates to /hr/admin/payroll/periods/new.
 * - SuperAdminOnly restricts to 'users' / 'manage' (HR admin + super_admin).
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

import { usePayrollPeriods } from '@/hooks/hr/payroll/use-payroll-periods';
import { useJkknInstitutions } from '@/hooks/use-jkkn-institutions';
import type { PayrollPeriodFilters, PayrollPeriodStatus } from '@/types/hr-payroll';

import {
  PeriodListTable,
  PeriodListTableSkeleton,
} from '@/features/hr/payroll/period-list-table';

const STATUS_OPTIONS: Array<{ value: PayrollPeriodStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'prepared', label: 'Prepared' },
  { value: 'cao_reviewed', label: 'CAO reviewed' },
  { value: 'accounts_verified', label: 'Accounts verified' },
  { value: 'chairperson_approved', label: 'Chairperson approved' },
  { value: 'distributed', label: 'Distributed' },
  { value: 'locked', label: 'Locked' },
];

export default function PayrollPeriodsListPage() {
  return (
    <SuperAdminOnly>
      <ContentLayout title="Payroll Periods">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'HR' },
            { label: 'Payroll' },
            { label: 'Periods' },
          ]}
        />
        <PayrollPeriodsListContent />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function PayrollPeriodsListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const institutionFilter = searchParams.get('institution_id') ?? 'all';
  const statusFilter = (searchParams.get('status') ?? 'all') as PayrollPeriodStatus | 'all';

  const filters: PayrollPeriodFilters = useMemo(() => {
    const f: PayrollPeriodFilters = { pageSize: 50 };
    if (institutionFilter !== 'all') f.institution_id = institutionFilter;
    if (statusFilter !== 'all') f.status = statusFilter;
    return f;
  }, [institutionFilter, statusFilter]);

  const { data, isLoading, error } = usePayrollPeriods(filters);
  const { data: institutionsData } = useJkknInstitutions({ limit: 50 });

  const institutionLookup: Record<string, string> = useMemo(() => {
    const acc: Record<string, string> = {};
    const list = institutionsData?.data ?? [];
    for (const inst of list) {
      if (inst.id && inst.name) acc[inst.id] = inst.name;
    }
    return acc;
  }, [institutionsData]);

  const updateFilter = (key: 'institution_id' | 'status', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`/hr/admin/payroll/periods?${params.toString()}`);
  };

  const periods = data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={institutionFilter}
            onValueChange={(v) => updateFilter('institution_id', v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Institution" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All institutions</SelectItem>
              {(institutionsData?.data ?? []).map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(v) => updateFilter('status', v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button asChild>
          <Link href="/hr/admin/payroll/periods/new">
            <Plus className="mr-1 h-4 w-4" />
            Create period
          </Link>
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load payroll periods</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!isLoading && !error && periods.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-muted-foreground">
              No payroll periods yet. Create the first one to start the approval chain.
            </p>
            <Button asChild>
              <Link href="/hr/admin/payroll/periods/new">
                <Plus className="mr-1 h-4 w-4" />
                Create period
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading / Data */}
      {isLoading ? (
        <PeriodListTableSkeleton />
      ) : (
        periods.length > 0 && (
          <PeriodListTable
            periods={periods}
            institutionLookup={institutionLookup}
            userLookup={{}}
          />
        )
      )}

      {data && data.metadata.total > periods.length && (
        <p className="text-xs text-muted-foreground text-right">
          Showing first {periods.length} of {data.metadata.total} periods · narrow with filters above
        </p>
      )}
    </div>
  );
}
