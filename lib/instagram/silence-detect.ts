/**
 * lib/instagram/silence-detect.ts
 *
 * Weekly (Monday) silence-detection core for connected Instagram accounts.
 *
 * Reads ig_accounts rows in status `active` OR `dormant`, derives each
 * account's true last-post time from `ig_posts` (falling back to the
 * denormalised `ig_accounts.last_post_at` column only when an account has no
 * post rows at all), and dispatches one in-app notification per
 * genuinely-silent account per weekly run to the account's connected_by user
 * (when present) plus all super admins.
 *
 * 2026-09-09 — why the scope is no longer `.eq('status', 'active')`:
 *   The metrics poller flips an account to `dormant` at
 *   `ig.dormancy_threshold_days` (live value 14) while this detector alerts at
 *   `ig.alert_dormant_after_days` (live value 30). An account therefore LEFT
 *   the old scope at day 14 and could never re-enter it to reach the day-30
 *   alarm — a 16-day trapdoor. Measured on production 2026-09-09: zero active
 *   accounts had a `last_post_at` older than 30 days (the oldest was 12 days),
 *   so the old `last_post_at.lt.<threshold>` disjunct was empirically inert
 *   and 100% of alerts came from the NULL disjunct. All 12 genuinely silent
 *   Graph-connected department accounts (40–586 days silent; jkkneducation
 *   586d, jkkn_physicianassistant 431d, jkkn_ece 187d, …) were `dormant` and
 *   therefore invisible to this cron.
 *
 * 2026-09-09 — why a NULL last-post no longer means "silent":
 *   The old code deliberately treated a NULL `last_post_at` as alertable. But
 *   `metrics_source='business_discovery'` accounts NEVER get that column
 *   written, so 4 accounts with zero `ig_posts` rows were being told they
 *   "have gone quiet for more than 30 days" when nothing whatsoever is known
 *   about them. Unknown is now its own terminal state (`status: 'unknown'`)
 *   and never alerts.
 *
 *   The two changes above MUST ship together. Including dormant while still
 *   treating NULL as silent would have false-alarmed 4 recently-posting
 *   accounts (jkkn_textile 5d, jkkn_english 15d, jkkn_bba 19d,
 *   jkkn_microbiology 28d) that the old status filter was accidentally hiding.
 *
 * `disconnected` (2 accounts) stays out of scope: an account nobody is
 * connected to is not silent, it is unplugged.
 *
 * Cadence (2026-07-16; mechanism corrected 2026-09-09): the cron fires WEEKLY
 * on Monday — no longer from vercel.json (retired 2026-08-13 under the 100-cron
 * cap) but from the AI-routine dispatcher, routine id `ig-silence-detect`,
 * minute_of_day 773 = Mon 07:23 UTC = Mon 12:53 IST (migration
 * 20260825010000_move_daily_weekly_crons_to_dispatcher.sql). Concentrating every still-silent account's alert onto the same
 * Monday lets the inbox roll them into ONE "N departments are silent" digest
 * instead of scattering them across the week as each account's own re-alert
 * window elapses. The per-account `ig.silence_realert_days` throttle (default
 * 7) still applies: at a 7-day Monday-to-Monday gap the suppression test is a
 * strict `<`, so each still-silent account is let through exactly once per
 * weekly run. Keep `ig.silence_realert_days` <= 7 or accounts skip some Mondays.
 *
 * Why these two keys vs a new `ig.silence_threshold_days`:
 *   `ig.dormancy_threshold_days` (default 14) — classifies the account as
 *     dormant (used elsewhere to flip status).
 *   `ig.alert_dormant_after_days`   (default 30) — when alerts dispatch.
 * Both already exist in `platform_policies` (seeded by migration
 * 20260530140000_instagram_monitoring_substrate.sql), so a "silence alert"
 * cron is exactly the second key. Re-using avoids the
 * parallel-config-knob smell.
 *
 * Idempotent per (ig_user_id, day): the `notifications.idempotency_key`
 * is `ig-silence-${ig_user_id}-${YYYY-MM-DD}` so a re-run on the same day
 * is a no-op. Fanout uses the canonical
 * `lib/services/_shared/notifications/notify.ts` helper.
 *
 * Re-alert cadence (`ig.silence_realert_days`, default 7): a still-silent
 * account is alerted on FIRST detection, then suppressed until N days have
 * elapsed since its last silence alert. "Last alerted" is derived from the
 * `notifications` rows this cron already writes (idempotency_key prefix
 * `ig-silence-` embeds the alert day) — no new state column. Setting the
 * policy to 0 restores the legacy alert-every-day behaviour.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

/** Default in-code fallback — must match the seeded platform_policies row. */
const DEFAULT_SILENCE_DAYS = 30;

/**
 * Default in-code fallback for `ig.silence_realert_days` — must match the
 * seeded platform_policies row (migration
 * 20260731010000_ig_silence_realert_policy.sql). 0 = re-alert daily.
 */
const DEFAULT_REALERT_DAYS = 7;

/** notifications.idempotency_key prefix written by this cron. */
const IDEMPOTENCY_PREFIX = 'ig-silence-';

export interface SilenceAccountResult {
  ig_user_id: string;
  username: string;
  institution_id: string;
  last_post_at: string | null;
  days_silent: number | null;
  /**
   * `unknown` (added 2026-09-09) = neither ig_posts nor the last_post_at
   * column knows when this account last posted. Unknown is NOT silent and is
   * never alerted on; it is surfaced so the data gap is visible rather than
   * silently swallowed.
   */
  status:
    | 'alerted'
    | 'suppressed'
    | 'deduplicated'
    | 'no_recipients'
    | 'unknown'
    | 'error';
  /** YYYY-MM-DD of the most recent prior silence alert (suppressed rows). */
  last_alerted_on?: string;
  notified?: number;
  notification_id?: string;
  error?: string;
}

export interface RunSilenceDetectResult {
  threshold_days: number;
  realert_days: number;
  /**
   * Every ig_accounts row read this run (status active or dormant). Added
   * 2026-09-09 when the query-time recency prefilter was removed — without it
   * `candidates` alone no longer explains how many rows were examined.
   */
  in_scope: number;
  /**
   * MEANING CHANGED 2026-09-09. Was "rows returned by the prefiltered query";
   * is now "rows that passed the silence guard", i.e. accounts with a known
   * last-post older than threshold_days. This is the number a reader expects
   * from the word "candidates", and it keeps the invariant
   * `in_scope === candidates + unknown + recent` checkable from the JSON.
   * `candidates` itself decomposes into
   * alerted + suppressed + deduplicated + failed + (no_recipients rows).
   */
  candidates: number;
  /** In scope but no last-post date known anywhere — never alerted on. */
  unknown: number;
  /** In scope and posted within threshold_days — healthy, skipped silently. */
  recent: number;
  alerted: number;
  /** Still-silent accounts skipped because their last alert is < realert_days old. */
  suppressed: number;
  deduplicated: number;
  failed: number;
  results: SilenceAccountResult[];
}

/**
 * Read the threshold via the typed-policy resolver. The function is
 * SECURITY DEFINER (lib/policies/keys.ts notes are authoritative), so the
 * service-role client can call it and get the global default even though
 * the resolver also walks user/role/institution overrides which aren't
 * meaningful for a cron context. NULL/missing rows fall back to the
 * provided default rather than throwing.
 */
async function readPolicyInt(
  supabase: SupabaseClient,
  key: string,
  fallback: number,
  minValue: number
): Promise<number> {
  const { data, error } = await supabase.rpc('fn_get_policy_int', {
    p_key: key,
    p_default: fallback,
  });
  if (error) {
    console.warn(`[ig-silence-detect] fn_get_policy_int(${key}) failed:`, error.message);
    return fallback;
  }
  // RPC returns a scalar int; guard against unexpected shapes.
  const n = typeof data === 'number' ? data : Number(data);
  if (!Number.isFinite(n) || n < minValue) return fallback;
  return Math.floor(n);
}

async function resolveSuperAdminIds(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true);
  return (data ?? [])
    .map((r: any) => r?.id as string)
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
}

interface SilentRow {
  /** ig_accounts.id (uuid) — the join key for ig_posts.account_id. */
  id: string;
  ig_user_id: string;
  username: string;
  institution_id: string;
  last_post_at: string | null;
  connected_by: string | null;
}

/** Whole days between two YYYY-MM-DD day keys (toDay - fromDay). */
function daysBetweenDayKeys(fromDay: string, toDay: string): number {
  return Math.round(
    (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) /
      (24 * 60 * 60 * 1000)
  );
}

/**
 * Derive "when was each account last silence-alerted" from the notifications
 * rows this cron already writes. The idempotency_key is
 * `ig-silence-${ig_user_id}-${YYYY-MM-DD}`, so the alert DAY is embedded in
 * the key itself — day-based comparison is deterministic regardless of the
 * exact minute the cron runs (a timestamp comparison would flap at the
 * window boundary). ig_user_id is read from metadata (written by every
 * alert) with a key-parse fallback.
 *
 * Returns Map<ig_user_id, latest YYYY-MM-DD alerted>. Fails OPEN (empty map
 * + warn) on read errors so a lookup failure can never silently mute alerts
 * — worst case is the legacy re-alert-daily behaviour.
 */
async function fetchLastAlertDays(
  supabase: SupabaseClient,
  windowDays: number
): Promise<Map<string, string>> {
  const lastAlertDay = new Map<string, string>();
  if (windowDays <= 0) return lastAlertDay;

  // +1 day fetch buffer so a boundary-day alert is never missed by the
  // created_at prefilter; the precise day arithmetic happens in JS below.
  const sinceIso = new Date(
    Date.now() - (windowDays + 1) * 24 * 60 * 60 * 1000
  ).toISOString();

  // Newest-first + explicit cap (review fix): without an order, Supabase's
  // implicit ~1000-row limit truncates NONDETERMINISTICALLY — an account's
  // newest alert row could silently vanish and re-enable daily re-alerts.
  // Ordered desc, truncation can only shed OLDER rows; since only the max
  // day per account matters, the newest 5000 rows (~one notifications row
  // per silent account per day; 35/day today => ~300/window) cannot lose
  // any account's latest alert at any realistic scale.
  // Paginated fetch (round-3 review): a single capped query cannot
  // guarantee completeness — PostgREST's server max-rows (commonly 1000)
  // can silently truncate, and a large realert window (30–90 days) can
  // legitimately exceed it (~35 alerts/day × window across all accounts).
  // Page newest-first until a short page arrives; hard stop at PAGE_CAP
  // pages with a loud warn (degrades toward alerting, never silence).
  // NOTE on tenant scoping (re-flagged each round): keying on ig_user_id
  // alone is safe — ig_accounts.ig_user_id carries a GLOBAL unique
  // constraint (ig_accounts_ig_user_id_key), so one IG account cannot be
  // connected under two institutions.
  const PAGE_SIZE = 1000;
  const PAGE_CAP = 10;
  type AlertRow = { idempotency_key?: string; metadata?: { ig_user_id?: unknown } };
  const rows: AlertRow[] = [];
  for (let page = 0; page < PAGE_CAP; page++) {
    const { data: pageData, error } = await supabase
      .from('notifications')
      .select('idempotency_key, metadata, created_at')
      .like('idempotency_key', `${IDEMPOTENCY_PREFIX}%`)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.warn(
        '[ig-silence-detect] last-alert lookup failed (failing open, no suppression):',
        error.message
      );
      return lastAlertDay;
    }
    rows.push(...((pageData ?? []) as AlertRow[]));
    if ((pageData?.length ?? 0) < PAGE_SIZE) break;
    if (page === PAGE_CAP - 1) {
      console.warn(
        `[ig-silence-detect] last-alert lookup hit the ${PAGE_CAP * PAGE_SIZE}-row page cap — suppression may be incomplete (fails open to alerting)`
      );
    }
  }

  for (const row of rows) {
    const key = row.idempotency_key;
    if (!key || key.length <= IDEMPOTENCY_PREFIX.length + 11) continue;
    const dayKey = key.slice(-10); // trailing YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) continue;
    const meta = row.metadata;
    const metaId = meta?.ig_user_id;
    const igUserId =
      (typeof metaId === 'string' && metaId.length > 0) ||
      typeof metaId === 'number'
        ? String(metaId)
        : key.slice(IDEMPOTENCY_PREFIX.length, -11); // strip prefix + '-YYYY-MM-DD'
    if (!igUserId) continue;
    const prev = lastAlertDay.get(igUserId);
    if (!prev || dayKey > prev) lastAlertDay.set(igUserId, dayKey);
  }
  return lastAlertDay;
}

/**
 * Derive each in-scope account's TRUE last-post timestamp from `ig_posts`.
 *
 * `ig_accounts.last_post_at` is a denormalised column the metrics poller
 * writes, and `metrics_source='business_discovery'` accounts never get it at
 * all: on production 2026-09-09 it was NULL for 39 of 44 dormant and 10 of 25
 * active accounts, while `ig_posts` knew the real answer for 26 of those. Two
 * other production files already prefer `ig_posts` for this — notably
 * `app/api/cron/instagram-monthly-audit/route.ts`, whose aggregateMetrics
 * reads `posted_at` directly — so this is the house source of truth, not a new
 * one.
 *
 * Returns Map<ig_accounts.id, newest posted_at ISO string>.
 *
 * FAILS CLOSED, unlike `fetchLastAlertDays` above, and deliberately so. That
 * helper may degrade toward alerting; this one cannot be allowed to. A missing
 * entry here makes an account `unknown`, and unknown never alerts — so a
 * partial read would mute exactly the accounts it dropped. Worse, the page
 * order is newest-first, so a truncated read sheds the OLDEST posts, i.e.
 * precisely the long-silent accounts this cron exists to find. Truncation is
 * therefore maximally adversarial here. Both a read error and page-cap
 * exhaustion throw; the route turns that into a loud 502. (1,021 ig_posts rows
 * today against a 10,000-row cap, so this is a latent guard rather than a live
 * constraint — but a silence detector whose own read path can go silent is
 * exactly the failure class this PR exists to remove.)
 */
async function fetchLastPostAt(
  supabase: SupabaseClient,
  accountIds: string[]
): Promise<Map<string, string>> {
  const lastPostAt = new Map<string, string>();
  if (accountIds.length === 0) return lastPostAt;

  const PAGE_SIZE = 1000;
  const PAGE_CAP = 10;
  type PostRow = { account_id?: string | null; posted_at?: string | null };

  for (let page = 0; page < PAGE_CAP; page++) {
    const { data: pageData, error } = await supabase
      .from('ig_posts')
      .select('account_id, posted_at')
      .in('account_id', accountIds)
      .order('posted_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    // Mirrors the `ig_accounts read failed` throw in runSilenceDetect: a read
    // this cron depends on must never degrade into "alert nobody".
    if (error) throw new Error(`ig_posts read failed: ${error.message}`);

    const rows = (pageData ?? []) as PostRow[];
    for (const row of rows) {
      const accountId = row.account_id;
      const postedAt = row.posted_at;
      if (!accountId || !postedAt) continue;
      const postedMs = Date.parse(postedAt);
      if (!Number.isFinite(postedMs)) continue;
      const prev = lastPostAt.get(accountId);
      if (!prev || postedMs > Date.parse(prev)) lastPostAt.set(accountId, postedAt);
    }
    // A short page is the only proof the history was read to the end.
    if (rows.length < PAGE_SIZE) return lastPostAt;
  }

  throw new Error(
    `ig_posts read hit the ${PAGE_CAP * PAGE_SIZE}-row page cap — refusing to run on a truncated post history (newest-first truncation drops the oldest posts, i.e. exactly the silent accounts this cron must find)`
  );
}

/**
 * Run silence detection across all active AND dormant accounts, judging each
 * one's silence against ig_posts rather than the denormalised
 * `ig_accounts.last_post_at` column. Per-account failures
 * are isolated — one bad fanout never aborts the loop.
 *
 * @param supabase a service-role Supabase client.
 */
export async function runSilenceDetect(
  supabase: SupabaseClient
): Promise<RunSilenceDetectResult> {
  const thresholdDays = await readPolicyInt(
    supabase,
    'ig.alert_dormant_after_days',
    DEFAULT_SILENCE_DAYS,
    1
  );
  // 0 is a valid value here: it disables suppression (legacy alert-daily).
  const realertDays = await readPolicyInt(
    supabase,
    'ig.silence_realert_days',
    DEFAULT_REALERT_DAYS,
    0
  );
  const thresholdMs = Date.now() - thresholdDays * 24 * 60 * 60 * 1000;

  // Scope = active OR dormant (see the file header for the 14-vs-30-day
  // trapdoor that `.eq('status','active')` created). Recency is deliberately
  // NOT decided here any more: the old `.or(last_post_at.is.null,
  // last_post_at.lt.<threshold>)` prefilter read a denormalised column that is
  // NULL for the majority of accounts, which is what inverted the audience.
  // Silence is now judged in JS against ig_posts, below.
  const { data: inScopeRaw, error: selectErr } = await supabase
    .from('ig_accounts')
    .select('id, ig_user_id, username, institution_id, last_post_at, connected_by')
    .in('status', ['active', 'dormant']);

  if (selectErr) {
    throw new Error(`ig_accounts read failed: ${selectErr.message}`);
  }
  const inScope: SilentRow[] = (inScopeRaw ?? []) as SilentRow[];
  const postMap = await fetchLastPostAt(
    supabase,
    inScope
      .map((r) => r.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  const adminIds = await resolveSuperAdminIds(supabase);
  // first super-admin is the canonical created_by for service-role cron
  // inserts (notifications.created_by is NOT NULL).
  const dayKey = new Date().toISOString().slice(0, 10);
  const lastAlertDays = await fetchLastAlertDays(supabase, realertDays);

  const results: SilenceAccountResult[] = [];
  let candidates = 0;
  let unknown = 0;
  let recent = 0;
  let alerted = 0;
  let suppressed = 0;
  // NOTE: with cadence suppression active, 'deduplicated' only counts
  // intra-run/concurrent idempotency conflicts — same-day re-runs for a
  // just-alerted account hit the suppressed branch before the insert.
  let deduplicated = 0;
  let failed = 0;

  for (const row of inScope) {
    const ig_user_id = row.ig_user_id;
    const username = row.username || '';
    // ig_posts is the source of truth; the denormalised column is only a
    // fallback for accounts that have no post rows at all.
    const last = postMap.get(row.id) ?? row.last_post_at ?? null;
    const lastMs = last === null ? NaN : Date.parse(last);

    // Guard 1 — unknown is not silent. 4 business-discovery accounts
    // (jkkn_bcom, jkkn_humanphysiology, jkkn_pharmacology,
    // jkkn_scienceandhumanities) have zero ig_posts rows AND a NULL column;
    // the old code told their recipients the account "has gone quiet for more
    // than 30 days" on no evidence at all. Report the gap, never alert on it.
    if (last === null || !Number.isFinite(lastMs)) {
      unknown++;
      results.push({
        ig_user_id,
        username,
        institution_id: row.institution_id,
        last_post_at: null,
        days_silent: null,
        status: 'unknown',
      });
      continue;
    }

    // Guard 2 — posted inside the threshold. Healthy accounts are counted but
    // get no result row: at 21 of 69 in scope they would be pure JSON noise,
    // whereas the `unknown` rows above are an actionable data gap.
    if (lastMs >= thresholdMs) {
      recent++;
      continue;
    }

    candidates++;
    const daysSilent = Math.floor((Date.now() - lastMs) / (24 * 60 * 60 * 1000));

    // Re-alert cadence: still-silent accounts alerted within the last
    // realert_days are skipped before any notification write. First-time
    // detections have no prior alert row and always pass through.
    // Review fix: a FRESH silence episode is never suppressed — if the
    // account posted AFTER its last alert (recovered, then went silent
    // again within the window), that's a new episode, not a repeat.
    // String-coerce the lookup key — map keys are always strings; a numeric
    // ig_user_id column type must not silently no-op the suppression.
    const lastAlertedOn = lastAlertDays.get(String(ig_user_id));
    // `last` is guaranteed non-null past guard 1.
    const lastPostDay = String(last).slice(0, 10);
    const freshEpisode = lastAlertedOn !== undefined && lastPostDay > lastAlertedOn;
    if (
      realertDays > 0 &&
      lastAlertedOn &&
      !freshEpisode &&
      daysBetweenDayKeys(lastAlertedOn, dayKey) < realertDays
    ) {
      suppressed++;
      results.push({
        ig_user_id,
        username,
        institution_id: row.institution_id,
        last_post_at: last,
        days_silent: daysSilent,
        status: 'suppressed',
        last_alerted_on: lastAlertedOn,
      });
      continue;
    }

    // Recipients: account's connected_by user (if any) + every super-admin
    // — never depend on a single per-account owner that may be null.
    const recipients = new Set<string>([
      ...(row.connected_by ? [row.connected_by] : []),
      ...adminIds,
    ]);
    const recipientIds = Array.from(recipients);

    if (recipientIds.length === 0) {
      results.push({
        ig_user_id,
        username,
        institution_id: row.institution_id,
        last_post_at: last,
        days_silent: daysSilent,
        status: 'no_recipients',
      });
      continue;
    }

    const idempotencyKey = `ig-silence-${ig_user_id}-${dayKey}`;
    // Self-identifying title: the inbox rolls these rows up into ONE stacked
    // entry (keyed on metadata.event = 'ig_silence_alert'), so each occurrence
    // must name its own account or the expanded rollup is 35 identical lines.
    const title = `Instagram @${username || ig_user_id} is silent`;
    // The former 'No post has been recorded yet' branch is gone: guard 1 now
    // routes those accounts to `unknown` instead of asserting silence.
    const lastClause = `Last post was ${daysSilent} day${daysSilent === 1 ? '' : 's'} ago`;
    const body =
      `@${username || ig_user_id} has gone quiet for more than ${thresholdDays} days. ` +
      `${lastClause}. Open the Instagram admin to review whether the account is still owned and posting.`;

    try {
      const outcome = await fanoutNotification(supabase, {
        title,
        body,
        userIds: recipientIds,
        createdBy: adminIds[0] || row.connected_by || undefined,
        category: 'Alert',
        // Operational cron task → work_item (matches the
        // notifications_kind_check constraint added by setup/01_tables.sql).
        kind: 'work_item',
        priority: 'normal',
        idempotencyKey,
        source: 'ig-silence-detect',
        metadata: {
          event: 'ig_silence_alert',
          ig_user_id,
          ig_username: username || null,
          institution_id: row.institution_id,
          last_post_at: last,
          days_silent: daysSilent,
          threshold_days: thresholdDays,
        },
      });

      if (outcome.skipped === 'idempotent') {
        deduplicated++;
        results.push({
          ig_user_id,
          username,
          institution_id: row.institution_id,
          last_post_at: last,
          days_silent: daysSilent,
          status: 'deduplicated',
          notification_id: outcome.notificationId,
        });
        continue;
      }

      if (outcome.skipped === 'no_recipients' || outcome.skipped === 'no_created_by') {
        results.push({
          ig_user_id,
          username,
          institution_id: row.institution_id,
          last_post_at: last,
          days_silent: daysSilent,
          status: 'no_recipients',
        });
        continue;
      }

      alerted++;
      results.push({
        ig_user_id,
        username,
        institution_id: row.institution_id,
        last_post_at: last,
        days_silent: daysSilent,
        status: 'alerted',
        notified: outcome.notified,
        notification_id: outcome.notificationId,
      });
    } catch (err) {
      failed++;
      results.push({
        ig_user_id,
        username,
        institution_id: row.institution_id,
        last_post_at: last,
        days_silent: daysSilent,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    threshold_days: thresholdDays,
    realert_days: realertDays,
    in_scope: inScope.length,
    candidates,
    unknown,
    recent,
    alerted,
    suppressed,
    deduplicated,
    failed,
    results,
  };
}
