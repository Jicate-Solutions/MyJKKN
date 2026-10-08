/**
 * Behavioural proof for supabase/migrations/20271007161123_hr_duty_proofs.sql
 * (HR staff harness, "Proof of done (2)").
 *
 * The migration is applied VERBATIM with psql onto a throwaway database, after
 * main's own offboarding migrations (20260515000004 substrate, 20260621
 * separation extension, 20260624 termination workflow). hr_leave_encashments
 * has no CREATE TABLE on main, so a stub with exactly the columns in
 * types/supabase.ts stands in for it. Calls run as `authenticated`, with
 * auth.uid(), the permission keys held and the colleges reachable answered from
 * test settings — including a NULL answer, the case `IF NOT (a OR b)` lets
 * through.
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIG = (f: string) => path.join(REPO, 'supabase/migrations', f);
const MIGRATION = MIG('20271007161123_hr_duty_proofs.sql');
// Follow-up to the #4226 review: applied on top, so every test below runs
// against what production will have once both files are applied.
const REVIEW_FIXES = MIG('20271008110105_hr_duty_proofs_review_fixes.sql');
const PGHOST = process.env.HDP_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.HDP_TEST_PGPORT ?? '5432';
const PGUSER = process.env.HDP_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `hdp_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const APPROVER = '00000000-0000-4000-8000-00000000a001';
const CHECKER = '00000000-0000-4000-8000-00000000a002';
const PAYEE = '00000000-0000-4000-8000-00000000a003';
const SETTLER = '00000000-0000-4000-8000-00000000a004';
const LEAVER = '00000000-0000-4000-8000-00000000a005';
const CALCULATOR = '00000000-0000-4000-8000-00000000a006';
const INST_A = '00000000-0000-4000-8000-00000000b001';
const INST_B = '00000000-0000-4000-8000-00000000b002';
const ORG_A = '00000000-0000-4000-8000-00000000c001';
const STAFF_PAYEE = '00000000-0000-4000-8000-00000000d001';
const STAFF_LEAVER = '00000000-0000-4000-8000-00000000d002';
const ENC = '00000000-0000-4000-8000-00000000e001';
const CASE_ORDER = '00000000-0000-4000-8000-00000000f001';
const CASE_SETTLE = '00000000-0000-4000-8000-00000000f002';

const L4_KEY = 'hr.leave.encashment.approve';
const G5_KEY = 'hr.employees.edit';
const G6_KEY = 'hr.payroll.salary.manage';

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
-- Supabase storage, the parts the migration touches.
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON storage.objects TO authenticated;
-- Permission helpers answered from settings. 'NULL' makes the helper return NULL.
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.super', true) = 'on', false) $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.user_has_permission(k text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN current_setting('test.perms', true) = 'NULL' THEN NULL
              ELSE k = ANY (string_to_array(COALESCE(current_setting('test.perms', true), ''), ',')) END $$;
CREATE FUNCTION public.role_has_institution_access(i uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN current_setting('test.insts', true) = 'NULL' THEN NULL
              ELSE i::text = ANY (string_to_array(COALESCE(current_setting('test.insts', true), ''), ',')) END $$;
GRANT EXECUTE ON FUNCTION public.is_super_admin(), public.is_admin(), public.user_has_permission(text),
  public.role_has_institution_access(uuid) TO authenticated;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text);
CREATE TABLE public.staff (id uuid PRIMARY KEY, profile_id uuid, institution_id uuid, role_key text);
CREATE TABLE public.hr_organizations (id uuid PRIMARY KEY, institution_id uuid);
-- No CREATE TABLE on main: exactly the columns in types/supabase.ts.
CREATE TABLE public.hr_leave_encashments (
  id uuid PRIMARY KEY, employee_id uuid NOT NULL, hr_organization_id uuid NOT NULL,
  leave_type_id uuid NOT NULL, days_encashed numeric NOT NULL, per_diem_rate numeric NOT NULL,
  total_amount numeric NOT NULL, status text NOT NULL, approved_by uuid, approved_at timestamptz,
  rejection_reason text, paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.profiles VALUES
  ('${APPROVER}', 'Priya Raman'), ('${CHECKER}', 'Arun Kumar'), ('${PAYEE}', 'Kavya S'),
  ('${SETTLER}', 'Meena R'), ('${LEAVER}', 'Ravi T'), ('${CALCULATOR}', 'Lakshmi V');
INSERT INTO public.staff VALUES
  ('${STAFF_PAYEE}', '${PAYEE}', '${INST_A}', 'faculty'),
  ('${STAFF_LEAVER}', '${LEAVER}', '${INST_A}', 'faculty');
INSERT INTO public.hr_organizations VALUES ('${ORG_A}', '${INST_A}');
-- Supabase grants EXECUTE on every new public function to anon and
-- authenticated by default; without this the anon-REVOKE checks below prove
-- nothing.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

interface Who {
  uid?: string | null;
  perms?: string;   // comma list of keys, or 'NULL'
  insts?: string;   // comma list of college ids, or 'NULL'
  superAdmin?: boolean;
  status?: string;  // the encashment's status
  setup?: string;   // extra SQL as the owner, before switching role
  after?: string;   // SQL as the owner after the call, its rows returned as `after`
}

/**
 * Seed the items, then run `sql` as `authenticated`. Always rolled back.
 */
async function as(who: Who, sql: string) {
  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO public.hr_leave_encashments
         (id, employee_id, hr_organization_id, leave_type_id, days_encashed, per_diem_rate, total_amount,
          status, approved_by, approved_at)
       VALUES ($1, $2, $3, gen_random_uuid(), 5, 1000, 5000, $4, $5, CASE WHEN $4 = 'pending' THEN NULL ELSE now() END)`,
      [ENC, STAFF_PAYEE, ORG_A, who.status ?? 'approved', who.status === 'pending' ? null : APPROVER],
    );
    await client.query(
      `INSERT INTO public.hr_offboarding_cases (id, staff_id, institution_id, reason, separation_type, termination_approval_chain)
       VALUES ($1, $2, $3, 'Termination after inquiry', 'termination',
               '[{"step":"sedc","status":"approved"},{"step":"legal","status":"approved"},
                 {"step":"director","status":"approved","acted_at":"2026-10-02T10:00:00Z"}]'::jsonb),
              ($4, $5, $3, 'Termination after inquiry', 'termination', '[]'::jsonb)`,
      [CASE_ORDER, STAFF_PAYEE, INST_A, CASE_SETTLE, STAFF_LEAVER],
    );
    await client.query(
      `INSERT INTO public.hr_offboarding_step_completions (case_id, step_key, step_index, completed_by)
       VALUES ($1, 'final_settlement', 5, $2)`,
      [CASE_SETTLE, SETTLER],
    );
    await client.query(
      `INSERT INTO public.hr_fnf_calculations (case_id, gratuity, leave_encashment, calculated_by, approved_by, approved_at)
       VALUES ($1, 80000, 12000, $2, $3, now())`,
      [CASE_SETTLE, SETTLER, APPROVER],
    );
    if (who.setup) await client.query(who.setup);
    await client.query(
      `SELECT set_config('test.uid', $1, true), set_config('test.perms', $2, true),
              set_config('test.insts', $3, true), set_config('test.super', $4, true)`,
      [who.uid === undefined ? CHECKER : who.uid ?? '', who.perms ?? '', who.insts ?? INST_A, who.superAdmin ? 'on' : 'off'],
    );
    await client.query('SET LOCAL ROLE authenticated');
    const r = await client.query(sql);
    await client.query('RESET ROLE');
    const after = who.after ? (await client.query(who.after)).rows : [];
    const enc = await client.query('SELECT total_amount::text AS total, status FROM public.hr_leave_encashments WHERE id = $1', [ENC]);
    return { rows: r.rows, after, enc: enc.rows[0], error: null as string | null };
  } catch (e) {
    return { rows: [] as Record<string, unknown>[], after: [] as Record<string, unknown>[], enc: undefined, error: (e as Error).message };
  } finally {
    await client.query('ROLLBACK');
  }
}

const check = (duty: string, item: string, result: string, amount: string = 'NULL', note: string = 'NULL') =>
  `SELECT public.fn_hr_duty_proof_second_check('${duty}', '${item}', '${result}', ${amount}, ${note}) AS id`;
const PROOFS = `SELECT duty_code, kind, recorded_by, check_result, corrected_amount::text AS amount FROM public.hr_duty_proofs`;

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', PRELUDE]);
  psql(['-d', DBNAME, '-f', MIG('20260515000004_hr_offboarding_substrate.sql')]);
  psql(['-d', DBNAME, '-f', MIG('20260621_hr_separation_extension.sql')]);
  psql(['-d', DBNAME, '-f', MIG('20260624_hr_termination_workflow.sql')]);
  psql(['-d', DBNAME, '-f', MIGRATION]);
  psql(['-d', DBNAME, '-f', REVIEW_FIXES]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
}, 60_000);
afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('hr_duty_proof_rules — the three seeded rules (20271007161123)', () => {
  it('seeds L4, G5 and G6 with their kind and checker key', async () => {
    const r = await client.query(
      `SELECT config_key, proof_kind, checker_permission_key FROM public.hr_duty_proof_rules WHERE is_active ORDER BY config_key`);
    expect(r.rows).toEqual([
      { config_key: 'G5', proof_kind: 'file', checker_permission_key: G5_KEY },
      { config_key: 'G6', proof_kind: 'second_check', checker_permission_key: G6_KEY },
      { config_key: 'L4', proof_kind: 'second_check', checker_permission_key: L4_KEY },
    ]);
  });

  it('a change to a rule is written to the audit table', async () => {
    await client.query('BEGIN');
    try {
      await client.query(`UPDATE public.hr_duty_proof_rules SET href = '/x', change_reason = 'test' WHERE config_key = 'L4'`);
      const a = await client.query(`SELECT change_reason FROM public.hr_duty_proof_rules_audit`);
      expect(a.rows).toEqual([{ change_reason: 'test' }]);
    } finally { await client.query('ROLLBACK'); }
  });

  it('a signed-in super admin changes a rule and the change is audited under their name', async () => {
    const r = await as({ uid: APPROVER, superAdmin: true,
      after: `SELECT changed_by, change_reason FROM public.hr_duty_proof_rules_audit` },
    `UPDATE public.hr_duty_proof_rules SET href = '/x', change_reason = 'moved screen' WHERE config_key = 'L4' RETURNING updated_by`);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([{ updated_by: APPROVER }]);
    expect(r.after).toEqual([{ changed_by: APPROVER, change_reason: 'moved screen' }]);
  });

  it('a signed-in team member who is not a super admin cannot change a rule', async () => {
    const r = await as({ perms: L4_KEY },
      `UPDATE public.hr_duty_proof_rules SET href = '/x' WHERE config_key = 'L4' RETURNING id`);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([]);
  });
});

describe('fn_hr_duty_proof_second_check — leave encashment (L4)', () => {
  it('a team member with the key in that college records a confirmed check', async () => {
    const r = await as({ perms: L4_KEY, after: PROOFS }, check('L4', ENC, 'confirmed'));
    expect(r.error).toBeNull();
    expect(r.after).toEqual([{ duty_code: 'L4', kind: 'second_check', recorded_by: CHECKER, check_result: 'confirmed', amount: null }]);
  });

  it('the approver cannot second-check their own encashment', async () => {
    const r = await as({ uid: APPROVER, perms: L4_KEY }, check('L4', ENC, 'confirmed'));
    expect(r.error).toMatch(/You decided this item/);
  });

  it('the team member being paid cannot check their own encashment', async () => {
    const r = await as({ uid: PAYEE, perms: L4_KEY }, check('L4', ENC, 'confirmed'));
    expect(r.error).toMatch(/You decided this item or it pays you/);
  });

  it('an encashment whose approver is not recorded cannot be second-checked', async () => {
    const r = await as({ perms: L4_KEY,
      setup: `UPDATE public.hr_leave_encashments SET approved_by = NULL WHERE id = '${ENC}'` },
    check('L4', ENC, 'confirmed'));
    expect(r.error).toMatch(/approver of this item is not recorded, so an independent check cannot be confirmed/);
  });

  it('the checker needs the rule key', async () => {
    const r = await as({ perms: 'hr.leave.approve' }, check('L4', ENC, 'confirmed'));
    expect(r.error).toMatch(/do not have the permission to check/);
  });

  it('a NULL permission answer is refused', async () => {
    const r = await as({ perms: 'NULL' }, check('L4', ENC, 'confirmed'));
    expect(r.error).toMatch(/do not have the permission to check/);
  });

  it('another college is refused', async () => {
    const r = await as({ perms: L4_KEY, insts: INST_B }, check('L4', ENC, 'confirmed'));
    expect(r.error).toMatch(/do not have the permission to check/);
  });

  it("'corrected' without an amount is refused", async () => {
    const r = await as({ perms: L4_KEY }, check('L4', ENC, 'corrected', 'NULL', `'Rate should be 900 per day'`));
    expect(r.error).toMatch(/needs the right amount and a note of at least 10 characters/);
  });

  it("'corrected' without a real note is refused", async () => {
    const r = await as({ perms: L4_KEY }, check('L4', ENC, 'corrected', '4500', `'wrong'`));
    expect(r.error).toMatch(/needs the right amount and a note of at least 10 characters/);
  });

  it("the table itself refuses a 'corrected' row with no note", async () => {
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO public.hr_duty_proofs (duty_code, item_table, item_id, kind, recorded_by, check_result, corrected_amount)
         VALUES ('L4', 'hr_leave_encashments', '${ENC}', 'second_check', '${CHECKER}', 'corrected', 4500)`);
      throw new Error('inserted');
    } catch (e) {
      expect((e as Error).message).toMatch(/hr_duty_proofs_corrected_has_amount_and_note/);
    } finally { await client.query('ROLLBACK'); }
  });

  it('an encashment not yet approved is refused', async () => {
    const r = await as({ perms: L4_KEY, status: 'pending' }, check('L4', ENC, 'confirmed'));
    expect(r.error).toMatch(/not decided yet/);
  });

  it("a 'corrected' check leaves the encashment itself unchanged", async () => {
    const r = await as({ perms: L4_KEY, after: PROOFS },
      check('L4', ENC, 'corrected', '4500', `'Rate should be 900 per day, not 1000'`));
    expect(r.error).toBeNull();
    expect(r.enc).toEqual({ total: '5000', status: 'approved' });
    expect(r.after).toEqual([{ duty_code: 'L4', kind: 'second_check', recorded_by: CHECKER, check_result: 'corrected', amount: '4500.00' }]);
  });

  it('a second check on the same item is refused', async () => {
    const r = await as({ perms: L4_KEY, setup: `INSERT INTO public.hr_duty_proofs
        (duty_code, item_table, item_id, institution_id, kind, recorded_by, check_result, checked_amount, decider_id)
        VALUES ('L4', 'hr_leave_encashments', '${ENC}', '${INST_A}', 'second_check', '${SETTLER}', 'confirmed', 5000, '${APPROVER}')` },
    check('L4', ENC, 'confirmed'));
    expect(r.error).toMatch(/already has a second check/);
  });

  it('a file duty does not take a second check', async () => {
    const r = await as({ perms: G5_KEY }, check('G5', CASE_ORDER, 'confirmed'));
    expect(r.error).toMatch(/does not take a second check/);
  });
});

describe('fn_hr_duty_proof_gaps — done items with no proof', () => {
  const GAPS = `SELECT item_id, amount::text AS amount, caller_is_doer FROM public.fn_hr_duty_proof_gaps('L4', NULL)`;

  it('lists an approved encashment with no proof, then drops it after a check', async () => {
    const before = await as({ perms: L4_KEY }, GAPS);
    expect(before.error).toBeNull();
    expect(before.rows).toEqual([{ item_id: ENC, amount: '5000', caller_is_doer: false }]);

    const after = await as({ perms: L4_KEY, setup: `INSERT INTO public.hr_duty_proofs
        (duty_code, item_table, item_id, institution_id, kind, recorded_by, check_result, checked_amount, decider_id)
        VALUES ('L4', 'hr_leave_encashments', '${ENC}', '${INST_A}', 'second_check', '${SETTLER}', 'confirmed', 5000, '${APPROVER}')` }, GAPS);
    expect(after.error).toBeNull();
    expect(after.rows).toEqual([]);
  });

  it('tells the approver the item is theirs', async () => {
    const r = await as({ uid: APPROVER, perms: L4_KEY }, GAPS);
    expect(r.rows).toEqual([{ item_id: ENC, amount: '5000', caller_is_doer: true }]);
  });

  it("leaves out another college's items", async () => {
    const r = await as({ perms: L4_KEY, insts: INST_B }, GAPS);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([]);
  });

  it('refuses a caller without the key', async () => {
    const r = await as({ perms: 'hr.leave.approve' }, GAPS);
    expect(r.error).toMatch(/do not have the permission to see proof/);
  });
});

describe('termination: the signed order (G5) and the final settlement (G6)', () => {
  const PATH = `G5/${CASE_ORDER}/11111111-1111-4111-8111-111111111111-order.pdf`;
  const upload = `INSERT INTO storage.objects (bucket_id, name) VALUES ('hr-duty-proofs', '${PATH}')`;
  const attach = (p: string) => `SELECT public.fn_hr_duty_proof_attach_file('G5', '${CASE_ORDER}', '${p}', 'order.pdf') AS id`;

  it('a team member with the key uploads the order and attaches it', async () => {
    const r = await as({ perms: G5_KEY, after: PROOFS }, `${upload}; ${attach(PATH)}`);
    expect(r.error).toBeNull();
    expect(r.after).toEqual([{ duty_code: 'G5', kind: 'file', recorded_by: CHECKER, check_result: null, amount: null }]);
  });

  it('the bucket refuses an upload from someone without the key', async () => {
    const r = await as({ perms: L4_KEY }, upload);
    expect(r.error).toMatch(/row-level security/);
  });

  it('the bucket refuses an upload for a case not yet signed off', async () => {
    const r = await as({ perms: G5_KEY },
      `INSERT INTO storage.objects (bucket_id, name) VALUES ('hr-duty-proofs', 'G5/${CASE_SETTLE}/x-order.pdf')`);
    expect(r.error).toMatch(/row-level security/);
  });

  it('attaching refuses a file that was never uploaded', async () => {
    const r = await as({ perms: G5_KEY }, attach(PATH));
    expect(r.error).toMatch(/has not been uploaded/);
  });

  it('attaching refuses a team member without the key, even when the order is already uploaded', async () => {
    const r = await as({ perms: L4_KEY, setup: upload }, attach(PATH));
    expect(r.error).toMatch(/do not have the permission to attach/);
  });

  it('attaching refuses a key holder from another college, even when the order is already uploaded', async () => {
    const r = await as({ perms: G5_KEY, insts: INST_B, setup: upload }, attach(PATH));
    expect(r.error).toMatch(/do not have the permission to attach/);
  });

  it("attaching refuses a path outside the case's folder", async () => {
    const r = await as({ perms: G5_KEY, setup: upload }, attach(`G5/${CASE_SETTLE}/x-order.pdf`));
    expect(r.error).toMatch(/file path must be/);
  });

  it('G6: the team member who completed the settlement cannot check it', async () => {
    const r = await as({ uid: SETTLER, perms: G6_KEY }, check('G6', CASE_SETTLE, 'confirmed'));
    expect(r.error).toMatch(/You decided this item/);
  });

  it('G6: the team member who approved the F&F calculation cannot check it', async () => {
    const r = await as({ uid: APPROVER, perms: G6_KEY }, check('G6', CASE_SETTLE, 'confirmed'));
    expect(r.error).toMatch(/You decided this item/);
  });

  it('G6: a settlement whose completer is not recorded cannot be second-checked', async () => {
    const r = await as({ perms: G6_KEY,
      setup: `UPDATE public.hr_offboarding_step_completions SET completed_by = NULL WHERE case_id = '${CASE_SETTLE}'` },
    check('G6', CASE_SETTLE, 'confirmed'));
    expect(r.error).toMatch(/approver of this item is not recorded/);
  });

  it('G6: the team member leaving cannot check their own settlement', async () => {
    const r = await as({ uid: LEAVER, perms: G6_KEY }, check('G6', CASE_SETTLE, 'confirmed'));
    expect(r.error).toMatch(/You decided this item or it pays you/);
  });

  it('G6: a second team member with the key confirms; gaps shows the F&F amount first', async () => {
    const g = await as({ perms: G6_KEY },
      `SELECT item_id, amount::text AS amount FROM public.fn_hr_duty_proof_gaps('G6', NULL)`);
    expect(g.rows).toEqual([{ item_id: CASE_SETTLE, amount: '92000.00' }]);
    const r = await as({ perms: G6_KEY, after: PROOFS }, check('G6', CASE_SETTLE, 'confirmed'));
    expect(r.error).toBeNull();
    expect(r.after).toEqual([{ duty_code: 'G6', kind: 'second_check', recorded_by: CHECKER, check_result: 'confirmed', amount: null }]);
  });

  it('G6: a case with no completed settlement step is not checkable', async () => {
    const r = await as({ perms: G6_KEY }, check('G6', CASE_ORDER, 'confirmed'));
    expect(r.error).toMatch(/not decided yet/);
  });
});

describe('hr_duty_proofs — who sees and who writes', () => {
  const seed = `INSERT INTO public.hr_duty_proofs
    (duty_code, item_table, item_id, institution_id, kind, recorded_by, check_result)
    VALUES ('L4', 'hr_leave_encashments', '${ENC}', '${INST_A}', 'second_check', '${CHECKER}', 'confirmed')`;

  it('a key holder in that college sees the proof', async () => {
    const r = await as({ perms: L4_KEY, setup: seed }, `SELECT duty_code FROM public.hr_duty_proofs`);
    expect(r.rows).toEqual([{ duty_code: 'L4' }]);
  });

  it('a team member without the key sees nothing', async () => {
    const r = await as({ perms: 'hr.leave.approve', setup: seed }, `SELECT duty_code FROM public.hr_duty_proofs`);
    expect(r.rows).toEqual([]);
  });

  it('a signed-in user cannot write a proof row directly', async () => {
    const r = await as({ perms: L4_KEY }, seed);
    expect(r.error).toMatch(/permission denied/);
  });

  it('anon has no EXECUTE on any function, and nobody signed in can call the done-items reader', async () => {
    const r = await client.query(`SELECT
      has_function_privilege('anon', 'public.fn_hr_duty_proof_can_view(text, uuid)', 'EXECUTE') AS can_view,
      has_function_privilege('anon', 'public.fn_hr_duty_proof_can_view_object(text)', 'EXECUTE') AS can_view_object,
      has_function_privilege('anon', 'public.fn_hr_duty_proof_second_check(text, uuid, text, numeric, text)', 'EXECUTE') AS second_check,
      has_function_privilege('anon', 'public.fn_hr_duty_proof_attach_file(text, uuid, text, text)', 'EXECUTE') AS attach_file,
      has_function_privilege('anon', 'public.fn_hr_duty_proof_gaps(text, date)', 'EXECUTE') AS gaps,
      has_function_privilege('authenticated', 'public.fn_hr_duty_proof_done_items(text, uuid)', 'EXECUTE') AS done_items,
      has_function_privilege('authenticated', 'public.fn_hr_duty_proof_rules_audit()', 'EXECUTE') AS audit_trigger`);
    expect(r.rows[0]).toEqual({
      can_view: false, can_view_object: false, second_check: false, attach_file: false,
      gaps: false, done_items: false, audit_trigger: false,
    });
  });

  it('signed-in users can call the four public functions', async () => {
    const r = await client.query(`SELECT
      has_function_privilege('authenticated', 'public.fn_hr_duty_proof_second_check(text, uuid, text, numeric, text)', 'EXECUTE') AS a,
      has_function_privilege('authenticated', 'public.fn_hr_duty_proof_attach_file(text, uuid, text, text)', 'EXECUTE') AS b,
      has_function_privilege('authenticated', 'public.fn_hr_duty_proof_gaps(text, date)', 'EXECUTE') AS c,
      has_function_privilege('authenticated', 'public.fn_hr_duty_proof_can_view(text, uuid)', 'EXECUTE') AS d`);
    expect(r.rows[0]).toEqual({ a: true, b: true, c: true, d: true });
  });
});

describe('review fixes (20271008110105) — follow-up to #4226', () => {
  const GAPS_L4 = `SELECT item_id, amount::text AS amount FROM public.fn_hr_duty_proof_gaps('L4', NULL)`;
  const CHECKED = `SELECT recorded_by, check_result, check_note, checked_amount::text AS checked, decider_id,
                          revoked_at IS NOT NULL AS revoked
                   FROM public.hr_duty_proofs ORDER BY recorded_at, revoked_at NULLS LAST`;
  const proofRow = (amount: string, decider: string | null) => `INSERT INTO public.hr_duty_proofs
      (duty_code, item_table, item_id, institution_id, kind, recorded_by, check_result, checked_amount, decider_id,
       recorded_at)
      VALUES ('L4', 'hr_leave_encashments', '${ENC}', '${INST_A}', 'second_check', '${SETTLER}', 'confirmed',
              ${amount}, ${decider === null ? 'NULL' : `'${decider}'`}, now() - interval '1 day')`;

  // Finding 1: a check records the amount and the decider it checked.
  it('a second check saves the amount and the decider it checked', async () => {
    const r = await as({ perms: L4_KEY, after: CHECKED }, check('L4', ENC, 'confirmed'));
    expect(r.error).toBeNull();
    expect(r.after).toEqual([{ recorded_by: CHECKER, check_result: 'confirmed', check_note: null,
      checked: '5000', decider_id: APPROVER, revoked: false }]);
  });

  it('a check whose amount no longer matches the encashment is stale: the item is listed again', async () => {
    const r = await as({ perms: L4_KEY,
      setup: `${proofRow('5000', APPROVER)}; UPDATE public.hr_leave_encashments SET total_amount = 6000 WHERE id = '${ENC}'` },
    GAPS_L4);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([{ item_id: ENC, amount: '6000' }]);
  });

  it('a check whose decider no longer matches the encashment is stale', async () => {
    const r = await as({ perms: L4_KEY, setup: proofRow('5000', SETTLER) }, GAPS_L4);
    expect(r.rows).toEqual([{ item_id: ENC, amount: '5000' }]);
  });

  it('a check recorded before this fix (nothing saved about what it checked) counts as stale', async () => {
    const r = await as({ perms: L4_KEY, setup: proofRow('NULL', null) }, GAPS_L4);
    expect(r.rows).toEqual([{ item_id: ENC, amount: '5000' }]);
  });

  it('a check that still matches keeps the item off the list', async () => {
    const r = await as({ perms: L4_KEY, setup: proofRow('5000', APPROVER) }, GAPS_L4);
    expect(r.rows).toEqual([]);
  });

  it('a new check on a stale item keeps the old check as revoked history and records the new one', async () => {
    const r = await as({ perms: L4_KEY, after: CHECKED,
      setup: `${proofRow('5000', APPROVER)}; UPDATE public.hr_leave_encashments SET total_amount = 6000 WHERE id = '${ENC}'` },
    check('L4', ENC, 'confirmed'));
    expect(r.error).toBeNull();
    expect(r.after).toEqual([
      { recorded_by: SETTLER, check_result: 'confirmed', check_note: null, checked: '5000', decider_id: APPROVER, revoked: true },
      { recorded_by: CHECKER, check_result: 'confirmed', check_note: null, checked: '6000', decider_id: APPROVER, revoked: false },
    ]);
  });

  // Finding 3: the F&F calculator is a doer.
  it('G6: the team member who calculated the F&F settlement cannot check it', async () => {
    const r = await as({ uid: CALCULATOR, perms: G6_KEY,
      setup: `UPDATE public.hr_fnf_calculations SET calculated_by = '${CALCULATOR}' WHERE case_id = '${CASE_SETTLE}'` },
    check('G6', CASE_SETTLE, 'confirmed'));
    expect(r.error).toMatch(/You decided this item/);
  });

  // Finding 5: one malformed acted_at no longer breaks every caller.
  it("G5: a malformed acted_at ('2026-13-40') falls back to the case's last update instead of an error", async () => {
    const r = await as({ perms: G5_KEY,
      setup: `UPDATE public.hr_offboarding_cases
                 SET termination_approval_chain = '[{"step":"director","status":"approved","acted_at":"2026-13-40"}]'::jsonb
               WHERE id = '${CASE_ORDER}'` },
    // The case's updated_at is stamped now() by its own trigger in this transaction.
    `SELECT item_id, done_at = now() AS fell_back FROM public.fn_hr_duty_proof_gaps('G5', NULL)`);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([{ item_id: CASE_ORDER, fell_back: true }]);
  });

  // Finding 7: a confirmation keeps no note.
  it('a confirmed check stores no note, even when one is sent', async () => {
    const r = await as({ perms: L4_KEY, after: `SELECT check_note FROM public.hr_duty_proofs` },
      check('L4', ENC, 'confirmed', 'NULL', `'Rate should be 900 per day'`));
    expect(r.error).toBeNull();
    expect(r.after).toEqual([{ check_note: null }]);
  });

  // Finding 8: a new rule row is audited.
  it('a rule row a super admin adds is written to the audit table', async () => {
    const r = await as({ uid: APPROVER, superAdmin: true,
      after: `SELECT a.changed_by, a.change_reason, a.old_value IS NULL AS no_old
                FROM public.hr_duty_proof_rules_audit a
                JOIN public.hr_duty_proof_rules r ON r.id = a.config_id WHERE r.config_key = 'L1'` },
    `INSERT INTO public.hr_duty_proof_rules (config_key, duty_code, display_name, item_table, proof_kind,
       checker_permission_key, change_reason)
     VALUES ('L1', 'L1', 'Test rule', 'hr_leave_encashments', 'second_check', '${L4_KEY}', 'added for a test')`);
    expect(r.error).toBeNull();
    expect(r.after).toEqual([{ changed_by: APPROVER, change_reason: 'added for a test', no_old: true }]);
  });

  // Finding 9: "since" is an India-time date.
  it('an item decided at 01:30 IST on the 1st counts in that month, whatever the session time zone', async () => {
    const r = await as({ perms: L4_KEY,
      setup: `SET LOCAL TimeZone = 'UTC';
              UPDATE public.hr_leave_encashments SET approved_at = '2026-09-30T20:00:00Z' WHERE id = '${ENC}'` },
    `SELECT item_id FROM public.fn_hr_duty_proof_gaps('L4', '2026-10-01')`);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([{ item_id: ENC }]);
  });

  // Review extra: a negative or oversized right amount is a 400, not a stored row or a 500.
  it('a correction to a negative amount is refused', async () => {
    const r = await as({ perms: L4_KEY }, check('L4', ENC, 'corrected', '-5', `'Rate should be 900 per day'`));
    expect(r.error).toMatch(/between 0 and/);
  });

  it('a correction too large for the column is refused with a clear message', async () => {
    const r = await as({ perms: L4_KEY }, check('L4', ENC, 'corrected', '99999999999', `'Rate should be 900 per day'`));
    expect(r.error).toMatch(/between 0 and/);
  });

  // Review round 2: the bound checks the ROUNDED amount, so a value that rounds up to the limit is a 400, not a 500.
  it('a correction that rounds up past the column limit is refused with a clear message', async () => {
    const r = await as({ perms: L4_KEY }, check('L4', ENC, 'corrected', '9999999999.995', `'Rate should be 900 per day'`));
    expect(r.error).toMatch(/between 0 and/);
  });

  // The drift check: a body that is neither main's nor this file's stops the file.
  it('the migration refuses to run over a function that differs from main, and re-runs cleanly over itself', async () => {
    const fs = await import('fs');
    const sql = fs.readFileSync(REVIEW_FIXES, 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql); // a re-run over its own definitions passes
      await client.query(`CREATE OR REPLACE FUNCTION public.fn_hr_duty_proof_gaps(p_duty text, p_since date DEFAULT NULL)
        RETURNS TABLE (item_id uuid, done_at timestamptz, institution_id uuid, amount numeric, caller_is_doer boolean)
        LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $x$ BEGIN RETURN; END $x$`);
      await expect(client.query(sql)).rejects.toThrow(/Drift: public\.fn_hr_duty_proof_gaps/);
    } finally { await client.query('ROLLBACK'); }
  });

  it('the new helper is callable by nobody signed in', async () => {
    const r = await client.query(`SELECT
      has_function_privilege('anon', 'public.fn_hr_duty_proof_try_timestamptz(text)', 'EXECUTE') AS anon,
      has_function_privilege('authenticated', 'public.fn_hr_duty_proof_try_timestamptz(text)', 'EXECUTE') AS authed`);
    expect(r.rows[0]).toEqual({ anon: false, authed: false });
  });
});
