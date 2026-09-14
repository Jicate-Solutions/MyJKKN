/**
 * Why did the institution detail page fail to load?
 *
 * The page used to answer that question with one sentence — "Institution not
 * found" — for every failure that produced no row. For a reader whose role
 * cannot see that institution, that sentence is false: the institution exists,
 * they are simply not allowed to see it. Told "not found", they read the page as
 * broken and report a bug instead of asking for access. CLAUDE.md #27: a
 * permission failure must be explicit, never silent and never misleading.
 *
 * WHAT CAN AND CANNOT BE DISTINGUISHED HERE — read this before widening it.
 *
 * The page loads through `OrganizationService.getInstitution(id)`, which runs
 * `.from('institutions').select('*').eq('id', id).single()` on the browser
 * client, under RLS, as the signed-in reader.
 *
 * Row-level security does not refuse — it filters. A row the reader may not see
 * is simply not in the result, with `error === null` (this codebase already says
 * so in its own words at `app/(routes)/accreditation/manage/owners/page.tsx`:
 * "RLS denial is silent"). `.single()` then turns "0 rows" into a PGRST116
 * error. A row that was deleted produces EXACTLY the same 0 rows and EXACTLY
 * the same PGRST116.
 *
 * So `PGRST116` is genuinely ambiguous between "you may not see it" and "it is
 * gone", and no amount of client-side cleverness separates them: telling them
 * apart needs a SECURITY DEFINER RPC that can look without RLS and report which
 * case it is — a database change, which this PR deliberately does not make.
 * Rather than assert the wrong one, that case says both, out loud.
 *
 * What IS unambiguous is a hard refusal: `42501` (Postgres
 * insufficient_privilege — a missing table GRANT) and `PGRST301` (PostgREST
 * rejected the credential). Those are the database saying no, not filtering, and
 * they earn a real access-denied screen.
 *
 * Codes first, prose second — the same idiom as
 * `app/(routes)/health/sports/_components/tournament-permission-ui.tsx`.
 *
 * WHICH OF THE TWO ACTUALLY FIRES TODAY: the prose one. `getInstitution` throws
 * `new Error(institutionError.message)`, which keeps PostgREST's sentence and
 * drops its code, so what reaches this page is a plain Error with a message and
 * no `code`. Both discriminators are implemented anyway — the code branch for
 * any caller that does preserve one, the prose branch for the call path that
 * exists — and the prose patterns below are matched against the messages
 * PostgREST actually sends:
 *
 *   PGRST116 -> "JSON object requested, multiple (or no) rows returned"  (v11)
 *            -> "The result contains 0 rows"                            (v12)
 *   42501    -> "permission denied for table institutions"
 *
 * The one case that degrades: `PGRST301` arrives as "JWT expired", which matches
 * no pattern here and so classifies as `unknown` — the reader is shown that
 * message rather than an access-denied screen. Honest, if blunt.
 *
 * Teaching the service to carry the code through was tried and reverted: that
 * file already carries two type errors on `jicate/main` (a TS2307 for the
 * untracked `@/types/database.types`, and a TS2322 in `getInstitutionNames`), so
 * editing it pulls both into `TypeCheck (PR-scoped)`, which fails on ANY error
 * in a PR-touched file. Fixing someone else's baseline is not this change's job.
 */

/** What the failure actually was, as far as the client can honestly tell. */
export type InstitutionLoadFailure =
  /** The database refused outright. Not a filter — a denial. */
  | 'not_permitted'
  /** No row came back. Denied or deleted; indistinguishable from here. */
  | 'absent_or_not_permitted'
  /** Something else went wrong (network, driver, a bug). Say what we were told. */
  | 'unknown';

/**
 * The permission key the institutions list already enforces on its Code cell
 * (`columns.tsx`, `canAccess('organizations.institutions', 'view')`). Named on
 * screen so a reader can ask for the right thing by name.
 *
 * This is a LABEL, not a gate. Nothing here checks a permission; the page only
 * reports a refusal the database already made. Inventing a client-side check the
 * list page does not also enforce would hide rows the reader can legitimately
 * open.
 */
export const INSTITUTION_VIEW_PERMISSION = 'organizations.institutions.view';

/**
 * Shown when no row came back and the reason cannot be pinned down. Says both
 * possibilities and points at a person, rather than picking the flattering one.
 *
 * Exported so the page and its test assert the same string.
 */
export const INSTITUTION_ABSENT_OR_DENIED_MESSAGE =
  'You may not have access to this institution, or it no longer exists. ' +
  'Contact your administrator if you believe you should be able to see it.';

/** Shown when the database refused outright. */
export const INSTITUTION_DENIED_MESSAGE =
  'You do not have access to this institution.';

/** Pull a PostgREST code and a message off whatever the query rejected with. */
export function readFailureFields(error: unknown): {
  code: string | null;
  message: string;
} {
  if (!error || typeof error !== 'object') {
    return { code: null, message: typeof error === 'string' ? error : '' };
  }

  const candidate = error as { code?: unknown; message?: unknown };

  return {
    code: typeof candidate.code === 'string' ? candidate.code : null,
    message: typeof candidate.message === 'string' ? candidate.message : ''
  };
}

/** The database said no, rather than quietly filtering. */
function isHardRefusal(code: string | null, message: string): boolean {
  if (code === '42501' || code === 'PGRST301') return true;
  return /permission denied|row[- ]level security|insufficient privilege|not authori[sz]ed/i.test(
    message
  );
}

/** Nothing came back. Could be RLS filtering it out, could be deleted. */
function isEmptyResult(code: string | null, message: string): boolean {
  if (code === 'PGRST116') return true;
  return /multiple \(or no\) rows|contains 0 rows|no rows returned|not found/i.test(
    message
  );
}

/**
 * Classify a detail-page load failure.
 *
 * Order matters: a hard refusal is checked first, because it is the only
 * verdict this function is entitled to state with confidence.
 */
export function classifyInstitutionLoadFailure(
  code: string | null,
  message: string
): InstitutionLoadFailure {
  if (isHardRefusal(code, message)) return 'not_permitted';
  if (isEmptyResult(code, message)) return 'absent_or_not_permitted';
  return 'unknown';
}

/** Convenience for the page: classify straight from a thrown error. */
export function classifyInstitutionLoadError(
  error: unknown
): InstitutionLoadFailure {
  const { code, message } = readFailureFields(error);
  return classifyInstitutionLoadFailure(code, message);
}
