/**
 * Behavioural proof for
 * supabase/migrations/20271010180000_events_review_followups_and_registration_allowlist.sql
 *
 * The two migrations it follows up (#4304 20271009163000 and #4311
 * 20271010090000) and then this one are applied VERBATIM to a throwaway
 * PostgreSQL, on the minimal slice of tables and helpers they use. Each test
 * performs the write a real client or RPC performs and reads back what
 * PostgreSQL allowed.
 *
 * REQUIRES a local PostgreSQL 16 (CI: the test-suite Postgres service). Loud
 * rather than skipped when no server is reachable. Override with
 * EVFOLLOW_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 * EVFOLLOW_TEST_MIGRATION points at another copy of the new SQL (used for the
 * mutation proof).
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIG = (f: string) => path.join(REPO, 'supabase/migrations', f);
const LOCK_4304 = MIG('20271009163000_tournament_division_results_lock.sql');
const WINNERS_4311 = MIG('20271010090000_cultural_event_winners.sql');
const FOLLOWUP =
  process.env.EVFOLLOW_TEST_MIGRATION ??
  MIG('20271010180000_events_review_followups_and_registration_allowlist.sql');

const PGHOST = process.env.EVFOLLOW_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.EVFOLLOW_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.EVFOLLOW_TEST_PGUSER ??
  process.env.DIVLOCK_TEST_PGUSER ??
  (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const PGPASSWORD = process.env.EVFOLLOW_TEST_PGPASSWORD;
const DBNAME = `ev_followups_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const EVENT = '00000000-0000-4000-8000-0000000000e1';
const EVENT_B = '00000000-0000-4000-8000-0000000000e2';
const DIV_A = '00000000-0000-4000-8000-0000000000a1';
const DIV_B = '00000000-0000-4000-8000-0000000000a2';
const ENTRY_1 = '00000000-0000-4000-8000-0000000000c1';
const ENTRY_2 = '00000000-0000-4000-8000-0000000000c2';
const MATCH = '00000000-0000-4000-8000-0000000000d1';
const REG = '00000000-0000-4000-8000-0000000000b1';

const U = {
  organiser: '00000000-0000-4000-8000-0000000000f1',
  committee: '00000000-0000-4000-8000-0000000000f2',
  registrant: '00000000-0000-4000-8000-0000000000f3',
  admin: '00000000-0000-4000-8000-0000000000f4',
  incharge: '00000000-0000-4000-8000-0000000000f5',
  stranger: '00000000-0000-4000-8000-0000000000f6',
};

/** The union of what the three migrations read, plus test-driven helpers. */
const SCHEMA = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.role', true), '') $$;

-- Callers are described by per-session settings.
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.super', true), '') = 'yes' $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.app_role', true), '') = 'admin' $$;
CREATE FUNCTION public.get_current_user_role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.app_role', true), '') $$;
CREATE FUNCTION public.user_has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.perm', true), '') = p $$;
CREATE FUNCTION public.role_has_institution_access(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT false $$;
CREATE FUNCTION public.fn_is_event_incharge(p_event_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.incharge_event', true), '') = p_event_id::text $$;
CREATE FUNCTION public.fn_is_event_committee_member(p_event_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.committee_event', true), '') = p_event_id::text $$;

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL DEFAULT 'cultural',
  institution_id uuid,
  created_by uuid);
CREATE FUNCTION public.fn_is_event_creator(p_event_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.created_by = auth.uid()) $$;

-- Tournament slice (#4304 + fn_record_result / fn_tournament_set_fixture_mode).
CREATE TABLE public.tournament_divisions (
  id uuid PRIMARY KEY, event_id uuid NOT NULL, sport text NOT NULL, gender text,
  format text NOT NULL DEFAULT 'knockout', level text, config jsonb);
CREATE TABLE public.tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid,
  division_id uuid NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  side_a_entry_id uuid, side_b_entry_id uuid, winner_entry_id uuid,
  score_a integer, score_b integer, sets jsonb, result_notes text,
  result_entered_by uuid, result_entered_at timestamptz,
  next_match_id uuid, next_slot text);
CREATE TABLE public.tournament_heat_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id uuid NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  position integer, mark_value numeric, result_status text NOT NULL DEFAULT 'ok');
CREATE FUNCTION public.fn_tournament_can_manage_division(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT true $$;
-- Stand-in for the live draw: wipes the division's matches and draws two.
CREATE FUNCTION public.fn_generate_fixtures(p_division_id uuid, p_regenerate boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.tournament_matches WHERE division_id = p_division_id;
  INSERT INTO public.tournament_matches (division_id, status) VALUES (p_division_id, 'pending'), (p_division_id, 'pending');
  RETURN 2;
END $$;
ALTER TABLE public.tournament_divisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY divisions_visible ON public.tournament_divisions FOR SELECT TO authenticated
  USING (coalesce(current_setting('test.visible_event', true), '') IN ('', event_id::text));
CREATE POLICY divisions_update ON public.tournament_divisions FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
GRANT SELECT, UPDATE ON public.tournament_divisions TO authenticated;

-- Registrations slice (#4311): every live column, as in cultural-event-winners.pg.test.ts.
CREATE TABLE public.event_registration_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE);
CREATE TABLE public.events_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category_id uuid, profile_id uuid, learner_id uuid, external_participant_id uuid,
  participant_type text, participant_name text NOT NULL DEFAULT 'Person',
  participant_phone text, participant_email text, participant_age integer, participant_gender text,
  institution_id uuid, institution_name text, department text, bib_number text, registration_number text,
  status text NOT NULL DEFAULT 'registered'
    CHECK (status IN ('pending', 'registered', 'confirmed', 'checked_in', 'cancelled', 'disqualified', 'no_show', 'waitlisted')),
  checked_in boolean DEFAULT false, checked_in_at timestamptz, checked_in_by uuid,
  payment_status text, payment_amount numeric, payment_method text, payment_reference text,
  discount_code text, discount_amount numeric, custom_data jsonb, source text, referral_source text,
  registered_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  stall_id uuid, tshirt_collected boolean DEFAULT false, tshirt_collected_at timestamptz, tshirt_collected_by uuid,
  certificate_issued boolean DEFAULT false, certificate_issued_at timestamptz, certificate_issued_by uuid,
  qr_code_url text, qr_generated_at timestamptz, custom_fields jsonb,
  form_id uuid REFERENCES public.event_registration_forms(id) ON DELETE SET NULL,
  myjkkn_profile jsonb);

-- A stand-in for fn_soi_confirm_acceptance: SECURITY DEFINER, writes status
-- and custom_data for a caller who is not an event manager.
CREATE FUNCTION public.fn_test_definer_confirm(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.events_registrations SET status = 'confirmed', custom_data = '{"soi":{"review":"ok"}}' WHERE id = p_id $$;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT, UPDATE ON public.events_registrations TO authenticated, service_role;
GRANT SELECT ON public.events TO authenticated;
GRANT SELECT, DELETE ON public.event_registration_forms TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_test_definer_confirm(uuid) TO authenticated;
`;

const connect = (database: string) =>
  new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database });

let server: Client;
let db: Client;
let db2: Client;

async function code(client: Client, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await client.query(sql, params);
    return null;
  } catch (e: any) {
    return `${e.code ?? 'unknown'} ${e.message}`;
  }
}

/** Act as a signed-in PostgREST client on `client`. */
async function actAs(client: Client, uid: string | null, s: Record<string, string> = {}) {
  await client.query('RESET ROLE');
  const keys = ['test.super', 'test.app_role', 'test.perm', 'test.incharge_event', 'test.committee_event', 'test.visible_event'];
  for (const k of keys) await client.query('SELECT set_config($1, $2, false)', [k, s[k] ?? '']);
  await client.query(`SELECT set_config('test.uid', $1, false), set_config('test.role', 'authenticated', false)`, [uid ?? '']);
  await client.query('SET ROLE authenticated');
}
async function asOwner(client: Client) {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('test.uid', '', false), set_config('test.role', '', false)`);
}

beforeAll(async () => {
  server = connect('postgres');
  try {
    await server.connect();
  } catch (e) {
    throw new Error(`Local PostgreSQL 16 is required at ${PGHOST}:${PGPORT} (${String(e).slice(0, 200)})`);
  }
  await server.query(`CREATE DATABASE ${DBNAME}`);
  db = connect(DBNAME);
  await db.connect();
  db2 = connect(DBNAME);
  await db2.connect();
  await db.query(SCHEMA);
  await db.query(readFileSync(LOCK_4304, 'utf8'));
  await db.query(readFileSync(WINNERS_4311, 'utf8'));
  await db.query(readFileSync(FOLLOWUP, 'utf8')); // its DO $assert$ block runs here
}, 120_000);

afterAll(async () => {
  await db?.end();
  await db2?.end();
  if (server) {
    try {
      await server.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
    } catch {
      /* disposable */
    }
    await server.end();
  }
});

beforeEach(async () => {
  for (const c of [db, db2]) {
    await c.query('ROLLBACK').catch(() => undefined);
    await asOwner(c);
  }
  await db.query(`
    TRUNCATE public.tournament_division_result_marks, public.tournament_division_lock_overrides,
             public.tournament_heat_entries, public.tournament_matches, public.tournament_divisions,
             public.event_winner_rank_changes, public.events_registrations,
             public.event_registration_forms, public.events CASCADE;
    INSERT INTO public.events (id, created_by) VALUES ('${EVENT}', '${U.organiser}'), ('${EVENT_B}', '${U.organiser}');
    INSERT INTO public.tournament_divisions (id, event_id, sport, gender, format) VALUES
      ('${DIV_A}', '${EVENT}', 'Chess', 'female', 'knockout'),
      ('${DIV_B}', '${EVENT}', 'Carrom', 'female', 'knockout');
    INSERT INTO public.tournament_matches (id, event_id, division_id, status, side_a_entry_id, side_b_entry_id)
      VALUES ('${MATCH}', '${EVENT}', '${DIV_A}', 'pending', '${ENTRY_1}', '${ENTRY_2}');
    INSERT INTO public.events_registrations (id, event_id, profile_id, payment_status)
      VALUES ('${REG}', '${EVENT}', '${U.registrant}', 'pending');
  `);
});

const sportOf = async (div: string) =>
  (await db.query('SELECT sport FROM public.tournament_divisions WHERE id = $1', [div])).rows[0].sport;

// ── #4304 r4 LOW 1 ──────────────────────────────────────────────────────────
describe('#4304 LOW 1: a recorded match moved to another division', () => {
  it('locks the division it moved to, even after the result is rolled back', async () => {
    await db.query(`UPDATE public.tournament_matches SET status = 'completed' WHERE id = '${MATCH}'`);
    await db.query(`UPDATE public.tournament_matches SET division_id = '${DIV_B}' WHERE id = '${MATCH}'`);
    await db.query(`UPDATE public.tournament_matches SET status = 'pending' WHERE id = '${MATCH}'`);
    await actAs(db, U.organiser);
    const err = await code(db, `UPDATE public.tournament_divisions SET sport = 'Athletics - 400 m' WHERE id = '${DIV_B}'`);
    expect(err).toMatch(/already has recorded results/);
    await asOwner(db);
    expect(await sportOf(DIV_B)).toBe('Carrom');
  });
});

// ── #4304 r4 LOW 2 ──────────────────────────────────────────────────────────
describe('#4304 LOW 2: a session temp table cannot shadow the marks', () => {
  it('the edit lock still sees the real mark', async () => {
    await db.query(`UPDATE public.tournament_matches SET status = 'completed' WHERE id = '${MATCH}'`);
    await db.query(`UPDATE public.tournament_matches SET status = 'pending' WHERE id = '${MATCH}'`);
    await db.query(`CREATE TEMP TABLE tournament_division_result_marks (division_id uuid PRIMARY KEY, first_recorded_at timestamptz)`);
    try {
      await db.query(`GRANT ALL ON pg_temp.tournament_division_result_marks TO authenticated`);
      await actAs(db, U.organiser);
      const err = await code(db, `UPDATE public.tournament_divisions SET sport = 'Carrom' WHERE id = '${DIV_A}'`);
      expect(err).toMatch(/already has recorded results/);
    } finally {
      await asOwner(db);
      await db.query('DROP TABLE pg_temp.tournament_division_result_marks');
    }
  });

  it('the result trigger writes the mark into public, not into a temp table', async () => {
    await db.query(`CREATE TEMP TABLE tournament_division_result_marks (division_id uuid PRIMARY KEY, first_recorded_at timestamptz DEFAULT now())`);
    try {
      await db.query(`UPDATE public.tournament_matches SET status = 'completed' WHERE id = '${MATCH}'`);
      const real = await db.query(`SELECT 1 FROM public.tournament_division_result_marks WHERE division_id = '${DIV_A}'`);
      expect(real.rowCount).toBe(1);
    } finally {
      await db.query('DROP TABLE pg_temp.tournament_division_result_marks');
    }
  });
});

// ── #4304 r4 LOW 3 ──────────────────────────────────────────────────────────
describe('#4304 LOW 3: marks are readable alongside their division', () => {
  it('a signed-in reader sees the mark of a division they can see, and no other', async () => {
    await db.query(`UPDATE public.tournament_matches SET status = 'completed' WHERE id = '${MATCH}'`);
    await actAs(db, U.organiser, { 'test.visible_event': EVENT });
    const seen = await db.query(`SELECT division_id FROM public.tournament_division_result_marks`);
    expect(seen.rows.map((r) => r.division_id)).toEqual([DIV_A]);
    await actAs(db, U.organiser, { 'test.visible_event': EVENT_B });
    const hidden = await db.query(`SELECT division_id FROM public.tournament_division_result_marks`);
    expect(hidden.rowCount).toBe(0);
  });

  it('clients still cannot write marks', async () => {
    await actAs(db, U.organiser, { 'test.visible_event': EVENT, 'test.super': 'yes' });
    expect(await code(db, `DELETE FROM public.tournament_division_result_marks`)).toMatch(/^42501/);
  });
});

// ── fixture mode vs the first result ────────────────────────────────────────
describe('fixture mode vs a result being recorded at the same moment', () => {
  const RECORD = `SELECT public.fn_record_result('${MATCH}', 'completed', '${ENTRY_1}', 2, 1)`;
  const SWITCH = `SELECT public.fn_tournament_set_fixture_mode('${DIV_A}', 'auto')`;

  it('a switch that arrives while a result is open waits, then refuses (the result survives)', async () => {
    await actAs(db, U.organiser, { 'test.super': 'yes' });
    await actAs(db2, U.organiser, { 'test.super': 'yes' });
    await db.query('BEGIN');
    await db.query(RECORD);
    const pending = code(db2, SWITCH);
    await new Promise((r) => setTimeout(r, 400));
    await db.query('COMMIT');
    expect(await pending).toMatch(/results are already recorded/);
    await asOwner(db);
    const m = await db.query(`SELECT status FROM public.tournament_matches WHERE id = '${MATCH}'`);
    expect(m.rows[0]?.status).toBe('completed');
  });

  it('a result that arrives while a switch is open waits, then reports the match is gone', async () => {
    await actAs(db, U.organiser, { 'test.super': 'yes' });
    await actAs(db2, U.organiser, { 'test.super': 'yes' });
    await db2.query('BEGIN');
    await db2.query(SWITCH);
    const pending = code(db, RECORD);
    await new Promise((r) => setTimeout(r, 400));
    await db2.query('COMMIT');
    expect(await pending).toMatch(/match not found/);
  });

  it('with no result, the switch still works (control)', async () => {
    await actAs(db, U.organiser, { 'test.super': 'yes' });
    expect(await code(db, SWITCH)).toBeNull();
  });
});

// ── #4311 r10 LOW 1 ─────────────────────────────────────────────────────────
describe('#4311 r10 LOW 1: a stale winners dialog', () => {
  const save = (changes: unknown) =>
    code(db, `SELECT public.fn_set_event_registration_ranks($1, $2::jsonb)`, [EVENT, JSON.stringify(changes)]);

  it('refuses a clear when the row no longer holds the place the screen showed', async () => {
    await db.query(`UPDATE public.events_registrations SET final_rank = 3 WHERE id = '${REG}'`);
    await actAs(db, U.organiser);
    // The dialog loaded the row as runner-up (2); someone has since made it 3rd.
    expect(await save([{ registration_id: REG, final_rank: null, expected_rank: 2 }])).toMatch(/^40001/);
    await asOwner(db);
    const r = await db.query(`SELECT final_rank FROM public.events_registrations WHERE id = '${REG}'`);
    expect(r.rows[0].final_rank).toBe(3);
  });

  it('applies the change when the expected place still matches, or none is sent', async () => {
    await db.query(`UPDATE public.events_registrations SET final_rank = 3 WHERE id = '${REG}'`);
    await actAs(db, U.organiser);
    expect(await save([{ registration_id: REG, final_rank: 1, expected_rank: 3 }])).toBeNull();
    expect(await save([{ registration_id: REG, final_rank: null }])).toBeNull();
    expect(await save([{ registration_id: REG, final_rank: 2, expected_rank: 'x' }])).toMatch(/^22023/);
  });
});

// ── events_registrations column allowlist ───────────────────────────────────
describe('events_registrations column allowlist', () => {
  const upd = (set: string) => code(db, `UPDATE public.events_registrations SET ${set} WHERE id = '${REG}'`);
  const row = async () => {
    await asOwner(db);
    return (await db.query(`SELECT * FROM public.events_registrations WHERE id = '${REG}'`)).rows[0];
  };
  const committee = () => actAs(db, U.committee, { 'test.committee_event': EVENT });

  it('a committee member may check in, hand out kit and certificates, assign a stall, and undo a check-in', async () => {
    await committee();
    expect(await upd(`status = 'checked_in', checked_in = true, checked_in_at = now(), checked_in_by = '${U.committee}'`)).toBeNull();
    expect(await upd(`tshirt_collected = true, tshirt_collected_at = now(), tshirt_collected_by = '${U.committee}'`)).toBeNull();
    expect(await upd(`certificate_issued = true, certificate_issued_at = now(), certificate_issued_by = '${U.committee}'`)).toBeNull();
    expect(await upd(`stall_id = gen_random_uuid()`)).toBeNull();
    expect(await upd(`status = 'registered', checked_in = false, checked_in_at = NULL, checked_in_by = NULL`)).toBeNull();
  });

  it('a committee member cannot mark payment, re-point the row, or cancel it', async () => {
    await committee();
    expect(await upd(`payment_status = 'paid'`)).toMatch(/^42501/);
    expect(await upd(`profile_id = '${U.committee}'`)).toMatch(/^42501/);
    expect(await upd(`custom_data = '{"x":1}'`)).toMatch(/^42501/);
    expect(await upd(`event_id = '${EVENT_B}'`)).toMatch(/^42501/);
    expect(await upd(`status = 'cancelled'`)).toMatch(/^42501/);
    const r = await row();
    expect(r.payment_status).toBe('pending');
    expect(r.profile_id).toBe(U.registrant);
    expect(r.status).toBe('registered');
  });

  it('the registrant on their own row can change nothing but updated_at', async () => {
    await actAs(db, U.registrant);
    expect(await upd(`payment_status = 'paid'`)).toMatch(/^42501/);
    expect(await upd(`checked_in = true, status = 'checked_in'`)).toMatch(/^42501/);
    expect(await upd(`certificate_issued = true`)).toMatch(/^42501/);
    expect(await upd(`updated_at = now()`)).toBeNull();
  });

  it('managers may change anything: an admin role, a super admin, the creator, the in-charge', async () => {
    await actAs(db, U.admin, { 'test.app_role': 'event_coordinator' });
    expect(await upd(`payment_status = 'paid'`)).toBeNull();
    await actAs(db, U.admin, { 'test.super': 'yes' });
    expect(await upd(`status = 'cancelled'`)).toBeNull();
    await actAs(db, U.organiser);
    expect(await upd(`status = 'registered', profile_id = '${U.stranger}'`)).toBeNull();
    await actAs(db, U.incharge, { 'test.incharge_event': EVENT });
    expect(await upd(`payment_status = 'waived'`)).toBeNull();
    expect((await row()).payment_status).toBe('waived');
  });

  it('an in-charge cannot move a row into an event they do not run', async () => {
    await db.query(`UPDATE public.events SET created_by = NULL WHERE id = '${EVENT_B}'`);
    await actAs(db, U.incharge, { 'test.incharge_event': EVENT });
    expect(await upd(`event_id = '${EVENT_B}'`)).toMatch(/^42501/);
  });

  it('SECURITY DEFINER functions, the service role and the form-delete cascade are not judged', async () => {
    await actAs(db, U.stranger);
    expect(await code(db, `SELECT public.fn_test_definer_confirm('${REG}')`)).toBeNull();
    expect((await row()).status).toBe('confirmed');

    await db.query(`SELECT set_config('test.role', 'service_role', false)`);
    await db.query('SET ROLE service_role');
    expect(await upd(`payment_status = 'paid'`)).toBeNull();

    await asOwner(db);
    const form = (await db.query(`INSERT INTO public.event_registration_forms (event_id) VALUES ('${EVENT}') RETURNING id`)).rows[0].id;
    await db.query(`UPDATE public.events_registrations SET form_id = $1 WHERE id = '${REG}'`, [form]);
    await committee();
    expect(await code(db, `DELETE FROM public.event_registration_forms WHERE id = $1`, [form])).toBeNull();
    expect((await row()).form_id).toBeNull();
  });
});
