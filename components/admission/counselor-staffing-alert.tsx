'use client';

/**
 * CounselorStaffingAlert
 *
 * Director-facing widget that surfaces counselor load imbalance and
 * institutions with zero active counselors.
 *
 * Renders only when either condition is true:
 *   - Top counselor open_leads / median > max_to_median_ratio.ratio (config row), OR
 *   - Top counselor open_leads > max_open_leads_alert.threshold (config row), OR
 *   - At least orphan_institution_alert.min_unassigned institutions have unassigned
 *     leads + 0 active counselors (config row)
 *
 * All thresholds are loaded from the staffing_alert_thresholds table via
 * useStaffingThreshold(). Edit them at /admin/counselors/alert-thresholds
 * (super_admin only). Defaults match prior hardcoded behaviour.
 *
 * Director's STANDING RULE — every policy decision = config-table row + super_admin UI.
 *
 * Reuses DataAlertBanner from PR #544 (components/shared/data-alert-banner).
 *
 * Usage:
 *   <CounselorStaffingAlert />
 */

import { DataAlertBanner } from '@/components/shared/data-alert-banner/data-alert-banner';
import { useCounselorStaffingStats } from '@/hooks/admission/use-counselor-staffing-stats';
import { useStaffingThreshold } from '@/lib/services/admin/staffing-alert-thresholds-service';

export function CounselorStaffingAlert() {
  const { stats, loading } = useCounselorStaffingStats();
  const { value: ratioCfg } = useStaffingThreshold('max_to_median_ratio');
  const { value: maxLoadCfg } = useStaffingThreshold('max_open_leads_alert');
  const { value: orphanCfg } = useStaffingThreshold('orphan_institution_alert');

  if (loading || !stats) return null;

  const ratioThreshold = ratioCfg.ratio;
  const maxLoadThreshold = maxLoadCfg.threshold;
  const minUnassignedThreshold = orphanCfg.min_unassigned;

  const hasRatioOverload = stats.ratio > ratioThreshold;
  const hasAbsoluteOverload = stats.top_load > maxLoadThreshold;
  const hasOverload = hasRatioOverload || hasAbsoluteOverload;
  const hasOrphans = stats.orphan_count >= minUnassignedThreshold;

  if (!hasOverload && !hasOrphans) return null;

  // Build a human-readable description combining both signals
  const parts: string[] = [];
  if (hasRatioOverload) {
    parts.push(
      `Highest-load counselor has ${stats.top_load.toLocaleString()} open leads (${stats.ratio}× the median of ${stats.median_load.toLocaleString()}).`,
    );
  } else if (hasAbsoluteOverload) {
    parts.push(
      `Highest-load counselor has ${stats.top_load.toLocaleString()} open leads (above the configured ${maxLoadThreshold.toLocaleString()}-lead overload threshold).`,
    );
  }
  if (hasOrphans) {
    parts.push(
      `${stats.orphan_count} institution${stats.orphan_count !== 1 ? 's have' : ' has'} zero active counselors.`,
    );
  }

  const description = parts.join(' ');

  // count passed to DataAlertBanner drives the title placeholder.
  // Use top_load when overloaded, orphan_count otherwise.
  const primaryCount = hasOverload ? stats.top_load : stats.orphan_count;

  const title = hasRatioOverload
    ? `Counselor staffing imbalance detected — ${stats.ratio}× load ratio`
    : hasAbsoluteOverload
      ? `Counselor overload — ${stats.top_load.toLocaleString()} open leads on one counselor`
      : `${stats.orphan_count} institution${stats.orphan_count !== 1 ? 's' : ''} without active counselors`;

  return (
    <DataAlertBanner
      count={primaryCount}
      severity="critical"
      title={title}
      description={description}
      cta={{
        href: '/admission/counselors/team',
        label: 'Review counselor team →',
      }}
    />
  );
}
