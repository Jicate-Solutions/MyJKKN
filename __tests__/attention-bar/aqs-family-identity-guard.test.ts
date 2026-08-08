/**
 * The rest of the fn_aqs_* family must not take its identity from an argument.
 * Behavioural proof for
 * supabase/migrations/20260817010000_aqs_family_identity_and_scope_guards.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The migration is applied VERBATIM — read off disk, never retyped. No assertion
 * below re-implements a scope decision in TypeScript. A suite that models the SQL
 * only ever proves the model agrees with itself, which is how forty green checks
 * once sat on top of a live defect.
 *
 * NON-VACUITY IS PROVED, NOT ASSERTED
 * -----------------------------------
 * Three control functions reproduce the PRE-FIX bodies exactly as they ran on
 * production on 2026-08-08 (fn_ctl_prefix_*). Against the SAME fixture, every
 * "the guard refuses" assertion is paired with a control showing the pre-fix shape
 * ANSWERS. If a guard were ever deleted, the paired assertion fails — the controls
 * are what stop these tests from passing against the vulnerable code.
 *
 * Every zero assertion is additionally paired with a non-zero reading of the same
 * value under a legitimate caller, so `toBe(0)` can never pass merely because the
 * fixture is empty or the function is broken for everyone.
 *
 * ROLE SCOPE COMES FROM THE REGISTRY, NOT A NAME LIST
 * ---------------------------------------------------
 * The fixture mirrors production as measured on 2026-08-08: custom_roles holds
 * 'super_admin' and 'administrator' at institution_scope='all' and NO row named
 * 'admin' at all, while one profile still carries the legacy value role='admin'
 * with an institution and without the is_super_admin flag. Two tests below pin
 * both directions — the legacy value must NOT buy the cluster, and a registry
 * cluster role must still get it without the flag.
 *
 * No production count is asserted anywhere. Roughly nine sessions write the
 * production database concurrently, so a test pinned to a live number measures the
 * clock. Every figure here belongs to a fixture this file created.
 *
 * REQUIRES a local PostgreSQL. Deliberately loud rather than skipped when none is
 * reachable — a silent skip reports green over a suite that never executed.
 *
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/attention-bar/aqs-family-identity-guard.test.ts
 *
 * Override with AQS_TEST_PGHOST / _PGPORT / _PGUSER / _PGPASSWORD.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(
  REPO,
  'supabase/migrations/20260817010000_aqs_family_identity_and_scope_guards.sql',
);

const PGHOST = process.env.AQS_TEST_PGHOST ?? 'localhost';
const PGPORT = Number(process.env.AQS_TEST_PGPORT ?? 5432);
const PGUSER = process.env.AQS_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const PGPASSWORD = process.env.AQS_TEST_PGPASSWORD;

const DBNAME = `aqs_guard_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const INST = '00000000-0000-4000-8000-0000000000a1';
const OTHER_INST = '00000000-0000-4000-8000-0000000000a2';

const SUPER_ADMIN = '00000000-0000-4000-8000-0000000000d1';
const CLUSTER_ADMIN = '00000000-0000-4000-8000-0000000000d2';
const LEGACY_ADMIN = '00000000-0000-4000-8000-0000000000d3';
const COUNSELOR_A = '00000000-0000-4000-8000-0000000000d4';
const COUNSELOR_B = '00000000-0000-4000-8000-0000000000d5';
const ORPHAN = '00000000-0000-4000-8000-0000000000d6';
/** Cluster-scoped ONLY via user_roles; profiles.role is institution-scoped. */
const MODERN_CLUSTER = '00000000-0000-4000-8000-0000000000d7';
/** Cluster-scoped via a role row that is is_active = false. */
const RETIRED_HEAD = '00000000-0000-4000-8000-0000000000d8';
const NOBODY = '00000000-0000-4000-8000-0000000000df';

const CA = '00000000-0000-4000-8000-0000000000f1';
const CB = '00000000-0000-4000-8000-0000000000f2';

const B_NAME = 'Beta Applicant';

const SCHEMA = `
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
-- Mirrors production: is_active is NOT NULL DEFAULT true, institution_scope is
-- NULLABLE with default 'own' (verified 2026-08-08) — so a NULL scope must
-- resolve to "not cluster-scoped", never to true.
CREATE TABLE public.custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key TEXT UNIQUE NOT NULL,
  institution_scope TEXT DEFAULT 'own',
  is_active BOOLEAN NOT NULL DEFAULT true
);
-- The many-to-many table Role Management actually writes, and the FIRST thing
-- role_has_institution_access() consults. A fixture without it cannot tell a
-- profiles.role-only read from a correct one.
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role_id UUID NOT NULL,
  is_primary BOOLEAN DEFAULT false
);
CREATE TABLE public.billing_student_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(30),
  due_date DATE NOT NULL,
  institution_id UUID NOT NULL,
  final_amount NUMERIC(15,2) NOT NULL,
  balance_amount NUMERIC(15,2)
);
CREATE TABLE public.admission_counselors (
  id UUID PRIMARY KEY,
  user_id UUID,
  is_active BOOLEAN DEFAULT true
);
CREATE TABLE public.admission_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_counselor_id UUID,
  funnel_stage TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_lost BOOLEAN DEFAULT false,
  institution_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  full_name TEXT,
  first_name TEXT NOT NULL
);
`;

/**
 * The three PRE-FIX bodies, exactly as they ran on production on 2026-08-08.
 * These are what the migration replaces. They exist so every refusal below can be
 * shown to be a refusal — against the same fixture, these answer.
 */
const CONTROLS = `
CREATE OR REPLACE FUNCTION public.fn_ctl_prefix_billing(p_user_id UUID, p_institution_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $ctl$
DECLARE
  v_is_super_admin BOOLEAN; v_user_role TEXT; v_institution_id UUID;
  v_count INT; v_total_amount NUMERIC(15,2); v_oldest_days INT;
BEGIN
  SELECT p.is_super_admin, p.role, p.institution_id
  INTO v_is_super_admin, v_user_role, v_institution_id
  FROM public.profiles p WHERE p.id = p_user_id;

  IF v_is_super_admin OR v_user_role IN ('super_admin', 'admin') THEN
    v_institution_id := p_institution_id;
  ELSIF p_institution_id IS NOT NULL THEN
    NULL;
  END IF;

  SELECT COUNT(*)::INT,
         COALESCE(SUM(bsb.final_amount - COALESCE(bsb.balance_amount, 0)), 0)::NUMERIC(15,2),
         CEIL(EXTRACT(EPOCH FROM (NOW() - MIN(bsb.due_date::TIMESTAMPTZ))) / 86400.0)::INT
  INTO v_count, v_total_amount, v_oldest_days
  FROM public.billing_student_bills bsb
  WHERE bsb.status IN ('unpaid', 'pending')
    AND bsb.due_date < CURRENT_DATE
    AND (v_institution_id IS NULL OR bsb.institution_id = v_institution_id);

  RETURN jsonb_build_object('count', COALESCE(v_count,0),
                            'total_overdue_amount', COALESCE(v_total_amount,0),
                            'oldest_invoice_days', COALESCE(v_oldest_days,0));
END $ctl$;

CREATE OR REPLACE FUNCTION public.fn_ctl_prefix_counselor(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $ctl$
DECLARE
  v_count INT; v_oldest_id UUID; v_oldest_days INT; v_oldest_name TEXT; v_counselor_id UUID;
BEGIN
  SELECT id INTO v_counselor_id FROM public.admission_counselors
  WHERE user_id = p_user_id AND is_active = true LIMIT 1;

  IF v_counselor_id IS NULL THEN
    RETURN jsonb_build_object('count', 0);
  END IF;

  SELECT COUNT(*)::INT,
         (ARRAY_AGG(al.id ORDER BY al.created_at ASC))[1],
         CEIL(EXTRACT(EPOCH FROM (NOW() - MIN(al.created_at))) / 86400.0)::INT,
         (ARRAY_AGG(COALESCE(al.full_name, al.first_name) ORDER BY al.created_at ASC))[1]
  INTO v_count, v_oldest_id, v_oldest_days, v_oldest_name
  FROM public.admission_leads al
  WHERE al.assigned_counselor_id = v_counselor_id
    AND al.funnel_stage::text IN ('new','contacted','qualified','follow_up','follow_up_scheduled',
                                  'engaged','not_reachable','application_started')
    AND al.is_active = true AND al.is_lost = false;

  IF COALESCE(v_count,0) = 0 THEN
    RETURN jsonb_build_object('count', 0);
  END IF;

  RETURN jsonb_build_object('count', v_count, 'oldest_lead_id', v_oldest_id,
                            'oldest_lead_days', v_oldest_days,
                            'oldest_lead_full_name', COALESCE(v_oldest_name,''));
END $ctl$;

CREATE OR REPLACE FUNCTION public.fn_ctl_prefix_admission(p_institution_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $ctl$
DECLARE
  v_is_super_admin BOOLEAN; v_user_role TEXT; v_institution_id UUID; v_caller_inst_id UUID;
  v_count INT; v_oldest_days INT;
BEGIN
  SELECT p.is_super_admin, p.role, p.institution_id
  INTO v_is_super_admin, v_user_role, v_caller_inst_id
  FROM public.profiles p WHERE p.id = auth.uid();

  IF v_is_super_admin OR v_user_role IN ('super_admin', 'admin', 'admission') THEN
    v_institution_id := p_institution_id;
  ELSE
    v_institution_id := v_caller_inst_id;
  END IF;

  SELECT COUNT(*)::INT,
         CEIL(EXTRACT(EPOCH FROM (NOW() - MIN(al.created_at))) / 86400.0)::INT
  INTO v_count, v_oldest_days
  FROM public.admission_leads al
  WHERE al.assigned_counselor_id IS NULL
    AND al.funnel_stage::text NOT IN ('lost','converted','enrolled','confirmed',
                                      'declined','withdrew','expired','dormant')
    AND al.is_active = true AND al.is_lost = false
    AND (v_institution_id IS NULL OR al.institution_id = v_institution_id);

  RETURN jsonb_build_object('count', COALESCE(v_count,0),
                            'oldest_unassigned_days', COALESCE(v_oldest_days,0));
END $ctl$;
`;

let admin: Client;
let db: Client;

type Billing = { count: number; total_overdue_amount: string; oldest_invoice_days: number };
type Pending = { count: number; oldest_lead_full_name?: string; oldest_lead_id?: string };
type Unassigned = { count: number; oldest_unassigned_days: number };

/** Run `fn` with the session pinned to a signed-in user, or to no user at all. */
async function asSession<T>(sessionUser: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sessionUser ?? '']);
  try {
    return await fn();
  } finally {
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  }
}

async function billingFor(userId: string, institutionId?: string | null): Promise<Billing> {
  const r = await db.query(
    'SELECT public.fn_aqs_billing_overdue_invoices($1::uuid, $2::uuid) AS j',
    [userId, institutionId ?? null],
  );
  return r.rows[0].j as Billing;
}

async function prefixBillingFor(userId: string, institutionId?: string | null): Promise<Billing> {
  const r = await db.query('SELECT public.fn_ctl_prefix_billing($1::uuid, $2::uuid) AS j', [
    userId,
    institutionId ?? null,
  ]);
  return r.rows[0].j as Billing;
}

async function pendingFor(userId: string): Promise<Pending> {
  const r = await db.query('SELECT public.fn_aqs_counselor_pending_leads($1::uuid) AS j', [userId]);
  return r.rows[0].j as Pending;
}

async function prefixPendingFor(userId: string): Promise<Pending> {
  const r = await db.query('SELECT public.fn_ctl_prefix_counselor($1::uuid) AS j', [userId]);
  return r.rows[0].j as Pending;
}

async function unassigned(institutionId?: string | null): Promise<Unassigned> {
  const r = await db.query(
    'SELECT public.fn_aqs_admission_leads_unassigned_count($1::uuid) AS j',
    [institutionId ?? null],
  );
  return r.rows[0].j as Unassigned;
}

async function prefixUnassigned(institutionId?: string | null): Promise<Unassigned> {
  const r = await db.query('SELECT public.fn_ctl_prefix_admission($1::uuid) AS j', [
    institutionId ?? null,
  ]);
  return r.rows[0].j as Unassigned;
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
        `Start one (brew services start postgresql@16) or set AQS_TEST_PGHOST. Cause: ${String(e)}`,
    );
  }
  await admin.query(`CREATE DATABASE ${DBNAME}`);

  db = new Client({ ...base, database: DBNAME });
  await db.connect();

  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}')
         THEN CREATE ROLE ${role} NOLOGIN; END IF;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
  }

  await db.query(SCHEMA);
  await db.query(CONTROLS);

  // Applied VERBATIM — never retyped, never paraphrased.
  await db.query(readFileSync(MIGRATION, 'utf8'));

  // The registry as production carries it: no row named 'admin'.
  // 'staff_counselor' is real and really is institution_scope='all' (46 holders
  // on production) — it pins the widening this migration discloses.
  // 'retired_head' is cluster-scoped but INACTIVE: deactivating a role in Role
  // Management must revoke cluster scope, not keep granting it.
  await db.query(
    `INSERT INTO public.custom_roles (role_key, institution_scope, is_active) VALUES
       ('super_admin',     'all',  true),
       ('administrator',   'all',  true),
       ('staff_counselor', 'all',  true),
       ('retired_head',    'all',  false),
       ('counselor',       'own',  true)`,
  );

  await db.query(
    `INSERT INTO public.profiles (id, email, role, is_super_admin, institution_id) VALUES
       ($1,'super@jkkn.ac.in',    'super_admin',   true,  $9),
       ($2,'cluster@jkkn.ac.in',  'administrator', false, NULL),
       ($3,'legacy@jkkn.ac.in',   'admin',         false, $9),
       ($4,'ca@jkkn.ac.in',       'counselor',     false, $9),
       ($5,'cb@jkkn.ac.in',       'counselor',     false, $10),
       ($6,'orphan@jkkn.ac.in',   'counselor',     false, NULL),
       -- profiles.role is institution-scoped; their cluster role arrives ONLY
       -- through user_roles. 29 live profiles are in exactly this state.
       ($7,'modern@jkkn.ac.in',   'counselor',     false, $9),
       -- Cluster-scoped by a role that has been DEACTIVATED.
       ($8,'retired@jkkn.ac.in',  'retired_head',  false, $9)`,
    [
      SUPER_ADMIN, CLUSTER_ADMIN, LEGACY_ADMIN, COUNSELOR_A, COUNSELOR_B, ORPHAN,
      MODERN_CLUSTER, RETIRED_HEAD, INST, OTHER_INST,
    ],
  );

  // The cluster role that exists ONLY in user_roles.
  await db.query(
    `INSERT INTO public.user_roles (user_id, role_id)
     SELECT $1::uuid, cr.id FROM public.custom_roles cr WHERE cr.role_key = 'staff_counselor'`,
    [MODERN_CLUSTER],
  );

  // Overdue bills: 2 in INST, 3 in OTHER_INST, cluster 5. The two colleges must
  // hold DIFFERENT counts — with 2 and 2, a clamp test asserting `toBe(2)` would
  // pass whether the clamp held or redirected, which is vacuity by fixture.
  await db.query(
    `INSERT INTO public.billing_student_bills (status, due_date, institution_id, final_amount, balance_amount) VALUES
       ('unpaid',  CURRENT_DATE - 1,  $1, 1000, 0),
       ('pending', CURRENT_DATE - 10, $1, 2000, 500),
       ('unpaid',  CURRENT_DATE - 30, $2, 5000, 0),
       ('unpaid',  CURRENT_DATE - 3,  $2, 100,  0),
       ('unpaid',  CURRENT_DATE - 2,  $2, 250,  0),
       ('paid',    CURRENT_DATE - 5,  $1, 700,  0),
       ('unpaid',  CURRENT_DATE + 1,  $1, 900,  0)`,
    [INST, OTHER_INST],
  );

  await db.query(
    `INSERT INTO public.admission_counselors (id, user_id, is_active) VALUES ($1,$2,true), ($3,$4,true)`,
    [CA, COUNSELOR_A, CB, COUNSELOR_B],
  );

  // Unassigned: 2 in INST, 3 in OTHER_INST (cluster 5). Plus one excluded by stage.
  await db.query(
    `INSERT INTO public.admission_leads
       (assigned_counselor_id, funnel_stage, institution_id, first_name, full_name, created_at) VALUES
       (NULL,'new',      $1,'Una','Una One',   now() - interval '9 day'),
       (NULL,'contacted',$1,'Unb','Unb Two',   now() - interval '4 day'),
       (NULL,'new',      $2,'Unc','Unc Three', now() - interval '7 day'),
       (NULL,'new',      $2,'Und','Und Four',  now() - interval '6 day'),
       (NULL,'qualified',$2,'Une','Une Five',  now() - interval '5 day'),
       (NULL,'lost',     $1,'Unf','Unf Six',   now() - interval '8 day'),
       ($3,  'new',      $1,'Alp','Alpha Applicant', now() - interval '3 day'),
       ($3,  'contacted',$1,'Alq','Alpha Second',    now() - interval '2 day'),
       ($4,  'new',      $2,'Bet',$5,                now() - interval '1 day')`,
    [INST, OTHER_INST, CA, CB, B_NAME],
  );
});

afterAll(async () => {
  if (db) await db.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
    await admin.end();
  }
});

/* ───────────────────────────────────────────────────────────────────────────
 * The fixture itself must be able to refute. If cluster and institution figures
 * were equal, every scope assertion below would pass whatever the code did.
 * ─────────────────────────────────────────────────────────────────────────── */
describe('the fixture can tell cluster from institution', () => {
  it('cluster billing is strictly larger than either college alone', async () => {
    const cluster = await asSession(SUPER_ADMIN, () => billingFor(SUPER_ADMIN, null));
    const one = await asSession(SUPER_ADMIN, () => billingFor(SUPER_ADMIN, INST));
    expect(cluster.count).toBe(5);
    expect(one.count).toBe(2);
    expect(cluster.count).toBeGreaterThan(one.count);
  });

  it('cluster unassigned leads are strictly more than either college alone', async () => {
    const cluster = await asSession(SUPER_ADMIN, () => unassigned(null));
    const one = await asSession(SUPER_ADMIN, () => unassigned(INST));
    expect(cluster.count).toBe(5);
    expect(one.count).toBe(2);
    expect(cluster.count).toBeGreaterThan(one.count);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * HOLE 1 — borrowed identity
 * ─────────────────────────────────────────────────────────────────────────── */
describe('billing: the caller cannot borrow another identity', () => {
  it('CONTROL: signed in as themselves, a counselor still gets real figures', async () => {
    const own = await asSession(COUNSELOR_A, () => billingFor(COUNSELOR_A, null));
    expect(own.count).toBeGreaterThan(0);
  });

  it('refuses to answer for a super administrator the caller merely names', async () => {
    const borrowed = await asSession(COUNSELOR_A, () => billingFor(SUPER_ADMIN, null));
    expect(borrowed.count).toBe(0);
    expect(Number(borrowed.total_overdue_amount)).toBe(0);

    // The zero is a refusal, not an empty estate: the same identity unborrowed
    // is genuinely cluster-wide.
    const real = await asSession(SUPER_ADMIN, () => billingFor(SUPER_ADMIN, null));
    expect(real.count).toBe(5);
  });

  it('CONTROL: the pre-fix body hands over the whole cluster for the same call', async () => {
    // This is the proof the assertion above is not vacuous. Same fixture, same
    // arguments, guard removed.
    const leaked = await asSession(COUNSELOR_A, () => prefixBillingFor(SUPER_ADMIN, null));
    expect(leaked.count).toBe(5);
    expect(Number(leaked.total_overdue_amount)).toBeGreaterThan(0);
  });

  it('leaves service-role and internal callers working', async () => {
    const internal = await asSession(null, () => billingFor(SUPER_ADMIN, null));
    expect(internal.count).toBe(5);
  });
});

describe('pending leads: the caller cannot borrow another identity', () => {
  it('CONTROL: signed in as themselves, a counselor sees their own pipeline', async () => {
    const own = await asSession(COUNSELOR_A, () => pendingFor(COUNSELOR_A));
    expect(own.count).toBe(2);
    expect(own.oldest_lead_full_name).toBe('Alpha Applicant');
  });

  it('refuses to name another counselor applicant', async () => {
    const borrowed = await asSession(COUNSELOR_A, () => pendingFor(COUNSELOR_B));
    expect(borrowed.count).toBe(0);
    // The applicant name is the sensitive part — it must not appear at all.
    expect(borrowed.oldest_lead_full_name).toBeUndefined();
    expect(JSON.stringify(borrowed)).not.toContain(B_NAME);
  });

  it('CONTROL: the pre-fix body leaks that applicant by name', async () => {
    const leaked = await asSession(COUNSELOR_A, () => prefixPendingFor(COUNSELOR_B));
    expect(leaked.count).toBe(1);
    expect(leaked.oldest_lead_full_name).toBe(B_NAME);
  });

  it('leaves service-role and internal callers working', async () => {
    const internal = await asSession(null, () => pendingFor(COUNSELOR_B));
    expect(internal.count).toBe(1);
  });
});

describe('unassigned leads: identity was never borrowable and still is not', () => {
  it('takes its answer from the session, and only from the session', async () => {
    // This function has no p_user_id at all — it was already safe on hole 1.
    // The assertion that matters is that the answer tracks who is signed in.
    const asCounselor = await asSession(COUNSELOR_A, () => unassigned(null));
    const asSuper = await asSession(SUPER_ADMIN, () => unassigned(null));
    expect(asCounselor.count).toBe(2);
    expect(asSuper.count).toBe(5);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * HOLE 2 — unclamped scope, and the role-name list that got it wrong both ways
 * ─────────────────────────────────────────────────────────────────────────── */
describe('scope is clamped, and decided by the role registry', () => {
  it('an institution-scoped caller cannot redirect billing to another college', async () => {
    const redirected = await asSession(COUNSELOR_A, () => billingFor(COUNSELOR_A, OTHER_INST));
    expect(redirected.count).toBe(2);

    // CONTROL: OTHER_INST really does hold a different set, so the 2 above is the
    // clamp holding rather than the two colleges happening to match.
    const other = await asSession(SUPER_ADMIN, () => billingFor(SUPER_ADMIN, OTHER_INST));
    expect(Number(other.total_overdue_amount)).not.toBe(Number(redirected.total_overdue_amount));
  });

  it('the legacy role value admin no longer buys the whole cluster', async () => {
    // Production carries exactly one such profile: institution-scoped, unflagged,
    // and with no custom_roles row. The old name list handed it everything.
    const clamped = await asSession(LEGACY_ADMIN, () => billingFor(LEGACY_ADMIN, null));
    expect(clamped.count).toBe(2);
  });

  it('CONTROL: the pre-fix name list did hand it the whole cluster', async () => {
    const leaked = await asSession(LEGACY_ADMIN, () => prefixBillingFor(LEGACY_ADMIN, null));
    expect(leaked.count).toBe(5);
  });

  it('a registry cluster role still sees everything without the super-admin flag', async () => {
    // The other direction: clamping on is_super_admin alone would have emptied
    // this screen. Production has 2 of these.
    const wide = await asSession(CLUSTER_ADMIN, () => billingFor(CLUSTER_ADMIN, null));
    expect(wide.count).toBe(5);
  });

  it('the same two directions hold for unassigned leads', async () => {
    const legacy = await asSession(LEGACY_ADMIN, () => unassigned(null));
    expect(legacy.count).toBe(2);

    const leaked = await asSession(LEGACY_ADMIN, () => prefixUnassigned(null));
    expect(leaked.count).toBe(5);

    const cluster = await asSession(CLUSTER_ADMIN, () => unassigned(null));
    expect(cluster.count).toBe(5);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * HOLE 3 — a NULL scope read as CLUSTER-WIDE rather than as none
 * ─────────────────────────────────────────────────────────────────────────── */
describe('an unresolvable caller fails closed, not open', () => {
  it('billing returns nothing for a signed-in caller with no institution', async () => {
    const closed = await asSession(ORPHAN, () => billingFor(ORPHAN, null));
    expect(closed.count).toBe(0);
    expect(Number(closed.total_overdue_amount)).toBe(0);
  });

  it('CONTROL: the pre-fix body gave that caller the whole cluster', async () => {
    const leaked = await asSession(ORPHAN, () => prefixBillingFor(ORPHAN, null));
    expect(leaked.count).toBe(5);
  });

  it('billing returns nothing for a p_user_id matching no profile at all', async () => {
    // Every local flag stays NULL, both branches are skipped, and the scope
    // predicate would otherwise read NULL as cluster-wide.
    const closed = await asSession(null, () => billingFor(NOBODY, null));
    expect(closed.count).toBe(0);
  });

  it('CONTROL: the pre-fix body answered for that unknown identity too', async () => {
    const leaked = await asSession(null, () => prefixBillingFor(NOBODY, null));
    expect(leaked.count).toBe(5);
  });

  it('unassigned leads fail closed for the same caller', async () => {
    const closed = await asSession(ORPHAN, () => unassigned(null));
    expect(closed.count).toBe(0);

    const leaked = await asSession(ORPHAN, () => prefixUnassigned(null));
    expect(leaked.count).toBe(5);
  });

  it('unassigned leads cannot be redirected to another college either', async () => {
    // Without this, deleting `ELSE v_institution_id := v_caller_inst_id` would
    // leave every other test green while re-opening cross-tenant redirect — the
    // clamp was only ever exercised with a NULL argument.
    const redirected = await asSession(COUNSELOR_A, () => unassigned(OTHER_INST));
    expect(redirected.count).toBe(2); // own college, not the 3 next door

    // CONTROL: OTHER_INST really does hold 3, so the 2 above is the clamp
    // holding rather than the other college being empty. (The pre-fix body is
    // NOT the control here — it clamped ordinary callers correctly too; this
    // function's holes were the name list and the fail-open, not redirect.)
    const truth = await asSession(SUPER_ADMIN, () => unassigned(OTHER_INST));
    expect(truth.count).toBe(3);
  });

  it('but an internal caller with no session keeps the cluster-wide figure', async () => {
    // This function has no p_user_id to fall back on, so failing closed on a NULL
    // auth.uid() would break server-side callers that legitimately read it.
    const internal = await asSession(null, () => unassigned(null));
    expect(internal.count).toBe(5);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Scope authority: user_roles is the table Role Management writes, and
 * role_has_institution_access() consults it BEFORE the denormalised
 * profiles.role. Reading only the fallback is the same mistake as a name list,
 * one level down — and it is the mistake this file's first draft made.
 * ─────────────────────────────────────────────────────────────────────────── */
describe('cluster scope is read from user_roles, not only profiles.role', () => {
  it('a cluster role held ONLY through user_roles is honoured', async () => {
    // profiles.role says 'counselor' (own). The cluster role arrives via
    // user_roles alone — the state 29 live profiles are in. Reading only
    // profiles.role clamps them to one college.
    const wide = await asSession(MODERN_CLUSTER, () => billingFor(MODERN_CLUSTER, null));
    expect(wide.count).toBe(5);
  });

  it('CONTROL: their profiles.role alone would have clamped them to one college', async () => {
    // Proves the assertion above is about the user_roles read and not about the
    // caller being cluster-scoped by some other route: a caller with the SAME
    // profiles.role and no user_roles row sees only their own institution.
    const clamped = await asSession(COUNSELOR_A, () => billingFor(COUNSELOR_A, null));
    expect(clamped.count).toBe(2);
  });

  it('the same holds for unassigned leads', async () => {
    const wide = await asSession(MODERN_CLUSTER, () => unassigned(null));
    expect(wide.count).toBe(5);
  });

  it('a DEACTIVATED cluster role grants nothing', async () => {
    // Deactivating a role in Role Management must revoke cluster scope. This
    // caller's institution is INST, so they fall back to their own college
    // rather than the cluster — not to zero.
    const revoked = await asSession(RETIRED_HEAD, () => billingFor(RETIRED_HEAD, null));
    expect(revoked.count).toBe(2);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * PINNED, NOT ASSUMED — the widening this migration discloses.
 *
 * Reading custom_roles.institution_scope instead of the old name list takes
 * cluster-wide billing from 31 profiles to 138. `staff_counselor` (46 holders on
 * production) is institution_scope='all' and therefore now sees every college's
 * overdue position through a SECURITY DEFINER function that consults no
 * permission check. That is a deliberate consequence of treating the registry as
 * the authority, and it is pinned here so it is a decision on the record rather
 * than an emergent behaviour — if a reviewer rejects the widening, THIS test is
 * what must change, and it will fail loudly rather than drifting.
 * ─────────────────────────────────────────────────────────────────────────── */
describe('DISCLOSED: a cluster-scoped non-admin role sees cluster-wide billing', () => {
  it('staff_counselor reads every college overdue position', async () => {
    const wide = await asSession(MODERN_CLUSTER, () => billingFor(MODERN_CLUSTER, null));
    expect(wide.count).toBe(5);

    // CONTROL: under the pre-fix name list they saw only their own college, so
    // this is a real change in exposure and not a restatement of old behaviour.
    const before = await asSession(MODERN_CLUSTER, () => prefixBillingFor(MODERN_CLUSTER, null));
    expect(before.count).toBe(2);
  });
});
