/**
 * WHY a leadership post was given, and when it ends.
 * Behavioural proof for supabase/migrations/20260809103500_leadership_appointment_basis.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The migration files are applied VERBATIM with psql. This suite never
 * re-implements a COALESCE, a join or a vacate rule in TypeScript — it seeds the
 * estate, calls the real functions and reads back what PostgreSQL actually did.
 * A test that models the SQL only proves the model agrees with itself.
 *
 * THE HEADLINE CHECK IS A BEFORE/AFTER SNAPSHOT, NOT AN ASSERTION ABOUT SQL.
 * fn_get_college_leadership is called for every college BEFORE 20260809103500 is
 * applied and again AFTER, and the two answers must be identical. That is the
 * only form of the "all 11 principals still resolve" claim that cannot be
 * satisfied by a test author who has misunderstood the query.
 *
 * All three migrations are applied in filename order:
 *   20260809101500_college_leadership.sql            (the original functions)
 *   20260809102100_institution_leadership_posts.sql  (the table + the fallback)
 *   20260809103500_leadership_appointment_basis.sql  (this PR)
 *
 * REQUIRES a local PostgreSQL. It is NOT run by CI (no workflow in
 * .github/workflows runs this path) and is deliberately loud rather than skipped
 * when no server is reachable — a silent skip would report green over a suite
 * that never executed.
 *
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/organizations/leadership-appointment-basis.test.ts
 *
 * Override the server with LEADERSHIP_TEST_PGHOST / _PGPORT / _PGUSER.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const M_BASE = path.join(REPO, 'supabase/migrations/20260809101500_college_leadership.sql');
const M_POSTS = path.join(
  REPO,
  'supabase/migrations/20260809102100_institution_leadership_posts.sql',
);
const M_BASIS = path.join(
  REPO,
  'supabase/migrations/20260809103500_leadership_appointment_basis.sql',
);

const PGHOST = process.env.LEADERSHIP_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.LEADERSHIP_TEST_PGPORT ?? '5432';
const PGUSER = process.env.LEADERSHIP_TEST_PGUSER ?? process.env.USER ?? 'postgres';

/**
 * Production table shapes, reduced to the columns these functions touch. Taken
 * from supabase/setup/01_tables.sql and the migrations that created them,
 * including the two constraints that drive real behaviour
 * (user_roles_unique_assignment, idx_user_roles_primary_unique).
 *
 * The permission helpers answer from the acting profile exactly as the SECURITY
 * DEFINER originals do, so authorisation is real rather than stubbed open.
 */
const FIXTURE = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;

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

INSERT INTO public.custom_roles (role_key, role_name, description, permissions, institution_scope, is_system_role)
VALUES ('principal', 'Principal', 'Head of a college',
        '{"organizations.leadership.manage": true,
          "academic.attendance.view": true,
          "hr.recruitment.approve": true,
          "learners.onboarding.delete": true}'::jsonb,
        'own', true);

INSERT INTO public.custom_roles (role_key, role_name, description, permissions, institution_scope, is_system_role)
VALUES ('cao', 'Chief Administrative Officer', 'CAO', '{}'::jsonb, 'all', false);
`;

/**
 * The ten colleges that answer "who is Principal?" through the DERIVED arm on
 * production, named as they are named there. Dental and Education are the two
 * this PR cares about; the rest are present because the regression is about all
 * of them surviving, not about the interesting two.
 */
const DERIVED_COLLEGES = [
  'JKKN Dental College',
  'JKKN College of Pharmacy',
  'JKKN College of Engineering and Technology',
  'JKKN College of Arts and Science (Self)',
  'JKKN College of Nursing',
  'JKKN College of Education',
  'JKKN Matriculation Higher Secondary School',
  'JKKN Nattraja Vidhyalaya',
  'JKKN Polytechnic College',
  'JKKN Institute of Physiotherapy',
];
/** The one college that answers through an EXPLICIT institution_leadership row. */
const EXPLICIT_COLLEGE = 'JKKN College of Allied Health Sciences';

function psql(db: string, args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

interface Post {
  user_id: string;
  full_name: string | null;
  email: string | null;
  basis_code?: string | null;
  basis_label?: string | null;
  basis_passes_to_successor?: boolean | null;
  basis_note?: string | null;
  assigned_at?: string | null;
  assigned_by_name?: string | null;
}

/**
 * Builds a database that mirrors production the moment before 20260809103500 is
 * applied: eleven colleges with a Principal, ten of them derived and one — Allied
 * Health — held by an EXPLICIT institution_leadership row with NO basis recorded,
 * because that is exactly the single explicit row live today.
 *
 * Returns the connected client plus the ids the assertions need.
 */
async function buildEstate(dbName: string, tmpDir: string) {
  psql('postgres', ['-c', `CREATE DATABASE ${dbName}`]);

  const fixturePath = path.join(tmpDir, `${dbName}-fixture.sql`);
  writeFileSync(fixturePath, FIXTURE);
  psql(dbName, ['-f', fixturePath]);
  psql(dbName, ['-f', M_BASE]);
  psql(dbName, ['-f', M_POSTS]);

  const client = new Client({
    host: PGHOST,
    port: Number(PGPORT),
    user: PGUSER,
    database: dbName,
  });
  await client.connect();

  const principalRoleId = (
    await client.query(`SELECT id FROM custom_roles WHERE role_key = 'principal'`)
  ).rows[0].id;
  const caoRoleId = (await client.query(`SELECT id FROM custom_roles WHERE role_key = 'cao'`))
    .rows[0].id;

  // The Director. §6 of the migration resolves assigned_by by this email.
  const director = (
    await client.query(
      `INSERT INTO profiles (email, full_name, is_super_admin)
       VALUES ('director@jkkn.ac.in', 'Ommsharravana S', true) RETURNING id`,
    )
  ).rows[0].id;

  const colleges: { id: string; name: string; principal: string }[] = [];
  for (const name of DERIVED_COLLEGES) {
    const inst = (
      await client.query(`INSERT INTO institutions (name) VALUES ($1) RETURNING id`, [name])
    ).rows[0].id;
    const email =
      name === 'JKKN College of Education'
        ? 'cao@jkkn.ac.in'
        : `principal.${name.replace(/\W+/g, '').toLowerCase().slice(0, 18)}@jkkn.ac.in`;
    const fullName =
      name === 'JKKN College of Education'
        ? 'Dr. RAJENDIRAN K M'
        : name === 'JKKN Dental College'
          ? 'Dr Dhanasekar Balakrishnan'
          : `Principal of ${name}`;
    const person = (
      await client.query(
        `INSERT INTO profiles (email, full_name, institution_id, role)
         VALUES ($1, $2, $3, 'principal') RETURNING id`,
        [email, fullName, inst],
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ($1, $2, true)`,
      [person, principalRoleId],
    );
    colleges.push({ id: inst, name, principal: person });
  }

  const rajendiran = colleges.find((c) => c.name === 'JKKN College of Education')!.principal;
  const dhanasekar = colleges.find((c) => c.name === 'JKKN Dental College')!.principal;

  // Rajendiran ALSO holds CAO — the whole reason his principalship needs a basis:
  // stored side by side, one post reads as implying the other.
  await client.query(
    `INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ($1, $2, false)`,
    [rajendiran, caoRoleId],
  );

  // Allied Health: the ONE explicit row on production, with no basis recorded.
  const alliedHealth = (
    await client.query(`INSERT INTO institutions (name) VALUES ($1) RETURNING id`, [
      EXPLICIT_COLLEGE,
    ])
  ).rows[0].id;
  await client.query(
    `INSERT INTO user_institution_access (user_id, institution_id, is_active)
     VALUES ($1, $2, true)`,
    [dhanasekar, alliedHealth],
  );
  await client.query(
    `INSERT INTO institution_leadership (institution_id, position, user_id, assigned_by, is_active)
     VALUES ($1, 'principal', $2, $3, true)`,
    [alliedHealth, dhanasekar, director],
  );

  await client.query(`SELECT set_config('test.acting_uid', $1, false)`, [director]);

  return {
    client,
    director,
    rajendiran,
    dhanasekar,
    alliedHealth,
    colleges,
    education: colleges.find((c) => c.name === 'JKKN College of Education')!.id,
    dental: colleges.find((c) => c.name === 'JKKN Dental College')!.id,
    allInstitutions: [...colleges.map((c) => c.id), alliedHealth],
  };
}

async function readPrincipal(client: Client, institutionId: string): Promise<Post | null> {
  const r = await client.query('SELECT public.fn_get_college_leadership($1) AS j', [
    institutionId,
  ]);
  return r.rows[0].j.principal as Post | null;
}

const DB = `myjkkn_basis_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
const DB_MUT = `myjkkn_basis_mut_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

let tmp: string;
let env: Awaited<ReturnType<typeof buildEstate>>;
let mutClient: Client | null = null;

/** Every college's Principal as read BEFORE 20260809103500 was applied. */
const before = new Map<string, string | null>();
/** …and after. */
const after = new Map<string, string | null>();

let mutationLostAlliedHealth: boolean | null = null;

beforeAll(async () => {
  try {
    psql('postgres', ['-c', 'SELECT 1']);
  } catch (e: any) {
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}.\n` +
        `This suite applies the real migration files and proves behaviour against a\n` +
        `throwaway database; it will not pretend to pass without one.\n` +
        `  brew services start postgresql@16\n\n` +
        String(e?.stderr || e?.message || e),
    );
  }

  tmp = mkdtempSync(path.join(tmpdir(), 'leadership-basis-'));
  env = await buildEstate(DB, tmp);

  // --- THE SNAPSHOT. Taken through the real function, before the change. -----
  for (const inst of env.allInstitutions) {
    const p = await readPrincipal(env.client, inst);
    before.set(inst, p?.user_id ?? null);
  }

  psql(DB, ['-f', M_BASIS]);

  for (const inst of env.allInstitutions) {
    const p = await readPrincipal(env.client, inst);
    after.set(inst, p?.user_id ?? null);
  }

  // --- NON-VACUITY CONTROL --------------------------------------------------
  // The same estate, with the LEFT JOIN to the basis vocabulary turned into an
  // INNER JOIN — the single most plausible way to write this change wrong. If the
  // suite above passes for a reason unrelated to that join, this control will
  // also pass, and the suite proves nothing.
  const mutated = readFileSync(M_BASIS, 'utf8').replace(
    /LEFT JOIN public\.leadership_appointment_basis/g,
    'JOIN public.leadership_appointment_basis',
  );
  const mutPath = path.join(tmp, 'mutated.sql');
  writeFileSync(mutPath, mutated);

  const mutEnv = await buildEstate(DB_MUT, tmp);
  mutClient = mutEnv.client;
  psql(DB_MUT, ['-f', mutPath]);
  const mutAllied = await readPrincipal(mutClient, mutEnv.alliedHealth);
  mutationLostAlliedHealth = mutAllied === null;
}, 240_000);

afterAll(async () => {
  if (env?.client) await env.client.end();
  if (mutClient) await mutClient.end();
  for (const db of [DB, DB_MUT]) {
    try {
      psql('postgres', ['-c', `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`]);
    } catch {
      /* the throwaway databases are disposable; a failure to drop must not fail the run */
    }
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

// ===========================================================================
describe('🛑 the regression: every sitting Principal still resolves', () => {
  it('found a Principal at all 11 colleges before the change', () => {
    const filled = [...before.values()].filter(Boolean);
    expect(filled).toHaveLength(11);
    expect(new Set(filled).size).toBe(10); // Dr Dhanasekar holds two of them
  });

  it('returns the IDENTICAL Principal at every college after the change', () => {
    // Compared as a whole map rather than college by college, so a college that
    // vanished from the payload entirely also fails.
    expect([...after.entries()].sort()).toEqual([...before.entries()].sort());
  });

  it('kept the DERIVED arm answering — 10 colleges with no explicit row', async () => {
    const r = await env.client.query(
      `SELECT count(*)::int AS n FROM institution_leadership WHERE is_active`,
    );
    // Allied Health (seeded) + Education (backfilled by §6). The other nine
    // colleges still have no row at all and are still answered.
    expect(r.rows[0].n).toBe(2);

    const stillDerived = env.colleges.filter((c) => c.name !== 'JKKN College of Education');
    expect(stillDerived).toHaveLength(9);
    for (const c of stillDerived) {
      const p = await readPrincipal(env.client, c.id);
      expect(p, `${c.name} lost its Principal`).not.toBeNull();
      expect(p!.user_id).toBe(c.principal);
    }
  });

  it('reports an unrecorded basis as null and NEVER as ex officio', async () => {
    const dental = await readPrincipal(env.client, env.dental);
    expect(dental!.basis_code).toBeNull();
    expect(dental!.basis_label).toBeNull();
    expect(dental!.basis_passes_to_successor).toBeNull();
  });

  it('keeps an EXPLICIT row with no basis visible (LEFT JOIN, not INNER)', async () => {
    const allied = await readPrincipal(env.client, env.alliedHealth);
    expect(allied, 'Allied Health went dark').not.toBeNull();
    expect(allied!.user_id).toBe(env.dhanasekar);
    expect(allied!.basis_code).toBeNull();
  });

  it('NON-VACUITY: the INNER JOIN mutant really does lose Allied Health', () => {
    // If this is false, every assertion above passes for some other reason.
    expect(mutationLostAlliedHealth).toBe(true);
  });

  it('still reports an unfilled post as JSON null, not a bag of null keys', async () => {
    const r = await env.client.query('SELECT public.fn_get_college_leadership($1) AS j', [
      env.dental,
    ]);
    expect(r.rows[0].j.vice_principal).toBeNull();
  });
});

// ===========================================================================
describe('the Director decision is recorded on the right row', () => {
  it('backfilled exactly one Education row, naming Rajendiran', async () => {
    const r = await env.client.query(
      `SELECT user_id, basis_code, basis_note, assigned_by
         FROM institution_leadership
        WHERE institution_id = $1 AND position = 'principal' AND is_active`,
      [env.education],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].user_id).toBe(env.rajendiran);
    expect(r.rows[0].basis_code).toBe('personal');
    expect(r.rows[0].assigned_by).toBe(env.director);
  });

  it('says it is personal, names the CAO exclusion and the end condition', async () => {
    const p = await readPrincipal(env.client, env.education);
    expect(p!.basis_code).toBe('personal');
    expect(p!.basis_passes_to_successor).toBe(false);
    expect(p!.basis_note).toContain('NOT held by virtue of being CAO');
    expect(p!.basis_note).toContain('moves out of JKKN');
    expect(p!.assigned_by_name).toBe('Ommsharravana S');
    expect(p!.assigned_at).not.toBeNull();
  });

  it('did not change WHO is Principal of Education', () => {
    expect(after.get(env.education)).toBe(before.get(env.education));
    expect(after.get(env.education)).toBe(env.rajendiran);
  });

  it('left every other college with no basis at all', async () => {
    const r = await env.client.query(
      `SELECT count(*)::int AS n FROM institution_leadership
        WHERE basis_code IS NOT NULL AND institution_id <> $1`,
      [env.education],
    );
    expect(r.rows[0].n).toBe(0);
  });

  it('is idempotent — replaying the migration writes no second row', async () => {
    psql(DB, ['-f', M_BASIS]);
    const r = await env.client.query(
      `SELECT count(*)::int AS n FROM institution_leadership
        WHERE institution_id = $1 AND position = 'principal' AND is_active`,
      [env.education],
    );
    expect(r.rows[0].n).toBe(1);
    expect(after.get(env.education)).toBe(
      (await readPrincipal(env.client, env.education))!.user_id,
    );
  });
});

// ===========================================================================
describe('the vocabulary carries the semantic, not the UI', () => {
  it('seeds exactly the two bases the decision names', async () => {
    const r = await env.client.query(
      `SELECT code, passes_to_successor FROM leadership_appointment_basis
        WHERE is_active ORDER BY sort_order`,
    );
    expect(r.rows.map((x) => x.code)).toEqual(['ex_officio', 'personal']);
    expect(r.rows.map((x) => x.passes_to_successor)).toEqual([true, false]);
  });

  it('extends with one INSERT — a third basis needs no migration and no deploy', async () => {
    await env.client.query(
      `INSERT INTO leadership_appointment_basis
         (code, label, description, passes_to_successor, sort_order)
       VALUES ('acting', 'Acting', 'Holding the post until a permanent appointment', false, 30)`,
    );
    const r = await env.client.query(
      `SELECT public.fn_set_college_leadership($1, 'principal', $2, NULL, 'acting', 'cover') AS j`,
      [env.dental, env.dhanasekar],
    );
    expect(r.rows[0].j.ok).toBe(true);

    // …and the READ picks up its label and its semantic with no code change.
    const p = await readPrincipal(env.client, env.dental);
    expect(p!.basis_code).toBe('acting');
    expect(p!.basis_label).toBe('Acting');
    expect(p!.basis_passes_to_successor).toBe(false);
  });

  it('refuses a basis that is not in the vocabulary rather than dropping it', async () => {
    await expect(
      env.client.query(
        `SELECT public.fn_set_college_leadership($1, 'principal', $2, NULL, 'made_up', NULL)`,
        [env.dental, env.dhanasekar],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('refuses a retired basis too', async () => {
    await env.client.query(
      `UPDATE leadership_appointment_basis SET is_active = false WHERE code = 'acting'`,
    );
    await expect(
      env.client.query(
        `SELECT public.fn_set_college_leadership($1, 'principal', $2, NULL, 'acting', NULL)`,
        [env.dental, env.dhanasekar],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await env.client.query(
      `UPDATE leadership_appointment_basis SET is_active = true WHERE code = 'acting'`,
    );
  });

  it('refuses a basis on a post that has nowhere to keep one', async () => {
    await expect(
      env.client.query(
        `SELECT public.fn_set_college_leadership($1, 'iqac_chair', $2, NULL, 'personal', NULL)`,
        [env.dental, env.dhanasekar],
      ),
    ).rejects.toMatchObject({ code: '22023' });
  });
});

// ===========================================================================
describe('a recorded reason is not lost by accident, and not inherited', () => {
  it('survives a re-save that supplies no basis for the same holder', async () => {
    await env.client.query(
      `SELECT public.fn_set_college_leadership($1, 'principal', $2, NULL, NULL, NULL)`,
      [env.education, env.rajendiran],
    );
    const p = await readPrincipal(env.client, env.education);
    expect(p!.user_id).toBe(env.rajendiran);
    expect(p!.basis_code).toBe('personal');
    expect(p!.basis_note).toContain('moves out of JKKN');
  });

  it('is replaced, not merged, when a new basis is supplied', async () => {
    await env.client.query(
      `SELECT public.fn_set_college_leadership($1, 'principal', $2, NULL, 'ex_officio', 'corrected')`,
      [env.education, env.rajendiran],
    );
    const p = await readPrincipal(env.client, env.education);
    expect(p!.basis_code).toBe('ex_officio');
    expect(p!.basis_passes_to_successor).toBe(true);
    expect(p!.basis_note).toBe('corrected');
  });

  it('does NOT hand the previous holder’s reason to a replacement', async () => {
    const successor = (
      await env.client.query(
        `INSERT INTO profiles (email, full_name, institution_id)
         VALUES ('newprincipal.education@jkkn.ac.in', 'A Successor', $1) RETURNING id`,
        [env.education],
      )
    ).rows[0].id;

    await env.client.query(
      `SELECT public.fn_set_college_leadership($1, 'principal', $2, NULL, NULL, NULL)`,
      [env.education, successor],
    );

    const p = await readPrincipal(env.client, env.education);
    expect(p!.user_id).toBe(successor);
    expect(p!.basis_code).toBeNull();
    expect(p!.basis_note).toBeNull();
  });

  it('kept the outgoing holder’s row, and its reason, as history', async () => {
    const r = await env.client.query(
      `SELECT basis_code, basis_note FROM institution_leadership
        WHERE institution_id = $1 AND user_id = $2 AND NOT is_active`,
      [env.education, env.rajendiran],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].basis_code).toBe('ex_officio');
    expect(r.rows[0].basis_note).toBe('corrected');
  });
});

// ===========================================================================
describe('the locks', () => {
  it('dropped the old 4-argument write path so no call silently discards a basis', async () => {
    const r = await env.client.query(`
      SELECT to_regprocedure('public.fn_set_college_leadership(uuid, text, uuid, uuid)') AS old,
             to_regprocedure('public.fn_set_college_leadership(uuid, text, uuid, uuid, text, text)') AS current
    `);
    expect(r.rows[0].old).toBeNull();
    expect(r.rows[0].current).not.toBeNull();
  });

  it('still accepts the page’s existing 4-argument named call', async () => {
    const r = await env.client.query(
      `SELECT public.fn_set_college_leadership(
                p_institution_id => $1,
                p_position       => 'principal',
                p_user_id        => $2,
                p_department_id  => NULL) AS j`,
      [env.dental, env.dhanasekar],
    );
    expect(r.rows[0].j.ok).toBe(true);
  });

  it('locks anon out of both functions and of the vocabulary', async () => {
    const r = await env.client.query(`
      SELECT
        has_function_privilege('anon', 'public.fn_get_college_leadership(uuid)', 'EXECUTE') AS f1,
        has_function_privilege('anon', 'public.fn_set_college_leadership(uuid, text, uuid, uuid, text, text)', 'EXECUTE') AS f2,
        has_function_privilege('authenticated', 'public.fn_get_college_leadership(uuid)', 'EXECUTE') AS f3,
        has_function_privilege('authenticated', 'public.fn_set_college_leadership(uuid, text, uuid, uuid, text, text)', 'EXECUTE') AS f4,
        has_table_privilege('anon', 'public.leadership_appointment_basis', 'SELECT') AS t1,
        has_table_privilege('authenticated', 'public.leadership_appointment_basis', 'SELECT') AS t2,
        has_table_privilege('authenticated', 'public.leadership_appointment_basis', 'UPDATE') AS t3,
        (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.leadership_appointment_basis'::regclass) AS rls
    `);
    const row = r.rows[0];
    expect(row.f1).toBe(false);
    expect(row.f2).toBe(false);
    expect(row.f3).toBe(true);
    expect(row.f4).toBe(true);
    expect(row.t1).toBe(false);
    expect(row.t2).toBe(true); // the picker reads the list
    expect(row.t3).toBe(false); // …and cannot change it
    expect(row.rls).toBe(true);
  });

  it('will not let a basis in use be deleted out from under an appointment', async () => {
    await expect(
      env.client.query(`DELETE FROM leadership_appointment_basis WHERE code = 'ex_officio'`),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
