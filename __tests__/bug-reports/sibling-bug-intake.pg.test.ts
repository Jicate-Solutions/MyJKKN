/**
 * supabase/migrations/20271010151437_sibling_app_bug_intake.sql, applied
 * VERBATIM to a throwaway PostgreSQL on top of 20270301090000 (which created
 * api_keys.key_kind), then exercised as the roles PostgREST uses.
 *
 * Proves:
 *   - it applies twice; seeds the five college apps; an existing admin key
 *     stays an admin key
 *   - fn_bug_intake_key_create issues a jkkn_bi_ key for one app, stores only
 *     its SHA-256 exactly as Node computes it, with read/write false — and
 *     only the service role can run it
 *   - an intake row can never become a read/write key, change app, change
 *     kind or be turned back on (the CHECK and the freeze trigger), and a
 *     client cannot insert one; renaming and turning off still work
 *   - an admin key cannot carry an app link
 *   - sibling_apps: anon reads nothing, a plain signed-in person sees no rows,
 *     a super admin sees them
 *   - a bug with reporter_user_id NULL now inserts (the participant trigger
 *     used to fail it on the NOT NULL user_id); a bug with a reporter still
 *     gets its participant row
 *
 * REQUIRES a PostgreSQL (CI's postgres:16 service; locally
 * `brew services start postgresql@16`). Fails loudly rather than skipping.
 * Override with AI_DOOR_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD (the
 * same variables as personal-keys-and-menu.pg.test.ts).
 */
import { readFileSync } from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const PRIOR = path.join(REPO, 'supabase/migrations/20270301090000_ai_tool_catalog.sql');
const MIGRATION = path.join(REPO, 'supabase/migrations/20271010151437_sibling_app_bug_intake.sql');

const PGHOST = process.env.AI_DOOR_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.AI_DOOR_TEST_PGPORT ?? 5432);
const PGUSER =
  process.env.AI_DOOR_TEST_PGUSER ?? (process.env.CI ? 'postgres' : (process.env.USER ?? 'postgres'));
const PGPASSWORD = process.env.AI_DOOR_TEST_PGPASSWORD;
const DBNAME = `bug_intake_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const USER = 'aaaaaaaa-0000-4000-8000-000000000001'; // plain signed-in person
const SUPER = 'cccccccc-0000-4000-8000-000000000003'; // super admin

const SCHEMA = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
-- Supabase's service_role bypasses RLS. Roles are cluster-wide and other test files
-- create this one without it, so set it explicitly rather than inherit whatever exists.
-- Without it the service-role UPDATEs below match no row (api_keys' only policy is
-- TO authenticated), raise nothing, and the freeze test fails on a fresh cluster.
ALTER ROLE service_role BYPASSRLS;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;
GRANT USAGE ON SCHEMA auth, extensions, public TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, institution_id uuid, is_super_admin boolean DEFAULT false,
  is_active boolean DEFAULT true, is_login_disabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.test_perms (user_id uuid, key text);
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $f$ SELECT COALESCE((SELECT is_super_admin FROM profiles WHERE id = auth.uid()), false) $f$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $f$ SELECT public.is_super_admin() $f$;
CREATE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $f$ SELECT EXISTS (SELECT 1 FROM test_perms WHERE user_id = auth.uid() AND key = permission_name) $f$;
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  key_value VARCHAR(255) NOT NULL,
  created_by UUID,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '{"read": true, "write": false}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  institution_id uuid,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role TEXT CHECK (user_role IN ('student', 'faculty', 'admin', 'super_admin')),
  department_id UUID
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_keys_any ON public.api_keys FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.api_keys (name, key_value) VALUES ('legacy admin key', 'legacy-hash');
-- bug_reports / participants, as far as the participant trigger needs them
CREATE TABLE public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid,
  application_id uuid,
  page_url text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bug_report_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role varchar(20),
  can_view_internal boolean,
  is_active boolean,
  joined_at timestamptz,
  UNIQUE (bug_report_id, user_id)
);
-- the definition live before this migration (fix_bug_report_participants_rls.sql)
CREATE FUNCTION public.add_bug_reporter_as_participant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $f$
BEGIN
  INSERT INTO public.bug_report_participants (bug_report_id, user_id, role, can_view_internal, is_active, joined_at)
  VALUES (NEW.id, NEW.reporter_user_id, 'reporter', false, true, now())
  ON CONFLICT (bug_report_id, user_id) DO NOTHING;
  RETURN NEW;
END $f$;
CREATE TRIGGER trigger_add_bug_reporter_participant AFTER INSERT ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.add_bug_reporter_as_participant();
INSERT INTO auth.users VALUES ('${USER}'), ('${SUPER}');
INSERT INTO public.profiles (id, is_super_admin) VALUES ('${USER}', false), ('${SUPER}', true);
`;

let admin: Client;
let db: Client;
let adminConnected = false;
let dbConnected = false;
const priorSql = readFileSync(PRIOR, 'utf8');
const migrationSql = readFileSync(MIGRATION, 'utf8');

function stubsFor(sql: string): string {
  const targets = [...new Set([...sql.matchAll(/'rpc', '(ai_rpc_[a-z0-9_]+)'/g)].map((m) => m[1]))];
  return targets
    .map((t) => `CREATE FUNCTION public.${t}() RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$;`)
    .join('\n');
}

type Who = 'anon' | 'service_role' | string; // a uuid = that signed-in person

async function as<T = any>(who: Who, sql: string, params: unknown[] = []): Promise<{ rows: T[]; error?: string }> {
  await db.query('RESET ROLE');
  const isUser = who !== 'anon' && who !== 'service_role';
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [isUser ? who : '']);
  await db.query(`SET ROLE ${isUser ? 'authenticated' : who}`);
  try {
    const r = await db.query(sql, params);
    return { rows: r.rows as T[] };
  } catch (e) {
    return { rows: [], error: (e as Error).message };
  } finally {
    await db.query('RESET ROLE');
  }
}

async function issue(slug: string): Promise<{ id: string; key: string; app: string }> {
  const r = await as('service_role', `SELECT public.fn_bug_intake_key_create($1) AS out`, [slug]);
  if (r.error) throw new Error(r.error);
  return r.rows[0].out;
}

beforeAll(async () => {
  admin = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: 'postgres' });
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(
      `Cannot reach PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}. This suite proves the migration against a ` +
        `real engine and fails rather than skipping. Start one with: brew services start postgresql@16\n${e}`
    );
  }
  adminConnected = true;
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: DBNAME });
  await db.connect();
  dbConnected = true;
  await db.query(SCHEMA);
  await db.query(stubsFor(priorSql));
  await db.query(priorSql);
  await db.query(migrationSql);
}, 60_000);

afterAll(async () => {
  if (dbConnected) await db.end();
  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME}`);
    await admin.end();
  }
});

describe('migration', () => {
  it('applies twice and seeds the five college apps', async () => {
    await db.query(migrationSql);
    const r = await db.query(`SELECT slug, name FROM public.sibling_apps ORDER BY slug`);
    expect(r.rows).toEqual([
      { slug: 'coe', name: 'COE' },
      { slug: 'event-forms', name: 'Event Forms' },
      { slug: 'library', name: 'Library' },
      { slug: 'mentor', name: 'Mentor' },
      { slug: 'tms', name: 'TMS' },
    ]);
  });

  it('leaves the existing admin key an admin key with no app', async () => {
    const r = await db.query(`SELECT key_kind, sibling_app_id FROM public.api_keys WHERE name = 'legacy admin key'`);
    expect(r.rows[0]).toEqual({ key_kind: 'admin', sibling_app_id: null });
  });
});

describe('issuing a key', () => {
  it('returns a jkkn_bi_ key once and stores only its SHA-256, read/write false, tied to the app', async () => {
    const out = await issue('mentor');
    expect(out.key).toMatch(/^jkkn_bi_[0-9a-f]{48}$/);
    expect(out.app).toBe('mentor');
    const row = (
      await db.query(
        `SELECT k.key_value, k.key_kind, k.permissions, k.user_id, k.institution_id, k.expires_at, a.slug
           FROM public.api_keys k JOIN public.sibling_apps a ON a.id = k.sibling_app_id WHERE k.id = $1`,
        [out.id]
      )
    ).rows[0];
    expect(row.key_value).toBe(createHash('sha256').update(out.key).digest('hex'));
    expect(row.key_value).not.toContain(out.key);
    expect(row).toMatchObject({
      key_kind: 'bug_intake',
      permissions: { read: false, write: false },
      user_id: null,
      institution_id: null,
      expires_at: null,
      slug: 'mentor',
    });
  });

  it('refuses an unknown or turned-off app', async () => {
    expect((await as('service_role', `SELECT public.fn_bug_intake_key_create('nope')`)).error).toMatch(/No sibling app/);
    await db.query(`UPDATE public.sibling_apps SET is_active = false WHERE slug = 'library'`);
    expect((await as('service_role', `SELECT public.fn_bug_intake_key_create('library')`)).error).toMatch(/turned off/);
    await db.query(`UPDATE public.sibling_apps SET is_active = true WHERE slug = 'library'`);
  });

  it('cannot be run by anon, a signed-in person, or a super admin through the API', async () => {
    for (const who of ['anon', USER, SUPER]) {
      const r = await as(who, `SELECT public.fn_bug_intake_key_create('tms')`);
      expect(r.error, who).toMatch(/permission denied/);
    }
  });
});

describe('an intake key stays submit-only', () => {
  it('can never be widened to read or write (CHECK + freeze trigger), even by the service role', async () => {
    const { id } = await issue('coe');
    for (const sql of [
      `UPDATE public.api_keys SET permissions = '{"read": true, "write": false}'::jsonb WHERE id = $1`,
      `UPDATE public.api_keys SET key_kind = 'admin', sibling_app_id = NULL WHERE id = $1`,
      `UPDATE public.api_keys SET sibling_app_id = (SELECT id FROM public.sibling_apps WHERE slug = 'tms') WHERE id = $1`,
      `UPDATE public.api_keys SET institution_id = gen_random_uuid() WHERE id = $1`,
      `UPDATE public.api_keys SET key_value = 'other' WHERE id = $1`,
    ]) {
      const r = await as('service_role', sql, [id]);
      expect(r.error, sql).toBeTruthy();
    }
  });

  it('can be renamed and turned off, but never turned back on', async () => {
    const { id } = await issue('tms');
    expect((await as(SUPER, `UPDATE public.api_keys SET name = 'TMS v2' WHERE id = $1`, [id])).error).toBeUndefined();
    expect((await as(SUPER, `UPDATE public.api_keys SET is_active = false WHERE id = $1`, [id])).error).toBeUndefined();
    expect((await as(SUPER, `UPDATE public.api_keys SET is_active = true WHERE id = $1`, [id])).error).toMatch(
      /cannot be changed or turned back on/
    );
  });

  it('cannot be inserted directly by a client', async () => {
    const r = await as(
      SUPER,
      `INSERT INTO public.api_keys (name, key_value, key_kind, sibling_app_id, permissions)
       VALUES ('x', 'y', 'bug_intake', (SELECT id FROM public.sibling_apps WHERE slug = 'mentor'),
               '{"read": false, "write": false}'::jsonb)`
    );
    expect(r.error).toMatch(/only with fn_bug_intake_key_create/);
  });

  it('cannot be inserted with read access even by the owner role', async () => {
    await expect(
      db.query(
        `INSERT INTO public.api_keys (name, key_value, key_kind, sibling_app_id, permissions)
         VALUES ('x', 'y2', 'bug_intake', (SELECT id FROM public.sibling_apps WHERE slug = 'mentor'),
                 '{"read": true, "write": false}'::jsonb)`
      )
    ).rejects.toThrow(/api_keys_bug_intake_shape_check/);
  });

  it('an admin key cannot carry an app link', async () => {
    await expect(
      db.query(
        `INSERT INTO public.api_keys (name, key_value, sibling_app_id)
         VALUES ('x', 'y3', (SELECT id FROM public.sibling_apps WHERE slug = 'mentor'))`
      )
    ).rejects.toThrow(/api_keys_bug_intake_shape_check/);
  });
});

describe('sibling_apps visibility', () => {
  it('anon reads nothing; a plain signed-in person sees no rows; a super admin sees all five', async () => {
    expect((await as('anon', `SELECT count(*) FROM public.sibling_apps`)).error).toMatch(/permission denied/);
    expect((await as(USER, `SELECT count(*)::int AS n FROM public.sibling_apps`)).rows[0].n).toBe(0);
    expect((await as(SUPER, `SELECT count(*)::int AS n FROM public.sibling_apps`)).rows[0].n).toBe(5);
  });

  it('nobody writes it through the API', async () => {
    const r = await as(SUPER, `INSERT INTO public.sibling_apps (slug, name) VALUES ('evil', 'Evil')`);
    expect(r.error).toMatch(/permission denied/);
  });
});

describe('participant trigger', () => {
  it('a bug with no matched reporter now inserts, with no participant row', async () => {
    const r = await db.query(
      `INSERT INTO public.bug_reports (page_url, description, reporter_user_id)
       VALUES ('https://mentor.jkkn.ai/x', 'no reporter here', NULL) RETURNING id`
    );
    const p = await db.query(`SELECT count(*)::int AS n FROM public.bug_report_participants WHERE bug_report_id = $1`, [
      r.rows[0].id,
    ]);
    expect(p.rows[0].n).toBe(0);
  });

  it('a bug with a reporter still gets its reporter participant row', async () => {
    const r = await db.query(
      `INSERT INTO public.bug_reports (page_url, description, reporter_user_id)
       VALUES ('https://mentor.jkkn.ai/y', 'with reporter', $1) RETURNING id`,
      [USER]
    );
    const p = await db.query(
      `SELECT user_id, role FROM public.bug_report_participants WHERE bug_report_id = $1`,
      [r.rows[0].id]
    );
    expect(p.rows).toEqual([{ user_id: USER, role: 'reporter' }]);
  });
});

describe('bug_reports intake links (application_id, dedup)', () => {
  it('application_id must name a sibling app', async () => {
    await expect(
      db.query(
        `INSERT INTO public.bug_reports (page_url, description, application_id)
         VALUES ('https://x.example/a', 'unknown app', gen_random_uuid())`
      )
    ).rejects.toThrow(/bug_reports_application_id_sibling_fkey/);
    const ok = await db.query(
      `INSERT INTO public.bug_reports (page_url, description, application_id)
       SELECT 'https://mentor.jkkn.ai/a', 'known app', id FROM public.sibling_apps WHERE slug = 'mentor'
       RETURNING id`
    );
    expect(ok.rows).toHaveLength(1);
  });

  it('two bugs with the same intake_dedup_key collide; bugs without one never do', async () => {
    const insert = (key: string | null) =>
      db.query(
        `INSERT INTO public.bug_reports (page_url, description, metadata)
         VALUES ('https://mentor.jkkn.ai/d', 'dup', $1::jsonb)`,
        [JSON.stringify(key ? { intake_dedup_key: key } : { source: 'myjkkn' })]
      );
    await insert('k-1');
    await expect(insert('k-1')).rejects.toThrow(/uq_bug_reports_intake_dedup/);
    await insert(null);
    await insert(null);
  });
});
