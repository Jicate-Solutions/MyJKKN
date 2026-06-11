/**
 * provision-counselors.ts
 * -----------------------
 * Batch-provisions active admission counselors of one institution as Cal.com
 * users on jicate-booking-prod, so the public routing form (/book/[slug]) has
 * a bookable round-robin pool. Path W task — Engineering pilot first.
 *
 * Per counselor (idempotent, safe to rerun):
 *   1. Vault check  — fn_get_cal_api_key; provisioned users are fast-skipped
 *      to the schedule/event-type steps.
 *   2. Cal user     — upsert into jicate-booking-prod `users` (ON CONFLICT
 *      email no-op) + REPLACE the 'MyJKKN auto-provisioned' ApiKey row (heals
 *      partial states where the key row exists but the vault lost the
 *      plaintext). Mirrors jicate-booking-provision-service.ts exactly:
 *      uuid via gen_random_uuid() (NOT NULL, PR #1327), `created` omitted
 *      (has default), key = 'cal_' + 32 hex, hash = sha256(plaintext).
 *   3. Vault store  — fn_set_cal_api_key (encrypts + sets profiles.cal_user_id).
 *   4. Schedule     — if the user has none: Mon–Sat 09:30–17:00 Asia/Kolkata,
 *      isDefault (counselors refine later in /meetings/availability).
 *   5. Event type   — if slug 'admission-counseling' missing: 30-min
 *      "Admission Counseling" (cal-api-version 2024-06-14, PR #1328).
 *   6. Mapping row  — upsert jicate_booking_meeting_types with
 *      host_profile_id = counselor's profiles.id, internal_kind
 *      'admission_call' (what MeetingRoutingService.eligiblePool reads).
 *
 * SELF-CONTAINED on purpose: scripts run via `npx tsx` which does not resolve
 * the app's `@/` path aliases, so app services are not importable here
 * (same pattern as list-event-types.ts).
 *
 * USAGE (from MyJKKN project root)
 * --------------------------------
 *   NEXT_PUBLIC_SUPABASE_URL=https://kvizhngldtiuufknvehv.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   CAL_BOOKING_DB_URL=postgresql://... \
 *   CAL_API_KEY_MASTER_SECRET=... \
 *   CAL_BOOKING_API_URL=https://jicate-booking-api-production.up.railway.app \
 *     npx tsx scripts/jicate-booking/provision-counselors.ts \
 *       --institution 5de4fba1-4564-41ed-8c73-5d948b74b843 [--limit 3] [--dry-run]
 *
 * EXIT CODES: 0 = all ok · 1 = one or more counselors failed · 2 = env/args bad
 */

import crypto from 'crypto';
import { Client as PgClient } from 'pg';

// ── env + args ───────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var ${name}`);
    process.exit(2);
  }
  return v;
}

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
const SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const CAL_DB_URL = requireEnv('CAL_BOOKING_DB_URL');
const MASTER_SECRET = requireEnv('CAL_API_KEY_MASTER_SECRET');
const CAL_API_URL = requireEnv('CAL_BOOKING_API_URL').replace(/\/$/, '');

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const INSTITUTION_ID = argValue('--institution');
const LIMIT = Number(argValue('--limit') ?? '0') || 0;
const DRY_RUN = args.includes('--dry-run');

if (!INSTITUTION_ID) {
  console.error('Usage: --institution <uuid> [--limit N] [--dry-run]');
  process.exit(2);
}

const EVENT_TYPE_SLUG = 'admission-counseling';
const EVENT_TYPE_TITLE = 'Admission Counseling';
const EVENT_TYPE_MINUTES = 30;

// ── small REST helpers (MyJKKN Supabase, service-role) ──────────────────────

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase ${init.method ?? 'GET'} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ── Cal v2 API helpers (per-user key) ────────────────────────────────────────

async function calApi<T>(
  method: 'GET' | 'POST',
  path: string,
  apiKey: string,
  apiVersion: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${CAL_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'cal-api-version': apiVersion,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => null)) as
    | { status: string; data: T; error?: { message?: string } }
    | null;
  if (!res.ok || !json || json.status === 'error') {
    throw new Error(
      `Cal ${method} ${path} → ${res.status}: ${json?.error?.message ?? JSON.stringify(json)?.slice(0, 200)}`,
    );
  }
  return json.data;
}

// ── provisioning primitives (mirrors jicate-booking-provision-service.ts) ───

function slugifyEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function generateApiKey(): { plaintext: string; hashedKey: string } {
  const plaintext = 'cal_' + crypto.randomBytes(16).toString('hex');
  // Cal.com verifies sha256 of the key WITHOUT its "cal_" prefix — the v2
  // ApiKeyStrategy strips the prefix before hashing. Verified live 2026-06-11:
  // hash(full plaintext) → 401 CustomThrottlerGuard; hash(stripped) → 200.
  const hashedKey = hashApiKeyForCal(plaintext);
  return { plaintext, hashedKey };
}

/** sha256 of the key with the "cal_" prefix stripped — Cal.com's stored format. */
function hashApiKeyForCal(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext.replace(/^cal_/, '')).digest('hex');
}

interface Counselor {
  id: string;
  user_id: string;
  institution_id: string;
  name: string;
  email: string;
  current_leads: number;
}

async function vaultGet(userId: string): Promise<{ cal_user_id: number; cal_api_key: string } | null> {
  const rows = await rest<Array<{ cal_user_id: number; cal_api_key: string | null }>>(
    `/rest/v1/rpc/fn_get_cal_api_key`,
    { method: 'POST', body: JSON.stringify({ p_user_id: userId, p_master_secret: MASTER_SECRET }) },
  );
  const row = rows?.[0];
  if (!row || row.cal_api_key == null) return null;
  return { cal_user_id: row.cal_user_id, cal_api_key: row.cal_api_key };
}

async function vaultSet(userId: string, calUserId: number, apiKey: string): Promise<void> {
  await rest(`/rest/v1/rpc/fn_set_cal_api_key`, {
    method: 'POST',
    body: JSON.stringify({
      p_user_id: userId,
      p_cal_user_id: calUserId,
      p_api_key: apiKey,
      p_master_secret: MASTER_SECRET,
    }),
  });
}

/** Upsert Cal user + REPLACE the auto-provisioned ApiKey. Returns cal user id. */
async function provisionCalUser(pg: PgClient, c: Counselor, hashedKey: string): Promise<number> {
  const username = slugifyEmail(c.email);
  const res = await pg.query(
    `
    WITH new_user AS (
      INSERT INTO "users" (email, username, name, "timeZone", "weekStart", locale, theme,
                           "emailVerified", uuid)
      VALUES ($1, $2, $3, 'Asia/Kolkata', 'Monday', 'en', 'light', NOW(), gen_random_uuid())
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id
    ),
    cleared AS (
      DELETE FROM "ApiKey"
      WHERE "userId" = (SELECT id FROM new_user)
        AND note = 'MyJKKN auto-provisioned'
    ),
    new_key AS (
      INSERT INTO "ApiKey" (id, "userId", note, "hashedKey", "createdAt")
      SELECT gen_random_uuid()::text, id, 'MyJKKN auto-provisioned', $4, NOW()
      FROM new_user
    )
    SELECT id FROM new_user;
    `,
    [c.email, username, c.name, hashedKey],
  );
  return res.rows[0].id as number;
}

// ── per-counselor pipeline ───────────────────────────────────────────────────

async function processCounselor(pg: PgClient, c: Counselor): Promise<string> {
  // 1. existing vault record?
  let key = await vaultGet(c.user_id);
  let step = 'vault-hit';

  if (!key) {
    if (DRY_RUN) return 'would-provision';
    const fresh = generateApiKey();
    const calUserId = await provisionCalUser(pg, c, fresh.hashedKey);
    await vaultSet(c.user_id, calUserId, fresh.plaintext);
    key = { cal_user_id: calUserId, cal_api_key: fresh.plaintext };
    step = 'provisioned';
  } else if (DRY_RUN) {
    return 'already-provisioned (would ensure schedule/event-type)';
  } else {
    // HEAL: keys minted before the hash fix stored sha256(full plaintext) on
    // Cal's side, which Cal rejects (it verifies against the prefix-stripped
    // hash). The vault plaintext is fine — re-derive the correct hash and
    // repair the Cal ApiKey row, then re-verify.
    const me = await fetch(`${CAL_API_URL}/v2/me`, {
      headers: { Authorization: `Bearer ${key.cal_api_key}`, 'cal-api-version': '2024-08-13' },
    });
    if (me.status === 401) {
      await pg.query(
        `UPDATE "ApiKey" SET "hashedKey" = $1 WHERE "userId" = $2 AND note = 'MyJKKN auto-provisioned'`,
        [hashApiKeyForCal(key.cal_api_key), key.cal_user_id],
      );
      const retry = await fetch(`${CAL_API_URL}/v2/me`, {
        headers: { Authorization: `Bearer ${key.cal_api_key}`, 'cal-api-version': '2024-08-13' },
      });
      if (retry.status !== 200) {
        throw new Error(`key heal failed — /v2/me still ${retry.status} after hash repair`);
      }
      step = 'healed-hash';
    }
  }

  // 2. default schedule
  const schedules = await calApi<unknown[]>('GET', '/v2/schedules', key.cal_api_key, '2024-06-11');
  if (!schedules?.length) {
    await calApi('POST', '/v2/schedules', key.cal_api_key, '2024-06-11', {
      name: 'Working hours',
      timeZone: 'Asia/Kolkata',
      isDefault: true,
      availability: [
        {
          days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
          startTime: '09:30',
          endTime: '17:00',
        },
      ],
    });
    step += '+schedule';
  }

  // 3. admission-counseling event type
  const eventTypes = await calApi<Array<{ id: number; slug: string }>>(
    'GET',
    '/v2/event-types',
    key.cal_api_key,
    '2024-06-14',
  );
  let et = eventTypes?.find((e) => e.slug === EVENT_TYPE_SLUG);
  if (!et) {
    et = await calApi<{ id: number; slug: string }>('POST', '/v2/event-types', key.cal_api_key, '2024-06-14', {
      title: EVENT_TYPE_TITLE,
      slug: EVENT_TYPE_SLUG,
      lengthInMinutes: EVENT_TYPE_MINUTES,
      description: 'Free admission counseling call with JKKN.',
    });
    step += '+event-type';
  }

  // 4. MyJKKN mapping row (what the round-robin pool query reads)
  await rest(`/rest/v1/jicate_booking_meeting_types?on_conflict=cal_event_type_id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      cal_event_type_id: et.id,
      cal_event_type_slug: EVENT_TYPE_SLUG,
      internal_kind: 'admission_call',
      meeting_for: 'counselor',
      display_name: `${EVENT_TYPE_TITLE} — ${c.name}`,
      is_active: true,
      host_profile_id: c.user_id,
    }),
  });

  return `${step} (cal_user=${key.cal_user_id}, event_type=${et.id})`;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const qs = new URLSearchParams({
    select: 'id,user_id,institution_id,name,email,current_leads',
    institution_id: `eq.${INSTITUTION_ID}`,
    is_active: 'eq.true',
    order: 'current_leads.asc',
  });
  let counselors = await rest<Counselor[]>(`/rest/v1/admission_counselors?${qs}`);
  counselors = counselors.filter((c) => c.user_id && c.email);
  if (LIMIT > 0) counselors = counselors.slice(0, LIMIT);

  console.log(
    `Provisioning ${counselors.length} counselors for institution ${INSTITUTION_ID}${DRY_RUN ? ' (DRY RUN)' : ''}`,
  );

  const pg = new PgClient({ connectionString: CAL_DB_URL });
  await pg.connect();

  let failed = 0;
  try {
    for (const c of counselors) {
      try {
        const outcome = await processCounselor(pg, c);
        console.log(`  ✓ ${c.name} <${c.email}> — ${outcome}`);
      } catch (err) {
        failed++;
        console.error(`  ✗ ${c.name} <${c.email}> — ${err instanceof Error ? err.message : err}`);
      }
    }
  } finally {
    await pg.end();
  }

  console.log(`Done. ${counselors.length - failed}/${counselors.length} ok.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
