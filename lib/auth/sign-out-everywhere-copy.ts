/**
 * "Sign out of all devices" — the wording every success message uses
 * (Director ruling 2026-10-01). No imports on purpose, so the staff screens,
 * the parent app and tests can all share it without pulling in server code.
 *
 * Honest about the limit: a page that is already open keeps reading data until
 * its current access token expires (normally up to an hour).
 */
export const SIGNED_OUT_EVERYWHERE_NOTICE =
  'Signed out on every device. A page already open may keep working for up to an hour.';
