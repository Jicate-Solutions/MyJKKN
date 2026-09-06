/**
 * Push notification opt-out — the register of people who asked to be left alone.
 *
 * WHY THIS EXISTS AT ALL.
 *   `push_subscriptions.is_active` cannot record an opt-out, and every sender
 *   that filters on it is filtering correctly and still messaging people who
 *   switched push off. Unsubscribing calls `subscription.unsubscribe()` in the
 *   browser, which DESTROYS that endpoint. On the next visit
 *   `Notification.permission` is still 'granted' and `getSubscription()` is
 *   null, so the auto-subscribe effect mints a BRAND NEW endpoint and posts it —
 *   a different endpoint, so a fresh row, so `is_active = true`. The opt-out
 *   signal was stored on the object the opt-out deleted.
 *
 *   The preference therefore lives on the PERSON, in
 *   `push_notification_preferences`, and every sender consults it here.
 *
 * TWO GATES, ONLY ONE OF WHICH IS AUTHORITATIVE.
 *   The subscribe endpoints refuse to write a subscription for an opted-out
 *   person — that is hygiene, and it is what stops the resurrected rows piling
 *   up. The senders refuse to SEND to an opted-out person — that is the
 *   protection. They are deliberately independent, so a hole in either one does
 *   not become a buzzed phone.
 *
 * HOW FAILURE IS HANDLED, AND WHY THE TWO SIDES DIFFER.
 *   `registerMissing` — the table does not exist yet. This migration is
 *   Director-gated, so between deploy and apply the register is genuinely
 *   absent. Treated as "feature not live": senders send as they always did.
 *   Failing closed here would silence every push on the platform during that
 *   window, which is a far larger outage than the bug being fixed.
 *
 *   Any OTHER read error means the register exists and could not be read. The
 *   senders then FAIL CLOSED and send nothing for that batch. A delayed
 *   notification is recoverable; buzzing 109 people who explicitly asked for
 *   silence is the exact harm this file exists to prevent, and a cron simply
 *   runs again.
 *
 *   The subscribe-side gate fails OPEN on the same error, because a subscription
 *   row that merely exists sends nothing on its own — the sender gate above is
 *   what protects the person.
 *
 * ALWAYS READ THE REGISTER WITH A SERVICE-ROLE CLIENT WHEN SENDING.
 *   RLS on this table only exposes a person's own row. A sender running under a
 *   user-scoped session would read zero rows for the RECIPIENT and conclude
 *   "no preference recorded" — i.e. it would leak. Pass a service-role client
 *   for any lookup about somebody other than the caller.
 */

export const PUSH_PREFERENCES_TABLE = 'push_notification_preferences';

/**
 * PostgREST payloads are wider than the generated types (this table is created
 * by a Director-gated migration, so it is not in types/supabase.ts yet). The
 * client is accepted structurally and cast at the boundary; every EXPORTED
 * signature below is fully typed, so callers gain nothing loose.
 */
export type PushPrefDb = {
  from: (table: string) => any;
};

type PostgrestErrorish = {
  code?: string | null;
  message?: string | null;
} | null;

/** `in()` lists are chunked so a large cohort cannot blow the URL length. */
const LOOKUP_CHUNK = 500;

/**
 * True when the failure is "this table does not exist yet" rather than "this
 * table could not be read". PostgREST surfaces the first as 42P01 (undefined
 * table) or PGRST205 (not in the schema cache) depending on whether the cache
 * has been reloaded.
 */
function isRegisterMissing(error: PostgrestErrorish): boolean {
  if (!error) return false;
  const code = error.code || '';
  if (code === '42P01' || code === 'PGRST205') return true;
  const message = (error.message || '').toLowerCase();
  return (
    message.includes('does not exist') || message.includes('schema cache')
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * The subset of `userIds` that may be sent a push right now.
 *
 * Returns an empty array when the register exists but could not be read — the
 * fail-closed case described in the file header. Returns every id unchanged
 * when the register has not been created yet.
 *
 * Pass a SERVICE-ROLE client: RLS on the register only exposes a caller's own
 * row, so a user-scoped client would read nothing for other people and this
 * would silently allow every send.
 */
export async function filterPushRecipients(
  db: PushPrefDb,
  userIds: string[]
): Promise<string[]> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return [];

  const optedOut = new Set<string>();

  for (const ids of chunk(unique, LOOKUP_CHUNK)) {
    const { data, error } = await db
      .from(PUSH_PREFERENCES_TABLE)
      .select('user_id')
      .in('user_id', ids)
      .eq('push_enabled', false);

    if (error) {
      if (isRegisterMissing(error)) {
        // Register not created yet — behave exactly as before it existed.
        return unique;
      }
      console.error(
        '[push/opt-out] preference lookup failed — refusing to send this batch:',
        error
      );
      return [];
    }

    for (const row of (data ?? []) as Array<{ user_id: string }>) {
      optedOut.add(row.user_id);
    }
  }

  if (optedOut.size === 0) return unique;
  return unique.filter((id) => !optedOut.has(id));
}

/**
 * Whether one person has asked to be left alone.
 *
 * `true` also when the register exists and could not be read — the same
 * fail-closed rule as {@link filterPushRecipients}, so a single-recipient
 * sender does not become the one path that leaks.
 */
export async function isPushOptedOut(
  db: PushPrefDb,
  userId: string
): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await db
    .from(PUSH_PREFERENCES_TABLE)
    .select('push_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isRegisterMissing(error)) return false;
    console.error(
      '[push/opt-out] preference lookup failed — refusing to send:',
      error
    );
    return true;
  }

  if (!data) return false;
  return (data as { push_enabled: boolean | null }).push_enabled === false;
}

/**
 * Whether a subscribe request should be refused because the person opted out.
 *
 * Fails OPEN, unlike the sender-side checks: a stored subscription row sends
 * nothing by itself, and refusing to save one on a transient error would strip
 * push from somebody who is genuinely trying to switch it on.
 */
export async function shouldRefusePushSubscribe(
  db: PushPrefDb,
  userId: string
): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await db
    .from(PUSH_PREFERENCES_TABLE)
    .select('push_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (!isRegisterMissing(error)) {
      console.error(
        '[push/opt-out] preference lookup failed on subscribe — allowing the save; the sender-side gate still applies:',
        error
      );
    }
    return false;
  }

  if (!data) return false;
  return (data as { push_enabled: boolean | null }).push_enabled === false;
}

/**
 * Record that this person wants to be left alone.
 *
 * Called from BOTH unsubscribe paths. The hard-delete path especially needs it:
 * without this the row vanishes and the opt-out leaves no trace anywhere.
 *
 * Returns false when the preference could not be written, so the caller can say
 * so in its response rather than reporting a silent success.
 */
export async function recordPushOptOut(
  db: PushPrefDb,
  userId: string
): Promise<boolean> {
  if (!userId) return false;

  const now = new Date().toISOString();
  const { error } = await db.from(PUSH_PREFERENCES_TABLE).upsert(
    {
      user_id: userId,
      push_enabled: false,
      opted_out_at: now,
      updated_at: now
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    if (isRegisterMissing(error)) return false;
    console.error('[push/opt-out] failed to record opt-out:', error);
    return false;
  }

  return true;
}

/**
 * Record that this person deliberately switched push back on.
 *
 * ONLY ever call this from an explicit user action. The auto-subscribe effect
 * must never reach it: re-enabling on a page visit would silently undo the
 * opt-out of everybody it was built to protect, which is the exact failure this
 * change exists to close.
 */
export async function recordPushOptIn(
  db: PushPrefDb,
  userId: string
): Promise<boolean> {
  if (!userId) return false;

  const now = new Date().toISOString();
  const { error } = await db.from(PUSH_PREFERENCES_TABLE).upsert(
    {
      user_id: userId,
      push_enabled: true,
      opted_out_at: null,
      updated_at: now
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    if (isRegisterMissing(error)) return false;
    console.error('[push/opt-out] failed to record opt-in:', error);
    return false;
  }

  return true;
}
