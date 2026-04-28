'use client';

/**
 * CounselorStaffingAlert
 *
 * Director-facing widget that surfaces counselor load imbalance and
 * institutions with zero active counselors.
 *
 * Renders only when either condition is true:
 *   - Top counselor open_leads > 3× median, OR
 *   - At least one institution has zero active counselors
 *
 * Reuses DataAlertBanner from PR #544 (components/shared/data-alert-banner).
 *
 * Usage:
 *   <CounselorStaffingAlert />
 */

import { DataAlertBanner } from '@/components/shared/data-alert-banner/data-alert-banner';
import { useCounselorStaffingStats } from '@/hooks/admission/use-counselor-staffing-stats';

const OVERLOAD_RATIO_THRESHOLD = 3;

export function CounselorStaffingAlert() {
  const { stats, loading } = useCounselorStaffingStats();

  if (loading || !stats) return null;

  const hasOverload = stats.ratio > OVERLOAD_RATIO_THRESHOLD;
  const hasOrphans = stats.orphan_count > 0;

  if (!hasOverload && !hasOrphans) return null;

  // Build a human-readable description combining both signals
  const parts: string[] = [];
  if (hasOverload) {
    parts.push(
      `Highest-load counselor has ${stats.top_load.toLocaleString()} open leads (${stats.ratio}× the median of ${stats.median_load.toLocaleString()}).`,
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

  const title = hasOverload
    ? `Counselor staffing imbalance detected — ${stats.ratio}× load ratio`
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
