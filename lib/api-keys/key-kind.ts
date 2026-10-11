/**
 * Which api_keys rows may open the administrator routes (b2a, transport-requests).
 *
 * key_kind arrived with migration 20270301090000 ('admin' | 'personal'), and
 * 20271010151437 adds 'bug_intake'. Before 20270301090000 is applied the column
 * is absent (undefined) and every row is an administrator key; a row from before
 * the column existed may also hold NULL. Both count as admin, so applying or not
 * applying either migration never locks out an existing administrator key.
 * Any other value (personal, bug_intake, anything new) is refused.
 */
export function isAdminKeyKind(kind: unknown): boolean {
  return kind === undefined || kind === null || kind === 'admin';
}
