/**
 * Which api_keys rows may open the administrator routes (b2a, transport-requests).
 *
 * key_kind arrived with migration 20270301090000 ('admin' | 'personal'), and
 * 20271010151437 adds 'bug_intake'. The column is REQUIRED: authenticate.ts
 * selects it by name, so a database without it answers every key with an
 * error (20270301090000 is in the prod ledger; W12 checked 11 Oct 2026). NULL
 * (or a row object without the field, as some tests build) counts as admin.
 * Any other value (personal, bug_intake, anything new) is refused.
 */
export function isAdminKeyKind(kind: unknown): boolean {
  return kind === undefined || kind === null || kind === 'admin';
}
