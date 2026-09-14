/**
 * Seat holding on a full event — behavioural proof for
 * supabase/migrations/20261212100000_event_registration_waitlist_seat_holding.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The migration file is applied VERBATIM with psql. This suite never
 * re-implements the trigger in TypeScript; it seeds rows, runs the exact
 * statements an application (or an attacker with the service key) could run,
 * and reads back what PostgreSQL actually did.
 *
 * THE ATTACK IT EXISTS TO REFUSE
 * ------------------------------
 * PR #3714's last review found that its trigger refused an offered → registered
 * transition only when the claim code was left UNCHANGED, so a statement that
 * simply NULLED the code passed without ever matching it — and its own
 * clean-up helper did exactly that. Every statement in the "attack" block below
 * is a way of leaving 'offered' without presenting the code. Each must be
 * refused with 42501 and leave the row untouched.
 *
 * REQUIRES a local PostgreSQL 16 with pgcrypto (Homebrew's postgresql@16 has
 * it). It is NOT run by CI — every `vitest run` in this repo names explicit
 * paths — and it is deliberately loud rather than skipped when no server is
 * reachable, following __tests__/organizations/institution-leadership-posts.test.ts.
 *
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/events/event-waitlist-seat-holding.pg.test.ts
 *
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
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20261212100000_event_registration_waitlist_seat_holding.sql'
);

const PGHOST = process.env.WAITLIST_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.WAITLIST_TEST_PGPORT ?? '5432';
const PGUSER = process.env.WAITLIST_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const DBNAME = `myjkkn_waitlist_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

/**
 * Production shapes reduced to the columns the migration touches, plus the
 * roles, schemas and helper functions it references. The authority helpers
 * answer from a session setting so the RLS policy can be exercised as a real
 * signed-in person rather than stubbed open.
 */
const FIXTURE = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.acting_uid', true), '')::uuid;
$$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Event',
  status text NOT NULL DEFAULT 'published',
  cap_behavior text NOT NULL DEFAULT 'waitlist',
  max_registrations integer,
  registration_close_date timestamptz,
  institution_id uuid,
  created_by uuid
);
CREATE TABLE public.event_registration_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id)
);
CREATE TABLE public.events_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id),
  form_id uuid,
  profile_id uuid,
  status text NOT NULL DEFAULT 'registered',
  source text NOT NULL DEFAULT 'event_self'
);

-- Authority helpers, answering from the acting profile.
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

GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;
GRANT SELECT ON public.events, public.events_registrations, public.profiles TO authenticated;
`;

function psql(args: string[], input?: string) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

let client: Client;
let tmp: string;

const ids = {
  event: '',
  form: '',
  regA: '',
  regB: '',
  personA: '',
  personB: '',
  personC: '',
  personD: '',
  personE: '',
};

async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await client.query(sql, params);
  return r.rows as T[];
}

async function row(profileId: string) {
  const rows = await q(
    `SELECT id, status, claim_code, claim_code_presented, registration_id, offered_at, offer_expires_at
       FROM public.event_registration_waitlist
      WHERE event_id = $1 AND profile_id = $2
      ORDER BY queue_seq`,
    [ids.event, profileId]
  );
  return rows[0];
}

async function taken() {
  const r = await q(`SELECT public.fn_event_waitlist_taken($1) AS n`, [ids.event]);
  return r[0].n as number;
}

/** Run a statement and return its SQLSTATE, or null when it succeeded. */
async function sqlstate(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await client.query(sql, params);
    return null;
  } catch (e: any) {
    return e.code ?? 'unknown';
  }
}

/**
 * Move an offer's deadline into the past WITHOUT going through the guard,
 * which correctly refuses to alter a live offer's deadline. Superuser-only and
 * test-only: session_replication_role = replica silences user triggers for the
 * statement. This is the one place the suite goes around the trigger, and it
 * does so to simulate 48 hours passing, not to change what the trigger allows.
 */
async function lapse(waitlistId: string) {
  await client.query(`SET session_replication_role = replica`);
  try {
    await client.query(
      `UPDATE public.event_registration_waitlist
          SET offer_expires_at = now() - interval '1 minute'
        WHERE id = $1`,
      [waitlistId]
    );
  } finally {
    await client.query(`SET session_replication_role = origin`);
  }
}

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e: any) {
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}.\n` +
        `This suite applies the real migration file and proves behaviour against a\n` +
        `throwaway database; it will not pretend to pass without one.\n` +
        `  brew services start postgresql@16\n\n` +
        String(e?.stderr || e?.message || e)
    );
  }

  tmp = mkdtempSync(path.join(tmpdir(), 'waitlist-'));
  const fixturePath = path.join(tmp, 'fixture.sql');
  writeFileSync(fixturePath, FIXTURE);

  psql(['-d', DBNAME, '-f', fixturePath]);
  // Verbatim. The migration's own DO $assert$ block runs here too — a grant
  // that did not take fails the suite at this line, before any test runs.
  psql(['-d', DBNAME, '-f', MIGRATION]);

  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();

  // Five people; a two-place event; A and B registered; C, D, E queue in that order.
  for (const k of ['personA', 'personB', 'personC', 'personD', 'personE'] as const) {
    ids[k] = (await q(`INSERT INTO public.profiles (id) VALUES (gen_random_uuid()) RETURNING id`))[0].id;
  }
  ids.event = (
    await q(`INSERT INTO public.events (max_registrations, cap_behavior) VALUES (2, 'waitlist') RETURNING id`)
  )[0].id;
  ids.form = (
    await q(`INSERT INTO public.event_registration_forms (event_id) VALUES ($1) RETURNING id`, [ids.event])
  )[0].id;
  ids.regA = (
    await q(
      `INSERT INTO public.events_registrations (event_id, form_id, profile_id) VALUES ($1, $2, $3) RETURNING id`,
      [ids.event, ids.form, ids.personA]
    )
  )[0].id;
  ids.regB = (
    await q(
      `INSERT INTO public.events_registrations (event_id, form_id, profile_id) VALUES ($1, $2, $3) RETURNING id`,
      [ids.event, ids.form, ids.personB]
    )
  )[0].id;
  for (const p of [ids.personC, ids.personD, ids.personE]) {
    await q(
      `INSERT INTO public.event_registration_waitlist (event_id, form_id, participant_name, profile_id)
       VALUES ($1, $2, 'Person', $3)`,
      [ids.event, ids.form, p]
    );
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

describe('the table only holds signed-in people, born waiting', () => {
  it('assigns join order 1, 2, 3 and refuses a row with no account', async () => {
    const seqs = await q(
      `SELECT queue_seq FROM public.event_registration_waitlist WHERE event_id = $1 ORDER BY queue_seq`,
      [ids.event]
    );
    expect(seqs.map((r) => r.queue_seq)).toEqual([1, 2, 3]);

    expect(
      await sqlstate(
        `INSERT INTO public.event_registration_waitlist (event_id, participant_name, profile_id) VALUES ($1, 'Ghost', NULL)`,
        [ids.event]
      )
    ).toBe('23502');
  });

  it('refuses a row inserted directly as offered, and one person cannot hold two open rows on one form', async () => {
    expect(
      await sqlstate(
        `INSERT INTO public.event_registration_waitlist (event_id, form_id, participant_name, profile_id, status)
         VALUES ($1, $2, 'Jumper', $3, 'offered')`,
        [ids.event, ids.form, ids.personA]
      )
    ).toBe('42501');

    expect(
      await sqlstate(
        `INSERT INTO public.event_registration_waitlist (event_id, form_id, participant_name, profile_id)
         VALUES ($1, $2, 'Again', $3)`,
        [ids.event, ids.form, ids.personC]
      )
    ).toBe('23505');
  });
});

describe('a freed place is offered to the head of the queue, and held', () => {
  it('cancelling A promotes C only, mints a code, sets a 48h deadline, and the place counts as taken', async () => {
    expect(await taken()).toBe(2);

    await q(`UPDATE public.events_registrations SET status = 'cancelled' WHERE id = $1`, [ids.regA]);

    const c = await row(ids.personC);
    const d = await row(ids.personD);
    expect(c.status).toBe('offered');
    expect(d.status).toBe('waiting');
    expect(c.claim_code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
    expect(c.claim_code_presented).toBeNull();
    expect(c.registration_id).toBeNull();

    const hours = await q(
      `SELECT EXTRACT(EPOCH FROM (offer_expires_at - offered_at)) / 3600 AS h
         FROM public.event_registration_waitlist WHERE id = $1`,
      [c.id]
    );
    expect(Number(hours[0].h)).toBeCloseTo(48, 3);

    // One registration left (B) plus one held place (C's offer) = 2 = full.
    expect(await taken()).toBe(2);
  });
});

describe('THE ATTACK: leaving offered without presenting the code is refused', () => {
  it('a statement that nulls the code and flips to registered is refused, and the row is untouched', async () => {
    const before = await row(ids.personC);
    // Exactly what #3714's closeOpenRowsFor did: match the row some other way,
    // set registered + registration_id, null the code, never present it.
    expect(
      await sqlstate(
        `UPDATE public.event_registration_waitlist
            SET status = 'registered', registration_id = $2, claim_code = NULL
          WHERE id = $1 AND status IN ('waiting', 'offered')`,
        [before.id, ids.regB]
      )
    ).toBe('42501');

    const after = await row(ids.personC);
    expect(after.status).toBe('offered');
    expect(after.claim_code).toBe(before.claim_code);
    expect(after.registration_id).toBeNull();
  });

  it('a statement that leaves the code unchanged is refused', async () => {
    const c = await row(ids.personC);
    expect(
      await sqlstate(
        `UPDATE public.event_registration_waitlist
            SET status = 'registered', registration_id = $2
          WHERE id = $1`,
        [c.id, ids.regB]
      )
    ).toBe('42501');
    expect((await row(ids.personC)).status).toBe('offered');
  });

  it('a statement that presents the WRONG code is refused', async () => {
    const c = await row(ids.personC);
    expect(
      await sqlstate(
        `UPDATE public.event_registration_waitlist
            SET status = 'registered', registration_id = $2, claim_code_presented = 'ZZZZZZ'
          WHERE id = $1`,
        [c.id, ids.regB]
      )
    ).toBe('42501');
    expect((await row(ids.personC)).status).toBe('offered');
  });

  it('the code of an outstanding offer cannot be nulled, changed or re-minted in place', async () => {
    const c = await row(ids.personC);
    expect(
      await sqlstate(`UPDATE public.event_registration_waitlist SET claim_code = NULL WHERE id = $1`, [c.id])
    ).toBe('42501');
    expect(
      await sqlstate(`UPDATE public.event_registration_waitlist SET claim_code = 'ABCDEF' WHERE id = $1`, [c.id])
    ).toBe('42501');
    expect(
      await sqlstate(
        `UPDATE public.event_registration_waitlist SET offer_expires_at = now() + interval '10 days' WHERE id = $1`,
        [c.id]
      )
    ).toBe('42501');
    expect((await row(ids.personC)).claim_code).toBe(c.claim_code);
  });

  it('an offered row cannot be sent back to waiting or expired early', async () => {
    const c = await row(ids.personC);
    expect(
      await sqlstate(`UPDATE public.event_registration_waitlist SET status = 'waiting' WHERE id = $1`, [c.id])
    ).toBe('42501');
    expect(
      await sqlstate(`UPDATE public.event_registration_waitlist SET status = 'expired' WHERE id = $1`, [c.id])
    ).toBe('42501');
    expect((await row(ids.personC)).status).toBe('offered');
  });

  it('a claim that presents the right code but names no registration is refused', async () => {
    const c = await row(ids.personC);
    expect(
      await sqlstate(
        `UPDATE public.event_registration_waitlist
            SET status = 'registered', claim_code_presented = $2
          WHERE id = $1`,
        [c.id, c.claim_code]
      )
    ).toBe('42501');
    expect((await row(ids.personC)).status).toBe('offered');
  });
});

describe('THE CLAIM: presenting the matching code takes the place up, once', () => {
  let regC = '';

  it('the compare-and-swap with the right code succeeds and consumes the code', async () => {
    const c = await row(ids.personC);
    regC = (
      await q(
        `INSERT INTO public.events_registrations (event_id, form_id, profile_id) VALUES ($1, $2, $3) RETURNING id`,
        [ids.event, ids.form, ids.personC]
      )
    )[0].id;

    // Exactly the statement claimOffer() in waitlist-service.ts issues.
    const r = await client.query(
      `UPDATE public.event_registration_waitlist
          SET status = 'registered', registration_id = $3, claim_code_presented = $2
        WHERE id = $1 AND status = 'offered' AND offer_expires_at > now()
        RETURNING id`,
      [c.id, c.claim_code, regC]
    );
    expect(r.rowCount).toBe(1);

    const after = await row(ids.personC);
    expect(after.status).toBe('registered');
    expect(after.claim_code).toBeNull();
    expect(after.claim_code_presented).toBeNull();
    expect(after.registration_id).toBe(regC);

    // The held place became a registration: still 2 of 2, not 3.
    expect(await taken()).toBe(2);
  });

  it('a second claim with the same code matches nothing, and forcing it changes nothing', async () => {
    const c = await row(ids.personC);
    const r = await client.query(
      `UPDATE public.event_registration_waitlist
          SET status = 'registered', registration_id = $3, claim_code_presented = $2
        WHERE id = $1 AND status = 'offered' AND offer_expires_at > now()
        RETURNING id`,
      [c.id, 'ANYTHI', regC]
    );
    expect(r.rowCount).toBe(0);

    // Even without the status predicate the row is final: it cannot be
    // re-pointed at another registration, and it cannot leave 'registered'.
    expect(
      await sqlstate(
        `UPDATE public.event_registration_waitlist SET registration_id = $2 WHERE id = $1`,
        [c.id, ids.regB]
      )
    ).toBe('42501');
    expect(
      await sqlstate(`UPDATE public.event_registration_waitlist SET status = 'offered' WHERE id = $1`, [c.id])
    ).toBe('42501');
    expect((await row(ids.personC)).registration_id).toBe(regC);
  });

  it('deleting the registration nulls the back-reference (FK) without tripping the guard, and re-settles', async () => {
    // D is still waiting. Deleting C's registration frees a place → D offered.
    await q(`DELETE FROM public.events_registrations WHERE id = $1`, [regC]);
    const c = await row(ids.personC);
    expect(c.status).toBe('registered');
    expect(c.registration_id).toBeNull();

    const d = await row(ids.personD);
    expect(d.status).toBe('offered');
    expect(d.claim_code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
    expect((await row(ids.personE)).status).toBe('waiting');
    expect(await taken()).toBe(2);
  });
});

describe('CONCURRENCY: two claimants for one held place — exactly one wins', () => {
  it('two connections race the same offer with the right code; one row updates, the other zero', async () => {
    const d = await row(ids.personD);
    const regD1 = (
      await q(
        `INSERT INTO public.events_registrations (event_id, form_id, profile_id) VALUES ($1, $2, $3) RETURNING id`,
        [ids.event, ids.form, ids.personD]
      )
    )[0].id;
    const regD2 = (
      await q(
        `INSERT INTO public.events_registrations (event_id, form_id, profile_id, source) VALUES ($1, $2, $3, 'desk') RETURNING id`,
        [ids.event, ids.form, ids.personD]
      )
    )[0].id;

    const one = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
    const two = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
    await one.connect();
    await two.connect();
    try {
      const claim = `UPDATE public.event_registration_waitlist
                        SET status = 'registered', registration_id = $3, claim_code_presented = $2
                      WHERE id = $1 AND status = 'offered' AND offer_expires_at > now()
                      RETURNING id`;

      await one.query('BEGIN');
      const first = await one.query(claim, [d.id, d.claim_code, regD1]);
      expect(first.rowCount).toBe(1);

      // The second claimant blocks on the row lock until the first commits,
      // then re-evaluates the WHERE against the committed row and finds it no
      // longer 'offered'.
      const secondPending = two.query(claim, [d.id, d.claim_code, regD2]);
      await new Promise((r) => setTimeout(r, 150));
      await one.query('COMMIT');
      const second = await secondPending;
      expect(second.rowCount).toBe(0);

      const after = await row(ids.personD);
      expect(after.status).toBe('registered');
      expect(after.registration_id).toBe(regD1);
      expect(after.claim_code).toBeNull();
    } finally {
      await one.end();
      await two.end();
    }
    // Tidy the loser's registration so capacity is honest for the next block.
    await q(`DELETE FROM public.events_registrations WHERE id = $1`, [regD2]);
  });
});

describe('THE HOLD LAPSES: an unclaimed offer expires and the place moves on', () => {
  it('after 48h a late claim is refused, the place stops counting, and settle offers it to the next person', async () => {
    // Free a place so E (the last waiter) is offered it.
    await q(`UPDATE public.events_registrations SET status = 'cancelled' WHERE id = $1`, [ids.regB]);
    const e = await row(ids.personE);
    expect(e.status).toBe('offered');
    expect(await taken()).toBe(2);

    await lapse(e.id);

    // The route's CAS filters on the deadline and finds nothing.
    const cas = await client.query(
      `UPDATE public.event_registration_waitlist
          SET status = 'registered', registration_id = $3, claim_code_presented = $2
        WHERE id = $1 AND status = 'offered' AND offer_expires_at > now()
        RETURNING id`,
      [e.id, e.claim_code, ids.regA]
    );
    expect(cas.rowCount).toBe(0);
    // And a claim that ignores the deadline is refused by the trigger itself.
    expect(
      await sqlstate(
        `UPDATE public.event_registration_waitlist
            SET status = 'registered', registration_id = $3, claim_code_presented = $2
          WHERE id = $1`,
        [e.id, e.claim_code, ids.regA]
      )
    ).toBe('42501');

    // A lapsed hold holds nothing, even before the sweep.
    expect(await taken()).toBe(1);

    // Put somebody new in the queue, then settle: E lapses, the newcomer is offered.
    const personF = (await q(`INSERT INTO public.profiles (id) VALUES (gen_random_uuid()) RETURNING id`))[0].id;
    await q(
      `INSERT INTO public.event_registration_waitlist (event_id, form_id, participant_name, profile_id)
       VALUES ($1, $2, 'Person F', $3)`,
      [ids.event, ids.form, personF]
    );
    const settled = await q(`SELECT * FROM public.fn_event_waitlist_settle($1)`, [ids.event]);
    expect(settled[0]).toEqual({ expired_count: 1, offered_count: 1 });

    const eAfter = await row(ids.personE);
    expect(eAfter.status).toBe('expired');
    expect(eAfter.claim_code).toBeNull();
    expect((await row(personF)).status).toBe('offered');
    expect(await taken()).toBe(2);

    // Expired is final.
    expect(
      await sqlstate(`UPDATE public.event_registration_waitlist SET status = 'waiting' WHERE id = $1`, [e.id])
    ).toBe('42501');
  });

  it('settle is idempotent and offers nothing on a cancelled event or past the close date', async () => {
    const again = await q(`SELECT * FROM public.fn_event_waitlist_settle($1)`, [ids.event]);
    expect(again[0]).toEqual({ expired_count: 0, offered_count: 0 });

    // A fresh event, full, one waiter, then cancelled: freeing a place offers nobody.
    const ev2 = (
      await q(`INSERT INTO public.events (max_registrations, cap_behavior) VALUES (1, 'waitlist') RETURNING id`)
    )[0].id;
    const reg = (
      await q(`INSERT INTO public.events_registrations (event_id, profile_id) VALUES ($1, $2) RETURNING id`, [
        ev2,
        ids.personA,
      ])
    )[0].id;
    await q(
      `INSERT INTO public.event_registration_waitlist (event_id, participant_name, profile_id) VALUES ($1, 'W', $2)`,
      [ev2, ids.personB]
    );
    await q(`UPDATE public.events SET status = 'cancelled' WHERE id = $1`, [ev2]);
    await q(`UPDATE public.events_registrations SET status = 'cancelled' WHERE id = $1`, [reg]);
    const w = await q(`SELECT status FROM public.event_registration_waitlist WHERE event_id = $1`, [ev2]);
    expect(w[0].status).toBe('waiting');

    // Same shape, live event but window shut.
    const ev3 = (
      await q(
        `INSERT INTO public.events (max_registrations, cap_behavior, registration_close_date)
         VALUES (1, 'waitlist', now() - interval '1 day') RETURNING id`
      )
    )[0].id;
    const reg3 = (
      await q(`INSERT INTO public.events_registrations (event_id, profile_id) VALUES ($1, $2) RETURNING id`, [
        ev3,
        ids.personA,
      ])
    )[0].id;
    await q(
      `INSERT INTO public.event_registration_waitlist (event_id, participant_name, profile_id) VALUES ($1, 'W', $2)`,
      [ev3, ids.personB]
    );
    await q(`DELETE FROM public.events_registrations WHERE id = $1`, [reg3]);
    const w3 = await q(`SELECT status FROM public.event_registration_waitlist WHERE event_id = $1`, [ev3]);
    expect(w3[0].status).toBe('waiting');
  });
});

describe('registering through the ordinary door closes a waiting row', () => {
  it('waiting → registered needs the registration it became, and a waiting row cannot expire', async () => {
    const ev = (
      await q(`INSERT INTO public.events (max_registrations, cap_behavior) VALUES (5, 'waitlist') RETURNING id`)
    )[0].id;
    const w = (
      await q(
        `INSERT INTO public.event_registration_waitlist (event_id, participant_name, profile_id) VALUES ($1, 'W', $2) RETURNING id`,
        [ev, ids.personA]
      )
    )[0].id;

    expect(
      await sqlstate(`UPDATE public.event_registration_waitlist SET status = 'registered' WHERE id = $1`, [w])
    ).toBe('42501');
    expect(
      await sqlstate(`UPDATE public.event_registration_waitlist SET status = 'expired' WHERE id = $1`, [w])
    ).toBe('42501');

    const reg = (
      await q(`INSERT INTO public.events_registrations (event_id, profile_id) VALUES ($1, $2) RETURNING id`, [
        ev,
        ids.personA,
      ])
    )[0].id;
    // Exactly the statement closeWaitingRowsFor() issues: waiting rows only.
    const r = await client.query(
      `UPDATE public.event_registration_waitlist
          SET status = 'registered', registration_id = $2
        WHERE id = $1 AND status = 'waiting'
        RETURNING id`,
      [w, reg]
    );
    expect(r.rowCount).toBe(1);
  });
});

describe('who may read the queue', () => {
  async function asRole(role: 'authenticated' | 'anon', settings: Record<string, string>, sql: string) {
    const c = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
    await c.connect();
    try {
      for (const [k, v] of Object.entries(settings)) {
        await c.query(`SELECT set_config($1, $2, false)`, [k, v]);
      }
      await c.query(`SET ROLE ${role}`);
      try {
        const r = await c.query(sql, [ids.event]);
        return { rows: r.rows, code: null as string | null };
      } catch (e: any) {
        return { rows: [] as any[], code: e.code as string };
      }
    } finally {
      await c.end();
    }
  }

  const SELECT = `SELECT profile_id FROM public.event_registration_waitlist WHERE event_id = $1`;

  it('a signed-in person sees only their own row; a stranger sees nothing; anon is refused outright', async () => {
    const mine = await asRole('authenticated', { 'test.acting_uid': ids.personC }, SELECT);
    expect(mine.code).toBeNull();
    expect(mine.rows.map((r) => r.profile_id)).toEqual([ids.personC]);

    const stranger = await asRole('authenticated', { 'test.acting_uid': randomUUID() }, SELECT);
    expect(stranger.rows).toEqual([]);

    const anon = await asRole('anon', {}, SELECT);
    expect(anon.code).toBe('42501');
  });

  it('the event creator, the in-charge and a same-institution admin see the whole queue; another college\'s admin does not', async () => {
    const creator = randomUUID();
    await q(`INSERT INTO public.profiles (id) VALUES ($1)`, [creator]);
    const inst = randomUUID();
    await q(`UPDATE public.events SET created_by = $2, institution_id = $3 WHERE id = $1`, [ids.event, creator, inst]);

    const total = (await q(`SELECT COUNT(*)::int AS n FROM public.event_registration_waitlist WHERE event_id = $1`, [ids.event]))[0].n;
    expect(total).toBeGreaterThan(1);

    const asCreator = await asRole('authenticated', { 'test.acting_uid': creator }, SELECT);
    expect(asCreator.rows.length).toBe(total);

    const asIncharge = await asRole(
      'authenticated',
      { 'test.acting_uid': randomUUID(), 'test.incharge_event': ids.event },
      SELECT
    );
    expect(asIncharge.rows.length).toBe(total);

    const sameCollegeAdmin = await asRole(
      'authenticated',
      { 'test.acting_uid': randomUUID(), 'test.admin': 'yes', 'test.admin_institution': inst },
      SELECT
    );
    expect(sameCollegeAdmin.rows.length).toBe(total);

    const otherCollegeAdmin = await asRole(
      'authenticated',
      { 'test.acting_uid': randomUUID(), 'test.admin': 'yes', 'test.admin_institution': randomUUID() },
      SELECT
    );
    expect(otherCollegeAdmin.rows).toEqual([]);
  });

  it('a signed-in person cannot write the table or call settle/taken; service_role can write but not delete', async () => {
    const w = await asRole(
      'authenticated',
      { 'test.acting_uid': ids.personC },
      `UPDATE public.event_registration_waitlist SET participant_name = 'x' WHERE event_id = $1`
    );
    expect(w.code).toBe('42501');
    const s = await asRole('authenticated', { 'test.acting_uid': ids.personC }, `SELECT * FROM public.fn_event_waitlist_settle($1)`);
    expect(s.code).toBe('42501');
    const t = await asRole('authenticated', { 'test.acting_uid': ids.personC }, `SELECT public.fn_event_waitlist_taken($1)`);
    expect(t.code).toBe('42501');

    const privs = await q(`
      SELECT has_table_privilege('service_role', 'public.event_registration_waitlist', 'INSERT') AS ins,
             has_table_privilege('service_role', 'public.event_registration_waitlist', 'UPDATE') AS upd,
             has_table_privilege('service_role', 'public.event_registration_waitlist', 'DELETE') AS del,
             has_table_privilege('authenticated', 'public.event_registration_waitlist', 'INSERT') AS a_ins,
             has_table_privilege('anon', 'public.event_registration_waitlist', 'SELECT') AS anon_sel`);
    expect(privs[0]).toEqual({ ins: true, upd: true, del: false, a_ins: false, anon_sel: false });
  });
});
