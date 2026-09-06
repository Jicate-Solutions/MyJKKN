/**
 * provision-counselors-native.ts — native counselor scale-out
 * -----------------------------------------------------------
 * Provisions admission counselors as bookable hosts on the NATIVE scheduling
 * engine (migration 20260611190000) — the post-Cal.com replacement for
 * scripts/jicate-booking/provision-counselors.ts (cal-era, OBSOLETE: it
 * minted Cal.com users/keys on retired infra).
 *
 * Per active counselor (admission_counselors.user_id IS the profiles.id):
 *   1. default "Working hours" schedule  → meeting_host_schedules
 *      (Asia/Kolkata, is_default) + Mon–Sat 09:30–17:00 windows
 *      → meeting_schedule_windows. Mirrors the proven Engineering shape
 *      (verified live against AKILA M, 2026-06-11).
 *   2. "Admission Counseling" meeting type → meeting_types
 *      (slug 'admission-counseling', 30 min, 120 min notice, 14 days ahead,
 *      schedule_id NULL = host default). This is the exact row
 *      MeetingRoutingService.eligiblePool() requires for /book routing.
 *
 * Idempotent — both natural keys are constraint-backed (uq_mhs_default_per_host,
 * uq_mt_host_slug); existing rows are matched and skipped. Counselors with a
 * deliberately DEACTIVATED meeting type (is_active=false) are reported and
 * skipped, never auto-reactivated. Safe to rerun.
 *
 * Institutions whose name matches /testing/i are excluded unless
 * --include-testing is passed.
 *
 * USAGE (from a checkout):
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx tsx scripts/meetings/provision-counselors-native.ts [--dry-run] \
 *       [--institution=<uuid>] [--include-testing]
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
const ONLY_INSTITUTION = process.argv
  .find((a) => a.startsWith('--institution='))
  ?.slice('--institution='.length);

// Proven Engineering shape (live-verified against AKILA M 2026-06-11):
const SCHEDULE_NAME = 'Working hours';
const TIMEZONE = 'Asia/Kolkata';
const WINDOWS = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday, // Mon–Sat
  start_minute: 9 * 60 + 30, // 09:30
  end_minute: 17 * 60, // 17:00
}));
const MEETING_TYPE = {
  title: 'Admission Counseling',
  slug: 'admission-counseling',
  duration_min: 30,
  min_notice_min: 120,
  // 5-minute gap each side — see provision-leadership-native.ts for why
  // buffer_BEFORE is the load-bearing one.
  buffer_before_min: 5,
  buffer_after_min: 5,
  max_days_ahead: 14,
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

interface Counselor {
  id: string;
  user_id: string | null;
  name: string;
  institution_id: string;
  institutions: { name: string } | null;
}

async function main() {
  // ── load the universe ─────────────────────────────────────────────────────
  const counselors = await rest<Counselor[]>(
    '/rest/v1/admission_counselors?select=id,user_id,name,institution_id,institutions(name)&is_active=eq.true&order=institution_id,name',
  );
  const profiles = await rest<Array<{ id: string; email: string | null }>>(
    '/rest/v1/profiles?select=id,email&limit=10000',
  );
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const defaultScheds = await rest<Array<{ id: string; host_profile_id: string }>>(
    '/rest/v1/meeting_host_schedules?select=id,host_profile_id&is_default=eq.true',
  );
  const defaultSchedByHost = new Map(defaultScheds.map((s) => [s.host_profile_id, s.id]));

  const existingTypes = await rest<Array<{ host_profile_id: string; is_active: boolean }>>(
    `/rest/v1/meeting_types?select=host_profile_id,is_active&slug=eq.${MEETING_TYPE.slug}`,
  );
  const typeByHost = new Map(existingTypes.map((t) => [t.host_profile_id, t]));

  // ── walk counselors ───────────────────────────────────────────────────────
  const summary = new Map<string, { done: number; created: number; skipped: string[] }>();
  const bucket = (inst: string) => {
    let b = summary.get(inst);
    if (!b) { b = { done: 0, created: 0, skipped: [] }; summary.set(inst, b); }
    return b;
  };

  for (const c of counselors) {
    const instName = c.institutions?.name ?? c.institution_id;
    const b = bucket(instName);

    if (!INCLUDE_TESTING && /testing/i.test(instName)) {
      b.skipped.push(`${c.name}: testing institution (use --include-testing)`);
      continue;
    }
    if (ONLY_INSTITUTION && c.institution_id !== ONLY_INSTITUTION) continue;
    if (!c.user_id) {
      b.skipped.push(`${c.name}: no user_id (profile not linked)`);
      continue;
    }
    const profile = profileById.get(c.user_id);
    if (!profile) {
      b.skipped.push(`${c.name}: profile ${c.user_id} not found`);
      continue;
    }
    if (!profile.email) {
      // Still provisionable — but the host email leg of booking notifications
      // will skip for them. Surface it.
      console.warn(`  ⚠ ${c.name}: profile has no email (host notifications will skip)`);
    }

    const existingType = typeByHost.get(c.user_id);
    if (existingType && !existingType.is_active) {
      b.skipped.push(`${c.name}: meeting type exists but is_active=false (deliberate? not touching)`);
      continue;
    }

    const hasSchedule = defaultSchedByHost.has(c.user_id);
    const hasType = !!existingType;
    if (hasSchedule && hasType) { b.done++; continue; }

    if (DRY) {
      console.log(
        `would provision ${c.name} (${instName}):` +
          `${hasSchedule ? '' : ' +schedule'}${hasType ? '' : ' +meeting-type'}`,
      );
      b.created++;
      continue;
    }

    // 1. default schedule + windows
    if (!hasSchedule) {
      const created = await rest<Array<{ id: string }>>('/rest/v1/meeting_host_schedules', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          host_profile_id: c.user_id,
          institution_id: c.institution_id,
          name: SCHEDULE_NAME,
          timezone: TIMEZONE,
          is_default: true,
        }),
      });
      const scheduleId = created[0].id;
      defaultSchedByHost.set(c.user_id, scheduleId);
      await rest('/rest/v1/meeting_schedule_windows', {
        method: 'POST',
        body: JSON.stringify(WINDOWS.map((w) => ({ ...w, schedule_id: scheduleId }))),
      });
    }

    // 2. meeting type
    if (!hasType) {
      await rest('/rest/v1/meeting_types', {
        method: 'POST',
        body: JSON.stringify({
          ...MEETING_TYPE,
          host_profile_id: c.user_id,
          institution_id: c.institution_id,
        }),
      });
      typeByHost.set(c.user_id, { host_profile_id: c.user_id, is_active: true });
    }

    b.created++;
    console.log(`✓ ${c.name} (${instName})`);
  }

  // ── report ────────────────────────────────────────────────────────────────
  console.log(`\n${DRY ? 'DRY RUN — nothing written' : 'DONE'}`);
  for (const [inst, b] of [...summary.entries()].sort()) {
    console.log(`  ${inst}: already=${b.done} ${DRY ? 'would-create' : 'created'}=${b.created} skipped=${b.skipped.length}`);
    for (const s of b.skipped) console.log(`      - ${s}`);
  }
}

main().catch((e) => {
  console.error('provisioning failed:', e);
  process.exit(1);
});
