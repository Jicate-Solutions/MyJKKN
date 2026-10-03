/**
 * "An admin signed you out of all devices on <date>." (Director ruling 2026-10-02)
 *
 * When an ADMIN signs someone else out of all devices, one sign_out_notices row
 * is written (migration 20271002150000). The person sees the notice once, the
 * next time they sign in, and it is then marked seen. A self sign-out writes
 * nothing.
 *
 * The writer runs with the service role (there is no INSERT rule for signed-in
 * users). The date shown is always India time, e.g. "2 Oct 2026, 3:15 pm".
 */

import type { createServiceRoleClient } from '@/lib/supabase/server';

type ServiceDb = ReturnType<typeof createServiceRoleClient>;

export type SignOutNoticeTarget =
  | { userId: string; parentAccountId?: never }
  | { parentAccountId: string; userId?: never };

/**
 * Record that `signedOutBy` signed the target out of all devices. Never throws:
 * the sign-out itself already happened, so a failed notice is logged and
 * reported as false, not turned into a failed sign-out.
 */
export async function recordAdminSignOutNotice(
  db: ServiceDb,
  target: SignOutNoticeTarget,
  signedOutBy: string,
  signedOutAt: string = new Date().toISOString()
): Promise<boolean> {
  try {
    const { error } = await db.from('sign_out_notices').insert({
      user_id: target.userId ?? null,
      parent_account_id: target.parentAccountId ?? null,
      signed_out_by: signedOutBy,
      signed_out_at: signedOutAt,
    });
    if (error) {
      console.error('[sign-out-notices] could not record the notice:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[sign-out-notices] could not record the notice:', e);
    return false;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2 Oct 2026, 3:15 pm" in India time. */
export function formatSignOutNoticeDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const hour24 = get('hour') % 24;
  const minute = get('minute');
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const ampm = hour24 < 12 ? 'am' : 'pm';
  return `${get('day')} ${MONTHS[get('month') - 1]} ${get('year')}, ${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

export function signOutNoticeText(signedOutAtIso: string): string {
  return `An admin signed you out of all devices on ${formatSignOutNoticeDate(signedOutAtIso)}.`;
}

export interface SignOutNotice {
  id: string;
  signedOutAt: string;
  message: string;
}
