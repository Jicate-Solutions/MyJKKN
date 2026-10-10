/**
 * Cultural event winners — behavioural proof for
 * supabase/migrations/20271010090000_cultural_event_winners.sql (BUG-006273).
 *
 * The migration file is applied VERBATIM with psql to a throwaway database.
 * The attack it exists to refuse: live RLS still carries
 * events_reg_public_event_update (any signed-in person may update registrations
 * of a public event), so a plain client UPDATE could crown itself the winner.
 * The guard trigger must refuse that with 42501, whatever policy let the row in.
 *
 * REQUIRES a local PostgreSQL 16 (not run by CI; loud rather than skipped):
 *   ./node_modules/.bin/vitest run __tests__/events/cultural-event-winners.pg.test.ts
 * Override the server with WAITLIST_TEST_PGHOST / _PGPORT / _PGUSER.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20271010090000_cultural_event_winners.sql');

const PGHOST = process.env.WAITLIST_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.WAITLIST_TEST_PGPORT ?? '5432';
const PGUSER = process.env.WAITLIST_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const DBNAME = `myjkkn_winners_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

const FIXTURE = `
DO $$ BEGIN
  BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.acting_uid', true), '')::uuid;
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.acting_role', true), '');
$$;

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL DEFAULT 'cultural',
  institution_id uuid,
  created_by uuid
);
CREATE TABLE public.event_registration_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE
);
CREATE TABLE public.events_registrations (
  -- Every live column (desk read, 10 Oct), so the guard's to_jsonb allowlist
  -- compares the real row shape. final_rank is added by the migration.
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The live foreign keys: cascade on event delete, SET NULL on form delete.
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category_id uuid,
  profile_id uuid,
  learner_id uuid,
  external_participant_id uuid,
  participant_type text,
  participant_name text NOT NULL DEFAULT 'Person',
  participant_phone text,
  participant_email text,
  participant_age integer,
  participant_gender text,
  institution_id uuid,
  institution_name text,
  department text,
  bib_number text,
  registration_number text,
  -- events_registrations_status_check, as documented in
  -- 20260808146000_soi_review_accept_queue.sql ("STATUS VOCABULARY").
  status text NOT NULL DEFAULT 'registered'
    CONSTRAINT events_registrations_status_check
    CHECK (status IN ('pending', 'registered', 'confirmed', 'checked_in', 'cancelled', 'disqualified', 'no_show', 'waitlisted')),
  checked_in boolean DEFAULT false,
  checked_in_at timestamptz,
  checked_in_by uuid,
  payment_status text,
  payment_amount numeric,
  payment_method text,
  payment_reference text,
  discount_code text,
  discount_amount numeric,
  custom_data jsonb,
  source text,
  referral_source text,
  registered_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  stall_id uuid,
  tshirt_collected boolean DEFAULT false,
  tshirt_collected_at timestamptz,
  tshirt_collected_by uuid,
  certificate_issued boolean DEFAULT false,
  certificate_issued_at timestamptz,
  certificate_issued_by uuid,
  qr_code_url text,
  qr_generated_at timestamptz,
  custom_fields jsonb,
  form_id uuid REFERENCES public.event_registration_forms(id) ON DELETE SET NULL,
  myjkkn_profile jsonb
);

CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.super_admin', true), '') = 'yes';
$$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.admin', true), '') = 'yes';
$$;
CREATE FUNCTION public.role_has_institution_access(p_institution_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.admin_institution', true), '') = p_institution_id::text;
$$;
CREATE FUNCTION public.fn_is_event_incharge(p_event_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.incharge_event', true), '') = p_event_id::text;
$$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events_registrations TO authenticated;
GRANT SELECT, DELETE ON public.events TO authenticated;
GRANT SELECT, DELETE ON public.event_registration_forms TO authenticated;
`;

function psql(args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

let client: Client;
/** A second, owner-only connection for fixtures created mid-test. */
let admin: Client;
async function newForm(eventId: string): Promise<string> {
  return (await admin.query(`INSERT INTO public.event_registration_forms (event_id) VALUES ($1) RETURNING id`, [eventId]))
    .rows[0].id;
}
let tmp: string;
const ids = { creator: randomUUID(), outsider: randomUUID(), event: '', tournament: '', regA: '', regB: '', regC: '' };

async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await client.query(sql, params)).rows as T[];
}
async function sqlstate(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await client.query(sql, params);
    return null;
  } catch (e: any) {
    return e.code ?? 'unknown';
  }
}
/** Act as a signed-in PostgREST client (role authenticated) with the given uid. */
async function actAs(uid: string | null, extra: Record<string, string> = {}) {
  await client.query(`RESET ROLE`);
  for (const k of ['test.super_admin', 'test.admin', 'test.admin_institution', 'test.incharge_event']) {
    await client.query(`SELECT set_config($1, $2, false)`, [k, extra[k] ?? '']);
  }
  await client.query(`SELECT set_config('test.acting_uid', $1, false)`, [uid ?? '']);
  await client.query(`SELECT set_config('test.acting_role', 'authenticated', false)`);
  await client.query(`SET ROLE authenticated`);
}
async function asOwner() {
  await client.query(`RESET ROLE`);
  await client.query(`SELECT set_config('test.acting_uid', '', false)`);
  await client.query(`SELECT set_config('test.acting_role', '', false)`);
}
async function ranks() {
  await asOwner();
  const rows = await q(`SELECT id, final_rank FROM public.events_registrations WHERE event_id = $1`, [ids.event]);
  return Object.fromEntries(rows.map((r) => [r.id, r.final_rank]));
}
async function reset() {
  await asOwner();
  await q(`UPDATE public.events_registrations SET final_rank = NULL`);
}

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e: any) {
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}.\n` +
        `  brew services start postgresql@16\n\n` +
        String(e?.stderr || e?.message || e)
    );
  }
  tmp = mkdtempSync(path.join(tmpdir(), 'winners-'));
  const fixturePath = path.join(tmp, 'fixture.sql');
  writeFileSync(fixturePath, FIXTURE);
  psql(['-d', DBNAME, '-f', fixturePath]);
  psql(['-d', DBNAME, '-f', MIGRATION]); // its own DO $assert$ block runs here
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
  admin = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await admin.connect();

  ids.event = (await q(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [ids.creator]))[0].id;
  ids.tournament = (
    await q(`INSERT INTO public.events (event_type, created_by) VALUES ('sports_tournament', $1) RETURNING id`, [ids.creator])
  )[0].id;
  for (const k of ['regA', 'regB', 'regC'] as const) {
    ids[k] = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ids.event]))[0].id;
  }
}, 120_000);

afterAll(async () => {
  if (client) await client.end();
  if (admin) await admin.end();
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`]);
  } catch {
    /* disposable */
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('the column guard (RLS grants rows, not columns)', () => {
  it('refuses a plain client UPDATE that crowns an outsider the winner', async () => {
    await reset();
    await actAs(ids.outsider);
    expect(await sqlstate(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [ids.regA])).toBe('42501');
    expect((await ranks())[ids.regA]).toBeNull();
  });

  it('refuses a client INSERT that arrives already placed', async () => {
    await actAs(ids.outsider);
    expect(
      await sqlstate(`INSERT INTO public.events_registrations (event_id, final_rank) VALUES ($1, 1)`, [ids.event])
    ).toBe('42501');
  });

  it('leaves every other column alone: an outsider UPDATE of status still works', async () => {
    await actAs(ids.outsider);
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'registered' WHERE id = $1`, [ids.regA])).toBeNull();
  });

  it('lets the creator set the place directly', async () => {
    await reset();
    await actAs(ids.creator);
    expect(await sqlstate(`UPDATE public.events_registrations SET final_rank = 2 WHERE id = $1`, [ids.regB])).toBeNull();
    expect((await ranks())[ids.regB]).toBe(2);
  });

  it('refuses a fourth place', async () => {
    await asOwner();
    expect(await sqlstate(`UPDATE public.events_registrations SET final_rank = 4 WHERE id = $1`, [ids.regA])).toBe('23514');
  });
});

describe('fn_set_event_registration_ranks', () => {
  const call = (eventId: string, changes: unknown) =>
    sqlstate(`SELECT public.fn_set_event_registration_ranks($1, $2::jsonb)`, [eventId, JSON.stringify(changes)]);

  it('refuses an outsider', async () => {
    await reset();
    await actAs(ids.outsider);
    expect(await call(ids.event, [{ registration_id: ids.regA, final_rank: 1 }])).toBe('42501');
  });

  it('lets the creator record 1st and 2nd, and the in-charge swap them in one call', async () => {
    await reset();
    await actAs(ids.creator);
    expect(
      await call(ids.event, [
        { registration_id: ids.regA, final_rank: 1 },
        { registration_id: ids.regB, final_rank: 2 },
      ])
    ).toBeNull();
    expect(await ranks()).toMatchObject({ [ids.regA]: 1, [ids.regB]: 2 });

    await actAs(ids.outsider, { 'test.incharge_event': ids.event });
    expect(
      await call(ids.event, [
        { registration_id: ids.regB, final_rank: 1 },
        { registration_id: ids.regA, final_rank: null },
        { registration_id: ids.regA, final_rank: 2 },
      ])
    ).toBeNull();
    expect(await ranks()).toMatchObject({ [ids.regA]: 2, [ids.regB]: 1 });
  });

  it('is all-or-nothing: a foreign registration rolls the whole list back', async () => {
    await reset();
    await actAs(ids.creator);
    expect(
      await call(ids.event, [
        { registration_id: ids.regA, final_rank: 1 },
        { registration_id: randomUUID(), final_rank: 2 },
      ])
    ).toBe('22023');
    expect((await ranks())[ids.regA]).toBeNull();
  });

  it('refuses a non-cultural event and a bad place', async () => {
    await actAs(ids.creator);
    expect(await call(ids.tournament, [{ registration_id: ids.regA, final_rank: 1 }])).toBe('22023');
    expect(await call(ids.event, [{ registration_id: ids.regA, final_rank: 4 }])).toBe('22023');
  });

  it('anon cannot execute it', async () => {
    await asOwner();
    const r = await q(
      `SELECT has_function_privilege('anon', 'public.fn_set_event_registration_ranks(uuid, jsonb)', 'EXECUTE') AS ok`
    );
    expect(r[0].ok).toBe(false);
  });
});

describe('no ties (Director ruling 9 Oct): one registration per place per set', () => {
  const call = (eventId: string, changes: unknown) =>
    sqlstate(`SELECT public.fn_set_event_registration_ranks($1, $2::jsonb)`, [eventId, JSON.stringify(changes)]);

  it('refuses a tie made by the creator with a direct UPDATE', async () => {
    await reset();
    await actAs(ids.creator);
    expect(await sqlstate(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [ids.regA])).toBeNull();
    expect(await sqlstate(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [ids.regB])).toBe('23505');
    expect(await ranks()).toMatchObject({ [ids.regA]: 1, [ids.regB]: null });
  });

  it('refuses a tie made through the function, and keeps nothing of that call', async () => {
    await reset();
    await actAs(ids.creator);
    expect(await call(ids.event, [{ registration_id: ids.regA, final_rank: 1 }])).toBeNull();
    expect(
      await call(ids.event, [
        { registration_id: ids.regC, final_rank: 3 },
        { registration_id: ids.regB, final_rank: 1 },
      ])
    ).toBe('23505');
    expect(await ranks()).toMatchObject({ [ids.regA]: 1, [ids.regB]: null, [ids.regC]: null });
  });

  it('still lets the function swap winner and runner-up', async () => {
    await reset();
    await actAs(ids.creator);
    expect(
      await call(ids.event, [
        { registration_id: ids.regA, final_rank: 1 },
        { registration_id: ids.regB, final_rank: 2 },
      ])
    ).toBeNull();
    expect(
      await call(ids.event, [
        { registration_id: ids.regA, final_rank: 2 },
        { registration_id: ids.regB, final_rank: 1 },
      ])
    ).toBeNull();
    expect(await ranks()).toMatchObject({ [ids.regA]: 2, [ids.regB]: 1 });
  });

  it('a direct two-statement swap needs a clear first (the index checks each statement)', async () => {
    await reset();
    await actAs(ids.creator);
    await q(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [ids.regA]);
    await q(`UPDATE public.events_registrations SET final_rank = 2 WHERE id = $1`, [ids.regB]);
    expect(await sqlstate(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [ids.regB])).toBe('23505');
    await q(`BEGIN`);
    await q(`UPDATE public.events_registrations SET final_rank = NULL WHERE id = $1`, [ids.regA]);
    await q(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [ids.regB]);
    await q(`UPDATE public.events_registrations SET final_rank = 2 WHERE id = $1`, [ids.regA]);
    expect(await sqlstate(`COMMIT`)).toBeNull();
    expect(await ranks()).toMatchObject({ [ids.regA]: 2, [ids.regB]: 1 });
  });

  it('two competitions (forms) each keep their own winner', async () => {
    await asOwner();
    const ev = (await q(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [ids.creator]))[0].id;
    const [f1, f2] = [await newForm(ev), await newForm(ev)];
    const r1 = (await q(`INSERT INTO public.events_registrations (event_id, form_id) VALUES ($1, $2) RETURNING id`, [ev, f1]))[0].id;
    const r2 = (await q(`INSERT INTO public.events_registrations (event_id, form_id) VALUES ($1, $2) RETURNING id`, [ev, f2]))[0].id;
    const r3 = (await q(`INSERT INTO public.events_registrations (event_id, form_id) VALUES ($1, $2) RETURNING id`, [ev, f1]))[0].id;
    await actAs(ids.creator);
    expect(await call(ev, [{ registration_id: r1, final_rank: 1 }, { registration_id: r2, final_rank: 1 }])).toBeNull();
    expect(await call(ev, [{ registration_id: r3, final_rank: 1 }])).toBe('23505');
  });
});

describe('change history (Director ruling 9 Oct): every change saved with who made it', () => {
  const call = (changes: unknown) =>
    sqlstate(`SELECT public.fn_set_event_registration_ranks($1, $2::jsonb)`, [ids.event, JSON.stringify(changes)]);

  it('records set, change and clear with changed_by = the caller', async () => {
    await reset();
    await asOwner();
    await q(`DELETE FROM public.event_winner_rank_changes`);
    await actAs(ids.creator);
    expect(await call([{ registration_id: ids.regC, final_rank: 3 }])).toBeNull();
    expect(await call([{ registration_id: ids.regC, final_rank: 2 }])).toBeNull();
    await actAs(ids.outsider, { 'test.incharge_event': ids.event });
    expect(await call([{ registration_id: ids.regC, final_rank: null }])).toBeNull();

    await asOwner();
    const rows = await q(
      `SELECT old_rank, new_rank, changed_by FROM public.event_winner_rank_changes
        WHERE registration_id = $1 ORDER BY changed_at, ctid`,
      [ids.regC]
    );
    expect(rows).toEqual([
      { old_rank: null, new_rank: 3, changed_by: ids.creator },
      { old_rank: 3, new_rank: 2, changed_by: ids.creator },
      { old_rank: 2, new_rank: null, changed_by: ids.outsider },
    ]);
  });

  it('records a direct UPDATE too, and nothing when the place did not change', async () => {
    await reset();
    await asOwner();
    await q(`DELETE FROM public.event_winner_rank_changes`);
    await actAs(ids.creator);
    await q(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [ids.regA]);
    await q(`UPDATE public.events_registrations SET final_rank = 1, status = 'registered' WHERE id = $1`, [ids.regA]);
    await asOwner();
    const rows = await q(`SELECT new_rank, changed_by FROM public.event_winner_rank_changes WHERE registration_id = $1`, [ids.regA]);
    expect(rows).toEqual([{ new_rank: 1, changed_by: ids.creator }]);
  });

  it('the creator can read the history; an outsider sees none and cannot write it', async () => {
    await actAs(ids.creator);
    expect((await q(`SELECT 1 FROM public.event_winner_rank_changes WHERE event_id = $1`, [ids.event])).length).toBeGreaterThan(0);
    await actAs(ids.outsider);
    expect(await q(`SELECT 1 FROM public.event_winner_rank_changes WHERE event_id = $1`, [ids.event])).toEqual([]);
    expect(
      await sqlstate(
        `INSERT INTO public.event_winner_rank_changes (event_id, registration_id, new_rank) VALUES ($1, $2, 1)`,
        [ids.event, ids.regA]
      )
    ).toBe('42501');
    await asOwner();
  });
});

describe('review round 3 (#4311)', () => {
  const call = (eventId: string, changes: unknown) =>
    sqlstate(`SELECT public.fn_set_event_registration_ranks($1, $2::jsonb)`, [eventId, JSON.stringify(changes)]);

  /** An event the outsider created (so they may record winners there), and a placed row on the victim event. */
  async function setupMove() {
    await reset();
    await asOwner();
    const own = (await q(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [ids.outsider]))[0].id;
    const ownRow = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [own]))[0].id;
    await q(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [ids.regA]);
    return { own, ownRow };
  }

  it('#1 refuses moving another event\'s winner into your own event (clearing it there)', async () => {
    const { own } = await setupMove();
    await actAs(ids.outsider);
    expect(
      await sqlstate(`UPDATE public.events_registrations SET event_id = $1, final_rank = NULL WHERE id = $2`, [own, ids.regA])
    ).toBe('42501');
    await asOwner();
    const r = await q(`SELECT event_id, final_rank FROM public.events_registrations WHERE id = $1`, [ids.regA]);
    expect(r[0]).toEqual({ event_id: ids.event, final_rank: 1 });
  });

  it('#1 refuses carrying a place from your own event into another event', async () => {
    const { own, ownRow } = await setupMove();
    const ownForm = await newForm(own);
    await actAs(ids.outsider);
    expect(await sqlstate(`UPDATE public.events_registrations SET final_rank = 2 WHERE id = $1`, [ownRow])).toBeNull();
    expect(await sqlstate(`UPDATE public.events_registrations SET event_id = $1 WHERE id = $2`, [ids.event, ownRow])).toBe('42501');
    expect(await sqlstate(`UPDATE public.events_registrations SET form_id = $1 WHERE id = $2`, [ownForm, ownRow])).toBeNull();
    await asOwner();
    expect((await q(`SELECT event_id FROM public.events_registrations WHERE id = $1`, [ownRow]))[0].event_id).not.toBe(ids.event);
  });

  it('#1 refuses moving a placed row to another form by someone without authority', async () => {
    await setupMove();
    const victimForm = await newForm(ids.event);
    await actAs(ids.outsider);
    expect(await sqlstate(`UPDATE public.events_registrations SET form_id = $1 WHERE id = $2`, [victimForm, ids.regA])).toBe('42501');
  });

  it('#4 refuses rewriting who a placed row names; an unplaced row can still be edited', async () => {
    await setupMove();
    await actAs(ids.outsider);
    for (const col of ['participant_name', 'institution_name', 'department']) {
      expect(await sqlstate(`UPDATE public.events_registrations SET ${col} = 'Mallory' WHERE id = $1`, [ids.regA])).toBe('42501');
    }
    expect(await sqlstate(`UPDATE public.events_registrations SET participant_name = 'Fixed typo' WHERE id = $1`, [ids.regB])).toBeNull();
    await actAs(ids.creator);
    expect(await sqlstate(`UPDATE public.events_registrations SET participant_name = 'Kavya R' WHERE id = $1`, [ids.regA])).toBeNull();
  });

  it('#2 two sessions saving place 1 at once: the second fails with 23505, no tie', async () => {
    await reset();
    await asOwner();
    const ev = (await q(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [ids.creator]))[0].id;
    const r1 = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ev]))[0].id;
    const r2 = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ev]))[0].id;
    const c2 = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
    await c2.connect();
    try {
      await q(`BEGIN`);
      await q(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [r1]);
      await c2.query(`BEGIN`);
      const second = c2
        .query(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [r2])
        .then(() => null, (e: any) => e.code as string);
      await new Promise((r) => setTimeout(r, 300));
      await q(`COMMIT`);
      const outcome = await second;
      await c2.query(outcome ? `ROLLBACK` : `COMMIT`).catch(() => undefined);
      expect(outcome).toBe('23505');
      const winners = await q(`SELECT id FROM public.events_registrations WHERE event_id = $1 AND final_rank = 1`, [ev]);
      expect(winners).toHaveLength(1);
    } finally {
      await c2.end();
    }
  });

  it('#3 the set is always the form: a place stays per form however forms come and go', async () => {
    await asOwner();
    const ev = (await q(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [ids.creator]))[0].id;
    const f1 = await newForm(ev);
    const a = (await q(`INSERT INTO public.events_registrations (event_id, form_id) VALUES ($1, $2) RETURNING id`, [ev, f1]))[0].id;
    const b = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ev]))[0].id;
    await actAs(ids.creator);
    // form f1 and "no form" are separate sets
    expect(await call(ev, [{ registration_id: a, final_rank: 1 }, { registration_id: b, final_rank: 1 }])).toBeNull();
    // moving b onto form f1 would make a tie there
    expect(await sqlstate(`UPDATE public.events_registrations SET form_id = $1 WHERE id = $2`, [f1, b])).toBe('23505');
  });

  it('#5 an admin of some institution cannot record winners on an event with no institution; a super admin can', async () => {
    await asOwner();
    const ev = (await q(`INSERT INTO public.events (created_by, institution_id) VALUES ($1, NULL) RETURNING id`, [randomUUID()]))[0].id;
    const r = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ev]))[0].id;
    await actAs(ids.outsider, { 'test.admin': 'yes', 'test.admin_institution': randomUUID() });
    expect(await call(ev, [{ registration_id: r, final_rank: 1 }])).toBe('42501');
    await actAs(ids.outsider, { 'test.super_admin': 'yes' });
    expect(await call(ev, [{ registration_id: r, final_rank: 1 }])).toBeNull();
  });

  it('#8 no place on a non-cultural event or a cancelled registration, even for a trusted session', async () => {
    await asOwner();
    const t = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ids.tournament]))[0].id;
    expect(await sqlstate(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [t])).toBe('22023');
    const c = (await q(`INSERT INTO public.events_registrations (event_id, status) VALUES ($1, 'cancelled') RETURNING id`, [ids.event]))[0].id;
    expect(await sqlstate(`UPDATE public.events_registrations SET final_rank = 3 WHERE id = $1`, [c])).toBe('22023');
    await q(`DELETE FROM public.events_registrations WHERE id = $1`, [c]);
  });

  it('history: a placed row moved between events by an authorised caller logs a clear and a set', async () => {
    await reset();
    await asOwner();
    await q(`DELETE FROM public.event_winner_rank_changes`);
    const other = (await q(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [ids.creator]))[0].id;
    const row = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ids.event]))[0].id;
    await actAs(ids.creator);
    await q(`UPDATE public.events_registrations SET final_rank = 3 WHERE id = $1`, [row]);
    await q(`UPDATE public.events_registrations SET event_id = $1 WHERE id = $2`, [other, row]);
    await asOwner();
    const rows = await q(
      `SELECT event_id, old_rank, new_rank FROM public.event_winner_rank_changes WHERE registration_id = $1 ORDER BY changed_at, ctid`,
      [row]
    );
    expect(rows).toEqual([
      { event_id: ids.event, old_rank: null, new_rank: 3 },
      { event_id: ids.event, old_rank: 3, new_rank: null },
      { event_id: other, old_rank: null, new_rank: 3 },
    ]);
  });
});

describe('review round 4 (#4311)', () => {
  async function placed(rank = 1) {
    await reset();
    await asOwner();
    await q(`DELETE FROM public.event_winner_rank_changes`);
    const row = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ids.event]))[0].id;
    await q(`UPDATE public.events_registrations SET final_rank = $2 WHERE id = $1`, [row, rank]);
    await q(`DELETE FROM public.event_winner_rank_changes`);
    return row;
  }
  async function history(row: string) {
    await asOwner();
    return q(
      `SELECT event_id, form_id, old_rank, new_rank, changed_by FROM public.event_winner_rank_changes
        WHERE registration_id = $1 ORDER BY changed_at, ctid`,
      [row]
    );
  }

  it('#1 someone without authority cannot cancel a placed registration', async () => {
    const row = await placed();
    await actAs(ids.outsider);
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'cancelled' WHERE id = $1`, [row])).toBe('42501');
    await asOwner();
    expect((await q(`SELECT status FROM public.events_registrations WHERE id = $1`, [row]))[0].status).toBe('registered');
    await q(`DELETE FROM public.events_registrations WHERE id = $1`, [row]);
  });

  it('#1 the creator may cancel a placed registration; the place is cleared and logged (round 6 ruling)', async () => {
    const row = await placed();
    await actAs(ids.creator);
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'cancelled' WHERE id = $1`, [row])).toBeNull();
    await asOwner();
    expect((await q(`SELECT status, final_rank FROM public.events_registrations WHERE id = $1`, [row]))[0]).toEqual({
      status: 'cancelled',
      final_rank: null,
    });
    expect(await history(row)).toEqual([
      { event_id: ids.event, form_id: null, old_rank: 1, new_rank: null, changed_by: ids.creator },
    ]);
    await q(`DELETE FROM public.events_registrations WHERE id = $1`, [row]);
  });

  it('#2 someone without authority cannot delete a placed registration', async () => {
    const row = await placed();
    await actAs(ids.outsider);
    expect(await sqlstate(`DELETE FROM public.events_registrations WHERE id = $1`, [row])).toBe('42501');
    await asOwner();
    expect(await q(`SELECT 1 FROM public.events_registrations WHERE id = $1`, [row])).toHaveLength(1);
    await q(`DELETE FROM public.events_registrations WHERE id = $1`, [row]);
  });

  it('#2 the creator may delete a placed registration, and the removal is logged with who did it', async () => {
    const row = await placed(2);
    await actAs(ids.creator);
    expect(await sqlstate(`DELETE FROM public.events_registrations WHERE id = $1`, [row])).toBeNull();
    expect(await history(row)).toEqual([
      { event_id: ids.event, form_id: null, old_rank: 2, new_rank: null, changed_by: ids.creator },
    ]);
  });

  it('#2 an unplaced registration can still be deleted by anyone the table lets', async () => {
    await asOwner();
    const row = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ids.event]))[0].id;
    await actAs(ids.outsider);
    expect(await sqlstate(`DELETE FROM public.events_registrations WHERE id = $1`, [row])).toBeNull();
  });

  it('#3 moving a placed row to another form logs a clear on the old form and a set on the new', async () => {
    const row = await placed(3);
    const f = await newForm(ids.event);
    await actAs(ids.creator);
    expect(await sqlstate(`UPDATE public.events_registrations SET form_id = $1 WHERE id = $2`, [f, row])).toBeNull();
    expect(await history(row)).toEqual([
      { event_id: ids.event, form_id: null, old_rank: 3, new_rank: null, changed_by: ids.creator },
      { event_id: ids.event, form_id: f, old_rank: null, new_rank: 3, changed_by: ids.creator },
    ]);
    await asOwner();
    await q(`DELETE FROM public.events_registrations WHERE id = $1`, [row]);
  });

  it('#5 the service role cannot call the user-session function', async () => {
    await asOwner();
    const r = await q(
      `SELECT has_function_privilege('service_role', 'public.fn_set_event_registration_ranks(uuid, jsonb)', 'EXECUTE') AS ok`
    );
    expect(r[0].ok).toBe(false);
  });
});

describe('review round 5 (#4311): the live foreign keys', () => {
  async function historyFor(eventId: string) {
    return (
      await admin.query(
        `SELECT registration_id, form_id, old_rank, new_rank FROM public.event_winner_rank_changes
          WHERE event_id = $1 ORDER BY changed_at, ctid`,
        [eventId]
      )
    ).rows;
  }

  it('#2 the creator deletes an event that has winners: the cascade succeeds and each removal is logged', async () => {
    await asOwner();
    const ev = (await q(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [ids.creator]))[0].id;
    const a = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ev]))[0].id;
    const b = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ev]))[0].id;
    await actAs(ids.creator);
    expect(
      await sqlstate(`SELECT public.fn_set_event_registration_ranks($1, $2::jsonb)`, [
        ev,
        JSON.stringify([
          { registration_id: a, final_rank: 1 },
          { registration_id: b, final_rank: 2 },
        ]),
      ])
    ).toBeNull();
    expect(await sqlstate(`DELETE FROM public.events WHERE id = $1`, [ev])).toBeNull();
    await asOwner();
    expect(await q(`SELECT 1 FROM public.events_registrations WHERE event_id = $1`, [ev])).toEqual([]);
    const removals = (await historyFor(ev)).filter((h) => h.new_rank === null);
    expect(removals).toEqual(
      expect.arrayContaining([
        { registration_id: a, form_id: null, old_rank: 1, new_rank: null },
        { registration_id: b, form_id: null, old_rank: 2, new_rank: null },
      ])
    );
    expect(removals).toHaveLength(2);
  });

  it('#2 a non-manager deleting a placed row directly is still refused', async () => {
    await asOwner();
    const row = (await q(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ids.event]))[0].id;
    await q(`UPDATE public.events_registrations SET final_rank = 3 WHERE id = $1`, [row]);
    await actAs(ids.outsider);
    expect(await sqlstate(`DELETE FROM public.events_registrations WHERE id = $1`, [row])).toBe('42501');
    await asOwner();
    await q(`DELETE FROM public.events_registrations WHERE id = $1`, [row]);
  });

  it('#3 deleting a form clears and logs its winner; the other form and the no-form set are untouched', async () => {
    await asOwner();
    const ev = (await q(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [ids.creator]))[0].id;
    const [f1, f2] = [await newForm(ev), await newForm(ev)];
    const add = async (form: string | null) =>
      (await q(`INSERT INTO public.events_registrations (event_id, form_id) VALUES ($1, $2) RETURNING id`, [ev, form]))[0].id;
    const [r1, r2, r0] = [await add(f1), await add(f2), await add(null)];
    await actAs(ids.creator);
    expect(
      await sqlstate(`SELECT public.fn_set_event_registration_ranks($1, $2::jsonb)`, [
        ev,
        JSON.stringify([
          { registration_id: r1, final_rank: 1 },
          { registration_id: r2, final_rank: 1 },
          { registration_id: r0, final_rank: 1 },
        ]),
      ])
    ).toBeNull();
    // Without the clear, r1 would land in the no-form set next to r0's 1st place.
    expect(await sqlstate(`DELETE FROM public.event_registration_forms WHERE id = $1`, [f1])).toBeNull();
    await asOwner();
    const rows = await q(`SELECT id, form_id, final_rank FROM public.events_registrations WHERE event_id = $1`, [ev]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[r1]).toEqual({ id: r1, form_id: null, final_rank: null });
    expect(byId[r2]).toEqual({ id: r2, form_id: f2, final_rank: 1 });
    expect(byId[r0]).toEqual({ id: r0, form_id: null, final_rank: 1 });
    const cleared = (await historyFor(ev)).filter((h) => h.registration_id === r1 && h.new_rank === null);
    expect(cleared).toEqual([{ registration_id: r1, form_id: f1, old_rank: 1, new_rank: null }]);
  });

  it('#3 a client setting form_id to NULL on a placed row (form still there) is a move that needs authority', async () => {
    await asOwner();
    const f = await newForm(ids.event);
    const row = (await q(`INSERT INTO public.events_registrations (event_id, form_id) VALUES ($1, $2) RETURNING id`, [ids.event, f]))[0].id;
    await q(`UPDATE public.events_registrations SET final_rank = 3 WHERE id = $1`, [row]);
    await actAs(ids.outsider);
    expect(await sqlstate(`UPDATE public.events_registrations SET form_id = NULL WHERE id = $1`, [row])).toBe('42501');
    await asOwner();
    expect((await q(`SELECT form_id, final_rank FROM public.events_registrations WHERE id = $1`, [row]))[0]).toEqual({
      form_id: f,
      final_rank: 3,
    });
    await q(`DELETE FROM public.events_registrations WHERE id = $1`, [row]);
  });
});

describe('review round 6 (#4311)', () => {
  const ZERO = null;
  async function placedRow(rank: number, extra: { profile?: string; form?: string } = {}) {
    await reset();
    await asOwner();
    const row = (
      await q(`INSERT INTO public.events_registrations (event_id, profile_id, form_id) VALUES ($1, $2, $3) RETURNING id`, [
        ids.event,
        extra.profile ?? null,
        extra.form ?? null,
      ])
    )[0].id;
    await q(`UPDATE public.events_registrations SET final_rank = $2 WHERE id = $1`, [row, rank]);
    await q(`DELETE FROM public.event_winner_rank_changes`);
    return row;
  }
  async function rowState(row: string) {
    return (await admin.query(`SELECT status, final_rank FROM public.events_registrations WHERE id = $1`, [row])).rows[0];
  }
  async function historyRows(row: string) {
    return (
      await admin.query(
        `SELECT old_rank, new_rank, changed_by FROM public.event_winner_rank_changes WHERE registration_id = $1 ORDER BY changed_at, ctid`,
        [row]
      )
    ).rows;
  }
  async function drop(row: string) {
    await admin.query(`DELETE FROM public.events_registrations WHERE id = $1`, [row]);
  }

  it('#2 a check-in volunteer without winner authority can check in a placed row', async () => {
    const row = await placedRow(1);
    await actAs(ids.outsider);
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'checked_in' WHERE id = $1`, [row])).toBeNull();
    expect(await rowState(row)).toEqual({ status: 'checked_in', final_rank: 1 });
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'confirmed' WHERE id = $1`, [row])).toBeNull();
    await asOwner();
    await drop(row);
  });

  it('#2 the registrant may cancel their own placed row: the place is cleared and logged as theirs', async () => {
    const learner = randomUUID();
    const row = await placedRow(2, { profile: learner });
    await actAs(learner);
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'cancelled' WHERE id = $1`, [row])).toBeNull();
    expect(await rowState(row)).toEqual({ status: 'cancelled', final_rank: null });
    expect(await historyRows(row)).toEqual([{ old_rank: 2, new_rank: null, changed_by: learner }]);
    await asOwner();
    await drop(row);
  });

  it('#2 the registrant cannot cancel and re-place in one statement (the place is cleared anyway)', async () => {
    const learner = randomUUID();
    const row = await placedRow(2, { profile: learner });
    await actAs(learner);
    expect(
      await sqlstate(`UPDATE public.events_registrations SET status = 'cancelled', final_rank = 1 WHERE id = $1`, [row])
    ).toBeNull();
    expect(await rowState(row)).toEqual({ status: 'cancelled', final_rank: null });
    await asOwner();
    await drop(row);
  });

  it('#2 someone else without authority cannot cancel or disqualify a placed row', async () => {
    const row = await placedRow(1, { profile: randomUUID() });
    await actAs(ids.outsider);
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'cancelled' WHERE id = $1`, [row])).toBe('42501');
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'disqualified' WHERE id = $1`, [row])).toBe('42501');
    expect(await rowState(row)).toEqual({ status: 'registered', final_rank: 1 });
    await asOwner();
    await drop(row);
  });

  it('#2 a manager disqualifies a placed row: the place is cleared and logged', async () => {
    const row = await placedRow(3);
    await actAs(ids.outsider, { 'test.incharge_event': ids.event });
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'disqualified' WHERE id = $1`, [row])).toBeNull();
    expect(await rowState(row)).toEqual({ status: 'disqualified', final_rank: null });
    expect(await historyRows(row)).toEqual([{ old_rank: 3, new_rank: null, changed_by: ids.outsider }]);
    await asOwner();
    await drop(row);
  });

  it('#2 a service-role cancel also clears the place', async () => {
    const row = await placedRow(1);
    await asOwner();
    await q(`UPDATE public.events_registrations SET status = 'cancelled' WHERE id = $1`, [row]);
    expect(await rowState(row)).toEqual({ status: 'cancelled', final_rank: null });
    expect(await historyRows(row)).toEqual([{ old_rank: 1, new_rank: null, changed_by: null }]);
    await drop(row);
  });

  it('#2 a row outside the ACTIVE set cannot be given a place', async () => {
    await asOwner();
    for (const status of ['cancelled', 'disqualified', 'no_show', 'waitlisted']) {
      const row = (
        await q(`INSERT INTO public.events_registrations (event_id, status) VALUES ($1, $2) RETURNING id`, [ids.event, status])
      )[0].id;
      expect(await sqlstate(`UPDATE public.events_registrations SET final_rank = 3 WHERE id = $1`, [row])).toBe('22023');
      await drop(row);
    }
  });

  it('#1 a form with winners cannot be deleted by someone whose only right is the forms policy (e.g. sports.tournaments.manage)', async () => {
    await asOwner();
    const f = await newForm(ids.event);
    const row = await placedRow(1, { form: f });
    // The outsider holds DELETE on forms (as event_registration_forms_manage
    // grants a sports.tournaments.manage holder) but no winner authority.
    await actAs(ids.outsider);
    expect(await sqlstate(`DELETE FROM public.event_registration_forms WHERE id = $1`, [f])).toBe('42501');
    expect(await rowState(row)).toEqual({ status: 'registered', final_rank: 1 });
    await actAs(ids.creator);
    expect(await sqlstate(`DELETE FROM public.event_registration_forms WHERE id = $1`, [f])).toBeNull();
    expect(await rowState(row)).toEqual({ status: 'registered', final_rank: null });
    await asOwner();
    await drop(row);
  });

  it('#1 a form with no winners can still be deleted by the forms policy alone', async () => {
    await asOwner();
    const f = await newForm(ids.event);
    await actAs(ids.outsider);
    expect(await sqlstate(`DELETE FROM public.event_registration_forms WHERE id = $1`, [f])).toBeNull();
    await asOwner();
  });

  it('#3 a list spanning two forms logs one history row per real change', async () => {
    await reset();
    await asOwner();
    const ev = (await q(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [ids.creator]))[0].id;
    const [f1, f2] = [await newForm(ev), await newForm(ev)];
    const a = (await q(`INSERT INTO public.events_registrations (event_id, form_id) VALUES ($1, $2) RETURNING id`, [ev, f1]))[0].id;
    const b = (await q(`INSERT INTO public.events_registrations (event_id, form_id) VALUES ($1, $2) RETURNING id`, [ev, f2]))[0].id;
    await q(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [a]);
    await q(`DELETE FROM public.event_winner_rank_changes`);
    await actAs(ids.creator);
    // a moves 1 -> 2 in form 1; b takes 1 in form 2 (a different set).
    expect(
      await sqlstate(`SELECT public.fn_set_event_registration_ranks($1, $2::jsonb)`, [
        ev,
        JSON.stringify([
          { registration_id: a, final_rank: 2 },
          { registration_id: b, final_rank: 1 },
        ]),
      ])
    ).toBeNull();
    expect(await historyRows(a)).toEqual([{ old_rank: 1, new_rank: 2, changed_by: ids.creator }]);
    expect(await historyRows(b)).toEqual([{ old_rank: null, new_rank: 1, changed_by: ids.creator }]);
    void ZERO;
    await asOwner();
  });
});

describe('review round 7 (#4311): an allowlist on a winner\'s row', () => {
  /** Live columns with a fixture type, used to build a value that differs. */
  const COLUMNS: Record<string, 'uuid' | 'text' | 'int' | 'num' | 'bool' | 'ts' | 'json'> = {
    id: 'uuid', event_id: 'uuid', category_id: 'uuid', profile_id: 'uuid', learner_id: 'uuid',
    external_participant_id: 'uuid', participant_type: 'text', participant_name: 'text',
    participant_phone: 'text', participant_email: 'text', participant_age: 'int', participant_gender: 'text',
    institution_id: 'uuid', institution_name: 'text', department: 'text', bib_number: 'text',
    registration_number: 'text', status: 'text', checked_in: 'bool', checked_in_at: 'ts', checked_in_by: 'uuid',
    payment_status: 'text', payment_amount: 'num', payment_method: 'text', payment_reference: 'text',
    discount_code: 'text', discount_amount: 'num', custom_data: 'json', source: 'text', referral_source: 'text',
    registered_by: 'uuid', created_at: 'ts', updated_at: 'ts', stall_id: 'uuid', tshirt_collected: 'bool',
    tshirt_collected_at: 'ts', tshirt_collected_by: 'uuid', certificate_issued: 'bool',
    certificate_issued_at: 'ts', certificate_issued_by: 'uuid', qr_code_url: 'text', qr_generated_at: 'ts',
    custom_fields: 'json', form_id: 'uuid', myjkkn_profile: 'json', final_rank: 'int',
  };
  const ALLOWED = [
    'status', 'checked_in', 'checked_in_at', 'checked_in_by',
    'tshirt_collected', 'tshirt_collected_at', 'tshirt_collected_by',
    'certificate_issued', 'certificate_issued_at', 'certificate_issued_by',
    'qr_code_url', 'qr_generated_at',
    'payment_status', 'payment_amount', 'payment_method', 'payment_reference',
    'updated_at',
  ];
  const FROZEN = Object.keys(COLUMNS).filter((c) => !ALLOWED.includes(c));
  const newValue = (col: string): string => {
    if (col === 'final_rank') return '2';
    if (col === 'status') return `'checked_in'`;
    switch (COLUMNS[col]) {
      case 'uuid': return 'gen_random_uuid()';
      case 'text': return `'changed'`;
      case 'int': return '42';
      case 'num': return '9.5';
      case 'bool': return 'true';
      case 'ts': return `now() - interval '3 days'`;
      case 'json': return `'{"changed": true}'::jsonb`;
    }
    throw new Error(col);
  };

  async function placedRow(profile: string | null = null) {
    await reset();
    await admin.query(`DELETE FROM public.event_winner_rank_changes`);
    const row = (
      await admin.query(`INSERT INTO public.events_registrations (event_id, profile_id) VALUES ($1, $2) RETURNING id`, [
        ids.event,
        profile,
      ])
    ).rows[0].id;
    await admin.query(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [row]);
    await admin.query(`DELETE FROM public.event_winner_rank_changes`);
    return row;
  }
  const snapshot = async (row: string) =>
    (await admin.query(`SELECT to_jsonb(r) AS j FROM public.events_registrations r WHERE id = $1`, [row])).rows[0].j;
  const drop = (row: string) => admin.query(`DELETE FROM public.events_registrations WHERE id = $1`, [row]);

  it('the fixture mirrors every live column (plus final_rank)', async () => {
    const cols = (
      await admin.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events_registrations'`
      )
    ).rows.map((r: any) => r.column_name).sort();
    expect(cols).toEqual(Object.keys(COLUMNS).sort());
  });

  it('(a) a committee-style updater cannot re-point a winner\'s row to themselves (and so cannot "self-cancel" it)', async () => {
    const row = await placedRow(randomUUID());
    await actAs(ids.outsider);
    expect(await sqlstate(`UPDATE public.events_registrations SET profile_id = $1 WHERE id = $2`, [ids.outsider, row])).toBe('42501');
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'cancelled' WHERE id = $1`, [row])).toBe('42501');
    const after = await snapshot(row);
    expect(after.final_rank).toBe(1);
    expect(after.profile_id).not.toBe(ids.outsider);
    await asOwner();
    await drop(row);
  });

  it('(b) every frozen column is refused to an updater without winner authority', async () => {
    const row = await placedRow(randomUUID());
    // Moving to another real cultural event (a random id would be refused
    // earlier, as an invalid event, with 22023).
    const other = (await admin.query(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [randomUUID()])).rows[0].id;
    const refused: string[] = [];
    for (const col of FROZEN) {
      await actAs(ids.outsider);
      const value = col === 'event_id' ? `'${other}'::uuid` : newValue(col);
      const code = await sqlstate(`UPDATE public.events_registrations SET ${col} = ${value} WHERE id = $1`, [row]);
      if (code !== '42501') refused.push(`${col}: ${code}`);
    }
    await asOwner();
    expect(refused).toEqual([]);
    expect((await snapshot(row)).final_rank).toBe(1);
    await drop(row);
  });

  it('(c) every allowlisted operational column stays writable by a committee-style updater', async () => {
    const row = await placedRow(randomUUID());
    const failed: string[] = [];
    for (const col of ALLOWED) {
      await actAs(ids.outsider);
      const code = await sqlstate(`UPDATE public.events_registrations SET ${col} = ${newValue(col)} WHERE id = $1`, [row]);
      if (code !== null) failed.push(`${col}: ${code}`);
    }
    await asOwner();
    expect(failed).toEqual([]);
    const after = await snapshot(row);
    expect(after).toMatchObject({ final_rank: 1, status: 'checked_in', checked_in: true, tshirt_collected: true, certificate_issued: true, payment_status: 'changed' });
    await drop(row);
  });

  it('(d) a manager can still change frozen columns on a winner\'s row', async () => {
    const row = await placedRow(randomUUID());
    const learner = randomUUID();
    await actAs(ids.outsider, { 'test.incharge_event': ids.event });
    expect(
      await sqlstate(
        `UPDATE public.events_registrations SET participant_name = 'Kavya R', profile_id = $1, custom_data = '{"note": 1}'::jsonb WHERE id = $2`,
        [learner, row]
      )
    ).toBeNull();
    await asOwner();
    expect(await snapshot(row)).toMatchObject({ participant_name: 'Kavya R', profile_id: learner, final_rank: 1 });
    await drop(row);
  });

  it('the registrant on their own winning row may only cancel it', async () => {
    const learner = randomUUID();
    const row = await placedRow(learner);
    await actAs(learner);
    for (const set of [`payment_status = 'paid'`, `certificate_issued = true`, `checked_in = true`, `status = 'checked_in'`, `participant_name = 'Me'`]) {
      expect(await sqlstate(`UPDATE public.events_registrations SET ${set} WHERE id = $1`, [row])).toBe('42501');
    }
    expect(await sqlstate(`UPDATE public.events_registrations SET updated_at = now() WHERE id = $1`, [row])).toBeNull();
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'cancelled' WHERE id = $1`, [row])).toBeNull();
    await asOwner();
    expect(await snapshot(row)).toMatchObject({ status: 'cancelled', final_rank: null });
    const log = (await admin.query(`SELECT old_rank, new_rank, changed_by FROM public.event_winner_rank_changes WHERE registration_id = $1`, [row])).rows;
    expect(log).toEqual([{ old_rank: 1, new_rank: null, changed_by: learner }]);
    await drop(row);
  });

  it('the registrant cannot cancel and change anything else in the same statement', async () => {
    const learner = randomUUID();
    const row = await placedRow(learner);
    await actAs(learner);
    expect(
      await sqlstate(`UPDATE public.events_registrations SET status = 'cancelled', payment_status = 'refund' WHERE id = $1`, [row])
    ).toBe('42501');
    await asOwner();
    expect((await snapshot(row)).final_rank).toBe(1);
    await drop(row);
  });

  it('unplaced rows are untouched by the allowlist (fast exit)', async () => {
    await asOwner();
    const row = (await admin.query(`INSERT INTO public.events_registrations (event_id) VALUES ($1) RETURNING id`, [ids.event])).rows[0].id;
    await actAs(ids.outsider);
    expect(await sqlstate(`UPDATE public.events_registrations SET profile_id = $1, custom_data = '{}'::jsonb WHERE id = $2`, [ids.outsider, row])).toBeNull();
    await asOwner();
    await drop(row);
  });
});

describe('review round 8 (#4311): one ACTIVE set of statuses', () => {
  const ACTIVE = ['registered', 'confirmed', 'checked_in', 'pending'];
  async function placedRow(profile: string | null = null) {
    await reset();
    await admin.query(`DELETE FROM public.event_winner_rank_changes`);
    const row = (
      await admin.query(`INSERT INTO public.events_registrations (event_id, profile_id) VALUES ($1, $2) RETURNING id`, [
        ids.event,
        profile,
      ])
    ).rows[0].id;
    await admin.query(`UPDATE public.events_registrations SET final_rank = 2 WHERE id = $1`, [row]);
    await admin.query(`DELETE FROM public.event_winner_rank_changes`);
    return row;
  }
  const state = async (row: string) =>
    (await admin.query(`SELECT status, final_rank FROM public.events_registrations WHERE id = $1`, [row])).rows[0];
  const log = async (row: string) =>
    (
      await admin.query(
        `SELECT old_rank, new_rank, changed_by FROM public.event_winner_rank_changes WHERE registration_id = $1 ORDER BY changed_at, ctid`,
        [row]
      )
    ).rows;
  const drop = (row: string) => admin.query(`DELETE FROM public.events_registrations WHERE id = $1`, [row]);

  it('a manager marks a winner no_show: the place is cleared and logged', async () => {
    const row = await placedRow();
    await actAs(ids.outsider, { 'test.incharge_event': ids.event });
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'no_show' WHERE id = $1`, [row])).toBeNull();
    expect(await state(row)).toEqual({ status: 'no_show', final_rank: null });
    expect(await log(row)).toEqual([{ old_rank: 2, new_rank: null, changed_by: ids.outsider }]);
    await asOwner();
    await drop(row);
  });

  it('a service-role move to waitlisted also clears the place', async () => {
    const row = await placedRow();
    await asOwner();
    await q(`UPDATE public.events_registrations SET status = 'waitlisted' WHERE id = $1`, [row]);
    expect(await state(row)).toEqual({ status: 'waitlisted', final_rank: null });
    expect(await log(row)).toEqual([{ old_rank: 2, new_rank: null, changed_by: null }]);
    await drop(row);
  });

  it('an ops writer without winner authority cannot move a winner out of the set', async () => {
    const row = await placedRow(randomUUID());
    await actAs(ids.outsider);
    for (const status of ['withdrawn', 'no_show', 'waitlisted', 'cancelled', 'disqualified']) {
      expect(await sqlstate(`UPDATE public.events_registrations SET status = '${status}' WHERE id = $1`, [row])).toBe('42501');
    }
    expect(await state(row)).toEqual({ status: 'registered', final_rank: 2 });
    await asOwner();
    await drop(row);
  });

  it('moves within the set (registered / checked_in / confirmed / pending) stay free for an ops writer', async () => {
    const row = await placedRow(randomUUID());
    await actAs(ids.outsider);
    for (const status of ['checked_in', 'confirmed', 'pending', 'registered', 'checked_in']) {
      expect(await sqlstate(`UPDATE public.events_registrations SET status = '${status}' WHERE id = $1`, [row])).toBeNull();
    }
    expect(await state(row)).toEqual({ status: 'checked_in', final_rank: 2 });
    expect(await log(row)).toEqual([]);
    void ACTIVE;
    await asOwner();
    await drop(row);
  });

  it('the registrant may still cancel their own winning row, but not mark it no_show', async () => {
    const learner = randomUUID();
    const row = await placedRow(learner);
    await actAs(learner);
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'no_show' WHERE id = $1`, [row])).toBe('42501');
    expect(await sqlstate(`UPDATE public.events_registrations SET status = 'cancelled' WHERE id = $1`, [row])).toBeNull();
    expect(await state(row)).toEqual({ status: 'cancelled', final_rank: null });
    await asOwner();
    await drop(row);
  });

  it('a no_show row cannot be given a place, even by a manager', async () => {
    await asOwner();
    const row = (
      await admin.query(`INSERT INTO public.events_registrations (event_id, status) VALUES ($1, 'no_show') RETURNING id`, [ids.event])
    ).rows[0].id;
    await actAs(ids.creator);
    expect(
      await sqlstate(`SELECT public.fn_set_event_registration_ranks($1, $2::jsonb)`, [
        ids.event,
        JSON.stringify([{ registration_id: row, final_rank: 1 }]),
      ])
    ).toBe('22023');
    await asOwner();
    await drop(row);
  });
});

describe('review round 9 (#4311): check-before-lock races, two connections', () => {
  /** Act on ANY connection as a signed-in user (the same settings actAs uses). */
  async function userOn(c: Client, uid: string, extra: Record<string, string> = {}) {
    await c.query(`RESET ROLE`);
    for (const k of ['test.super_admin', 'test.admin', 'test.admin_institution', 'test.incharge_event']) {
      await c.query(`SELECT set_config($1, $2, false)`, [k, extra[k] ?? '']);
    }
    await c.query(`SELECT set_config('test.acting_uid', $1, false)`, [uid]);
    await c.query(`SELECT set_config('test.acting_role', 'authenticated', false)`);
    await c.query(`SET ROLE authenticated`);
  }
  async function ownerOn(c: Client) {
    await c.query(`RESET ROLE`);
    await c.query(`SELECT set_config('test.acting_uid', '', false)`);
    await c.query(`SELECT set_config('test.acting_role', '', false)`);
  }
  const code = (p: Promise<unknown>) => p.then(() => null, (e: any) => (e.code as string) ?? 'unknown');
  const place = (c: Client, eventId: string, regId: string, rank: number) =>
    c.query(`SELECT public.fn_set_event_registration_ranks($1, $2::jsonb)`, [
      eventId,
      JSON.stringify([{ registration_id: regId, final_rank: rank }]),
    ]);
  /**
   * Wait until the given backend is actually blocked on a lock (polled every
   * 20 ms from the owner connection, up to 5 s), instead of a fixed sleep.
   */
  async function waitBlocked(pid: number, who: string) {
    const deadline = Date.now() + 5000;
    for (;;) {
      const r = await admin.query(`SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked`, [pid]);
      if (r.rows[0]?.blocked) return;
      if (Date.now() > deadline) throw new Error(`timed out after 5 s waiting for ${who} (pid ${pid}) to block on a lock`);
      await new Promise((res) => setTimeout(res, 20));
    }
  }
  let aPid = 0;
  let bPid = 0;

  async function freshEventWithForm() {
    const ev = (await admin.query(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [ids.creator])).rows[0].id;
    const f = await newForm(ev);
    const row = (
      await admin.query(`INSERT INTO public.events_registrations (event_id, form_id) VALUES ($1, $2) RETURNING id`, [ev, f])
    ).rows[0].id;
    return { ev, f, row };
  }
  const rowNow = async (row: string) =>
    (await admin.query(`SELECT event_id, form_id, final_rank FROM public.events_registrations WHERE id = $1`, [row])).rows[0];

  let b: Client;
  beforeAll(async () => {
    b = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
    await b.connect();
    bPid = (await b.query(`SELECT pg_backend_pid() AS pid`)).rows[0].pid;
    aPid = (await client.query(`SELECT pg_backend_pid() AS pid`)).rows[0].pid;
  });
  afterAll(async () => {
    if (b) await b.end();
  });

  it('(a) a form delete by someone with only the forms policy waits for a placement in flight, then is refused', async () => {
    await asOwner();
    const { ev, f, row } = await freshEventWithForm();
    await actAs(ids.creator);
    await q(`BEGIN`);
    await place(client, ev, row, 1);
    await userOn(b, ids.outsider); // forms policy only, no winner authority
    const del = code(b.query(`DELETE FROM public.event_registration_forms WHERE id = $1`, [f]));
    await waitBlocked(bPid, 'session B');
    await q(`COMMIT`);
    expect(await del).toBe('42501');
    expect(await rowNow(row)).toEqual({ event_id: ev, form_id: f, final_rank: 1 });
    await ownerOn(b);
    await asOwner();
  });

  it('(b) a row moved to another event while a save waits is refused, and nothing is written', async () => {
    await asOwner();
    const { ev, row } = await freshEventWithForm();
    const other = (await admin.query(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [ids.creator])).rows[0].id;
    await q(`BEGIN`);
    await q(`UPDATE public.events_registrations SET event_id = $1 WHERE id = $2`, [other, row]);
    await userOn(b, ids.creator);
    const save = code(place(b, ev, row, 1));
    await waitBlocked(bPid, 'session B');
    await q(`COMMIT`);
    expect(await save).toBe('22023');
    expect(await rowNow(row)).toMatchObject({ event_id: other, final_rank: null });
    await ownerOn(b);
  });

  it('(c) a save and a form delete interleaved never deadlock, in either order, five times each', async () => {
    for (let i = 0; i < 5; i++) {
      // Order 1: the save holds first; the delete (by the creator) waits, then clears the place.
      await asOwner();
      let t = await freshEventWithForm();
      await actAs(ids.creator);
      await q(`BEGIN`);
      await place(client, t.ev, t.row, 1);
      await userOn(b, ids.creator);
      const del = code(b.query(`DELETE FROM public.event_registration_forms WHERE id = $1`, [t.f]));
      await waitBlocked(bPid, 'session B');
      await q(`COMMIT`);
      expect(await del).toBeNull();
      expect(await rowNow(t.row)).toEqual({ event_id: t.ev, form_id: null, final_rank: null });

      // Order 2: the delete holds first; the save waits, then sees the row left its form.
      await asOwner();
      t = await freshEventWithForm();
      await userOn(b, ids.creator);
      await b.query(`BEGIN`);
      await b.query(`DELETE FROM public.event_registration_forms WHERE id = $1`, [t.f]);
      await actAs(ids.creator);
      const save = code(place(client, t.ev, t.row, 1));
      await waitBlocked(aPid, 'session A');
      await b.query(`COMMIT`);
      const outcome = await save;
      expect(outcome).not.toBe('40P01');
      expect(outcome).toBe('22023');
      expect(await rowNow(t.row)).toEqual({ event_id: t.ev, form_id: null, final_rank: null });
    }
    await ownerOn(b);
    await asOwner();
  }, 60_000);
});

