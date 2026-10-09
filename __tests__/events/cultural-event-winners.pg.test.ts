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
CREATE TABLE public.events_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id),
  form_id uuid,
  participant_name text NOT NULL DEFAULT 'Person',
  status text NOT NULL DEFAULT 'registered'
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
GRANT SELECT, INSERT, UPDATE ON public.events_registrations TO authenticated;
GRANT SELECT ON public.events TO authenticated;
`;

function psql(args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

let client: Client;
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

  it('a direct swap inside one transaction passes (the check waits for commit)', async () => {
    await reset();
    await actAs(ids.creator);
    await q(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [ids.regA]);
    await q(`UPDATE public.events_registrations SET final_rank = 2 WHERE id = $1`, [ids.regB]);
    await q(`BEGIN`);
    await q(`UPDATE public.events_registrations SET final_rank = 1 WHERE id = $1`, [ids.regB]);
    await q(`UPDATE public.events_registrations SET final_rank = 2 WHERE id = $1`, [ids.regA]);
    expect(await sqlstate(`COMMIT`)).toBeNull();
    expect(await ranks()).toMatchObject({ [ids.regA]: 2, [ids.regB]: 1 });
  });

  it('two competitions (forms) each keep their own winner', async () => {
    await asOwner();
    const ev = (await q(`INSERT INTO public.events (created_by) VALUES ($1) RETURNING id`, [ids.creator]))[0].id;
    const [f1, f2] = [randomUUID(), randomUUID()];
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
