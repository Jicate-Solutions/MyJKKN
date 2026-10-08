/**
 * HR intake helper — behavioural proof for
 * supabase/migrations/20270613101241_hr_intake_helper.sql
 *
 * The migration file is applied VERBATIM with psql, TWICE (a re-run must be
 * harmless), onto plain PostgreSQL with stubs for the tables and RLS helpers it
 * references. The helpers answer from session settings, so every policy is
 * exercised as a real signed-in person: who holds hr.recruitment.create, and
 * which colleges they can reach.
 *
 * REQUIRES a local PostgreSQL 16. Loud, not skipped, when none is reachable
 * (same stance as __tests__/events/event-waitlist-seat-holding.pg.test.ts).
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/hr/intake/intake-schema.pg.test.ts
 * Override the server with HR_INTAKE_TEST_PGHOST / _PGPORT / _PGUSER.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..', '..');
const MIGRATION = path.join(REPO, 'supabase/migrations/20270613101241_hr_intake_helper.sql');

const PGHOST = process.env.HR_INTAKE_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.HR_INTAKE_TEST_PGPORT ?? '5432';
const PGUSER = process.env.HR_INTAKE_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const DBNAME = `myjkkn_hr_intake_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

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

-- The four RLS helpers, answering from the session so a policy sees a real person.
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.super', true), '') = 'true';
$$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.admin', true), '') = 'true';
$$;
CREATE FUNCTION public.user_has_permission(permission_name text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT permission_name = ANY (string_to_array(COALESCE(current_setting('test.perms', true), ''), ','));
$$;
-- Like production (latest definition: 20261201110000_counselling_code_blank_sibling_guard.sql),
-- a NULL institution answers TRUE ("system-wide record"). The policies must not
-- rely on it answering FALSE.
CREATE FUNCTION public.role_has_institution_access(check_institution_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT check_institution_id IS NULL
      OR check_institution_id::text = ANY (string_to_array(COALESCE(current_setting('test.institutions', true), ''), ','));
$$;
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.institutions (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.hr_recruitment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  institution_id uuid REFERENCES public.institutions(id),
  status text NOT NULL DEFAULT 'open'
);
ALTER TABLE public.hr_recruitment_jobs ENABLE ROW LEVEL SECURITY;
-- Production's SELECT policy (rls_initplan_wrap_sweep.sql:2862).
CREATE POLICY hr_recruitment_jobs_select_permission ON public.hr_recruitment_jobs FOR SELECT USING (
  public.is_super_admin() OR public.is_admin()
  OR (public.user_has_permission('hr.recruitment.view') AND public.role_has_institution_access(institution_id))
);
-- hr_job_applications as 20260627 + 20260922000646 left it: the source CHECK inline,
-- so Postgres names it.
CREATE TABLE public.hr_job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.hr_recruitment_jobs(id),
  email text NOT NULL
);
ALTER TABLE public.hr_job_applications
  ADD COLUMN source text NOT NULL DEFAULT 'internal' CHECK (source IN ('internal', 'external_website'));

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.hr_recruitment_jobs, public.profiles, public.institutions TO authenticated;
-- Supabase's default: every NEW table is fully granted to anon. The migration must undo it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;
let tmp: string;

const INST_A = randomUUID();
const INST_B = randomUUID();
const HR_A = randomUUID();
const HR_A2 = randomUUID();
const HR_B = randomUUID();
const NOBODY = randomUUID();
const ADMIN = randomUUID();
let JOB_A = '';
let JOB_B = '';
let JOB_NONE = '';

interface Person {
  uid: string;
  perms: string;
  institutions: string[];
  admin?: boolean;
}
const hrA: Person = { uid: HR_A, perms: 'hr.recruitment.create,hr.recruitment.view', institutions: [INST_A] };
const hrA2: Person = { uid: HR_A2, perms: 'hr.recruitment.create,hr.recruitment.view', institutions: [INST_A] };
const hrB: Person = { uid: HR_B, perms: 'hr.recruitment.create,hr.recruitment.view', institutions: [INST_B] };
const nobody: Person = { uid: NOBODY, perms: 'hr.recruitment.view', institutions: [INST_A] };
const admin: Person = { uid: ADMIN, perms: '', institutions: [], admin: true };
const hrAB: Person = { uid: HR_A, perms: 'hr.recruitment.create,hr.recruitment.view', institutions: [INST_A, INST_B] };

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await client.query(sql, params)).rows as T[];
}

/** Run `fn` as this person, inside a transaction that is rolled back unless `keep`. */
async function as<T>(p: Person, fn: () => Promise<T>, keep = false): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE authenticated');
    await client.query(
      `SELECT set_config('test.acting_uid', $1, true), set_config('test.perms', $2, true),
              set_config('test.institutions', $3, true), set_config('test.admin', $4, true)`,
      [p.uid, p.perms, p.institutions.join(','), p.admin ? 'true' : 'false'],
    );
    const out = await fn();
    await client.query(keep ? 'COMMIT' : 'ROLLBACK');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

/** The SQLSTATE a statement ends with, or null when it succeeded (inside a savepoint). */
async function state(sql: string, params: unknown[] = []): Promise<string | null> {
  await client.query('SAVEPOINT probe');
  try {
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT probe');
    return null;
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT probe');
    return (e as { code?: string }).code ?? 'unknown';
  }
}

const newBatch = (createdBy: string, inst: string | null) =>
  q<{ id: string }>(
    `INSERT INTO public.hr_intake_batches (file_name, created_by, institution_id) VALUES ('e.tsv', $1, $2) RETURNING id`,
    [createdBy, inst],
  );

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e) {
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}.\n` +
        'This suite applies the real migration and will not pretend to pass without one.\n' +
        `  brew services start postgresql@16\n\n${String((e as { stderr?: string })?.stderr ?? e)}`,
    );
  }
  tmp = mkdtempSync(path.join(tmpdir(), 'hr-intake-'));
  const fixturePath = path.join(tmp, 'fixture.sql');
  writeFileSync(fixturePath, FIXTURE);
  psql(['-d', DBNAME, '-f', fixturePath]);

  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
  await q('INSERT INTO public.institutions (id) VALUES ($1), ($2)', [INST_A, INST_B]);
  await q('INSERT INTO public.profiles (id) VALUES ($1), ($2), ($3), ($4), ($5)', [HR_A, HR_A2, HR_B, NOBODY, ADMIN]);
  JOB_A = (await q<{ id: string }>(`INSERT INTO public.hr_recruitment_jobs (title, institution_id) VALUES ('Post A', $1) RETURNING id`, [INST_A]))[0].id;
  JOB_B = (await q<{ id: string }>(`INSERT INTO public.hr_recruitment_jobs (title, institution_id) VALUES ('Post B', $1) RETURNING id`, [INST_B]))[0].id;
  JOB_NONE = (await q<{ id: string }>(`INSERT INTO public.hr_recruitment_jobs (title) VALUES ('Post with no college') RETURNING id`))[0].id;
  await q(`INSERT INTO public.hr_job_applications (job_id, email, source) VALUES ($1, 'a@example.test', 'external_website')`, [JOB_A]);

  // Verbatim, twice: a re-run must be harmless.
  psql(['-d', DBNAME, '-f', MIGRATION]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
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

describe('hr_job_applications gains the cvviz_import source', () => {
  it('has exactly one source CHECK after two runs, and it admits cvviz_import', async () => {
    const checks = await q<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'public.hr_job_applications'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%source%'`,
    );
    expect(checks).toHaveLength(1);
    expect(checks[0].def).toContain('cvviz_import');
    expect(checks[0].def).toContain('external_website');
    await client.query('BEGIN');
    expect(await state(`INSERT INTO public.hr_job_applications (job_id, email, source) VALUES ($1, 'b@example.test', 'cvviz_import')`, [JOB_A])).toBeNull();
    expect(await state(`INSERT INTO public.hr_job_applications (job_id, email, source) VALUES ($1, 'c@example.test', 'bogus')`, [JOB_A])).toBe('23514');
    await client.query('ROLLBACK');
    const col = await q(`SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_job_applications' AND column_name = 'cvviz_profile_url'`);
    expect(col).toHaveLength(1);
  });

  it('stops, naming the value, before dropping anything when an unknown source exists', async () => {
    await q(`ALTER TABLE public.hr_job_applications DROP CONSTRAINT hr_job_applications_source_check`);
    await q(`INSERT INTO public.hr_job_applications (job_id, email, source) VALUES ($1, 'd@example.test', 'legacy_import')`, [JOB_A]);
    let stderr = '';
    try {
      psql(['-d', DBNAME, '-f', MIGRATION]);
    } catch (e) {
      stderr = String((e as { stderr?: string }).stderr ?? '');
    }
    expect(stderr).toContain('does not know: legacy_import');
    await q(`DELETE FROM public.hr_job_applications WHERE source = 'legacy_import'`);
    psql(['-d', DBNAME, '-f', MIGRATION]);
    const checks = await q(`SELECT 1 FROM pg_constraint WHERE conname = 'hr_job_applications_source_check'`);
    expect(checks).toHaveLength(1);
  });
});

describe('the anonymous key reaches nothing', () => {
  it.each(['hr_intake_batches', 'hr_intake_rows', 'hr_intake_match_rules'])('%s: permission denied for anon', async (t) => {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE anon');
    expect(await state(`SELECT 1 FROM public.${t}`)).toBe('42501');
    expect(await state(`INSERT INTO public.${t} DEFAULT VALUES`)).toBe('42501');
    await client.query('ROLLBACK');
  });

  it('every table has RLS on', async () => {
    const r = await q<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('hr_intake_batches', 'hr_intake_rows', 'hr_intake_match_rules')`,
    );
    expect(r).toHaveLength(3);
    expect(r.every((x) => x.relrowsecurity)).toBe(true);
  });
});

describe('one CVViZ import per person per job (M2)', () => {
  it('a second cvviz_import for the same job and email (any case) is refused; other sources are not', async () => {
    await client.query('BEGIN');
    expect(await state(`INSERT INTO public.hr_job_applications (job_id, email, source) VALUES ($1, 'Dup@Example.test', 'cvviz_import')`, [JOB_A])).toBeNull();
    expect(await state(`INSERT INTO public.hr_job_applications (job_id, email, source) VALUES ($1, 'dup@example.test', 'cvviz_import')`, [JOB_A])).toBe('23505');
    // The same person under another job, or arriving through another source, is not this index's business.
    expect(await state(`INSERT INTO public.hr_job_applications (job_id, email, source) VALUES ($1, 'dup@example.test', 'cvviz_import')`, [JOB_B])).toBeNull();
    expect(await state(`INSERT INTO public.hr_job_applications (job_id, email, source) VALUES ($1, 'dup@example.test', 'internal')`, [JOB_A])).toBeNull();
    await client.query('ROLLBACK');
  });

  it('stops, naming them, when existing rows already break it', async () => {
    await q(`DROP INDEX public.uq_hr_job_applications_cvviz_job_email`);
    await q(
      `INSERT INTO public.hr_job_applications (job_id, email, source) VALUES ($1, 'twice@example.test', 'cvviz_import'), ($1, 'TWICE@example.test', 'cvviz_import')`,
      [JOB_A],
    );
    let stderr = '';
    try {
      psql(['-d', DBNAME, '-f', MIGRATION]);
    } catch (e) {
      stderr = String((e as { stderr?: string }).stderr ?? '');
    }
    expect(stderr).toContain('already holds the same CVViZ import twice');
    expect(stderr).toContain('twice@example.test (2 rows)');
    await q(`DELETE FROM public.hr_job_applications WHERE lower(email) = 'twice@example.test'`);
    psql(['-d', DBNAME, '-f', MIGRATION]);
    expect(await q(`SELECT 1 FROM pg_indexes WHERE indexname = 'uq_hr_job_applications_cvviz_job_email'`)).toHaveLength(1);
  });
});

describe('signed-in people can only read; the server writes (M4)', () => {
  it.each(['hr_intake_batches', 'hr_intake_rows', 'hr_intake_match_rules'])(
    '%s: no INSERT, UPDATE or DELETE for authenticated, even for an admin',
    async (t) => {
      for (const p of [hrA, admin]) {
        await as(p, async () => {
          expect(await state(`INSERT INTO public.${t} DEFAULT VALUES`)).toBe('42501');
          expect(await state(`UPDATE public.${t} SET updated_at = now()`)).toBe('42501');
          expect(await state(`DELETE FROM public.${t}`)).toBe('42501');
          expect(await state(`SELECT 1 FROM public.${t}`)).toBeNull();
        });
      }
    },
  );

  it('no write policy is left behind', async () => {
    const pols = await q<{ policyname: string; cmd: string }>(
      `SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('hr_intake_batches', 'hr_intake_rows', 'hr_intake_match_rules')`,
    );
    expect(pols.map((p) => p.cmd).sort()).toEqual(['SELECT', 'SELECT', 'SELECT']);
  });
});

describe('batches and rows: the uploader, or HR of the same college (B1)', () => {
  it('a batch must carry a college', async () => {
    await client.query('BEGIN');
    expect(await state(`INSERT INTO public.hr_intake_batches (file_name, created_by, institution_id) VALUES ('e', $1, NULL)`, [HR_A])).toBe('23502');
    await client.query('ROLLBACK');
  });

  it('scopes reads by permission and college', async () => {
    const batchA = (await newBatch(HR_A, INST_A))[0].id;
    await q(
      `INSERT INTO public.hr_intake_rows (batch_id, row_index, candidate, proposal_action, proposal_confidence) VALUES ($1, 1, '{}', 'skip', 'high')`,
      [batchA],
    );
    // A job that a card was decided under can still be deleted: the card keeps
    // its decision with no job (filing refuses it), and nothing blocks the delete.
    await client.query('BEGIN');
    const gone = (await q<{ id: string }>(`INSERT INTO public.hr_recruitment_jobs (title, institution_id) VALUES ('Short-lived', $1) RETURNING id`, [INST_A]))[0].id;
    await q(
      `INSERT INTO public.hr_intake_rows (batch_id, row_index, candidate, proposal_action, proposal_confidence, decision_action, decision_job_id) VALUES ($1, 2, '{}', 'skip', 'high', 'file_under_job', $2)`,
      [batchA, gone],
    );
    expect(await state(`DELETE FROM public.hr_recruitment_jobs WHERE id = $1`, [gone])).toBeNull();
    expect((await q<{ j: string | null }>(`SELECT decision_job_id AS j FROM public.hr_intake_rows WHERE batch_id = $1 AND row_index = 2`, [batchA]))[0].j).toBeNull();
    await client.query('ROLLBACK');

    await as(hrA, async () => {
      expect(await q(`SELECT id FROM public.hr_intake_batches`)).toHaveLength(1);
      expect(await q(`SELECT id FROM public.hr_intake_rows`)).toHaveLength(1);
    });
    // Same college, other HR person: sees it.
    await as(hrA2, async () => {
      expect(await q(`SELECT id FROM public.hr_intake_batches`)).toHaveLength(1);
      expect(await q(`SELECT id FROM public.hr_intake_rows`)).toHaveLength(1);
    });
    // Another college: sees nothing.
    await as(hrB, async () => {
      expect(await q(`SELECT id FROM public.hr_intake_batches`)).toHaveLength(0);
      expect(await q(`SELECT id FROM public.hr_intake_rows`)).toHaveLength(0);
    });
    // Holding only the view permission is not enough.
    await as(nobody, async () => {
      expect(await q(`SELECT id FROM public.hr_intake_batches`)).toHaveLength(0);
    });
    await q(`DELETE FROM public.hr_intake_batches WHERE id = $1`, [batchA]);
  });

  it('even if a batch with no college existed, HR elsewhere could not read it (the guard, not only NOT NULL)', async () => {
    // Remove the first wall inside a transaction to prove the second one holds
    // against a role_has_institution_access() that answers TRUE for NULL.
    await client.query('BEGIN');
    try {
      await client.query(`ALTER TABLE public.hr_intake_batches ALTER COLUMN institution_id DROP NOT NULL`);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO public.hr_intake_batches (file_name, created_by, institution_id) VALUES ('orphan', $1, NULL) RETURNING id`,
        [HR_A],
      );
      await client.query(
        `INSERT INTO public.hr_intake_rows (batch_id, row_index, candidate, proposal_action, proposal_confidence) VALUES ($1, 1, '{}', 'skip', 'high')`,
        [rows[0].id],
      );
      // The stub really does answer TRUE for NULL, like production.
      expect((await client.query(`SELECT public.role_has_institution_access(NULL) AS ok`)).rows[0].ok).toBe(true);

      await client.query('SAVEPOINT as_b');
      await client.query('SET LOCAL ROLE authenticated');
      await client.query(
        `SELECT set_config('test.acting_uid', $1, true), set_config('test.perms', $2, true), set_config('test.institutions', $3, true), set_config('test.admin', 'false', true)`,
        [HR_B, hrB.perms, INST_B],
      );
      expect((await client.query(`SELECT id FROM public.hr_intake_batches`)).rows).toHaveLength(0);
      expect((await client.query(`SELECT id FROM public.hr_intake_rows`)).rows).toHaveLength(0);
      await client.query('ROLLBACK TO SAVEPOINT as_b');
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('match rules: within the college of their job (B1, M3)', () => {
  it('a rule must carry a college, one per title per college, visible only there', async () => {
    await client.query('BEGIN');
    expect(await state(
      `INSERT INTO public.hr_intake_match_rules (cvviz_job_title_norm, job_id, institution_id, created_by) VALUES ('post z', $1, NULL, $2)`,
      [JOB_NONE, ADMIN],
    )).toBe('23502');
    await client.query('ROLLBACK');

    await q(
      `INSERT INTO public.hr_intake_match_rules (cvviz_job_title_norm, job_id, institution_id, created_by) VALUES ('post x', $1, $2, $3)`,
      [JOB_A, INST_A, HR_A],
    );
    await client.query('BEGIN');
    expect(await state(
      `INSERT INTO public.hr_intake_match_rules (cvviz_job_title_norm, job_id, institution_id, created_by) VALUES ('post x', $1, $2, $3)`,
      [JOB_A, INST_A, HR_A2],
    )).toBe('23505');
    // The same title may route to another college's own job.
    expect(await state(
      `INSERT INTO public.hr_intake_match_rules (cvviz_job_title_norm, job_id, institution_id, created_by) VALUES ('post x', $1, $2, $3)`,
      [JOB_B, INST_B, HR_B],
    )).toBeNull();
    await client.query('ROLLBACK');

    await as(hrA, async () => expect(await q(`SELECT id FROM public.hr_intake_match_rules`)).toHaveLength(1));
    await as(hrB, async () => expect(await q(`SELECT id FROM public.hr_intake_match_rules`)).toHaveLength(0));
    await as(nobody, async () => expect(await q(`SELECT id FROM public.hr_intake_match_rules`)).toHaveLength(0));
    await as(hrAB, async () => expect(await q(`SELECT id FROM public.hr_intake_match_rules`)).toHaveLength(1));
    await q(`DELETE FROM public.hr_intake_match_rules`);
  });
});
describe('the resume bucket', () => {
  it('is private with a 10 MB limit and resume types only', async () => {
    const [b] = await q<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'hr-intake'`,
    );
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(10 * 1024 * 1024);
    expect(b.allowed_mime_types).toContain('application/pdf');
    expect(b.allowed_mime_types).not.toContain('text/html');
  });
});
