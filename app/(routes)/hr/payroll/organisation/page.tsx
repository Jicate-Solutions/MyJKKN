'use client';

/**
 * Payroll Organisation — WHO PAYS each staff member.
 *
 * staff.institution_id records WHERE SOMEONE WORKS. For most people the two
 * coincide, but not for everyone: the shared campus-services team works at JKKN
 * Main Office, which runs no payroll, and central officers are paid by a college
 * they do not work at. This page is where the paying organisation is recorded.
 *
 * Gated on hr.payroll.institution.view via MENU_PERMISSIONS — without an entry
 * there, RoutePermissionGuard resolves by longest prefix and this page would
 * silently inherit '/hr' → 'hr.view', which nearly every role holds.
 *
 * 2026-08-04, two changes:
 *   1. The hand-rolled <table> became the advanced DataTable, with coverage
 *      cards and a filter bar.
 *   2. It now lists EVERY active team member, not only the unassigned ones.
 *      Listing only the gap meant the coverage card counted 744 people while
 *      the table could reach ~106 of them, the "Works at" filter offered a
 *      single location out of 13, and — the real defect — a payer recorded by
 *      the backfill could never be corrected, because nothing displayed it.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, Wallet } from 'lucide-react';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useStaffPayerDirectory,
  usePayrollOrganizations,
  useSetStaffPayer,
  useSetStaffPayersBulk,
  useClearStaffPayer,
} from '@/hooks/hr/use-staff-payroll';
import type { StaffPayerRow } from '@/lib/services/hr/payroll/staff-payroll-service';

import { PayrollOrgStats } from './_components/payroll-org-stats';
import {
  PayerDirectoryFilters,
  DEFAULT_PAYER_DIRECTORY_FILTERS,
  matchesDirectoryFilters,
  normaliseRole,
  type FilterOption,
  type PayerDirectoryFilterState,
} from './_components/payer-directory-filters';
import { PayerDirectoryDataTable } from './_components/payer-directory-data-table';

/**
 * The option sets below are FACETED: an option exists if any row carries that
 * value at all, but its count is measured against the OTHER active filters.
 *
 * Counting against the unfiltered array is what made this screen lie. "Works
 * at" offered "JKKN Main Office (104)" no matter what else was selected, while
 * the table ANDs all four filters. Main Office is the only organisation with
 * is_payroll_entity = false — it runs no payroll, so all 104 of its people have
 * a NULL payer — which makes "works at Main Office AND has a payer" empty by
 * construction, and empty for that one institution only. The promise of 104 and
 * the bare "No results." below it had no way to be reconciled by the user.
 *
 * A zero now shows as "JKKN Main Office (0)" before the user picks it, and the
 * option is still listed so a stale selection keeps a label in the trigger.
 * Sorting on count keeps the zeroes at the bottom.
 */
function byCountThenLabel(a: FilterOption, b: FilterOption): number {
  return b.count - a.count || a.label.localeCompare(b.label);
}

/** Distinct work locations present in the directory, most-populated first. */
function buildWorksAtOptions(
  rows: StaffPayerRow[],
  filters: PayerDirectoryFilterState
): FilterOption[] {
  const byId = new Map<string, FilterOption>();
  for (const r of rows) {
    if (!r.works_at_id) continue;
    const hit = matchesDirectoryFilters(r, filters, 'worksAt') ? 1 : 0;
    const existing = byId.get(r.works_at_id);
    if (existing) existing.count += hit;
    else
      byId.set(r.works_at_id, {
        value: r.works_at_id,
        label: r.works_at_name,
        count: hit,
      });
  }
  return [...byId.values()].sort(byCountThenLabel);
}

/**
 * Distinct payers actually in use. Built from the rows rather than from the
 * organisations catalogue so the filter never lists an organisation that pays
 * nobody — picking it would return an empty table with no explanation.
 */
function buildPayerOptions(
  rows: StaffPayerRow[],
  filters: PayerDirectoryFilterState
): FilterOption[] {
  const byId = new Map<string, FilterOption>();
  for (const r of rows) {
    if (!r.payer_org_id) continue;
    const hit = matchesDirectoryFilters(r, filters, 'payer') ? 1 : 0;
    const existing = byId.get(r.payer_org_id);
    if (existing) existing.count += hit;
    else
      byId.set(r.payer_org_id, {
        value: r.payer_org_id,
        label: r.payer_org_name ?? 'Unknown',
        count: hit,
      });
  }
  return [...byId.values()].sort(byCountThenLabel);
}

/**
 * Distinct roles, collapsed on the normalised key so "Bus Cleaner" and
 * "Bus cleaner" are one option. Rows with no recorded role are skipped: their
 * key would be '', which is the sentinel for "no role filter".
 *
 * Iterates each of a row's roles, not the row: role_title is comma-joined for
 * the 215 people holding more than one, so a whole-string key would offer
 * "Facilitator, HOD" as its own option and hide those people from the plain
 * "Facilitator" one.
 */
function buildRoleOptions(
  rows: StaffPayerRow[],
  filters: PayerDirectoryFilterState
): FilterOption[] {
  const byKey = new Map<string, FilterOption>();
  for (const r of rows) {
    const hit = matchesDirectoryFilters(r, filters, 'role') ? 1 : 0;
    const labels = (r.role_title ?? '').split(',');
    labels.forEach((label, i) => {
      const key = normaliseRole(label);
      if (!key) return;
      const existing = byKey.get(key);
      if (existing) existing.count += hit;
      else byKey.set(key, { value: key, label: labels[i].trim(), count: hit });
    });
  }
  return [...byKey.values()].sort(byCountThenLabel);
}

export default function PayrollOrganisationPage() {
  const { canAccess } = usePermissions();
  // The route guard already enforces .view; .manage is the separate write key,
  // so a read-only HR viewer gets the table and the numbers but no pickers.
  const canManage = canAccess('hr.payroll.institution', 'manage');

  const [filters, setFilters] = useState<PayerDirectoryFilterState>(
    DEFAULT_PAYER_DIRECTORY_FILTERS
  );
  // Which row is mid-save, so only that row's controls disable. A page-level
  // flag would freeze every picker while one row saves.
  const [savingStaffId, setSavingStaffId] = useState<string | null>(null);

  const {
    data: rows = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useStaffPayerDirectory();
  const { data: organizations = [] } = usePayrollOrganizations();

  const setPayer = useSetStaffPayer();
  const setPayersBulk = useSetStaffPayersBulk();
  const clearPayer = useClearStaffPayer();

  // Counted from the same array the table renders, so the cards and the table
  // can never disagree about how many people are outstanding.
  const recorded = useMemo(
    () => rows.filter((r) => r.payer_org_id).length,
    [rows]
  );
  const awaiting = rows.length - recorded;

  const worksAtOptions = useMemo(
    () => buildWorksAtOptions(rows, filters),
    [rows, filters]
  );
  const payerOptions = useMemo(
    () => buildPayerOptions(rows, filters),
    [rows, filters]
  );
  const roleOptions = useMemo(
    () => buildRoleOptions(rows, filters),
    [rows, filters]
  );

  /**
   * How many rows the filter bar actually reaches, so an empty table can say
   * WHY it is empty. The table applies the same predicate over the same array;
   * this is not a second source of truth, it is the same one read early enough
   * to explain itself.
   */
  const matchCount = useMemo(
    () => rows.filter((r) => matchesDirectoryFilters(r, filters)).length,
    [rows, filters]
  );

  /**
   * Which single filter is emptying the table — the one whose removal brings
   * rows back. Naming it turns a bare "No results." into an instruction.
   * Null when no single filter is responsible and two or more must go.
   *
   * "Works at" is tried LAST on purpose. When it conflicts with "Paid by" both
   * removals would work, and the work location is the one the user just chose
   * deliberately; suggesting they abandon it would answer the wrong question.
   */
  const blockingFilter = useMemo(() => {
    if (matchCount > 0 || rows.length === 0) return null;

    const candidates: Array<{
      label: string;
      active: boolean;
      patch: Partial<PayerDirectoryFilterState>;
    }> = [
      {
        label: 'Payer status',
        active: filters.payerStatus !== 'all',
        patch: { payerStatus: 'all' },
      },
      { label: 'Paid by', active: !!filters.payerOrgId, patch: { payerOrgId: '' } },
      { label: 'Role', active: !!filters.roleKey, patch: { roleKey: '' } },
      { label: 'Works at', active: !!filters.worksAtId, patch: { worksAtId: '' } },
    ];

    for (const c of candidates) {
      if (!c.active) continue;
      const relaxed = { ...filters, ...c.patch };
      if (rows.some((r) => matchesDirectoryFilters(r, relaxed))) return c;
    }
    return null;
  }, [rows, filters, matchCount]);

  const handleFilterChange = useCallback(
    (patch: Partial<PayerDirectoryFilterState>) =>
      setFilters((prev) => ({ ...prev, ...patch })),
    []
  );

  const handleFilterReset = useCallback(
    () => setFilters(DEFAULT_PAYER_DIRECTORY_FILTERS),
    []
  );

  const handleAssign = useCallback(
    async (person: StaffPayerRow, hrOrganizationId: string) => {
      // Re-picking the value already stored is a no-op, not a write.
      if (person.payer_org_id === hrOrganizationId) return;

      setSavingStaffId(person.staff_uuid);
      try {
        await setPayer.mutateAsync({
          staffId: person.staff_uuid,
          hrOrganizationId,
        });
        toast.success(`Recorded who pays ${person.person_name}`);
      } catch (err) {
        // Supabase errors are plain objects, so `err instanceof Error` misses
        // the real code/message — including the payroll-entity FK rejection.
        toast.error(getErrorMessage(err));
      } finally {
        setSavingStaffId(null);
      }
    },
    [setPayer]
  );

  const handleClear = useCallback(
    async (person: StaffPayerRow) => {
      setSavingStaffId(person.staff_uuid);
      try {
        await clearPayer.mutateAsync({ staffId: person.staff_uuid });
        toast.success(
          `${person.person_name} is back in the queue and out of every payroll run`
        );
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setSavingStaffId(null);
      }
    },
    [clearPayer]
  );

  const handleBulkAssign = useCallback(
    async (
      staffIds: string[],
      hrOrganizationId: string,
      resetSelection: () => void
    ) => {
      const orgName =
        organizations.find((o) => o.id === hrOrganizationId)?.name ??
        'the selected organisation';
      try {
        await setPayersBulk.mutateAsync({ staffIds, hrOrganizationId });
        toast.success(
          `${staffIds.length} team member${staffIds.length === 1 ? '' : 's'} now paid by ${orgName}`
        );
        // Only after the write lands — clearing first would drop the selection
        // on a failure and leave the user re-picking 30 rows.
        resetSelection();
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
    },
    [organizations, setPayersBulk]
  );

  return (
    <ContentLayout title='Payroll Organisation'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/dashboard'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/hr'>HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Payroll Organisation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mt-6 space-y-6'>
        <PayrollOrgStats
          recorded={recorded}
          awaiting={awaiting}
          payingOrganizations={organizations.length}
          isLoading={isLoading}
        />

        {!isLoading && !isError && awaiting > 0 && (
          <div className='rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30'>
            <div className='flex flex-wrap items-start gap-3'>
              <Wallet className='mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400' />
              <div className='min-w-0 flex-1 space-y-1 text-sm'>
                <p className='font-medium text-amber-900 dark:text-amber-200'>
                  {awaiting} team member{awaiting === 1 ? ' has' : 's have'} no
                  recorded payer
                </p>
                <p className='text-amber-800 dark:text-amber-300'>
                  The team member record says where someone{' '}
                  <strong>works</strong>. It does not say who bears their salary,
                  and for these people the two are not the same — they work at a
                  location that runs no payroll. Until a paying organisation is
                  recorded they are left out of every payroll run, deliberately,
                  rather than being added to the wrong one.
                </p>
              </div>
              {/* The table defaults to everyone now, so the outstanding work
                  needs a one-click way back to the top. */}
              <Button
                variant='outline'
                size='sm'
                className='h-8 shrink-0 bg-background'
                onClick={() =>
                  handleFilterChange({ payerStatus: 'awaiting', payerOrgId: '' })
                }
                disabled={filters.payerStatus === 'awaiting'}
              >
                Show only these
              </Button>
            </div>
          </div>
        )}

        {isError ? (
          <div className='rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm'>
            <p className='font-medium text-destructive'>
              Could not load the list
            </p>
            <p className='mt-1 text-muted-foreground'>{getErrorMessage(error)}</p>
            <Button
              variant='outline'
              size='sm'
              className='mt-3'
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
              />
              Try again
            </Button>
          </div>
        ) : (
          <Card>
            <CardContent className='space-y-4 p-6'>
              <div className='flex flex-wrap items-end justify-between gap-3'>
                <PayerDirectoryFilters
                  filters={filters}
                  onChange={handleFilterChange}
                  onReset={handleFilterReset}
                  worksAtOptions={worksAtOptions}
                  payerOptions={payerOptions}
                  roleOptions={roleOptions}
                  disabled={isLoading}
                />
                <Button
                  variant='outline'
                  size='sm'
                  className='h-8'
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
              </div>

              {!canManage && (
                <p className='text-sm text-muted-foreground'>
                  You can see who pays each team member but not change it — that
                  needs the Manage Payroll Organisation permission.
                </p>
              )}

              {/* The DataTable's own empty state is a bare "No results.", which
                  cannot distinguish "nobody matches" from "these filters
                  contradict each other". Combining a work location that runs no
                  payroll with any payer filter is empty by construction, so say
                  so and offer the one click that fixes it. */}
              {!isLoading && rows.length > 0 && matchCount === 0 && (
                <div className='rounded-lg border border-dashed p-4 text-sm'>
                  <p className='font-medium'>
                    No team member matches all of these filters
                  </p>
                  {blockingFilter ? (
                    <>
                      <p className='mt-1 text-muted-foreground'>
                        Every other filter has matches on its own — it is{' '}
                        <strong>{blockingFilter.label}</strong> that rules
                        everyone out. A work location that runs no payroll has
                        nobody with a recorded payer, so pairing it with a payer
                        filter can never return a row.
                      </p>
                      <Button
                        variant='outline'
                        size='sm'
                        className='mt-3'
                        onClick={() => handleFilterChange(blockingFilter.patch)}
                      >
                        Clear {blockingFilter.label}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className='mt-1 text-muted-foreground'>
                        More than one filter has to go before any row comes back.
                      </p>
                      <Button
                        variant='outline'
                        size='sm'
                        className='mt-3'
                        onClick={handleFilterReset}
                      >
                        Reset all filters
                      </Button>
                    </>
                  )}
                </div>
              )}

              <PayerDirectoryDataTable
                rows={rows}
                filters={filters}
                organizations={organizations}
                canManage={canManage}
                savingStaffId={savingStaffId}
                isBulkSaving={setPayersBulk.isPending}
                onAssign={handleAssign}
                onClear={handleClear}
                onBulkAssign={handleBulkAssign}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
