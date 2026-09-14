// ============================================================================
// COUNSELOR BRIEFING EFFECT — the counter-metric, visible to the Director
// ============================================================================
// Director ruling 2026-09-13: the flag "briefing changed nothing" (a counselor
// who ignored the last N named briefings yet moved leads forward at/above
// their own baseline) is for the super admin ONLY, seen on /admin/loops —
// never sent to admission team members or the counselor, no notification.
// This block is that surface. It reads counselor_briefing_effects (written
// daily at 07:17 IST by fn_counselor_briefing_measure, migration
// 20261210071700) with the service role, from a page that is already gated on
// profiles.is_super_admin server-side BEFORE any read.
//
// Server-rendered, presentational, READ-ONLY, no client JS. Shows the current
// and previous ISO week (Monday start, IST calendar — the same v_ws the
// measure fn derives): counselors measured, how many carry a delta (both
// sides of the estimator cleared the de-noise floor), and the counselors
// flagged, by name and week. A read failure is said out loud (rule #27) —
// an empty list must never be mistaken for "nobody flagged".
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';
import { istToday } from '@/lib/services/loops/counselor-briefing-effect';

type AdminClient = ReturnType<typeof createServiceRoleClient>;

export interface CounselorBriefingWeek {
  /** Monday, 'YYYY-MM-DD' (IST calendar). */
  weekStart: string;
  measured: number;
  withDelta: number;
  flagged: number;
}

export interface FlaggedCounselor {
  counselorId: string;
  name: string;
  institution: string | null;
  weekStart: string;
}

export interface CounselorBriefingSummary {
  /** [current week, previous week] — always two entries, zeros when nothing was measured. */
  weeks: CounselorBriefingWeek[];
  flagged: FlaggedCounselor[];
  /** Set when the table could not be read (e.g. migration not yet applied). */
  readError: string | null;
}

interface EffectRow {
  counselor_id: string;
  institution_id: string;
  week_start: string;
  forward_delta: number | string | null;
  briefing_changed_nothing: boolean | null;
}

const DAY_MS = 86_400_000;

/** Monday of the ISO week containing an IST calendar date, as 'YYYY-MM-DD'. */
export function istWeekStart(istDate: string, weeksBack = 0): string {
  const d = new Date(`${istDate}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7 + weeksBack * 7;
  return new Date(d.getTime() - back * DAY_MS).toISOString().slice(0, 10);
}

export async function loadCounselorBriefingSummary(
  admin: AdminClient,
  now: Date = new Date()
): Promise<CounselorBriefingSummary> {
  const today = istToday(now);
  const weekStarts = [istWeekStart(today, 0), istWeekStart(today, 1)];
  const empty = weekStarts.map((weekStart) => ({ weekStart, measured: 0, withDelta: 0, flagged: 0 }));

  let rows: EffectRow[] = [];
  try {
    const { data, error } = await admin
      .from('counselor_briefing_effects')
      .select('counselor_id, institution_id, week_start, forward_delta, briefing_changed_nothing')
      .in('week_start', weekStarts);
    if (error) {
      return { weeks: empty, flagged: [], readError: error.message };
    }
    rows = (data ?? []) as EffectRow[];
  } catch (e) {
    return { weeks: empty, flagged: [], readError: e instanceof Error ? e.message : String(e) };
  }

  const weeks = weekStarts.map((weekStart) => {
    const wk = rows.filter((r) => r.week_start === weekStart);
    return {
      weekStart,
      measured: wk.length,
      withDelta: wk.filter((r) => r.forward_delta !== null && r.forward_delta !== undefined).length,
      flagged: wk.filter((r) => r.briefing_changed_nothing === true).length,
    };
  });

  const flaggedRows = rows.filter((r) => r.briefing_changed_nothing === true);
  if (flaggedRows.length === 0) return { weeks, flagged: [], readError: null };

  // Names are best-effort: a missing name never hides a flag.
  const nameById = new Map<string, string>();
  const instById = new Map<string, string>();
  try {
    const counselorIds = Array.from(new Set(flaggedRows.map((r) => r.counselor_id)));
    const institutionIds = Array.from(new Set(flaggedRows.map((r) => r.institution_id)));
    const [{ data: counselors }, { data: institutions }] = await Promise.all([
      admin.from('admission_counselors').select('id, name').in('id', counselorIds),
      admin.from('institutions').select('id, name').in('id', institutionIds),
    ]);
    for (const c of (counselors ?? []) as Array<{ id: string; name: string | null }>) {
      if (c.name) nameById.set(c.id, c.name);
    }
    for (const i of (institutions ?? []) as Array<{ id: string; name: string | null }>) {
      if (i.name) instById.set(i.id, i.name);
    }
  } catch {
    // fall through — ids still render
  }

  const flagged = flaggedRows
    .map((r) => ({
      counselorId: r.counselor_id,
      name: nameById.get(r.counselor_id) ?? `Counselor ${r.counselor_id.slice(0, 8)}`,
      institution: instById.get(r.institution_id) ?? null,
      weekStart: r.week_start,
    }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.name.localeCompare(b.name));

  return { weeks, flagged, readError: null };
}

// Same chip idiom as the proven-green strip / waiting-on-Director panel.
const CHIP_CLS =
  'inline-flex items-baseline gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide';
const CHIP_NEUTRAL = 'border-border bg-muted/40 text-muted-foreground';
const CHIP_RED =
  'border-red-400/60 bg-red-50/60 text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300';

export function CounselorBriefingPanel({ summary }: { summary: CounselorBriefingSummary }) {
  const [current, previous] = summary.weeks;
  const nothingMeasured = summary.weeks.every((w) => w.measured === 0);

  return (
    <section className="rounded-xl border border-border">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold tracking-tight">Counselor briefing effect</h2>
          <p className="text-xs text-muted-foreground">
            Did the nightly briefing change what counselors did? Flagged = ignored the
            last named briefings yet moved leads forward at or above their own baseline.
            Super-admin only — never shown to admission team members or the counselor.
          </p>
        </div>
        {!nothingMeasured && (
          <span className={`${CHIP_CLS} ${summary.flagged.length > 0 ? CHIP_RED : CHIP_NEUTRAL}`}>
            flagged <span className="tabular-nums">{summary.flagged.length}</span>
          </span>
        )}
      </header>

      {summary.readError !== null ? (
        <div className="px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
          Counselor measurements could not be read — {summary.readError}. Nothing below
          this line is known; this is not &ldquo;nobody flagged&rdquo;.
        </div>
      ) : nothingMeasured ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No counselor measurements yet — the loop runs daily at 07:17
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {[
              { label: 'This week', week: current },
              { label: 'Last week', week: previous },
            ].map(({ label, week }) => (
              <div key={week.weekStart} className="flex flex-col gap-1.5 px-4 py-3">
                <dt className="text-xs font-medium">
                  {label}{' '}
                  <span className="font-mono text-[10px] text-muted-foreground">
                    from {week.weekStart}
                  </span>
                </dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  <span className={`${CHIP_CLS} ${CHIP_NEUTRAL}`}>
                    measured <span className="tabular-nums">{week.measured}</span>
                  </span>
                  <span className={`${CHIP_CLS} ${CHIP_NEUTRAL}`}>
                    with delta <span className="tabular-nums">{week.withDelta}</span>
                  </span>
                  <span className={`${CHIP_CLS} ${week.flagged > 0 ? CHIP_RED : CHIP_NEUTRAL}`}>
                    changed nothing <span className="tabular-nums">{week.flagged}</span>
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          {summary.flagged.length > 0 && (
            <ul className="flex flex-col divide-y divide-border/60 border-t border-border">
              {summary.flagged.map((f) => (
                <li
                  key={`${f.counselorId}:${f.weekStart}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-sm"
                >
                  <span>
                    {f.name}
                    {f.institution && (
                      <span className="text-xs text-muted-foreground"> · {f.institution}</span>
                    )}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    briefing changed nothing · week of {f.weekStart}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
