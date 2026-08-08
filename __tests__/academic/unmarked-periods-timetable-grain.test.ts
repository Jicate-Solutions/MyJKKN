/**
 * Semester-level timetables must be COUNTED, and must DISAPPEAR once marked.
 * Behavioural proof for supabase/migrations/20260816030000_unmarked_periods_regrain_to_timetable.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The migration is applied VERBATIM. This suite never re-implements the counting
 * query in TypeScript — it seeds an estate, calls the real function and reads back
 * what PostgreSQL actually did. A test that models the SQL only proves the model
 * agrees with itself.
 *
 * THE HEADLINE CHECK IS A DISAPPEARANCE, NOT A COUNT
 * --------------------------------------------------
 * The dangerous failure here is not "the number is wrong". It is a to-do that can
 * never be cleared. The old clearing test was `sa.section_id = t.section_id`; a
 * semester-level timetable stores NULL there, NULL = NULL is never TRUE, so
 * NOT EXISTS stays true forever and the row keeps reporting itself as unmarked
 * however many times somebody marks it. So the central assertion is: mark a
 * semester-level timetable, call again, and it must be GONE.
 *
 * NON-VACUITY IS PROVED, NOT ASSERTED
 * -----------------------------------
 * Two control functions are built alongside the real one from the pre-fix shapes:
 *   fn_ctl_orig_*   the shipped behaviour (`section_id IS NOT NULL`)
 *   fn_ctl_naive_*  the tempting one-line fix (that predicate simply deleted)
 * Against the SAME fixture the suite shows the naive control counts identically to
 * the original (so the one-line fix moves nothing) and still reports a marked
 * semester-level timetable as unmarked (so the one-line fix is actively harmful).
 * If the real function ever regressed to either shape, these tests fail.
 *
 * No literal production count is asserted anywhere. Roughly nine sessions write
 * the production database concurrently, so a test pinned to 85 or 114 would be
 * measuring the clock. Every assertion here is about a fixture this file created,
 * or about a relationship (before/after, subset, distinctness).
 *
 * REQUIRES a local PostgreSQL. It is NOT run by CI (no workflow in
 * .github/workflows runs this path) and is deliberately loud rather than skipped
 * when no server is reachable — a silent skip would report green over a suite that
 * never executed.
 *
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/academic/unmarked-periods-timetable-grain.test.ts
 *
 * Override the server with UNMARKED_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20260816030000_unmarked_periods_regrain_to_timetable.sql',
);

const PGHOST = process.env.UNMARKED_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.UNMARKED_TEST_PGPORT ?? 5432);
const PGUSER = process.env.UNMARKED_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const PGPASSWORD = process.env.UNMARKED_TEST_PGPASSWORD;

const DBNAME = `unmarked_grain_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

// ── Fixture identifiers. Fixed so failures name a row, not a random uuid. ──────
const INST = '00000000-0000-4000-8000-0000000000a1';
const OTHER_INST = '00000000-0000-4000-8000-0000000000a2';
const DEPT = '00000000-0000-4000-8000-0000000000b1';
// A SECOND department. Every fixture timetable used to share one, which meant a
// department filter could never narrow anything and any assertion about
// department scope was passing vacuously.
const OTHER_DEPT = '00000000-0000-4000-8000-0000000000b2';
const SEC_1 = '00000000-0000-4000-8000-0000000000c1';
const SEC_2 = '00000000-0000-4000-8000-0000000000c2';
const SEC_3 = '00000000-0000-4000-8000-0000000000c3';
const SEC_LEARNER = '00000000-0000-4000-8000-0000000000c9';
const SUPER_ADMIN = '00000000-0000-4000-8000-0000000000d1';
const HOD = '00000000-0000-4000-8000-0000000000d2';
// Cluster-scoped via custom_roles.institution_scope='all', NOT via the
// is_super_admin flag, and carrying no institution_id of their own.
const CLUSTER_ADMIN = '00000000-0000-4000-8000-0000000000d3';
// role='admin' — a legacy value with NO custom_roles row, institution-scoped.
const LEGACY_ADMIN = '00000000-0000-4000-8000-0000000000d4';

const TT = {
  sectionUnmarked: '00000000-0000-4000-8000-0000000000e1',
  semesterUnmarked: '00000000-0000-4000-8000-0000000000e2',
  semesterTemplate: '00000000-0000-4000-8000-0000000000e3',
  sectionMarked: '00000000-0000-4000-8000-0000000000e4',
  sectionSibling: '00000000-0000-4000-8000-0000000000e5',
  notToday: '00000000-0000-4000-8000-0000000000e6',
  inactive: '00000000-0000-4000-8000-0000000000e7',
  /** Lives in a different institution — must never reach an INST-scoped caller. */
  otherInstitution: '00000000-0000-4000-8000-0000000000e8',
  /** Marked, but the attendance row's denormalised institution disagrees with the
   *  timetable's. Production already holds one such row. */
  instMismatch: '00000000-0000-4000-8000-0000000000e9',
  /** Same institution, DIFFERENT department — visible to a cluster/institution
   *  caller, hidden from one narrowed to DEPT. */
  otherDepartment: '00000000-0000-4000-8000-0000000000ea',
} as const;

/** Minimal shape of the four tables the functions read, plus the registry. */
const SCHEMA = `
-- Stand-in for Supabase's auth.uid(). The real one reads the request JWT; this
-- reads the same GUC, so the identity guard can be exercised in BOTH states:
-- a signed-in caller (claim set) and a service-role/internal caller (unset, so
-- the function returns NULL exactly as it does for service_role in production).
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$fn$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  role TEXT,
  is_super_admin BOOLEAN DEFAULT false,
  institution_id UUID
);
-- The role registry. The clamp asks THIS for a role's scope rather than
-- matching role names, so the fixture must carry it or the scope questions
-- below would be answered by a missing relation instead of by the data.
CREATE TABLE public.custom_roles (
  role_key TEXT PRIMARY KEY,
  institution_scope TEXT NOT NULL DEFAULT 'own',
  is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID,
  institution_email TEXT,
  is_active BOOLEAN DEFAULT true,
  department_id UUID,
  institution_id UUID
);
CREATE TABLE public.timetables (
  id UUID PRIMARY KEY,
  is_active BOOLEAN DEFAULT true,
  is_template BOOLEAN DEFAULT false,
  section_id UUID,                       -- nullable: NULL means semester-level
  institution_id UUID,
  department_id UUID,
  selected_days JSONB
);
-- Mirrors production exactly: every one of these columns is NOT NULL there,
-- which is why a marked semester-level timetable stores a REAL section id while
-- its own section_id is NULL — the precise mismatch the old key could not bridge.
CREATE TABLE public.student_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id UUID NOT NULL,
  section_id UUID NOT NULL,
  institution_id UUID NOT NULL,
  attendance_date DATE NOT NULL
);
CREATE TABLE public.quick_action_state_queries (
  query_key TEXT PRIMARY KEY,
  description TEXT,
  sql_function_name TEXT
);
CREATE TABLE public.quick_action_rules (
  id UUID PRIMARY KEY,
  description TEXT,
  action_template JSONB
);
`;

/**
 * CONTROLS — the two shapes this migration must never regress to.
 * `orig` is what shipped; `naive` is that with `section_id IS NOT NULL` deleted
 * and nothing else changed.
 */
const CONTROLS = `
CREATE OR REPLACE FUNCTION public.fn_ctl_orig_unmarked() RETURNS JSONB
LANGUAGE plpgsql STABLE AS $ctl$
DECLARE v_count INT := 0; v_ids UUID[]; v_dow TEXT;
BEGIN
  v_dow := TRIM(UPPER(TO_CHAR(CURRENT_DATE,'DAY')));
  SELECT COUNT(DISTINCT t.section_id)::INT,
         ARRAY(SELECT DISTINCT t2.section_id FROM public.timetables t2
               WHERE t2.is_active AND t2.section_id IS NOT NULL AND t2.selected_days ? v_dow
                 AND NOT EXISTS (SELECT 1 FROM public.student_attendance sa2
                                 WHERE sa2.section_id = t2.section_id
                                   AND sa2.attendance_date = CURRENT_DATE))
  INTO v_count, v_ids
  FROM public.timetables t
  WHERE t.is_active AND t.section_id IS NOT NULL AND t.selected_days ? v_dow
    AND NOT EXISTS (SELECT 1 FROM public.student_attendance sa
                    WHERE sa.section_id = t.section_id AND sa.attendance_date = CURRENT_DATE);
  RETURN jsonb_build_object('count', COALESCE(v_count,0),
                            'sample_period_ids', COALESCE(to_jsonb(v_ids),'[]'::jsonb));
END $ctl$;

CREATE OR REPLACE FUNCTION public.fn_ctl_naive_unmarked() RETURNS JSONB
LANGUAGE plpgsql STABLE AS $ctl$
DECLARE v_count INT := 0; v_ids UUID[]; v_dow TEXT;
BEGIN
  v_dow := TRIM(UPPER(TO_CHAR(CURRENT_DATE,'DAY')));
  SELECT COUNT(DISTINCT t.section_id)::INT,
         ARRAY(SELECT DISTINCT t2.section_id FROM public.timetables t2
               WHERE t2.is_active AND t2.selected_days ? v_dow
                 AND NOT EXISTS (SELECT 1 FROM public.student_attendance sa2
                                 WHERE sa2.section_id = t2.section_id
                                   AND sa2.attendance_date = CURRENT_DATE))
  INTO v_count, v_ids
  FROM public.timetables t
  WHERE t.is_active AND t.selected_days ? v_dow
    AND NOT EXISTS (SELECT 1 FROM public.student_attendance sa
                    WHERE sa.section_id = t.section_id AND sa.attendance_date = CURRENT_DATE);
  RETURN jsonb_build_object('count', COALESCE(v_count,0),
                            'sample_period_ids', COALESCE(to_jsonb(v_ids),'[]'::jsonb));
END $ctl$;

-- The asymmetric control: timetables filtered on t.institution_id, attendance
-- tested on sa.institution_id. This is what the first draft of the fix shipped,
-- and it reopens "unmarked forever" whenever the two columns disagree.
CREATE OR REPLACE FUNCTION public.fn_ctl_asymmetric_says_unmarked(p_tt UUID, p_inst UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $ctl$
  SELECT EXISTS (
    SELECT 1 FROM public.timetables t
    WHERE t.id = p_tt AND t.is_active AND t.institution_id = p_inst
      AND t.selected_days ? TRIM(UPPER(TO_CHAR(CURRENT_DATE,'DAY')))
      AND NOT EXISTS (SELECT 1 FROM public.student_attendance sa
                      WHERE sa.timetable_id = t.id
                        AND sa.attendance_date = CURRENT_DATE
                        AND sa.institution_id = p_inst));
$ctl$;

-- The naive control, asked the one question that matters: is a given timetable
-- still reported as unmarked? Keyed exactly as the naive fix would key it.
CREATE OR REPLACE FUNCTION public.fn_ctl_naive_says_unmarked(p_tt UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $ctl$
  SELECT EXISTS (
    SELECT 1 FROM public.timetables t
    WHERE t.id = p_tt AND t.is_active
      AND t.selected_days ? TRIM(UPPER(TO_CHAR(CURRENT_DATE,'DAY')))
      AND NOT EXISTS (SELECT 1 FROM public.student_attendance sa
                      WHERE sa.section_id = t.section_id
                        AND sa.attendance_date = CURRENT_DATE));
$ctl$;
`;

let admin: Client;
let db: Client;

type Unmarked = { count: number; sample_period_ids: string[] };
type Compliance = {
  total_faculty: number;
  compliant_count: number;
  non_compliant_count: number;
  non_compliant_user_ids: string[];
};

async function unmarkedFor(userId: string): Promise<Unmarked> {
  const r = await db.query(
    'SELECT public.fn_aqs_attendance_unmarked_periods_today($1::uuid) AS j',
    [userId],
  );
  return r.rows[0].j as Unmarked;
}

async function complianceFor(userId: string): Promise<Compliance> {
  const r = await db.query(
    'SELECT public.fn_aqs_attendance_faculty_compliance_today($1::uuid) AS j',
    [userId],
  );
  return r.rows[0].j as Compliance;
}

/** Mark one timetable, exactly as production stores it: a REAL section id on the
 *  row even when the timetable itself is semester-level.
 *  `sectionId` defaults to a section no timetable owns (the semester-level case).
 *  Pass the timetable's OWN section to reproduce how the section-keyed original
 *  behaved — without that, the original control can never clear anything and its
 *  agreement with the naive shape would be a fixture artefact rather than a result.
 *  `institutionId` exists so a row's denormalised institution can be made to
 *  disagree with its timetable's, which is a real production state. */
async function mark(timetableId: string, institutionId = INST, sectionId = SEC_LEARNER) {
  await db.query(
    `INSERT INTO public.student_attendance
       (timetable_id, section_id, institution_id, attendance_date)
     VALUES ($1::uuid, $2::uuid, $3::uuid, CURRENT_DATE)`,
    [timetableId, sectionId, institutionId],
  );
}

async function unmark(timetableId: string) {
  await db.query(
    'DELETE FROM public.student_attendance WHERE timetable_id = $1::uuid AND attendance_date = CURRENT_DATE',
    [timetableId],
  );
}

beforeAll(async () => {
  const base = {
    host: PGHOST,
    port: PGPORT,
    user: PGUSER,
    ...(PGPASSWORD ? { password: PGPASSWORD } : {}),
  };

  admin = new Client({ ...base, database: 'postgres' });
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(
      `Cannot reach PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}. ` +
        'This suite is a behavioural proof and refuses to skip silently. ' +
        `Start one (brew services start postgresql@16) or set UNMARKED_TEST_PGHOST. Cause: ${String(e)}`,
    );
  }
  await admin.query(`CREATE DATABASE ${DBNAME}`);

  db = new Client({ ...base, database: DBNAME });
  await db.connect();

  // The migration REVOKEs from these, so they must exist.
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}')
         THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`,
    );
  }

  await db.query(SCHEMA);
  await db.query(CONTROLS);

  // Applied VERBATIM — never re-typed, never paraphrased.
  await db.query(readFileSync(MIGRATION, 'utf8'));

  const today = (
    await db.query(`SELECT TRIM(UPPER(TO_CHAR(CURRENT_DATE,'DAY'))) AS d`)
  ).rows[0].d as string;
  const notToday = today === 'MONDAY' ? 'TUESDAY' : 'MONDAY';

  // The registry, shaped as production is (measured 2026-08-08): 'administrator'
  // and 'super_admin' are institution_scope='all'; there is NO row named 'admin'
  // at all, even though one live profile still carries that legacy value.
  await db.query(
    `INSERT INTO public.custom_roles (role_key, institution_scope, is_active) VALUES
       ('super_admin',  'all', true),
       ('administrator','all', true),
       ('hod',          'own', true)`,
  );

  await db.query(
    `INSERT INTO public.profiles (id, email, role, is_super_admin, institution_id) VALUES
       ($1,'super@jkkn.ac.in','super_admin',  true,  $3),
       ($2,'hod@jkkn.ac.in',  'hod',          false, $3),
       -- Cluster-scoped by REGISTRY, not by the is_super_admin flag, and with no
       -- institution of their own. Production has 2 of these.
       ($4,'clusteradmin@jkkn.ac.in','administrator', false, NULL),
       -- Legacy value with no registry row, institution-scoped. Production has 1.
       ($5,'legacyadmin@jkkn.ac.in','admin',          false, $3)`,
    [SUPER_ADMIN, HOD, INST, CLUSTER_ADMIN, LEGACY_ADMIN],
  );
  // The HOD is department-scoped through this record.
  await db.query(
    `INSERT INTO public.staff (profile_id, institution_email, is_active, department_id, institution_id)
     VALUES ($1,'hod@jkkn.ac.in',true,$2,$3)`,
    [HOD, DEPT, INST],
  );
  // The cluster-scoped administrator ALSO holds an active staff row — people who
  // run a college often still teach in one. Department resolution must not use it
  // to silently narrow their cluster-wide view down to that one department; the
  // "still sees every institution" assertion below is what catches it if it does.
  await db.query(
    `INSERT INTO public.staff (profile_id, institution_email, is_active, department_id, institution_id)
     VALUES ($1,'clusteradmin@jkkn.ac.in',true,$2,$3)`,
    [CLUSTER_ADMIN, DEPT, INST],
  );

  const rows: Array<[string, string | null, boolean, boolean, string, string]> = [
    // id,                     section,  active, template, days,     institution
    [TT.sectionUnmarked, SEC_1, true, false, today, INST],
    [TT.semesterUnmarked, null, true, false, today, INST],
    [TT.semesterTemplate, null, true, true, today, INST],
    [TT.sectionMarked, SEC_2, true, false, today, INST],
    [TT.sectionSibling, SEC_2, true, false, today, INST],
    [TT.notToday, SEC_1, true, false, notToday, INST],
    [TT.inactive, SEC_1, false, false, today, INST],
    [TT.otherInstitution, SEC_1, true, false, today, OTHER_INST],
    [TT.instMismatch, SEC_1, true, false, today, INST],
  ];
  for (const [id, section, active, template, day, inst] of rows) {
    await db.query(
      `INSERT INTO public.timetables
         (id, section_id, is_active, is_template, selected_days, institution_id, department_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::uuid, $7::uuid)`,
      [id, section, active, template, JSON.stringify([day]), inst, DEPT],
    );
  }

  // Unmarked, scheduled today, in the OTHER department.
  await db.query(
    `INSERT INTO public.timetables
       (id, section_id, is_active, is_template, selected_days, institution_id, department_id)
     VALUES ($1::uuid, $2::uuid, true, false, $3::jsonb, $4::uuid, $5::uuid)`,
    [TT.otherDepartment, SEC_1, JSON.stringify([today]), INST, OTHER_DEPT],
  );

  // One timetable starts out marked, under its OWN section — so the section-keyed
  // original genuinely clears it, and (wrongly) clears its sibling too.
  await mark(TT.sectionMarked, INST, SEC_2);

  // Marked, but the row's institution disagrees with the timetable's. This is the
  // state that made the old asymmetric `sa.institution_id = v_institution_id`
  // clearing predicate reopen "unmarked forever" through a second column.
  //
  // SEC_3, NOT SEC_1, and that matters. The section-keyed controls carry no
  // institution or department filter, so marking SEC_1 here would clear every
  // SEC_1 timetable for them too — `fn_ctl_orig_unmarked()` would return count 0
  // with an empty array and every control assertion below would pass trivially
  // against nothing. A control that returns the empty set proves nothing.
  await mark(TT.instMismatch, OTHER_INST, SEC_3);

  // Registry rows so the migration's copy UPDATEs have something to hit.
  await db.query(
    `INSERT INTO public.quick_action_state_queries (query_key, description, sql_function_name) VALUES
       ('attendance.unmarked_periods_today','Count of sections that should have been marked.','fn_aqs_attendance_unmarked_periods_today'),
       ('attendance.faculty_compliance_today','How many sections are compliant.','fn_aqs_attendance_faculty_compliance_today')`,
  );
  await db.query(
    `INSERT INTO public.quick_action_rules (id, description, action_template) VALUES
       ('11111111-1111-4111-8111-100000000004','... 0 sections still unmarked today.',
        '{"cta":"Mark now","label":"Mark attendance for {state.attendance.unmarked_periods_today.count} sections"}'::jsonb),
       ('11111111-1111-4111-8111-100000000003','... any section is non-compliant today.',
        '{"cta":"Review","label":"{state.attendance.faculty_compliance_today.non_compliant_count} sections unmarked today"}'::jsonb)`,
  );
  // Re-run the copy half now that the rows exist (the migration ran against an
  // empty registry above; both statements are idempotent by design).
  await db.query(readFileSync(MIGRATION, 'utf8'));
}, 60_000);

afterAll(async () => {
  if (db) await db.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
    await admin.end();
  }
});

describe('unmarked attendance is counted per timetable, not per section', () => {
  it('surfaces the semester-level timetable that carries no section', async () => {
    const r = await unmarkedFor(SUPER_ADMIN);
    expect(r.sample_period_ids).toContain(TT.semesterUnmarked);
  });

  it('never surfaces a template, an inactive timetable, or one not scheduled today', async () => {
    const r = await unmarkedFor(SUPER_ADMIN);
    expect(r.sample_period_ids).not.toContain(TT.semesterTemplate);
    expect(r.sample_period_ids).not.toContain(TT.inactive);
    expect(r.sample_period_ids).not.toContain(TT.notToday);
  });

  it('does not surface a timetable that already has attendance', async () => {
    const r = await unmarkedFor(SUPER_ADMIN);
    expect(r.sample_period_ids).not.toContain(TT.sectionMarked);
  });

  it('still surfaces a timetable whose section-sharing sibling was marked', async () => {
    // Under the old section grain this row vanished because a DIFFERENT timetable
    // in the same section had been marked. The teaching session was never marked.
    const r = await unmarkedFor(SUPER_ADMIN);
    expect(r.sample_period_ids).toContain(TT.sectionSibling);
  });

  it('emits no NULL element into sample_period_ids', async () => {
    const r = await unmarkedFor(SUPER_ADMIN);
    expect(r.sample_period_ids.every((v) => typeof v === 'string')).toBe(true);
  });

  // The aggregate and the sample are computed by two separately-written copies of
  // the same predicate list (outer query vs the ARRAY subquery on t2). They can
  // drift, and a drift shows up as a badge number that disagrees with the list
  // behind it. Both scopes are checked: an institution-scoped caller exercises
  // predicates that a super administrator's NULL scope leaves inert.
  it.each([
    ['an unscoped super administrator', () => SUPER_ADMIN],
    ['a department-scoped HOD', () => HOD],
  ])('reports a count equal to the number of distinct ids it returns, for %s', async (_l, who) => {
    // Relationship, never a literal: the fixture is small enough to sit under the
    // LIMIT 10, so the aggregate and the sample must describe the same set.
    const r = await unmarkedFor(who());
    expect(r.sample_period_ids.length).toBeLessThanOrEqual(10);
    expect(new Set(r.sample_period_ids).size).toBe(r.sample_period_ids.length);
    expect(r.count).toBe(r.sample_period_ids.length);
  });
});

describe('THE HEADLINE: a marked semester-level timetable disappears', () => {
  it('drops out of the result the moment it is marked, and returns when unmarked', async () => {
    const before = await unmarkedFor(SUPER_ADMIN);
    expect(before.sample_period_ids).toContain(TT.semesterUnmarked);

    await mark(TT.semesterUnmarked);
    const after = await unmarkedFor(SUPER_ADMIN);

    // The only assertion that exercises the uncloseable-to-do failure mode.
    expect(after.sample_period_ids).not.toContain(TT.semesterUnmarked);
    expect(after.count).toBe(before.count - 1);

    await unmark(TT.semesterUnmarked);
    const restored = await unmarkedFor(SUPER_ADMIN);
    expect(restored.sample_period_ids).toContain(TT.semesterUnmarked);
    expect(restored.count).toBe(before.count);
  });
});

describe('a marked timetable clears even when its attendance row names another institution', () => {
  it('does not report the mismatched row as unmarked, at either scope', async () => {
    // Marked once, with institution OTHER_INST on the row and INST on the timetable.
    const scoped = await unmarkedFor(HOD); // v_institution_id = INST
    const wide = await unmarkedFor(SUPER_ADMIN); // v_institution_id = NULL
    expect(scoped.sample_period_ids).not.toContain(TT.instMismatch);
    expect(wide.sample_period_ids).not.toContain(TT.instMismatch);
    // The aggregate is computed by a second copy of the predicate list, so assert
    // it too — checking only the sample leaves the outer query unexamined.
    expect(scoped.count).toBe(scoped.sample_period_ids.length);
    expect(wide.count).toBe(wide.sample_period_ids.length);
  });

  it('and the asymmetric shape would have reported it unmarked forever', async () => {
    // Non-vacuity for the fix above: the control keyed on sa.institution_id still
    // calls this marked timetable unmarked. Mechanism 3, via a second column.
    const asym = (
      await db.query('SELECT public.fn_ctl_asymmetric_says_unmarked($1::uuid,$2::uuid) AS b', [
        TT.instMismatch,
        INST,
      ])
    ).rows[0].b as boolean;
    expect(asym).toBe(true);
  });
});

describe('institution scope still holds', () => {
  it('hides another institution timetable from a department-scoped caller', async () => {
    const scoped = await unmarkedFor(HOD);
    expect(scoped.sample_period_ids).not.toContain(TT.otherInstitution);

    const compliance = await complianceFor(HOD);
    expect(compliance.non_compliant_user_ids).not.toContain(TT.otherInstitution);
  });

  it('shows it to an unscoped super administrator', async () => {
    const wide = await unmarkedFor(SUPER_ADMIN);
    expect(wide.sample_period_ids).toContain(TT.otherInstitution);
  });
});

// The function is GRANTed to `authenticated`, so any signed-in caller can invoke
// it through PostgREST with arguments of their own choosing. Before the clamp
// added 2026-08-08, p_institution_id was assigned unconditionally: naming another
// college simply replaced the caller's own scope. These assertions pin that shut.
// A control proves the target is genuinely reachable, so a green here cannot come
// from the row being absent for some unrelated reason.
describe('the institution override is clamped to administrators', () => {
  async function unmarkedForAt(userId: string, institutionId: string): Promise<Unmarked> {
    const r = await db.query(
      'SELECT public.fn_aqs_attendance_unmarked_periods_today($1::uuid,$2::uuid) AS j',
      [userId, institutionId],
    );
    return r.rows[0].j as Unmarked;
  }

  it('CONTROL: the other institution timetable really is reachable at that scope', async () => {
    // Guards the two assertions below — `not.toContain` passes vacuously against
    // an empty array, so first prove a correctly-privileged caller DOES see it.
    const wide = await unmarkedForAt(SUPER_ADMIN, OTHER_INST);
    expect(wide.sample_period_ids).toContain(TT.otherInstitution);
  });

  it('a department-scoped caller naming another college is held to their own', async () => {
    const attempted = await unmarkedForAt(HOD, OTHER_INST);
    expect(attempted.sample_period_ids).not.toContain(TT.otherInstitution);

    // And not merely emptied — the clamp keeps them on their OWN institution
    // rather than returning nothing, so the screen still works for them.
    const own = await unmarkedFor(HOD);
    expect(attempted.count).toBe(own.count);
  });

  it('an unresolvable caller gets nothing, never the whole cluster', async () => {
    // A uuid with no profile row leaves v_institution_id NULL, and the scope
    // predicate reads NULL as CLUSTER-WIDE rather than as "none". Fail closed.
    const ghost = '00000000-0000-4000-8000-00000000dead';
    const nobody = await unmarkedForAt(ghost, OTHER_INST);
    expect(nobody.count).toBe(0);
    expect(nobody.sample_period_ids).toEqual([]);

    const nobodyUnscoped = await unmarkedFor(ghost);
    expect(nobodyUnscoped.count).toBe(0);
  });

  // Scope is decided by the ROLE REGISTRY, not by a list of role names. These
  // two cases are why: on production one of them has no registry row and the
  // other is cluster-scoped without the is_super_admin flag, so any hardcoded
  // name list gets one of them wrong in one direction or the other.

  it('a legacy role with no registry row is treated as single-tenant', async () => {
    // role='admin' exists on a live profile but has NO custom_roles row. It must
    // NOT be read as cluster-wide. The dangerous call is the NO-ARGUMENT one:
    // p_institution_id defaults to NULL, and NULL means CLUSTER-WIDE downstream.
    const noArgs = await unmarkedFor(LEGACY_ADMIN);
    expect(noArgs.sample_period_ids).not.toContain(TT.otherInstitution);

    // Held to their own institution, not emptied — the screen still works.
    const hod = await unmarkedFor(HOD);
    expect(noArgs.count).toBeGreaterThan(0);
    expect(noArgs.count).toBeGreaterThanOrEqual(hod.count);

    // And naming another college explicitly is refused too.
    const named = await unmarkedForAt(LEGACY_ADMIN, OTHER_INST);
    expect(named.sample_period_ids).not.toContain(TT.otherInstitution);
  });

  it('a registry-cluster-scoped caller still sees every institution', async () => {
    // institution_scope='all' but is_super_admin=false AND institution_id NULL.
    // Clamping this persona by name would hit the fail-closed guard and empty
    // their screen — a regression in the opposite direction from the leak.
    const wide = await unmarkedFor(CLUSTER_ADMIN);
    expect(wide.sample_period_ids).toContain(TT.otherInstitution);
    expect(wide.count).toBeGreaterThan(0);
  });

  it('and is not narrowed to one department by an incidental staff row', async () => {
    // This persona holds an active staff row in DEPT — people who run a college
    // often still teach in one. Department resolution must be SKIPPED for them,
    // or the predicate `(v_department_id IS NULL OR t.department_id = ...)`
    // silently collapses a cluster-wide view to that single department. It fails
    // safe (under-reports) which is exactly why nothing else would notice.
    const wide = await unmarkedFor(CLUSTER_ADMIN);
    expect(wide.sample_period_ids).toContain(TT.otherDepartment);

    // CONTROL: the same row IS hidden from a genuinely department-scoped caller,
    // proving the department filter works at all and that the assertion above is
    // not passing because the filter is inert.
    const scoped = await unmarkedFor(HOD);
    expect(scoped.sample_period_ids).not.toContain(TT.otherDepartment);
  });
});

// The clamp above decides scope from the profile named by p_user_id — and
// p_user_id is an ARGUMENT. On a SECURITY DEFINER function granted to every
// signed-in user, that means the clamp is only as strong as the identity behind
// it: name a super administrator and the clamp faithfully evaluates THEIR
// privileges. These pin the caller to their own session.
describe('the caller cannot borrow another identity', () => {
  async function asSession<T>(sessionUser: string | null, fn: () => Promise<T>): Promise<T> {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sessionUser ?? '']);
    try {
      return await fn();
    } finally {
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
    }
  }

  it('CONTROL: signed in as themselves, the caller still gets their own data', async () => {
    // Without this, the two assertions below could pass because the function is
    // broken for everyone rather than because impersonation is refused.
    const own = await asSession(HOD, () => unmarkedFor(HOD));
    expect(own.count).toBeGreaterThan(0);
  });

  it('refuses to answer for a super administrator the caller merely names', async () => {
    const borrowed = await asSession(HOD, () => unmarkedFor(SUPER_ADMIN));
    expect(borrowed.count).toBe(0);
    expect(borrowed.sample_period_ids).toEqual([]);

    // And the same identity, unborrowed, is genuinely cluster-wide — so the zero
    // above is the guard refusing, not the super administrator seeing nothing.
    const real = await asSession(SUPER_ADMIN, () => unmarkedFor(SUPER_ADMIN));
    expect(real.sample_period_ids).toContain(TT.otherInstitution);
  });

  it('protects the compliance figures the same way', async () => {
    const borrowed = await asSession(HOD, () => complianceFor(SUPER_ADMIN));
    expect(borrowed.non_compliant_count).toBe(0);
    expect(borrowed.non_compliant_user_ids).toEqual([]);
  });

  it('leaves service-role and internal callers working', async () => {
    // auth.uid() is NULL for service_role. Those callers already hold full
    // trust, and server-side code depends on passing p_user_id explicitly, so
    // the guard must not fire for them.
    const internal = await asSession(null, () => unmarkedFor(HOD));
    expect(internal.count).toBeGreaterThan(0);
  });
});

describe('the controls prove these assertions can fail', () => {
  // A control that returns nothing cannot refute anything: `not.toContain` passes
  // against an empty array however the code behaves, and `orig.count === naive.count`
  // degenerates to 0 === 0. So every control assertion below is gated on this.
  it('the original control returns a NON-EMPTY set (guards the ones below)', async () => {
    const orig = (await db.query('SELECT public.fn_ctl_orig_unmarked() AS j')).rows[0]
      .j as Unmarked;
    expect(orig.count).toBeGreaterThan(0);
    expect(orig.sample_period_ids).toContain(SEC_1); // SEC_1 is deliberately unmarked
  });

  it('the section grain wrongly cleared a timetable nobody had marked', async () => {
    // The "+1" in the impact arithmetic. TT.sectionSibling shares SEC_2 with
    // TT.sectionMarked; only the latter was ever marked.
    const orig = (await db.query('SELECT public.fn_ctl_orig_unmarked() AS j')).rows[0]
      .j as Unmarked;
    const live = await unmarkedFor(SUPER_ADMIN);
    expect(orig.sample_period_ids).not.toContain(SEC_2); // cleared by the sibling
    expect(live.sample_period_ids).toContain(TT.sectionSibling);
  });

  it('the shipped behaviour cannot see the semester-level timetable at all', async () => {
    const orig = (await db.query('SELECT public.fn_ctl_orig_unmarked() AS j')).rows[0]
      .j as Unmarked;
    const live = await unmarkedFor(SUPER_ADMIN);
    expect(orig.sample_period_ids).not.toContain(TT.semesterUnmarked);
    expect(live.sample_period_ids).toContain(TT.semesterUnmarked);
  });

  it('deleting the predicate on its own moves the number by zero', async () => {
    const orig = (await db.query('SELECT public.fn_ctl_orig_unmarked() AS j')).rows[0]
      .j as Unmarked;
    const naive = (await db.query('SELECT public.fn_ctl_naive_unmarked() AS j')).rows[0]
      .j as Unmarked;
    // Non-zero first, or "they agree" would just be 0 === 0.
    expect(orig.count).toBeGreaterThan(0);
    expect(naive.count).toBe(orig.count);
    // ...even though the naive shape genuinely sees MORE rows; the aggregate eats
    // them. That widening is the mechanism, and it must be visible here.
    const naiveRows = (
      await db.query(
        `SELECT COUNT(*)::int AS n FROM public.timetables t
          WHERE t.is_active AND t.selected_days ? TRIM(UPPER(TO_CHAR(CURRENT_DATE,'DAY')))
            AND NOT EXISTS (SELECT 1 FROM public.student_attendance sa
                            WHERE sa.section_id = t.section_id
                              AND sa.attendance_date = CURRENT_DATE)`,
      )
    ).rows[0].n as number;
    expect(naiveRows).toBeGreaterThan(naive.count);
  });

  it('and leaves a to-do that marking can never clear', async () => {
    await mark(TT.semesterUnmarked);
    try {
      const naiveSaysUnmarked = (
        await db.query('SELECT public.fn_ctl_naive_says_unmarked($1::uuid) AS b', [
          TT.semesterUnmarked,
        ])
      ).rows[0].b as boolean;
      const real = await unmarkedFor(SUPER_ADMIN);

      expect(naiveSaysUnmarked).toBe(true); // marked, yet still reported unmarked
      expect(real.sample_period_ids).not.toContain(TT.semesterUnmarked);
    } finally {
      await unmark(TT.semesterUnmarked);
    }
  });
});

describe('the HOD compliance number moves to the same grain', () => {
  it('counts the semester-level timetable as non-compliant until it is marked', async () => {
    const before = await complianceFor(HOD);
    expect(before.non_compliant_user_ids).toContain(TT.semesterUnmarked);
    expect(before.non_compliant_user_ids).not.toContain(TT.semesterTemplate);

    await mark(TT.semesterUnmarked);
    try {
      const after = await complianceFor(HOD);
      expect(after.non_compliant_user_ids).not.toContain(TT.semesterUnmarked);
      expect(after.non_compliant_count).toBe(before.non_compliant_count - 1);
      expect(after.compliant_count).toBe(before.compliant_count + 1);
      // The denominator is a property of the schedule, not of what was marked.
      expect(after.total_faculty).toBe(before.total_faculty);
    } finally {
      await unmark(TT.semesterUnmarked);
    }
  });

  it('keeps its parts consistent: compliant + non-compliant equals the total', async () => {
    const c = await complianceFor(HOD);
    expect(c.compliant_count + c.non_compliant_count).toBe(c.total_faculty);
    expect(new Set(c.non_compliant_user_ids).size).toBe(c.non_compliant_user_ids.length);
  });
});

describe('the security posture is re-asserted, not assumed', () => {
  it.each([
    'fn_aqs_attendance_unmarked_periods_today',
    'fn_aqs_attendance_faculty_compliance_today',
  ])('%s is not executable by anon and is executable by authenticated', async (fn) => {
    const r = await db.query(
      `SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname=$1`,
      [fn],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].anon_can).toBe(false);
    expect(r.rows[0].auth_can).toBe(true);
  });

  it('both remain SECURITY DEFINER with a pinned search_path', async () => {
    const r = await db.query(
      `SELECT p.proname, p.prosecdef, array_to_string(p.proconfig, ',') AS cfg
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname LIKE 'fn_aqs_attendance_%'`,
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(2);
    for (const row of r.rows) {
      expect(row.prosecdef).toBe(true);
      expect(row.cfg).toContain('search_path');
    }
  });
});

describe('the registry copy stops saying sections', () => {
  it('rewrites both descriptions and both badge labels', async () => {
    const sq = await db.query(
      `SELECT query_key, description FROM public.quick_action_state_queries ORDER BY query_key`,
    );
    for (const row of sq.rows) {
      expect(row.description).toMatch(/timetable/i);
    }

    const rules = await db.query(
      `SELECT id, action_template->>'label' AS label FROM public.quick_action_rules ORDER BY id`,
    );
    expect(rules.rows).toHaveLength(2);
    for (const row of rules.rows) {
      expect(row.label).not.toMatch(/sections/i);
      expect(row.label).toMatch(/sessions/i);
    }
  });

  it('no rule interpolates the two id arrays, whose meaning changed', async () => {
    // sample_period_ids / non_compliant_user_ids now hold timetable UUIDs rather
    // than section UUIDs. A rule deep-linking off either would silently produce a
    // dead link. Verified against production too (0 rows), pinned here so a future
    // rule that starts reading them fails loudly instead.
    const r = await db.query(
      `SELECT COUNT(*)::int AS n FROM public.quick_action_rules
        WHERE action_template::text ILIKE '%sample_period_ids%'
           OR action_template::text ILIKE '%non_compliant_user_ids%'`,
    );
    expect(r.rows[0].n).toBe(0);
  });

  it('leaves the rest of action_template untouched', async () => {
    // jsonb_set, not a wholesale rewrite — the href/cta/icon must survive.
    const r = await db.query(
      `SELECT action_template->>'cta' AS cta FROM public.quick_action_rules
        WHERE id='11111111-1111-4111-8111-100000000004'`,
    );
    expect(r.rows[0].cta).toBe('Mark now');
  });
});
