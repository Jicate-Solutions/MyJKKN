'use client';
/**
 * Onboarding Table — client-side rendering with server-fetched initial data.
 *
 * Pattern cloned from app/(routes)/learners/profiles/_components/profiles-table-server.tsx.
 *
 * Bulk action — "Assign Academic Info" — pre-fills the existing promotion form
 * at /learners/profiles/promotion?ids=... so admins can batch-fill the four
 * onboarding fields (semester/section/academic year) for many learners at once.
 * No new bulk endpoint is needed — we lean on the existing promotion flow.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ArrowRight, ArrowUpDown, UserCheck, Loader2 } from 'lucide-react';
import { getOnboardingColumns } from './columns';
import { PaymentThresholdBanner } from './payment-threshold-banner';
import type {
  OnboardingProfileRow,
  OnboardingTier,
  OnboardingPaymentSummary
} from '@/types/learner-onboarding';
import { usePermissions } from '@/hooks/use-permissions';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';

const SORT_OPTIONS = [
  { value: 'first_name_asc', label: 'Name (A → Z)', sortBy: 'first_name', sortOrder: 'asc' },
  { value: 'first_name_desc', label: 'Name (Z → A)', sortBy: 'first_name', sortOrder: 'desc' },
  { value: 'roll_number_asc', label: 'Roll No. (A → Z)', sortBy: 'roll_number', sortOrder: 'asc' },
  { value: 'roll_number_desc', label: 'Roll No. (Z → A)', sortBy: 'roll_number', sortOrder: 'desc' },
  { value: 'created_at_desc', label: 'Newest First', sortBy: 'created_at', sortOrder: 'desc' },
  { value: 'created_at_asc', label: 'Oldest First', sortBy: 'created_at', sortOrder: 'asc' }
] as const;

/**
 * Extra sorts offered only on the Awaiting Payment tier.
 *
 * These keys are not learners_profiles columns — the server recognises them
 * (PAYMENT_SORT_COLUMNS) and sorts the tier in JS after the fee RPC resolves,
 * which is why the fee fetch covers the whole tier rather than one page.
 *
 * "Closest to Admission" is the one that changes how the queue is worked:
 * it surfaces the learners a small payment away from promotion, instead of
 * burying them alphabetically among learners who have barely started paying.
 */
const PAYMENT_SORT_OPTIONS = [
  {
    value: 'amount_to_threshold_asc',
    label: 'Closest to Admission',
    sortBy: 'amount_to_threshold',
    sortOrder: 'asc'
  },
  {
    value: 'achieved_pct_desc',
    label: 'Highest % Paid',
    sortBy: 'achieved_pct',
    sortOrder: 'desc'
  },
  {
    value: 'basis_balance_desc',
    label: 'Largest Balance',
    sortBy: 'basis_balance',
    sortOrder: 'desc'
  }
] as const;

interface OnboardingTableServerProps {
  initialData: OnboardingProfileRow[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  tier: OnboardingTier;
  /** Cohort fee position — supplied for the `awaiting_payment` tier only. */
  paymentSummary?: OnboardingPaymentSummary;
}

export function OnboardingTableServer({
  initialData,
  metadata,
  tier,
  paymentSummary
}: OnboardingTableServerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin, canAccess } = usePermissions();

  const canBulkUpdate =
    isSuperAdmin || canAccess('learners', 'onboarding.bulk_update' as any);

  const [localData, setLocalData] = useState<OnboardingProfileRow[]>(initialData);
  const [localMetadata, setLocalMetadata] = useState(metadata);
  const [isActivating, setIsActivating] = useState(false);

  /**
   * Bulk activate, run SEQUENTIALLY rather than with Promise.all.
   *
   * Each activation is two round trips (RPC, then login provisioning through
   * POST /api/learners/complete-onboarding, which itself talks to GoTrue).
   * Firing 200 of those concurrently would hammer the auth admin API, and a
   * partial failure mid-flight would leave no way to say which learners were
   * actually done. Sequential is slower and reportable; that trade is correct
   * for an operation that creates user accounts.
   */
  const handleBulkActivate = async (
    rows: OnboardingProfileRow[],
    resetSelection: () => void
  ) => {
    if (isActivating) return;

    const eligible = rows.filter((r) => r.can_activate);
    const skipped = rows.length - eligible.length;

    if (eligible.length === 0) {
      toast.error(
        skipped > 0
          ? `None of the ${skipped} selected learner(s) can be activated yet.`
          : 'No learners selected.'
      );
      return;
    }

    setIsActivating(true);
    const progress = toast.loading(`Activating 0 / ${eligible.length}...`);

    let activated = 0;
    let loginsCreated = 0;
    const failures: string[] = [];

    for (const [index, learner] of eligible.entries()) {
      const name = `${learner.first_name} ${learner.last_name || ''}`.trim();
      try {
        const result = await LearnerProfileService.activateIfReady(learner.id);
        if (result.activated) {
          activated++;
          if (result.loginCreated) loginsCreated++;
        } else {
          failures.push(`${name}: ${result.message}`);
        }
      } catch (err) {
        console.error('[onboarding] bulk activate failed for', learner.id, err);
        failures.push(`${name}: unexpected error`);
      }
      toast.loading(`Activating ${index + 1} / ${eligible.length}...`, { id: progress });
    }

    toast.dismiss(progress);
    setIsActivating(false);

    // Activated and logins-created are reported separately on purpose: a learner
    // who is active without an account is a real problem that a single
    // "N activated" message would bury.
    if (activated > 0) {
      toast.success(`Activated ${activated} learner(s); ${loginsCreated} login(s) created.`);
    }
    if (loginsCreated < activated) {
      toast.error(`${activated - loginsCreated} learner(s) activated WITHOUT a login — check their college email.`);
    }
    if (failures.length > 0) {
      console.warn('[onboarding] activation failures:', failures);
      toast.error(`${failures.length} could not be activated. See console for details.`);
    }
    if (skipped > 0) {
      toast(`${skipped} selected learner(s) were skipped as not yet eligible.`);
    }

    resetSelection();
    router.refresh();
  };

  useEffect(() => {
    setLocalData(initialData);
    setLocalMetadata(metadata);
  }, [initialData, metadata]);

  // The fee sorts exist only where fee data does. Offering "Closest to
  // Admission" on a tier whose rows carry no `payment` would produce a control
  // that reorders nothing.
  const sortOptions = useMemo(
    () =>
      tier === 'awaiting_payment'
        ? [...SORT_OPTIONS, ...PAYMENT_SORT_OPTIONS]
        : [...SORT_OPTIONS],
    [tier]
  );

  const currentSortBy = searchParams.get('sort_by') || 'first_name';
  const currentSortOrder = searchParams.get('sort_order') || 'asc';
  const currentSort =
    sortOptions.find((o) => o.sortBy === currentSortBy && o.sortOrder === currentSortOrder)?.value ??
    'first_name_asc';

  const handleSortChange = (value: string) => {
    const option = sortOptions.find((o) => o.value === value);
    if (!option) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort_by', option.sortBy);
    params.set('sort_order', option.sortOrder);
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const fetchData = useCallback(async () => {
    return {
      success: true,
      data: localData,
      pagination: localMetadata
    };
  }, [localData, localMetadata]);

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => {
    const selectedIds = props.allSelectedIds.join(',');
    const selected = props.selectedRows as OnboardingProfileRow[];
    const activatable = selected.filter((r) => r?.can_activate).length;

    return (
      <div className="flex items-center gap-2">
        <Select value={currentSort} onValueChange={handleSortChange}>
          <SelectTrigger className="h-8 w-[165px] text-xs">
            <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent align="end">
            {sortOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* On the Ready to Activate tier the useful bulk action is activation,
            not "assign academic info" — those fields are already filled, which
            is precisely why the rows are in this tier. */}
        {selected.length > 0 && canBulkUpdate && tier === 'ready_to_activate' && (
          <Button
            size="sm"
            className="h-8"
            disabled={activatable === 0 || isActivating}
            title={
              activatable === 0
                ? 'None of the selected learners are eligible for activation'
                : 'Promote to Active and create their logins'
            }
            onClick={() => handleBulkActivate(selected, props.resetSelection)}
          >
            {isActivating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="mr-2 h-4 w-4" />
            )}
            Activate ({activatable})
          </Button>
        )}

        {selected.length > 0 && canBulkUpdate && tier !== 'ready_to_activate' && (
          <Button asChild size="sm" className="h-8">
            <Link
              href={`/learners/profiles/promotion?ids=${selectedIds}`}
              onClick={() => props.resetSelection()}
              title="Open promotion form to assign Academic Year / Semester / Section in bulk"
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              Assign Academic Info ({selected.length})
            </Link>
          </Button>
        )}
      </div>
    );
  };

  // Columns are rebuilt when the basis changes, not on every render: the basis
  // comes from admission_statuses and is constant for the life of a page.
  const columns = useMemo(
    () => getOnboardingColumns(tier, paymentSummary?.threshold_basis ?? 'due_to_date'),
    [tier, paymentSummary?.threshold_basis]
  );

  return (
    <>
      {/* Only rendered for `awaiting_payment` — PaymentThresholdBanner returns
          null without a summary, so no tier needs to guard the call. */}
      <PaymentThresholdBanner summary={paymentSummary} />

      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: `onboarding-${tier}-learners`,
          columnMapping: {},
          columnWidths: [],
          headers: []
        }}
        idField="id"
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: false,
          enableRowSelection: true,
          enableSearch: false
        }}
        renderToolbarContent={renderCustomToolbar}
      />
    </>
  );
}
