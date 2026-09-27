/**
 * The daily adoption run's result, and the one-line summary the route logs and
 * the AI-routine dispatcher shows. Lives here, not in the route file: Next.js
 * route files may only export their handlers and route config (review 7).
 */

/** What fn_adoption_daily_tick returns (counts only — never who). */
export interface AdoptionTickResult {
  success: boolean;
  error?: string;
  skipped?: string;
  dry_run?: boolean;
  cap?: number;
  capped?: boolean;
  asked?: number;
  reminded?: number;
  features?: Record<
    string,
    {
      near_zero?: boolean;
      asked?: number;
      reminded?: number;
      ask_note?: string | null;
      remind_note?: string | null;
    }
  >;
}

/** One line for the log and the dispatcher's status column. */
export function summariseTick(result: AdoptionTickResult): string {
  if (result.skipped) return `skipped: ${result.skipped}`;
  const asked = Number(result.asked ?? 0);
  const reminded = Number(result.reminded ?? 0);
  const prefix = result.dry_run ? 'would ask' : 'asked';
  const verb = result.dry_run ? 'would remind' : 'reminded';
  const cap = result.capped ? ` (cap ${result.cap} reached — the rest go on a later day)` : '';
  return `${prefix} ${asked}, ${verb} ${reminded}${cap}`;
}
