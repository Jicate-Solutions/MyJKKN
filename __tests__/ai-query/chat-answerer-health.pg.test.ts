/**
 * Which computer is answering the AI Assistant — behavioural proof for
 * supabase/migrations/20270306090000_ai_chat_answerer_health.sql
 *
 * The migration is applied VERBATIM to a throwaway PostgreSQL database and
 * fn_ai_chat_drain_health() is then asked about every heartbeat combination.
 * Nothing here re-implements the CASE in TypeScript: the answer is whatever
 * PostgreSQL returns.
 *
 * Also proved: the Mac heartbeat row is seeded (and forced) managed = false so
 * the cloud dispatcher can never stamp a false heartbeat on it, and the Mac's
 * per-cycle stamps are kept out of ai_routine_run_log — with a CONTROL row
 * ('maxlane:some-routine') showing the trigger still logs everything else, so
 * "nothing was logged" cannot pass merely because the trigger never fires.
 *
 * REQUIRES a PostgreSQL (CI's postgres:16 service container; locally
 * `brew services start postgresql@16`). Loud, never skipped, when absent.
 * Override with ANSWERER_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270306090000_ai_chat_answerer_health.sql');

const PGHOST = process.env.ANSWERER_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.ANSWERER_TEST_PGPORT ?? 5432);
// CI's service container has a `postgres` superuser; $USER there is `runner`.
const PGUSER =
  process.env.ANSWERER_TEST_PGUSER ??
  (process.env.CI ? 'postgres' : (process.env.USER ?? 'postgres'));
const PGPASSWORD = process.env.ANSWERER_TEST_PGPASSWORD;
const DBNAME = `answerer_health_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const WIN = 'maxlane:chat-drain';
const MAC = 'maxlane:chat-standby-mac';

/** Production shapes, reduced to the columns the migration touches. */
const FIXTURE = `
DO $$ BEGIN
  BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
END $$;

CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.super_admin', true), '') = 'yes';
$$;

-- 20260701210000 + 20260713000200 + 20260801150000 column set.
CREATE TABLE public.ai_routine_schedules (
  routine_id      text PRIMARY KEY,
  enabled         boolean NOT NULL DEFAULT true,
  days_of_week    smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  minute_of_day   smallint NOT NULL DEFAULT 0,
  managed         boolean NOT NULL DEFAULT true,
  last_fired_slot text,
  last_fired_at   timestamptz,
  last_status     text,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  max_only        boolean NOT NULL DEFAULT false,
  launch_id       text
);

-- 20260714003000 run log + the trigger that calls fn_log_maxlane_routine_run.
CREATE TABLE public.ai_routine_run_log (
  id        bigserial PRIMARY KEY,
  routine_id text NOT NULL,
  lane      text NOT NULL,
  fired_at  timestamptz NOT NULL DEFAULT now(),
  status    text
);
CREATE FUNCTION public.fn_log_maxlane_routine_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RETURN NEW; END; $$;
CREATE TRIGGER trg_log_maxlane_routine_run
  AFTER UPDATE OF last_fired_at ON public.ai_routine_schedules
  FOR EACH ROW
  WHEN (NEW.routine_id LIKE 'maxlane:%')
  EXECUTE FUNCTION public.fn_log_maxlane_routine_run();
`;

function config(database: string) {
  return { host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database };
}

let admin: Client;
let db: Client;

async function health(): Promise<Record<string, unknown>> {
  await db.query(`SELECT set_config('test.super_admin', 'yes', false)`);
  const r = await db.query('SELECT public.fn_ai_chat_drain_health() AS h');
  return r.rows[0].h;
}

/** Set a heartbeat: minutes ago, or null = row exists but never stamped. */
async function stamp(routineId: string, minutesAgo: number | null) {
  await db.query(
    `INSERT INTO public.ai_routine_schedules (routine_id, managed, last_fired_at)
     VALUES ($1, false, CASE WHEN $2::int IS NULL THEN NULL ELSE now() - make_interval(mins => $2::int) END)
     ON CONFLICT (routine_id) DO UPDATE SET last_fired_at = EXCLUDED.last_fired_at`,
    [routineId, minutesAgo],
  );
}

beforeAll(async () => {
  admin = new Client(config('postgres'));
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(
      `No PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER} — start one (brew services start postgresql@16). ` +
        `This suite is loud, not skipped. ${(e as Error).message}`,
    );
  }
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  db = new Client(config(DBNAME));
  await db.connect();
  await db.query(FIXTURE);
  await db.query(readFileSync(MIGRATION, 'utf8'));
});

afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME}`);
    await admin.end();
  }
});

beforeEach(async () => {
  await db.query(`DELETE FROM public.ai_routine_schedules WHERE routine_id IN ($1, $2)`, [WIN, MAC]);
  await db.query(`DELETE FROM public.ai_routine_run_log`);
});

describe('fn_ai_chat_drain_health — every heartbeat combination', () => {
  it('refuses anyone who is not a super-admin', async () => {
    await db.query(`SELECT set_config('test.super_admin', 'no', false)`);
    await expect(db.query('SELECT public.fn_ai_chat_drain_health()')).rejects.toThrow(/not authorized/);
  });

  it('neither row exists → unknown, every field NULL (banner inert)', async () => {
    expect(await health()).toEqual({
      online: null,
      last_seen: null,
      standby_online: null,
      standby_last_seen: null,
      serving: 'unknown',
    });
  });

  it('both rows exist but neither ever stamped → still unknown', async () => {
    await stamp(WIN, null);
    await stamp(MAC, null);
    const h = await health();
    expect(h.serving).toBe('unknown');
    expect(h.online).toBeNull();
    expect(h.standby_online).toBeNull();
  });

  it('Windows fresh → windows (Mac never stamped)', async () => {
    await stamp(WIN, 1);
    const h = await health();
    expect(h.serving).toBe('windows');
    expect(h.online).toBe(true);
    expect(h.standby_online).toBeNull();
  });

  it('Windows fresh AND Mac fresh → windows wins', async () => {
    await stamp(WIN, 1);
    await stamp(MAC, 1);
    const h = await health();
    expect(h.serving).toBe('windows');
    expect(h.standby_online).toBe(true);
  });

  it('Windows stale, Mac fresh → mac_standby; online keeps meaning Windows (false)', async () => {
    await stamp(WIN, 20);
    await stamp(MAC, 1);
    const h = await health();
    expect(h.serving).toBe('mac_standby');
    expect(h.online).toBe(false);
    expect(h.last_seen).not.toBeNull();
    expect(h.standby_online).toBe(true);
    expect(h.standby_last_seen).not.toBeNull();
  });

  it('Windows never stamped, Mac fresh → mac_standby with online NULL', async () => {
    await stamp(MAC, 1);
    const h = await health();
    expect(h.serving).toBe('mac_standby');
    expect(h.online).toBeNull();
  });

  it('both stale → none', async () => {
    await stamp(WIN, 20);
    await stamp(MAC, 20);
    const h = await health();
    expect(h.serving).toBe('none');
    expect(h.online).toBe(false);
    expect(h.standby_online).toBe(false);
  });

  it('Windows stale, Mac never stamped → none', async () => {
    await stamp(WIN, 20);
    const h = await health();
    expect(h.serving).toBe('none');
    expect(h.standby_online).toBeNull();
  });

  it('Windows never stamped, Mac stale → none', async () => {
    await stamp(MAC, 20);
    const h = await health();
    expect(h.serving).toBe('none');
    expect(h.online).toBeNull();
    expect(h.standby_online).toBe(false);
  });

  it('the 3-minute edge: 2 min is fresh, 4 min is stale', async () => {
    await stamp(WIN, 2);
    expect((await health()).online).toBe(true);
    await stamp(WIN, 4);
    expect((await health()).online).toBe(false);
  });
});

describe('grants', () => {
  it('anon cannot execute; authenticated can', async () => {
    const r = await db.query(
      `SELECT has_function_privilege('anon', 'public.fn_ai_chat_drain_health()', 'EXECUTE') AS anon_x,
              has_function_privilege('authenticated', 'public.fn_ai_chat_drain_health()', 'EXECUTE') AS auth_x,
              has_function_privilege('anon', 'public.fn_log_maxlane_routine_run()', 'EXECUTE') AS anon_trg`,
    );
    expect(r.rows[0]).toEqual({ anon_x: false, auth_x: true, anon_trg: false });
  });
});

describe('Mac heartbeat row is never dispatcher-managed', () => {
  it('a row the Mac created with the column defaults (managed=true) is flipped to false, heartbeat untouched', async () => {
    await db.query(
      `INSERT INTO public.ai_routine_schedules (routine_id, last_fired_at) VALUES ($1, now() - interval '5 minutes')`,
      [MAC],
    );
    const before = await db.query(`SELECT managed, last_fired_at FROM public.ai_routine_schedules WHERE routine_id = $1`, [MAC]);
    expect(before.rows[0].managed).toBe(true); // the control: defaults really are managed=true
    await db.query(readFileSync(MIGRATION, 'utf8')); // re-apply = the operator applying it at merge
    const after = await db.query(`SELECT managed, last_fired_at FROM public.ai_routine_schedules WHERE routine_id = $1`, [MAC]);
    expect(after.rows[0].managed).toBe(false);
    expect(after.rows[0].last_fired_at).toEqual(before.rows[0].last_fired_at);
  });

  it('on a database with no row, the seed creates one with managed=false and NO heartbeat', async () => {
    await db.query(readFileSync(MIGRATION, 'utf8'));
    const r = await db.query(`SELECT managed, last_fired_at FROM public.ai_routine_schedules WHERE routine_id = $1`, [MAC]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].managed).toBe(false);
    expect(r.rows[0].last_fired_at).toBeNull();
    expect((await health()).serving).toBe('unknown');
  });
});

describe('run log: the Mac stamps are not logged, other max-lane routines still are', () => {
  it('Mac stamp → no log row; control routine stamp → one log row', async () => {
    await stamp(MAC, null);
    await db.query(`INSERT INTO public.ai_routine_schedules (routine_id, managed) VALUES ('maxlane:some-routine', false)
                    ON CONFLICT (routine_id) DO NOTHING`);
    await db.query(`UPDATE public.ai_routine_schedules SET last_fired_at = now() WHERE routine_id = $1`, [MAC]);
    await db.query(`UPDATE public.ai_routine_schedules SET last_fired_at = now() WHERE routine_id = 'maxlane:some-routine'`);
    const r = await db.query(`SELECT routine_id FROM public.ai_routine_run_log ORDER BY id`);
    expect(r.rows.map((x) => x.routine_id)).toEqual(['maxlane:some-routine']);
  });
});
