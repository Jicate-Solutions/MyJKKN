// The fn_scf_admin_* reads raise "<fn>: not authorized" / "not authenticated"
// for a caller without the leadership key. Any other failure (a statement
// timeout, a network drop) is NOT an access problem, and telling a HOD who
// does have access "you don't have access" sends them to the wrong person.
const ACCESS_DENIED = /not authori[sz]ed|not authenticated|permission denied/i;

export function loadErrorHeadline(error: unknown, accessDeniedCopy: string): string {
  const message = error instanceof Error ? error.message : '';
  return ACCESS_DENIED.test(message)
    ? accessDeniedCopy
    : "This section couldn't load right now — press Refresh to try again.";
}
