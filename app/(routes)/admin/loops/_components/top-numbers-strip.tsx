// ============================================================================
// THE TWO TOP NUMBERS — two lines at the head of /admin/loops
// ============================================================================
// Director 2026-09-18 06:27: "two top numbers, side by side."
// Spec: specs/2026-09-18-loop-graph-and-two-top-numbers.md
//
//   T1  top-defect-hours    weekly hours real users lose to defects  ↓ better
//   T2  top-adoption-share  share of shipped features actually used  ↑ better
//
// Every loop below this strip is supposed to serve one of these two. The strip
// shows, per number: the last value, the 4-week trend, the constants it was
// computed with, and the date it was measured.
//
// THE CONSTANTS ARE ON SCREEN ON PURPOSE. T1's "2 minutes per affected person"
// and "5 minutes per reporter" are a first honest guess that WILL be
// recalibrated. Each measurement carries the constants it used inside run_id,
// so the page can always say which guess produced which number and a
// recalibration never rewrites history.
//
// Read-only, service-role, swallow-to-empty like every other read on this page:
// an unapplied migration or an empty table renders an explicit line, never a
// 500 and never a silent blank (rule #27).
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';

export const TOP_DEFECT_HOURS_KEY = 'top-defect-hours';
export const TOP_ADOPTION_SHARE_KEY = 'top-adoption-share';

/** How many measurements make the trend the Director reads at a glance. */
const TREND_POINTS = 4;

export interface TopNumberPoint {
  measured_at: string;
  value: number | null;
  gap: string | null;
  /** Constants pulled out of run_id when it holds this route's JSON. */
  constants: Record<string, number> | null;
  /** ISO week label from run_id, e.g. '2026-W38'. */
  week: string | null;
}

export interface TopNumbersData {
  defectHours: TopNumberPoint[];
  adoptionShare: TopNumberPoint[];
  /** Set when the table could not be read at all — shown as one honest line. */
  unavailable: string | null;
}

interface MeasurementRow {
  loop_key: string;
  measured_at: string;
  value: number | string | null;
  gap: string | null;
  run_id: string | null;
  status: string | null;
}

function parseRunId(runId: string | null): { constants: Record<string, number> | null; week: string | null } {
  if (!runId) return { constants: null, week: null };
  try {
    const parsed = JSON.parse(runId) as Record<string, unknown>;
    const rawConstants = parsed.constants;
    let constants: Record<string, number> | null = null;
    if (rawConstants && typeof rawConstants === 'object') {
      constants = {};
      for (const [k, v] of Object.entries(rawConstants as Record<string, unknown>)) {
        if (typeof v === 'number') constants[k] = v;
      }
      if (Object.keys(constants).length === 0) constants = null;
    }
    const week = typeof parsed.week === 'string' ? parsed.week : null;
    return { constants, week };
  } catch {
    // run_id is free text for every other loop — a non-JSON value is normal.
    return { constants: null, week: null };
  }
}

function toPoint(row: MeasurementRow): TopNumberPoint {
  const raw = row.value;
  const value = raw === null || raw === undefined ? null : Number(raw);
  const { constants, week } = parseRunId(row.run_id);
  return {
    measured_at: row.measured_at,
    value: value === null || Number.isNaN(value) ? null : value,
    gap: row.gap,
    constants,
    week,
  };
}

/**
 * Reads the last few FINAL measurements for both top numbers. Never throws:
 * the page must render whether or not 20261225070000 has been applied.
 */
export async function loadTopNumbers(
  admin: ReturnType<typeof createServiceRoleClient>
): Promise<TopNumbersData> {
  const empty: TopNumbersData = { defectHours: [], adoptionShare: [], unavailable: null };
  try {
    const { data, error } = await admin
      .from('loop_measurements')
      .select('loop_key, measured_at, value, gap, run_id, status')
      .in('loop_key', [TOP_DEFECT_HOURS_KEY, TOP_ADOPTION_SHARE_KEY])
      .eq('status', 'final')
      .order('measured_at', { ascending: false })
      .limit(TREND_POINTS * 2);
    if (error) return { ...empty, unavailable: error.message };
    const rows = (data ?? []) as MeasurementRow[];
    return {
      defectHours: rows.filter((r) => r.loop_key === TOP_DEFECT_HOURS_KEY).slice(0, TREND_POINTS).map(toPoint),
      adoptionShare: rows
        .filter((r) => r.loop_key === TOP_ADOPTION_SHARE_KEY)
        .slice(0, TREND_POINTS)
        .map(toPoint),
      unavailable: null,
    };
  } catch (e) {
    return { ...empty, unavailable: e instanceof Error ? e.message : String(e) };
  }
}

const CONSTANT_LABEL: Record<string, (v: number) => string> = {
  sentry_minutes_per_affected_user: (v) => `${v} min per person hit by an error`,
  bug_minutes_per_reporter: (v) => `${v} min per reporter of an open bug`,
  bug_min_age_days: (v) => `bugs counted from ${v} day old`,
  used_share_pct: (v) => `"used" = ${v}% of an intended role`,
  min_age_days: (v) => `features counted from ${v} days after shipping`,
};

function constantsLine(constants: Record<string, number> | null): string | null {
  if (!constants) return null;
  const parts = Object.entries(constants)
    .map(([k, v]) => (CONSTANT_LABEL[k] ? CONSTANT_LABEL[k](v) : `${k} = ${v}`))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function fmtValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  return `${value}${unit}`;
}

function TopNumberCard({
  title,
  subtitle,
  unit,
  betterWhen,
  points,
  unavailable,
}: {
  title: string;
  subtitle: string;
  unit: string;
  betterWhen: 'lower' | 'higher';
  points: TopNumberPoint[];
  unavailable: string | null;
}) {
  const latest = points[0] ?? null;
  // Oldest first, so the trend reads left to right like a sentence.
  const trend = [...points].reverse();
  const constants = constantsLine(latest?.constants ?? null);

  return (
    <div className="rounded-md border border-border bg-muted/20 p-4">
      <div className="text-[13px] font-semibold text-foreground">{title}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</div>

      {unavailable ? (
        <div className="mt-3 text-[13px] text-muted-foreground">
          This number could not be read: {unavailable}. Nothing has been assumed in its place.
        </div>
      ) : latest === null ? (
        <div className="mt-3 text-[13px] text-muted-foreground">
          Not measured yet — the weekly pass writes the first reading on Monday.
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {fmtValue(latest.value, unit)}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {latest.week ? `${latest.week} · ` : ''}
              {fmtDate(latest.measured_at)}
            </span>
          </div>

          {latest.value === null && latest.gap ? (
            <div className="mt-1 text-[12px] text-amber-700 dark:text-amber-400">{latest.gap}</div>
          ) : null}

          <div className="mt-2 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {TREND_POINTS}-week trend ({betterWhen} is better):
            </span>{' '}
            {trend.length === 0 ? (
              '—'
            ) : (
              <span className="tabular-nums">
                {trend.map((p, i) => (
                  <span key={`${p.measured_at}-${i}`}>
                    {i > 0 ? ' → ' : ''}
                    {fmtValue(p.value, unit)}
                  </span>
                ))}
              </span>
            )}
          </div>

          <div className="mt-1 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground/80">Counted as:</span>{' '}
            {constants ?? 'constants not recorded with this measurement'}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The two lines at the head of the Loop Control Tower. Both cards always
 * render — an unmeasured number says so rather than disappearing.
 */
export function TopNumbersStrip({ data }: { data: TopNumbersData }) {
  return (
    <section aria-label="The two top numbers every loop serves" className="mb-6">
      <div className="mb-2">
        <h2 className="text-base font-semibold">
          The two numbers every loop below is supposed to move
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Measured once a week, for the ISO week that just ended. A loop that clears its own bar
          without moving one of these has not yet earned it.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TopNumberCard
          title="T1 — Hours real users lose to defects"
          subtitle="Live production errors people hit, plus open bug reports at least a day old."
          unit=" h"
          betterWhen="lower"
          points={data.defectHours}
          unavailable={data.unavailable}
        />
        <TopNumberCard
          title="T2 — Share of shipped features actually used"
          subtitle="Live features shipped 14+ days ago whose weekly reach clears a fifth of an intended role."
          unit="%"
          betterWhen="higher"
          points={data.adoptionShare}
          unavailable={data.unavailable}
        />
      </div>
    </section>
  );
}
