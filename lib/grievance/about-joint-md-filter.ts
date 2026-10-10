/**
 * THE ONE place an app reader that skips row-level security leaves out
 * complaints marked "about the Joint MD" (Director rulings 9 Oct 2026; deep
 * review of #4079 round 3).
 *
 * Who must use it: every reader of grievance_tickets that runs with the
 * service role or for an MCP / B2A key — row-level security does not run for
 * them, so nothing else hides these complaints. __tests__/grievance/
 * table-readers-guard.test.ts fails the build when such a reader exists
 * without it, or filters inline instead of through here.
 *
 * Under EITHER option of the switch grievance.about_joint_md.hide_from_everyone
 * these readers leave the complaints out: an API key, an MCP session or a
 * cron job cannot prove its viewer is not the Joint MD, so it never shows
 * them. (The switch decides what the database's own readers do — migration
 * 20271010020000, section 12.)
 *
 * Deploy order: the app can reach production before that migration adds the
 * column. readLeavingOutAboutJointMd then re-runs the read without the filter,
 * which is exact (no complaint can be marked before the column exists). A
 * `head: true` count fails with an EMPTY error (no code, no message: PostgREST
 * sends no body for HEAD), so such a failure is checked with one ordinary
 * probe before falling back. Any other error is returned untouched.
 */
import { ABOUT_JOINT_MD_COLUMN, isMissingGrievanceSchema } from './schema-compat';

type EqBuilder = { eq: (column: any, value: any) => any };

/** Adds the exclusion to one query builder (select, update or count). */
export function leaveOutAboutJointMd<Q>(query: Q): Q {
  // Unconstrained on purpose: checking a typed PostgREST builder against a
  // structural constraint makes tsc instantiate it too deeply (TS2589).
  return (query as unknown as EqBuilder).eq(ABOUT_JOINT_MD_COLUMN, false) as Q;
}

/**
 * The opposite, for the signed-in Director only (round 8): his own complaints
 * about the Joint MD, behind the "Confidential: N awaiting you" banner. A
 * USER-client read — row-level security still decides what he may see; this
 * only narrows it. Never use it with the service role.
 */
export function onlyMyAboutJointMd<Q>(query: Q, assignee: string): Q {
  const q = (query as unknown as EqBuilder).eq(ABOUT_JOINT_MD_COLUMN, true);
  return (q as EqBuilder).eq('assigned_to', assignee) as Q;
}

type ResultLike = { error: unknown };
type ProbeClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: boolean) => { limit: (n: number) => PromiseLike<ResultLike> };
    };
  };
};

function errorsOf(result: ResultLike | ResultLike[]): unknown[] {
  return (Array.isArray(result) ? result : [result]).map((r) => r.error).filter(Boolean);
}

function isBlankError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  return !e.code && !(typeof e.message === 'string' && e.message.trim() !== '');
}

/** True when the database answers that about_joint_md does not exist yet. */
export async function aboutJointMdColumnMissing(client: unknown): Promise<boolean> {
  try {
    const probe = await (client as ProbeClient)
      .from('grievance_tickets')
      .select('id')
      .eq(ABOUT_JOINT_MD_COLUMN, false)
      .limit(1);
    return isMissingGrievanceSchema(probe.error, ABOUT_JOINT_MD_COLUMN);
  } catch {
    return false;
  }
}

/**
 * Runs `build(true)` — the read WITH the exclusion. Only if the database says
 * the column does not exist yet does it run `build(false)`, the read as it was
 * before migration 20271010020000. `build` may return one result or several
 * (Promise.all of counts).
 */
export async function readLeavingOutAboutJointMd<R extends ResultLike | ResultLike[]>(
  client: unknown,
  build: (leaveOut: boolean) => PromiseLike<R>
): Promise<R> {
  const first = await build(true);
  const errors = errorsOf(first);
  if (errors.length === 0) return first;

  let missing = errors.some((e) => isMissingGrievanceSchema(e, ABOUT_JOINT_MD_COLUMN));
  if (!missing && errors.some(isBlankError)) {
    missing = await aboutJointMdColumnMissing(client);
  }
  return missing ? build(false) : first;
}
