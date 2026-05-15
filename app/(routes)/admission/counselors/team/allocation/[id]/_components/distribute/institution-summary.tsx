'use client';

import { useMemo } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CounselorSourceAssignment } from '@/lib/services/admission/counselor-source-service';

interface InstitutionSummaryProps {
  /** Map of lead_id -> institution_id for every selected lead. */
  selectedLeadInstitutions: Array<{ leadId: string; institutionId: string | null }>;
  /** All counselors currently selected as targets in the picker. */
  selectedCounselors: CounselorSourceAssignment[];
  /** All counselors mapped to this source (so we can compare "selected" vs "available per institution"). */
  allMappedCounselors: CounselorSourceAssignment[];
  /** Institution id -> name lookup for display. */
  institutionMap: Map<string, string>;
  /** When true, mismatches are warnings instead of blockers. */
  overrideActive: boolean;
}

interface InstitutionRow {
  institutionId: string | null;
  institutionName: string;
  leadsSelected: number;
  counselorsSelectedFromInst: number;
  counselorsAvailableFromInst: number;
  perCounselor: number | null;
  status: 'ok' | 'capacity_warn' | 'no_match';
  message: string;
}

export interface InstitutionSummaryStatus {
  hasBlockingMismatches: boolean;
  routableLeads: number;
  blockedLeads: number;
  rows: InstitutionRow[];
}

/**
 * Pre-commit consolidated summary. For each institution that has selected
 * leads, computes:
 *   - leads to be distributed
 *   - counselors currently selected from that institution
 *   - counselors AVAILABLE from that institution (mapped to source)
 *   - per-counselor average if the round-robin lands on inst-matched counselors
 *   - a status verdict (ok / capacity_warn / no_match)
 *
 * Surfaces an aggregate `hasBlockingMismatches` flag that the panel uses
 * to gate the Confirm button (unless override is active).
 */
export function useInstitutionSummary(
  props: Omit<InstitutionSummaryProps, 'overrideActive'>,
): InstitutionSummaryStatus {
  const {
    selectedLeadInstitutions,
    selectedCounselors,
    allMappedCounselors,
    institutionMap,
  } = props;

  return useMemo(() => {
    // Bucket leads by institution_id.
    const leadCounts = new Map<string | null, number>();
    for (const l of selectedLeadInstitutions) {
      leadCounts.set(l.institutionId, (leadCounts.get(l.institutionId) ?? 0) + 1);
    }

    // Bucket selected counselors by institution_id.
    const selectedByInst = new Map<string, number>();
    for (const c of selectedCounselors) {
      const inst = c.counselor?.institution_id;
      if (!inst) continue;
      selectedByInst.set(inst, (selectedByInst.get(inst) ?? 0) + 1);
    }

    // Bucket all mapped counselors by institution_id (so we can report
    // "0 selected from Engineering but 21 available — broaden picker").
    const availableByInst = new Map<string, number>();
    for (const c of allMappedCounselors) {
      const inst = c.counselor?.institution_id;
      if (!inst) continue;
      availableByInst.set(inst, (availableByInst.get(inst) ?? 0) + 1);
    }

    const rows: InstitutionRow[] = [];
    let routableLeads = 0;
    let blockedLeads = 0;
    let hasBlockingMismatches = false;

    for (const [institutionId, leadsSelected] of leadCounts.entries()) {
      const institutionName = institutionId
        ? institutionMap.get(institutionId) ?? '(unknown institution)'
        : '(no institution)';
      const counselorsSelectedFromInst = institutionId
        ? selectedByInst.get(institutionId) ?? 0
        : 0;
      const counselorsAvailableFromInst = institutionId
        ? availableByInst.get(institutionId) ?? 0
        : 0;

      let status: InstitutionRow['status'] = 'ok';
      let message = '';

      if (counselorsSelectedFromInst === 0) {
        status = 'no_match';
        hasBlockingMismatches = true;
        blockedLeads += leadsSelected;
        message =
          counselorsAvailableFromInst > 0
            ? `${counselorsAvailableFromInst} counselor${counselorsAvailableFromInst === 1 ? '' : 's'} available but none selected — tick them in the picker below`
            : 'No counselors mapped to this institution for this source — map some first';
      } else {
        routableLeads += leadsSelected;
        const perCounselor = leadsSelected / counselorsSelectedFromInst;
        if (perCounselor > 200) {
          status = 'capacity_warn';
          message = `~${Math.ceil(perCounselor)} leads each — likely above max_leads cap`;
        } else {
          message = `~${Math.ceil(perCounselor)} leads each`;
        }
      }

      const perCounselor =
        counselorsSelectedFromInst > 0
          ? Math.ceil(leadsSelected / counselorsSelectedFromInst)
          : null;

      rows.push({
        institutionId,
        institutionName,
        leadsSelected,
        counselorsSelectedFromInst,
        counselorsAvailableFromInst,
        perCounselor,
        status,
        message,
      });
    }

    // Sort: blocking rows first, then by leads desc.
    rows.sort((a, b) => {
      const sa = a.status === 'no_match' ? 0 : a.status === 'capacity_warn' ? 1 : 2;
      const sb = b.status === 'no_match' ? 0 : b.status === 'capacity_warn' ? 1 : 2;
      if (sa !== sb) return sa - sb;
      return b.leadsSelected - a.leadsSelected;
    });

    return { hasBlockingMismatches, routableLeads, blockedLeads, rows };
  }, [
    selectedLeadInstitutions,
    selectedCounselors,
    allMappedCounselors,
    institutionMap,
  ]);
}

export function InstitutionSummary({
  selectedLeadInstitutions,
  selectedCounselors,
  allMappedCounselors,
  institutionMap,
  overrideActive,
}: InstitutionSummaryProps) {
  const status = useInstitutionSummary({
    selectedLeadInstitutions,
    selectedCounselors,
    allMappedCounselors,
    institutionMap,
  });

  if (status.rows.length === 0) return null;

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold">Institution-Matching Summary</span>
          <span className="text-muted-foreground">
            {selectedLeadInstitutions.length} leads · {selectedCounselors.length}{' '}
            counselors selected
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="text-emerald-700">
            <span className="font-semibold">{status.routableLeads.toLocaleString()}</span>{' '}
            routable
          </span>
          {status.blockedLeads > 0 && (
            <span className="text-red-700">
              <span className="font-semibold">{status.blockedLeads.toLocaleString()}</span>{' '}
              blocked
            </span>
          )}
        </div>
      </div>

      <div className="divide-y">
        {status.rows.map((row) => (
          <div
            key={row.institutionId ?? 'null'}
            className={cn(
              'flex items-center gap-3 px-3 py-2 text-sm',
              row.status === 'no_match' &&
                'bg-red-50/60 dark:bg-red-950/20',
              row.status === 'capacity_warn' &&
                'bg-amber-50/60 dark:bg-amber-950/20',
            )}
          >
            <span className="flex-shrink-0">
              {row.status === 'ok' && (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
              {row.status === 'capacity_warn' && (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              {row.status === 'no_match' && (
                <Ban className="h-4 w-4 text-red-600" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {row.institutionName}
            </span>
            <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
              {row.leadsSelected.toLocaleString()} leads →{' '}
              {row.counselorsSelectedFromInst} counselor
              {row.counselorsSelectedFromInst === 1 ? '' : 's'}
              {row.counselorsAvailableFromInst > row.counselorsSelectedFromInst &&
                row.counselorsSelectedFromInst > 0 && (
                  <span className="text-muted-foreground/70">
                    {' '}
                    (of {row.counselorsAvailableFromInst} available)
                  </span>
                )}
            </span>
            <span
              className={cn(
                'flex-shrink-0 text-[11px]',
                row.status === 'no_match' && 'text-red-700 dark:text-red-300',
                row.status === 'capacity_warn' && 'text-amber-700 dark:text-amber-300',
                row.status === 'ok' && 'text-muted-foreground',
              )}
            >
              {row.message}
            </span>
          </div>
        ))}
      </div>

      {status.hasBlockingMismatches && (
        <div
          className={cn(
            'border-t px-3 py-2 text-xs',
            overrideActive
              ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
              : 'bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200',
          )}
        >
          {overrideActive ? (
            <>
              <strong>Override active:</strong> blocked institutions will be
              skipped or routed via override rules.
            </>
          ) : (
            <>
              <strong>Confirm disabled:</strong> {status.blockedLeads.toLocaleString()}{' '}
              lead{status.blockedLeads === 1 ? '' : 's'} have no matching
              counselor selected. Either select matching counselors from the
              picker below, narrow the lead selection, or enable Override to
              proceed anyway.
            </>
          )}
        </div>
      )}
    </div>
  );
}
