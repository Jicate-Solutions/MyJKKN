'use client';

/**
 * Team Rotation — "two teams in one department" warning callout.
 *
 * The Director's ruling on a doubled-up rota is ALLOW-AND-WARN: a schedule that
 * puts two teams in the same department in the same period is permitted, but the
 * person setting it up must SEE it so it is a deliberate choice and not an
 * accident. So this component is purely informational:
 *
 *   - it never disables a control, blocks a save, or throws;
 *   - it renders NOTHING when the report is clean (`hasOverlap: false`), which is
 *     the live production state today — 0 cycles, 0 teams, 0 slots;
 *   - amber, not destructive red, because nothing is broken.
 *
 * Shared by the rota chart (`../_components/rotation-chart-client`) and the
 * rotation setup page, so the summary wording can never drift between the two.
 */

import { AlertTriangle } from 'lucide-react';
import type { MbaRotationOverlapReport } from '@/lib/services/mba-rotation/mba-rotation-service';

/** How many departments to name before collapsing into "and N more". */
const MAX_NAMED_AREAS = 4;

/**
 * "Library (period 2)" / "Transport (periods 1, 3)" — period numbers are 1-based
 * to match the "Period 1, Period 2 …" column headers on the chart.
 */
function describeArea(label: string, periodIndexes: number[]): string {
  const nums = periodIndexes.map((i) => i + 1);
  const word = nums.length === 1 ? 'period' : 'periods';
  return `${label} (${word} ${nums.join(', ')})`;
}

/**
 * The one-line headline, e.g. "2 departments have two teams in the same period".
 *
 * Exported so the rotation-setup toast and this callout can never word it
 * differently. It says "two teams" only when two is the truth: with more teams
 * than twice the department count a single cell can hold three or more, and the
 * copy has to follow the data rather than the usual case.
 */
export function rotationOverlapHeadline(report: MbaRotationOverlapReport): string {
  const most = Math.max(0, ...Array.from(report.teamCountByCell.values()));
  const subject =
    report.areaCount === 1 ? '1 department has' : `${report.areaCount} departments have`;
  const object = most > 2 ? `up to ${most} teams` : 'two teams';
  return `${subject} ${object} in the same period`;
}

export function RotationOverlapWarning({
  report,
  areaLabel,
  className,
}: {
  report: MbaRotationOverlapReport;
  /** area_id -> the department's display label. */
  areaLabel: (areaId: string) => string;
  className?: string;
}) {
  if (!report.hasOverlap) return null;

  const entries = Array.from(report.byArea.entries())
    .map(([areaId, periods]) => ({ label: areaLabel(areaId), periods }))
    .sort((a, b) => a.periods[0] - b.periods[0] || a.label.localeCompare(b.label));

  const named = entries.slice(0, MAX_NAMED_AREAS);
  const hidden = entries.length - named.length;

  const lead = rotationOverlapHeadline(report);

  const list =
    named.map((e) => describeArea(e.label, e.periods)).join(', ') +
    (hidden > 0 ? `, and ${hidden} more` : '');

  return (
    <div
      role="status"
      className={`rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40 ${className ?? ''}`}
    >
      <div className="flex gap-3">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="space-y-1">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            {lead} &mdash; {list}.
          </p>
          <p className="text-amber-800/90 dark:text-amber-200/80">
            This is allowed and the rota was saved. Confirm it is intentional
            &mdash; it usually happens when a cycle has more teams than
            departments, which makes the same pairs of teams share a department in
            every period.
          </p>
        </div>
      </div>
    </div>
  );
}
