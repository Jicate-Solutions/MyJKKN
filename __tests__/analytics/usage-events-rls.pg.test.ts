/**
 * usage_events RLS hardening — behavioural proof for
 * supabase/migrations/20271010094500_usage_events_rls_hardening.sql
 *
 * Two throwaway databases are built from the same fixture:
 *   BASELINE  — the policy set and grants that were LIVE on 10 Oct 2027
 *               (read-only by the Bugs desk), written out verbatim below.
 *   HARDENED  — BASELINE + the migration file applied VERBATIM with psql
 *               (its own DO self-check runs there too).
 * The "baseline" block proves the holes are real (anon insert and a forged
 * user_id are ACCEPTED, a plain user reads the whole institution); the
 * "hardened" block proves the migration closes them without breaking the
 * legitimate paths.
 *
 * REQUIRES a local PostgreSQL (brew services start postgresql@16); loud, never
 * skipped, when none is reachable. Override with USAGE_EVENTS_TEST_PGHOST /
 * _PGPORT / _PGUSER.
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
  'supabase/migrations/20271010094500_usage_events_rls_hardening.sql'
);

const PGHOST = process.env.USAGE_EVENTS_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.USAGE_EVENTS_TEST_PGPORT ?? '5432';
const PGUSER = process.env.USAGE_EVENTS_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 10);
const DB_BASE = `myjkkn_usage_base_${SUFFIX}`;
const DB_HARD = `myjkkn_usage_hard_${SUFFIX}`;

/** Production shapes reduced to what the policies and the migration touch. */
const FIXTURE = `
DO $$ BEGIN
  BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
END $$;
-- Roles are cluster-wide: another *.pg.test.ts in the same CI server may have
-- created service_role first without BYPASSRLS, so set it explicitly.
ALTER ROLE service_role BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.acting_uid', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  institution_id uuid,
  role text,
  is_super_admin boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.profiles TO anon, authenticated, service_role;

-- Authority helpers with the production meaning, read from profiles
-- (is_admin: super admin or role super_admin/administrator; institution access:
-- own institution, super admin always).
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;
CREATE FUNCTION public.is_admin(user_id uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles
                  WHERE id = COALESCE(user_id, auth.uid())
                    AND (is_super_admin OR role IN ('super_admin', 'administrator')));
$$;
CREATE FUNCTION public.role_has_institution_access(check_institution_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT check_institution_id IS NULL
      OR public.is_super_admin()
      OR check_institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid());
$$;

CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL,
  module text NOT NULL,
  feature text,
  institution_id uuid,
  source text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

/**
 * The LIVE policy set and grants as read on 10 Oct 2027 — all three policies
 * TO PUBLIC; anon and authenticated hold every write privilege.
 */
const BASELINE = `
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.usage_events TO anon, authenticated, service_role;

CREATE POLICY "Service role can insert usage_events" ON public.usage_events
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Institution admin can view own institution usage_events" ON public.usage_events
  FOR SELECT USING (institution_id IN (SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "Super admin can view all usage_events" ON public.usage_events
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));
`;

function psql(args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

const INST_A = randomUUID();
const INST_B = randomUUID();
const people = {
  plain: randomUUID(), // ordinary staff/learner of institution A
  colleague: randomUUID(), // another ordinary user of institution A
  admin: randomUUID(), // administrator of institution A
  outsiderAdmin: randomUUID(), // administrator of institution B
  superAdmin: randomUUID(),
};

let tmp: string;
const clients: Record<'base' | 'hard', Client> = {} as any;

async function seed(c: Client) {
  const rows: Array<[string, string, string | null, boolean]> = [
    [people.plain, INST_A, 'staff', false],
    [people.colleague, INST_A, 'staff', false],
    [people.admin, INST_A, 'administrator', false],
    [people.outsiderAdmin, INST_B, 'administrator', false],
    [people.superAdmin, INST_A, 'super_admin', true],
  ];
  for (const [id, inst, role, sa] of rows) {
    await c.query(
      `INSERT INTO public.profiles (id, institution_id, role, is_super_admin) VALUES ($1, $2, $3, $4)`,
      [id, inst, role, sa]
    );
  }
  // The colleague's own page visits — what a plain user must NOT be able to read.
  for (const mod of ['billing', 'billing', 'attendance']) {
    await c.query(
      `INSERT INTO public.usage_events (user_id, event_type, module, institution_id, metadata)
       VALUES ($1, 'page_visit', $2, $3, '{"page_url":"/x"}')`,
      [people.colleague, mod, INST_A]
    );
  }
}

/**
 * Run fn inside a transaction acting as `role` (anon / authenticated) with
 * auth.uid() = uid, then roll back so tests never see each other's writes.
 * Returns { error: SQLSTATE | null, rows }.
 */
async function actAs(
  db: 'base' | 'hard',
  role: 'anon' | 'authenticated',
  uid: string | null,
  sql: string,
  params: unknown[] = []
): Promise<{ error: string | null; rows: any[]; rowCount: number }> {
  const c = clients[db];
  await c.query('BEGIN');
  try {
    await c.query(`SELECT set_config('test.acting_uid', $1, true)`, [uid ?? '']);
    await c.query(`SET LOCAL ROLE ${role}`);
    const r = await c.query(sql, params);
    return { error: null, rows: r.rows, rowCount: r.rowCount ?? 0 };
  } catch (e: any) {
    return { error: e.code ?? 'unknown', rows: [], rowCount: 0 };
  } finally {
    await c.query('ROLLBACK');
  }
}

const INSERT_AS = (userId: string | null) => ({
  sql: `INSERT INTO public.usage_events (user_id, event_type, module, institution_id, source)
        VALUES ($1, 'search', 'navigation', $2, 'client')`,
  params: [userId, INST_A],
});

const COUNT_INST_A = `SELECT count(*)::int AS n FROM public.usage_events WHERE institution_id = '${INST_A}'`;

/**
 * Add page visits to institution A as service_role — the only page_visit
 * writer — shaped as UsageTrackingService.trackPageVisit stores them (module
 * from url-module-mapper, the raw url in metadata.page_url), then call
 * fn_usage_trending_pages as a plain user of A. One rolled-back transaction.
 * A forged explicit-mode row (free-text module) is just a different `module`.
 */
async function trendingAfter(
  visits: Array<{ user: string; module: string; url?: string }>,
  limit = 50
): Promise<any[]> {
  const c = clients.hard;
  await c.query('BEGIN');
  try {
    await c.query('SET LOCAL ROLE service_role');
    for (const v of visits) {
      await c.query(
        `INSERT INTO public.usage_events (user_id, event_type, module, institution_id, metadata)
         VALUES ($1, 'page_visit', $2, $3, jsonb_build_object('page_url', $4::text))`,
        [v.user, v.module, INST_A, v.url ?? `/${v.module}`]
      );
    }
    await c.query(`SELECT set_config('test.acting_uid', $1, true)`, [people.plain]);
    await c.query('SET LOCAL ROLE authenticated');
    return (await c.query(`SELECT * FROM public.fn_usage_trending_pages(7, $1)`, [limit])).rows;
  } finally {
    await c.query('ROLLBACK');
  }
}

/** n distinct visitor ids. */
const visitors = (n: number) => Array.from({ length: n }, () => randomUUID());

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DB_BASE}`]);
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DB_HARD}`]);
  } catch (e: any) {
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}.\n` +
        `This suite applies the real migration file and will not pretend to pass without one.\n` +
        `  brew services start postgresql@16\n\n` +
        String(e?.stderr || e?.message || e)
    );
  }
  tmp = mkdtempSync(path.join(tmpdir(), 'usage-events-'));
  const fixture = path.join(tmp, 'fixture.sql');
  const baseline = path.join(tmp, 'baseline.sql');
  writeFileSync(fixture, FIXTURE);
  writeFileSync(baseline, BASELINE);

  for (const db of [DB_BASE, DB_HARD]) {
    psql(['-d', db, '-f', fixture]);
    psql(['-d', db, '-f', baseline]);
  }
  // Verbatim — the migration's DO self-check fails the suite here if it does not hold.
  psql(['-d', DB_HARD, '-f', MIGRATION]);

  for (const [key, db] of [['base', DB_BASE], ['hard', DB_HARD]] as const) {
    const c = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: db });
    await c.connect();
    clients[key] = c;
    await seed(c);
  }
});

afterAll(async () => {
  for (const c of Object.values(clients)) await c?.end().catch(() => {});
  for (const db of [DB_BASE, DB_HARD]) {
    try {
      psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${db}`]);
    } catch {
      /* best effort */
    }
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('BASELINE (live policy set before the fix) — the holes are real', () => {
  it('anon can insert a usage event', async () => {
    const { sql, params } = INSERT_AS(people.plain);
    const r = await actAs('base', 'anon', null, sql, params);
    expect(r.error).toBeNull();
    expect(r.rowCount).toBe(1);
  });

  it('a signed-in user can insert an event under someone else’s user_id', async () => {
    const { sql, params } = INSERT_AS(people.colleague);
    const r = await actAs('base', 'authenticated', people.plain, sql, params);
    expect(r.error).toBeNull();
    expect(r.rowCount).toBe(1);
  });

  it('a plain user reads every usage event of their institution', async () => {
    const r = await actAs('base', 'authenticated', people.plain, COUNT_INST_A);
    expect(r.rows[0].n).toBe(3);
  });
});

describe('HARDENED (after 20271010094500)', () => {
  it('anon insert is refused', async () => {
    const { sql, params } = INSERT_AS(people.plain);
    const r = await actAs('hard', 'anon', null, sql, params);
    expect(r.error).toBe('42501');
  });

  it('a signed-in user can insert their OWN event (command-palette search path)', async () => {
    const { sql, params } = INSERT_AS(people.plain);
    const r = await actAs('hard', 'authenticated', people.plain, sql, params);
    expect(r.error).toBeNull();
    expect(r.rowCount).toBe(1);
  });

  it('a signed-in user cannot insert under someone else’s user_id', async () => {
    const { sql, params } = INSERT_AS(people.colleague);
    const r = await actAs('hard', 'authenticated', people.plain, sql, params);
    expect(r.error).toBe('42501');
  });

  it('a signed-in user cannot insert with no user_id', async () => {
    const { sql, params } = INSERT_AS(null);
    const r = await actAs('hard', 'authenticated', people.plain, sql, params);
    expect(r.error).toBe('42501');
  });

  it('a plain user cannot read other people’s events of their institution', async () => {
    const r = await actAs('hard', 'authenticated', people.plain, COUNT_INST_A);
    expect(r.error).toBeNull();
    expect(r.rows[0].n).toBe(0);
  });

  it('an institution admin reads their institution’s events', async () => {
    const r = await actAs('hard', 'authenticated', people.admin, COUNT_INST_A);
    expect(r.rows[0].n).toBe(3);
  });

  it('an admin of ANOTHER institution reads none of them', async () => {
    const r = await actAs('hard', 'authenticated', people.outsiderAdmin, COUNT_INST_A);
    expect(r.rows[0].n).toBe(0);
  });

  it('a super admin reads them all', async () => {
    const r = await actAs('hard', 'authenticated', people.superAdmin, COUNT_INST_A);
    expect(r.rows[0].n).toBe(3);
  });

  it('anon reads nothing', async () => {
    const r = await actAs('hard', 'anon', null, COUNT_INST_A);
    // anon keeps the SELECT grant it already had but no policy admits it.
    expect(r.error === '42501' || r.rows[0]?.n === 0).toBe(true);
  });

  it('authenticated UPDATE and DELETE are refused', async () => {
    const up = await actAs('hard', 'authenticated', people.admin, `UPDATE public.usage_events SET module = 'x'`);
    expect(up.error).toBe('42501');
    const del = await actAs('hard', 'authenticated', people.superAdmin, `DELETE FROM public.usage_events`);
    expect(del.error).toBe('42501');
  });

  it('anon UPDATE / DELETE / TRUNCATE are refused', async () => {
    for (const sql of [
      `UPDATE public.usage_events SET module = 'x'`,
      `DELETE FROM public.usage_events`,
      `TRUNCATE public.usage_events`,
    ]) {
      const r = await actAs('hard', 'anon', null, sql);
      expect(r.error).toBe('42501');
    }
  });

  it('service_role still writes and reads everything', async () => {
    // service_role is BYPASSRLS in the fixture, as on Supabase.
    const c = clients.hard;
    await c.query('BEGIN');
    try {
      await c.query('SET LOCAL ROLE service_role');
      await c.query(
        `INSERT INTO public.usage_events (user_id, event_type, module, institution_id) VALUES ($1, 'create', 'billing', $2)`,
        [people.colleague, INST_A]
      );
      const n = (await c.query(COUNT_INST_A)).rows[0].n;
      expect(n).toBe(4);
    } finally {
      await c.query('ROLLBACK');
    }
  });

  it('fn_usage_trending_pages gives a plain user per-module counts — no paths, no user ids', async () => {
    // Seed: the colleague visited billing twice and attendance once. Two more
    // people visit billing (3 people), one more visits attendance (2 people).
    const [u2, u3] = visitors(2);
    const rows = await trendingAfter(
      [
        { user: u2, module: 'billing/invoices', url: '/billing/invoices' },
        { user: u3, module: 'billing' },
        { user: u2, module: 'attendance' },
      ],
      5
    );
    expect(rows).toEqual([{ module: 'billing', visit_count: '4' }]);
    expect(Object.keys(rows[0]).sort()).toEqual(['module', 'visit_count']);
  });

  it('fn_usage_trending_pages shows a module only when 3+ different people visited it', async () => {
    const two = visitors(2);
    const three = visitors(3);
    const rows = await trendingAfter([
      // one person visiting many times does not count as many people
      ...Array.from({ length: 10 }, () => ({ user: two[0], module: 'events' })),
      { user: two[1], module: 'events' },
      ...three.map((user) => ({ user, module: 'hr' })),
    ]);
    expect(rows.map((r: any) => r.module)).toEqual(['hr']);
  });

  it('fn_usage_trending_pages never reveals a record id or slug in any form, however many people visited it', async () => {
    const many = visitors(6);
    const uuid = randomUUID();
    const secrets = ['22CSE001', '22cse001', 'EMP0123', 'emp0123', 'john-doe', uuid];
    const rows = await trendingAfter(
      many.flatMap((user) => [
        // as the beacon stores them: module from the mapper, id only in the url
        { user, module: 'students', url: '/students/22CSE001' },
        { user, module: 'staff', url: '/staff/EMP0123' },
        { user, module: 'staff', url: '/staff/john-doe' },
        { user, module: 'students', url: `/students/${uuid}` },
        // forged explicit-mode rows carrying the id in the module text itself
        { user, module: 'students/22cse001' },
        { user, module: 'staff/EMP0123' },
        { user, module: 'staff/john-doe/payslip' },
      ])
    );
    expect(rows.map((r: any) => r.module).sort()).toEqual(['staff', 'students']);
    const out = JSON.stringify(rows);
    for (const secret of secrets) expect(out).not.toContain(secret);
  });

  it('fn_usage_trending_pages returns nothing for another institution’s user', async () => {
    const r = await actAs(
      'hard',
      'authenticated',
      people.outsiderAdmin,
      `SELECT * FROM public.fn_usage_trending_pages(7, 5)`
    );
    expect(r.rows).toEqual([]);
  });

  it('a signed-in user cannot insert an event tagged with ANOTHER institution', async () => {
    const r = await actAs(
      'hard',
      'authenticated',
      people.plain,
      `INSERT INTO public.usage_events (user_id, event_type, module, institution_id, source)
       VALUES ($1, 'search', 'navigation', $2, 'client')`,
      [people.plain, INST_B]
    );
    expect(r.error).toBe('42501');
  });

  it('a signed-in user can insert their own search event with a NULL institution', async () => {
    const r = await actAs(
      'hard',
      'authenticated',
      people.plain,
      `INSERT INTO public.usage_events (user_id, event_type, module, institution_id, source)
       VALUES ($1, 'search', 'navigation', NULL, 'client')`,
      [people.plain]
    );
    expect(r.error).toBeNull();
    expect(r.rowCount).toBe(1);
  });

  it('a signed-in user cannot insert a page_visit (or any non-search event) from the browser', async () => {
    for (const eventType of ['page_visit', 'create']) {
      const r = await actAs(
        'hard',
        'authenticated',
        people.plain,
        `INSERT INTO public.usage_events (user_id, event_type, module, institution_id, metadata)
         VALUES ($1, $2, 'x', $3, '{"page_path":"//evil.com"}')`,
        [people.plain, eventType, INST_A]
      );
      expect(r.error).toBe('42501');
    }
  });

  it('fn_usage_trending_pages returns only slug-shaped module keys, however many people visited', async () => {
    const many = visitors(5);
    const junk = [
      '//evil.com',
      '/\\evil.com',
      'https://evil.com/x',
      'javascript:alert(1)',
      '\t/evil.com',
      ' evil',
      'Evil',
      '22cse001',
      'x'.repeat(41),
    ];
    const rows = await trendingAfter([
      ...many.flatMap((user) => junk.map((module) => ({ user, module }))),
      ...many.slice(0, 3).map((user) => ({ user, module: 'events' })),
    ]);
    expect(rows.map((r: any) => r.module)).toEqual(['events']);
  });

  it('anon cannot call fn_usage_trending_pages', async () => {
    const r = await actAs('hard', 'anon', null, `SELECT * FROM public.fn_usage_trending_pages(7, 5)`);
    expect(r.error).toBe('42501');
  });
});

describe('migration self-check', () => {
  it('refuses to commit when a second INSERT policy would OR in', () => {
    const db = `myjkkn_usage_chk_${SUFFIX}`;
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${db}`]);
    try {
      psql(['-d', db, '-f', path.join(tmp, 'fixture.sql')]);
      psql(['-d', db, '-f', path.join(tmp, 'baseline.sql')]);
      psql([
        '-d',
        db,
        '-c',
        `CREATE POLICY "extra insert" ON public.usage_events FOR INSERT TO authenticated WITH CHECK (true)`,
      ]);
      let err = '';
      try {
        psql(['-d', db, '-f', MIGRATION]);
      } catch (e: any) {
        err = String(e?.stderr || e?.message || e);
      }
      expect(err).toContain('exactly one INSERT policy');
    } finally {
      try {
        psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${db}`]);
      } catch {
        /* best effort */
      }
    }
  });
});
