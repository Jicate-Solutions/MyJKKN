// How an organogram role's holder is shown on screen.
//
// The AI draft fills every unnamed role with a bracketed placeholder such as
// "[Manager to complete]". Rendered as-is it reads like a person's name, so an
// unfilled role looks staffed — which is how Feedback / SCF came to display eight
// role holders that did not exist, on an org chart badged "Approved", above a
// "Print / Save as PDF" button.
//
// This lives in one module on purpose. The same helper was defined privately
// inside the review dialog, so the read-only view dialog rendered the raw
// placeholder while the edit dialog showed "Not assigned yet" — the same fact,
// two answers, which is the drift that produced the bug in the first place.
//
// Display only. The placeholder must still reach the database unchanged:
// fn_mba_dept_role_assignment_set rejects it, and
// fn_mba_dept_role_assignments_sync reads it as "leave this role alone" so a real
// holder is not end-dated. Blanking it before it is saved is destructive.

/** Bracketed-and-nothing-else, e.g. "[Manager to complete]" or "[TBD]". */
const UNFILLED_HOLDER = /^\s*\[[^\]]*\]\s*$/;

function asText(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/** True when nobody has actually been named for this role. */
export function isUnfilledHolder(v: unknown): boolean {
  const s = asText(v).trim();
  return s === '' || UNFILLED_HOLDER.test(s);
}

/** What a reader should see: a real name, or plain language for "nobody yet". */
export function displayHolder(v: unknown): string {
  return isUnfilledHolder(v) ? 'Not assigned yet' : asText(v).trim();
}
