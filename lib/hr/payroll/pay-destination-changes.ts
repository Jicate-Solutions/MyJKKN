/**
 * Where pay goes: the weekly list of bank-account and paying-trust changes.
 *
 * Director ruling, 1 Oct 2026: the HR head may change a person's bank account
 * and paying trust; every change goes on a weekly list to the Director list
 * (who changed what, and when). The database keeps the log
 * (hr_pay_destination_changes, migration 20270614090000); this file only turns
 * a row into a sentence, so the Monday notice and the salaries page say the
 * same thing in the same words.
 *
 * PURE. No Supabase, no I/O.
 */

export interface PayDestinationChange {
  change_id: string;
  staff_id: string;
  staff_name: string | null;
  staff_code: string | null;
  college: string | null;
  kind: 'bank' | 'payer';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed_by_name: string;
  changed_at: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** "account ending 1234 at SBI" / "account ending 1234" / "no account". */
export function describeBank(v: Record<string, unknown> | null): string {
  if (!v) return 'no account';
  const last4 = str(v.account_last4);
  const bank = str(v.bank);
  const base = last4 ? `account ending ${last4}` : 'an account';
  return bank ? `${base} at ${bank}` : base;
}

/** The trust's name, or a plain stand-in. */
export function describePayer(v: Record<string, unknown> | null): string {
  if (!v) return 'no paying trust';
  return str(v.organization_name) ?? 'an unnamed trust';
}

/** The person, as the list names them. */
export function personLabel(c: Pick<PayDestinationChange, 'staff_name' | 'staff_code' | 'college'>): string {
  const name = c.staff_name ?? 'A team member';
  const code = c.staff_code ? ` (${c.staff_code})` : '';
  const college = c.college ? `, ${c.college}` : '';
  return `${name}${code}${college}`;
}

/** "Bank: account ending 1234 at SBI → account ending 5678 at HDFC". */
export function describeChange(c: Pick<PayDestinationChange, 'kind' | 'before' | 'after'>): string {
  if (c.kind === 'bank') {
    if (!c.before) return `Bank account recorded: ${describeBank(c.after)}`;
    if (!c.after) return `Bank account removed: was ${describeBank(c.before)}`;
    return `Bank account changed from ${describeBank(c.before)} to ${describeBank(c.after)}`;
  }
  if (!c.before) return `Paying trust recorded: ${describePayer(c.after)}`;
  if (!c.after) return `Paying trust removed: was ${describePayer(c.before)}`;
  return `Paying trust changed from ${describePayer(c.before)} to ${describePayer(c.after)}`;
}

/** The Monday notice's body: a count, then up to `max` one-line entries. */
export function weeklyNoticeBody(changes: PayDestinationChange[], max = 6): string {
  if (changes.length === 0) {
    return 'No bank account or paying trust was changed in the last 7 days.';
  }
  const lines = changes
    .slice(0, max)
    .map((c) => `${personLabel(c)}: ${describeChange(c)}, by ${c.changed_by_name}.`);
  const more = changes.length > max ? ` And ${changes.length - max} more on the salaries page.` : '';
  return `${lines.join(' ')}${more}`;
}

/** The Monday notice's headline. */
export function weeklyNoticeTitle(count: number): string {
  if (count === 0) return 'Bank and paying-trust changes this week: none';
  return `Bank and paying-trust changes this week: ${count}`;
}

/** Monday (YYYY-MM-DD) of the IST week containing `now`: the edition's identity. */
export function istWeekStart(now = Date.now()): string {
  const ist = new Date(now + 5.5 * 60 * 60 * 1000);
  const daysSinceMonday = (ist.getUTCDay() + 6) % 7;
  ist.setUTCDate(ist.getUTCDate() - daysSinceMonday);
  return ist.toISOString().slice(0, 10);
}
