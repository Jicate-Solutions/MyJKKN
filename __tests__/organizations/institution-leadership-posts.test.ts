/**
 * One person, a leadership post at MORE THAN ONE college.
 * Behavioural proof for supabase/migrations/20260809102100_institution_leadership_posts.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The migration files are applied VERBATIM with psql — this suite never
 * re-implements a predicate, a COALESCE or a vacate rule in TypeScript. It seeds
 * rows, calls the real functions, and reads back what PostgreSQL actually did. A
 * test that models the SQL only proves the model agrees with itself.
 *
 * BOTH migrations are applied, in filename order:
 *   20260809101500_college_leadership.sql   (the functions being replaced)
 *   20260809102100_institution_leadership_posts.sql  (this PR)
 * so the ordering guard and the replacement are exercised together.
 *
 * REQUIRES a local PostgreSQL. It is NOT run by CI (no workflow in
 * .github/workflows runs this path) and is deliberately loud rather than skipped
 * when no server is reachable — a silent skip would report green over a suite
 * that never executed.
 *
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/organizations/institution-leadership-posts.test.ts
 *
 * Override the server with LEADERSHIP_TEST_PGHOST / _PGPORT / _PGUSER.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const BASE_MIGRATION = path.join(
  REPO,
  'supabase/migrations/20260809101500_college_leadership.sql',
);
const THIS_MIGRATION = path.join(
  REPO,
  'supabase/migrations/20260809102100_institution_leadership_posts.sql',
);

const PGHOST = process.env.LEADERSHIP_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.LEADERSHIP_TEST_PGPORT ?? '5432';
const PGUSER = process.env.LEADERSHIP_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const DBNAME = `myjkkn_leadership_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

/**
 * Production table shapes, reduced to the columns these functions touch. Column
 * names, types and the two constraints that drive real behaviour
 * (user_roles_unique_assignment, idx_user_roles_primary_unique) are taken from
 * supabase/setup/01_tables.sql and the migrations that created them.
 *
 * The permission helpers answer from the acting profile, exactly as the
 * SECURITY DEFINER originals do, so authorisation is real rather than stubbed
 * open.
 */
const FIXTURE = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;

-- Roles are cluster-wide, not per-database, so they may already exist on a
-- machine that also runs a local Supabase.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $roles$;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $fn$
  SELECT NULLIF(current_setting('test.acting_uid', true), '')::uuid;
$fn$;

CREATE TABLE public.institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  full_name text,
  role text NOT NULL DEFAULT 'learner',
  is_active boolean NOT NULL DEFAULT true,
  is_super_admin boolean,
  institution_id uuid,
  department_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key varchar(50) UNIQUE NOT NULL,
  role_name varchar(50) NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  institution_scope varchar(10) NOT NULL DEFAULT 'own',
  is_system_role boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  institution_id uuid
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  CONSTRAINT user_roles_unique_assignment UNIQUE (user_id, role_id)
);
CREATE UNIQUE INDEX idx_user_roles_primary_unique
  ON public.user_roles (user_id) WHERE is_primary;

CREATE TABLE public.user_institution_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  access_type varchar(50) NOT NULL DEFAULT 'full',
  granted_by uuid,
  granted_at timestamptz DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid,
  department_name text,
  department_code text,
  head_of_department_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.accreditation_committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid,
  body_code text,
  committee_name text,
  committee_type text,
  chair_user_id uuid,
  formed_at date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.accreditation_committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid,
  user_id uuid,
  role text,
  joined_at date,
  is_active boolean NOT NULL DEFAULT true,
  is_external boolean NOT NULL DEFAULT false,
  CONSTRAINT accreditation_committee_members_unique UNIQUE (committee_id, user_id, joined_at)
);

CREATE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE((SELECT p.is_super_admin FROM public.profiles p WHERE p.id = auth.uid()), false);
$fn$;

CREATE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT public.is_super_admin();
$fn$;

CREATE FUNCTION public.user_has_permission(p_key text) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(
    (SELECT bool_or(COALESCE((cr.permissions ->> p_key)::boolean, false))
       FROM public.user_roles ur
       JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = auth.uid()),
    false);
$fn$;

CREATE FUNCTION public.role_has_institution_access(p_institution_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(
    (SELECT p.institution_id = p_institution_id FROM public.profiles p WHERE p.id = auth.uid()),
    false)
  OR EXISTS (
    SELECT 1 FROM public.user_institution_access uia
     WHERE uia.user_id = auth.uid()
       AND uia.institution_id = p_institution_id
       AND uia.is_active);
$fn$;

-- The 'principal' role as it exists live: a permissions JSONB the base
-- migration derives 'vice_principal' from. Two authority keys are true so the
-- withholding rule in that file has something real to withhold.
INSERT INTO public.custom_roles (role_key, role_name, description, permissions, institution_scope, is_system_role)
VALUES ('principal', 'Principal', 'Head of a college',
        '{"organizations.leadership.manage": true,
          "academic.attendance.view": true,
          "hr.recruitment.approve": true,
          "learners.onboarding.delete": true}'::jsonb,
        'own', true);
`;

function psql(args: string[], input?: string) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

let client: Client;
let tmp: string;

/** ids seeded in beforeAll */
const ids = {
  actor: '',
  dental: '',
  alliedHealth: '',
  dhanasekar: '',
  alliedHealthIncumbent: '',
  outsider: '',
  colleges: [] as { id: string; name: string; principal: string }[],
};

async function actAs(uid: string) {
  await client.query(`SELECT set_config('test.acting_uid', $1, false)`, [uid]);
}

async function leadership(institutionId: string) {
  const r = await client.query('SELECT public.fn_get_college_leadership($1) AS j', [
    institutionId,
  ]);
  return r.rows[0].j as {
    principal: { user_id: string; full_name: string } | null;
    vice_principal: { user_id: string } | null;
  };
}

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e: any) {
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}.\n` +
        `This suite applies the real migration files and proves behaviour against a\n` +
        `throwaway database; it will not pretend to pass without one.\n` +
        `  brew services start postgresql@16\n\n` +
        String(e?.stderr || e?.message || e),
    );
  }

  tmp = mkdtempSync(path.join(tmpdir(), 'leadership-'));
  const fixturePath = path.join(tmp, 'fixture.sql');
  writeFileSync(fixturePath, FIXTURE);

  // Verbatim, in filename order. Nothing is rewritten on the way in.
  psql(['-d', DBNAME, '-f', fixturePath]);
  psql(['-d', DBNAME, '-f', BASE_MIGRATION]);
  psql(['-d', DBNAME, '-f', THIS_MIGRATION]);

  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();

  // --- the estate ----------------------------------------------------------
  const principalRoleId = (
    await client.query(`SELECT id FROM custom_roles WHERE role_key = 'principal'`)
  ).rows[0].id;

  const actor = await client.query(
    `INSERT INTO profiles (email, full_name, is_super_admin) VALUES
     ('registrar@jkkn.ac.in', 'Registrar', true) RETURNING id`,
  );
  ids.actor = actor.rows[0].id;

  // Ten colleges, each with a sitting Principal and NO institution_leadership
  // row — the estate exactly as it stands the moment this migration is applied.
  const names = [
    'JKKN Dental College',
    'JKKN College of Allied Health Sciences',
    'JKKN College of Pharmacy',
    'JKKN College of Engineering and Technology',
    'JKKN College of Arts and Science',
    'JKKN College of Nursing',
    'JKKN College of Education',
    'JKKN Institute of Physiotherapy',
    'JKKN Matriculation School',
    'JKKN Polytechnic College',
  ];
  for (const name of names) {
    const inst = (
      await client.query(`INSERT INTO institutions (name) VALUES ($1) RETURNING id`, [name])
    ).rows[0].id;
    const person = (
      await client.query(
        `INSERT INTO profiles (email, full_name, institution_id, role)
         VALUES ($1, $2, $3, 'principal') RETURNING id`,
        [
          `principal.${name.replace(/\W+/g, '').toLowerCase().slice(0, 18)}@jkkn.ac.in`,
          `Principal of ${name}`,
          inst,
        ],
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ($1, $2, true)`,
      [person, principalRoleId],
    );
    ids.colleges.push({ id: inst, name, principal: person });
  }

  ids.dental = ids.colleges[0].id;
  ids.dhanasekar = ids.colleges[0].principal;
  ids.alliedHealth = ids.colleges[1].id;
  ids.alliedHealthIncumbent = ids.colleges[1].principal;

  // Dr Dhanasekar's profile names Dental. Allied Health is recorded the only way
  // the platform already has for a second attachment.
  await client.query(
    `UPDATE profiles SET full_name = 'Dr Dhanasekar Balakrishnan',
            email = 'dentalprincipal@jkkn.ac.in' WHERE id = $1`,
    [ids.dhanasekar],
  );
  await client.query(
    `INSERT INTO user_institution_access (user_id, institution_id, is_active)
     VALUES ($1, $2, true)`,
    [ids.dhanasekar, ids.alliedHealth],
  );

  // Somebody at a third college with no grant anywhere.
  ids.outsider = (
    await client.query(
      `INSERT INTO profiles (email, full_name, institution_id)
       VALUES ('unrelated.faculty@jkkn.ac.in', 'Unrelated Faculty', $1) RETURNING id`,
      [ids.colleges[4].id],
    )
  ).rows[0].id;

  await actAs(ids.actor);
}, 120_000);

afterAll(async () => {
  if (client) await client.end();
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`]);
  } catch {
    /* the throwaway database is disposable; a failure to drop must not fail the run */
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('(a) the fallback — 10 sitting principals survive the migration', () => {
  it('has written no institution_leadership row for any of them', async () => {
    const r = await client.query(`SELECT count(*)::int AS n FROM institution_leadership`);
    // Not a backfill: the migration invents no assignment nobody made.
    expect(r.rows[0].n).toBe(0);
  });

  it('still resolves every one of the 10 principals', async () => {
    const resolved: string[] = [];
    for (const c of ids.colleges) {
      const j = await leadership(c.id);
      expect(j.principal, `${c.name} lost its Principal`).not.toBeNull();
      expect(j.principal!.user_id).toBe(c.principal);
      resolved.push(j.principal!.user_id);
    }
    expect(resolved).toHaveLength(10);
    expect(new Set(resolved).size).toBe(10);
  });

  it('reports an unfilled Vice Principal as JSON null, not a blank object', async () => {
    const j = await leadership(ids.dental);
    expect(j.vice_principal).toBeNull();
  });
});

describe('(b) Dr Dhanasekar holds the post at two colleges', () => {
  it('accepts him at Allied Health on the strength of his access grant', async () => {
    const r = await client.query(
      `SELECT public.fn_set_college_leadership($1, 'principal', $2) AS j`,
      [ids.alliedHealth, ids.dhanasekar],
    );
    expect(r.rows[0].j.ok).toBe(true);
  });

  it('reads him as Principal of Allied Health', async () => {
    const j = await leadership(ids.alliedHealth);
    expect(j.principal!.user_id).toBe(ids.dhanasekar);
    expect(j.principal!.full_name).toBe('Dr Dhanasekar Balakrishnan');
  });

  it('STILL reads him as Principal of Dental — the point of the change', async () => {
    const j = await leadership(ids.dental);
    expect(j.principal!.user_id).toBe(ids.dhanasekar);
  });

  it('kept his single global principal row rather than duplicating it', async () => {
    const r = await client.query(
      `SELECT count(*)::int AS n FROM user_roles ur
         JOIN custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = $1 AND cr.role_key = 'principal'`,
      [ids.dhanasekar],
    );
    expect(r.rows[0].n).toBe(1);
  });

  it('retired the previous Allied Health incumbent from that college only', async () => {
    const live = await client.query(
      `SELECT user_id FROM institution_leadership
        WHERE institution_id = $1 AND position = 'principal' AND is_active`,
      [ids.alliedHealth],
    );
    expect(live.rows).toHaveLength(1);
    expect(live.rows[0].user_id).toBe(ids.dhanasekar);

    // The incumbent held it nowhere else, so the global role row is gone —
    // unchanged behaviour from before this PR.
    const held = await client.query(
      `SELECT count(*)::int AS n FROM user_roles ur
         JOIN custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = $1 AND cr.role_key = 'principal'`,
      [ids.alliedHealthIncumbent],
    );
    expect(held.rows[0].n).toBe(0);
  });

  it('is idempotent — naming him again does not raise 23505', async () => {
    const r = await client.query(
      `SELECT public.fn_set_college_leadership($1, 'principal', $2) AS j`,
      [ids.alliedHealth, ids.dhanasekar],
    );
    expect(r.rows[0].j.ok).toBe(true);

    const live = await client.query(
      `SELECT count(*)::int AS n FROM institution_leadership
        WHERE institution_id = $1 AND position = 'principal' AND is_active`,
      [ids.alliedHealth],
    );
    expect(live.rows[0].n).toBe(1);
  });

  it('vacating Allied Health does NOT strip him at Dental', async () => {
    await client.query(`SELECT public.fn_set_college_leadership($1, 'principal', NULL)`, [
      ids.alliedHealth,
    ]);

    const ah = await leadership(ids.alliedHealth);
    expect(ah.principal).toBeNull();

    const dental = await leadership(ids.dental);
    expect(dental.principal!.user_id).toBe(ids.dhanasekar);

    const held = await client.query(
      `SELECT count(*)::int AS n FROM user_roles ur
         JOIN custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = $1 AND cr.role_key = 'principal'`,
      [ids.dhanasekar],
    );
    expect(held.rows[0].n).toBe(1);
  });

  it('keeps the retired row for history instead of deleting it', async () => {
    const r = await client.query(
      `SELECT count(*)::int AS n FROM institution_leadership
        WHERE institution_id = $1 AND NOT is_active`,
      [ids.alliedHealth],
    );
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});

describe('(c) neither a profile match nor a grant is refused outright', () => {
  it('refuses, names the person and the college, and writes nothing', async () => {
    await expect(
      client.query(`SELECT public.fn_set_college_leadership($1, 'principal', $2)`, [
        ids.alliedHealth,
        ids.outsider,
      ]),
    ).rejects.toMatchObject({ code: '23514' }); // check_violation — never a silent no-op

    const err = await client
      .query(`SELECT public.fn_set_college_leadership($1, 'principal', $2)`, [
        ids.alliedHealth,
        ids.outsider,
      ])
      .catch((e) => e);
    expect(err.message).toContain('Unrelated Faculty');
    expect(err.message).toContain('JKKN College of Allied Health Sciences');

    const live = await client.query(
      `SELECT count(*)::int AS n FROM institution_leadership
        WHERE institution_id = $1 AND is_active`,
      [ids.alliedHealth],
    );
    expect(live.rows[0].n).toBe(0);
  });

  it('refuses once the grant is deactivated, even though a row exists', async () => {
    await client.query(
      `INSERT INTO user_institution_access (user_id, institution_id, is_active)
       VALUES ($1, $2, false)`,
      [ids.outsider, ids.alliedHealth],
    );
    await expect(
      client.query(`SELECT public.fn_set_college_leadership($1, 'principal', $2)`, [
        ids.alliedHealth,
        ids.outsider,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('the picker offers exactly whom the write path accepts', () => {
  it('includes a person attached only by an access grant', async () => {
    const r = await client.query('SELECT public.fn_list_leadership_candidates($1) AS j', [
      ids.alliedHealth,
    ]);
    const list = r.rows[0].j as { id: string }[];
    const idsOffered = list.map((c) => c.id);
    expect(idsOffered).toContain(ids.dhanasekar);
    expect(idsOffered).toContain(ids.alliedHealthIncumbent);
    expect(idsOffered).not.toContain(ids.outsider);
  });
});

describe('anon is locked out', () => {
  it('holds no EXECUTE on any of the three functions and no table privilege', async () => {
    const r = await client.query(`
      SELECT
        has_function_privilege('anon', 'public.fn_get_college_leadership(uuid)', 'EXECUTE')     AS f1,
        has_function_privilege('anon', 'public.fn_list_leadership_candidates(uuid)', 'EXECUTE') AS f2,
        has_function_privilege('anon', 'public.fn_set_college_leadership(uuid, text, uuid, uuid)', 'EXECUTE') AS f3,
        has_table_privilege('anon', 'public.institution_leadership', 'SELECT')                  AS t1,
        has_table_privilege('authenticated', 'public.institution_leadership', 'INSERT')         AS t2,
        (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.institution_leadership'::regclass) AS rls
    `);
    const row = r.rows[0];
    expect(row.f1).toBe(false);
    expect(row.f2).toBe(false);
    expect(row.f3).toBe(false);
    expect(row.t1).toBe(false);
    expect(row.t2).toBe(false); // every write goes through the function
    expect(row.rls).toBe(true);
  });
});
