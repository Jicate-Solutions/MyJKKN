/**
 * provision-leadership-native.ts — smooth-setup pre-seed for leadership hosts
 * ---------------------------------------------------------------------------
 * W2 of the meetings-adoption program. The Universal Booking module is built
 * but adoption is ~1 page; principals + HODs are the Day-30 leading indicator
 * (strategy memo specs/meetings-leverage-strategy-2026-06-19.md §3.8).
 *
 * This removes the boring half of a leader's setup so the only thing left is
 * the bit only THEY can do — claim a handle + connect Google + publish.
 *
 * Per active leader (profiles.role in ('principal','hod')):
 *   1. default "Working hours" schedule  → meeting_host_schedules
 *      (Asia/Kolkata, is_default) + Mon–Fri 10:00–16:00 windows
 *      → meeting_schedule_windows. Leadership default (memo §3.5), lighter
 *      than the counselor Mon–Sat 09:30–17:00.
 *   2. a default "30-Minute Meeting" type → meeting_types (slug 'meeting-30',
 *      30 min, 120 min notice, 30 days ahead, schedule_id NULL = host default).
 *      The app never auto-creates a meeting type, so without this a published
 *      page would have nothing bookable.
 *
 * It deliberately does NOT create a meeting_host_pages row: the handle locks at
 * claim time (D5, availability/actions.ts savePublicPage) and is admin-only to
 * change, so a machine-picked handle would trap the leader. Handle + Google +
 * publish stay the leader's own one-time actions.
 *
 * Idempotent — natural keys are constraint-backed (uq_mhs_default_per_host,
 * uq_mt_host_slug); existing rows are matched and skipped. A deliberately
 * DEACTIVATED type (is_active=false) is reported and never auto-reactivated.
 * Safe to rerun. Test/junk accounts and the testing institution are excluded.
 *
 * USAGE (from a jicate/main checkout):
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx tsx scripts/meetings/provision-leadership-native.ts [--dry-run] \
 *       [--role=principal|hod] [--include-testing]
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`Missing env ${name}`); process.exit(2); }
  return v;
}
const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
const SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const DRY = process.argv.includes('--dry-run');
const INCLUDE_TESTING = process.argv.includes('--include-testing');
const ONLY_ROLE = process.argv
  .find((a) => a.startsWith('--role='))
  ?.slice('--role='.length);

const SCHEDULE_NAME = 'Working hours';
const TIMEZONE = 'Asia/Kolkata';
// Leadership default: Mon–Fri 10:00–16:00 (memo §3.5).
const WINDOWS = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  start_minute: 10 * 60, // 10:00
  end_minute: 16 * 60, // 16:00
}));
const MEETING_TYPE = {
  title: '30-Minute Meeting',
  slug: 'meeting-30',
  duration_min: 30,
  min_notice_min: 120,
  // 5-minute gap each side. buffer_BEFORE is the one that actually stops a
  // visitor booking straight onto the end of an existing commitment (the slot
  // engine pads the candidate, native-slot-engine.ts:271); buffer_after alone
  // would change nothing. Seeding 0 here is what made the first four public
  // pages chain-bookable.
  buffer_before_min: 5,
  buffer_after_min: 5,
  max_days_ahead: 30,
  hidden: false,
  is_active: true,
  schedule_id: null as string | null, // NULL = host default schedule
};

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
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${body.slice(0, 250)}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

interface Leader {
  id: string;
  full_name: string | null;
  role: string | null;
  institution_id: string | null;
  institutions: { name: string } | null;
}

/** Test/seed/junk accounts that must never be provisioned as real hosts. */
function isJunk(name: string | null, instName: string | null): boolean {
  const n = (name ?? '').trim().toLowerCase();
  if (!n) return true; // unnamed — can't form a sensible page later
  if (/\btest\b/.test(n)) return true; // "test principal", "Test Principal", "test hod"
  if (n === 'hod' || n === 'hod jkkn' || n === 'principal') return true; // role-as-name junk
  if (!INCLUDE_TESTING && /testing/i.test(instName ?? '')) return true;
  return false;
}

async function main() {
  const roleFilter = ONLY_ROLE ? `role=eq.${ONLY_ROLE}` : 'role=in.(principal,hod)';
  const leaders = await rest<Leader[]>(
    `/rest/v1/profiles?${roleFilter}&select=id,full_name,role,institution_id,institutions!institution_id(name)&order=institution_id,full_name`,
  );

  // Existing default schedules + existing 'meeting-30' types — for idempotency.
  const defaultScheds = await rest<Array<{ id: string; host_profile_id: string }>>(
    '/rest/v1/meeting_host_schedules?select=id,host_profile_id&is_default=eq.true',
  );
  const defaultSchedByHost = new Map(defaultScheds.map((s) => [s.host_profile_id, s.id]));

  const existingTypes = await rest<Array<{ host_profile_id: string; is_active: boolean }>>(
    `/rest/v1/meeting_types?select=host_profile_id,is_active&slug=eq.${MEETING_TYPE.slug}`,
  );
  const typeByHost = new Map(existingTypes.map((t) => [t.host_profile_id, t]));

  const summary = new Map<string, { done: number; created: number; skipped: string[] }>();
  const bucket = (inst: string) => {
    let b = summary.get(inst);
    if (!b) { b = { done: 0, created: 0, skipped: [] }; summary.set(inst, b); }
    return b;
  };

  let total = 0, eligible = 0;
  for (const l of leaders) {
    total++;
    const instName = l.institutions?.name ?? '(no institution)';
    const b = bucket(instName);

    if (isJunk(l.full_name, l.institutions?.name ?? null)) {
      b.skipped.push(`${l.full_name ?? '(unnamed)'} [${l.role}]: test/junk — excluded`);
      continue;
    }
    if (!l.institution_id) {
      b.skipped.push(`${l.full_name} [${l.role}]: no institution_id — skipped`);
      continue;
    }
    eligible++;

    const hasSched = defaultSchedByHost.has(l.id);
    const existingType = typeByHost.get(l.id);
    if (existingType && !existingType.is_active) {
      b.skipped.push(`${l.full_name}: meeting type exists but is_active=false (deliberate? not touching)`);
      continue;
    }
    if (hasSched && existingType) { b.done++; continue; }

    if (DRY) {
      b.created++;
      console.log(`  would provision: ${l.full_name} [${l.role}] @ ${instName}`
        + ` (schedule:${hasSched ? 'exists' : 'create'} type:${existingType ? 'exists' : 'create'})`);
      continue;
    }

    // 1. default schedule + windows
    if (!hasSched) {
      const created = await rest<Array<{ id: string }>>('/rest/v1/meeting_host_schedules', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          host_profile_id: l.id,
          institution_id: l.institution_id,
          name: SCHEDULE_NAME,
          timezone: TIMEZONE,
          is_default: true,
        }),
      });
      const scheduleId = created[0].id;
      await rest('/rest/v1/meeting_schedule_windows', {
        method: 'POST',
        body: JSON.stringify(WINDOWS.map((w) => ({ ...w, schedule_id: scheduleId }))),
      });
    }
    // 2. default meeting type
    if (!existingType) {
      await rest('/rest/v1/meeting_types', {
        method: 'POST',
        body: JSON.stringify({ ...MEETING_TYPE, host_profile_id: l.id, institution_id: l.institution_id }),
      });
    }
    b.created++;
    console.log(`✓ ${l.full_name} [${l.role}] @ ${instName}`);
  }

  console.log(`\n${DRY ? 'DRY RUN — nothing written' : 'DONE'} · ${total} leaders scanned, ${eligible} eligible`);
  for (const [inst, b] of [...summary.entries()].sort()) {
    console.log(`  ${inst}: already=${b.done} ${DRY ? 'would-create' : 'created'}=${b.created} skipped=${b.skipped.length}`);
    for (const s of b.skipped) console.log(`      - ${s}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
