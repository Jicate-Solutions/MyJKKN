/**
 * Guards on 20270519090000_hr_salary_revision_requests.sql and on the two pay
 * readers, read as TEXT. The behaviour itself is rehearsed on a throwaway
 * PostgreSQL 16 by supabase/tests/hr-salary-revision/run.sh (88 checks, 19
 * mutation controls); these catch the regressions that can happen in a later
 * edit without anyone re-running it.
 *
 * Run: npx vitest run __tests__/hr/salary-revision-migration-guard.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
// The workflow as applied to production on 30 Sep 2026, plus this PR's file on
// top of it (the Director's rulings of 30 Sep). Read as one text: a later
// CREATE OR REPLACE supersedes the earlier one, exactly as applying both does.
const APPLIED = read('supabase/migrations/20270519090000_hr_salary_revision_requests.sql');
const RULINGS = read('supabase/migrations/20270524090000_hr_salary_revision_director_list.sql');
const SQL = APPLIED + '\n' + RULINGS;
const REGISTER = read('lib/services/hr/payroll/salary-register-service.ts');
const PAYSLIP = read('lib/services/hr/payroll/payslip-generator.ts');

/** Every function the migration creates, by name. */
const functions = Array.from(SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g)).map((m) => m[1]);

describe('the migration', () => {
  it('locks anon AND PUBLIC out of every function it creates', () => {
    expect(functions.length).toBeGreaterThanOrEqual(20);
    for (const fn of functions) {
      const revoke = new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon, PUBLIC`);
      expect(SQL, `${fn} is not revoked from anon and PUBLIC`).toMatch(revoke);
      expect(SQL, `${fn} is granted to anon`).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO [^;]*anon`));
    }
  });

  it('keeps the internal functions away from signed-in users', () => {
    for (const fn of ['fn_hr_salary_revision_my_department_ids', 'hr_salary_revision_user_holds', 'hr_salary_revision_user_tier', 'hr_salary_revision_notify',
      'hr_salary_revision_director_ids',
      'hr_salary_revision_start_date', 'hr_salary_revision_approve_one', 'hr_salary_revision_apply_due_on',
      'hr_salary_revision_suggestion_inputs', 'fn_hr_salary_revision_weekly_digest']) {
      expect(SQL).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon, PUBLIC, authenticated;`));
      expect(SQL).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO [^;]*authenticated`));
    }
  });

  it('turns on row level security for all four tables, with SELECT policies only', () => {
    for (const t of ['requests', 'comments', 'decision_notes', 'outcomes']) {
      expect(SQL).toContain(`ALTER TABLE public.hr_salary_revision_${t}`);
      expect(SQL).toMatch(new RegExp(`CREATE POLICY hr_salary_revision_${t}_select ON public\\.hr_salary_revision_${t}\\s+FOR SELECT TO authenticated`));
    }
    expect(SQL).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(SQL).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL) TO authenticated/);
    expect(SQL).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.hr_salary_revision_requests/);
  });

  it('enforces one open request per person in the database, counting approved as open (ruling 10)', () => {
    expect(SQL).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS hr_salary_revision_requests_one_open\s+ON public\.hr_salary_revision_requests \(staff_id\)\s+WHERE status IN \('waiting_principal', 'waiting_director', 'approved'\);/);
  });

  it('gives the final yes to the Director only, and grants the approve key to nobody (ruling 3)', () => {
    // 30 Sep: the NAMED list (#4121), never is_super_admin() (15 accounts hold it).
    // The applied file still carries the old line; this PR's file replaces the function.
    expect(RULINGS).toMatch(/FUNCTION public\.fn_hr_salary_revision_can_approve\(\)[\s\S]*?SELECT public\.fn_is_the_director\(\)\n\$function\$;/);
    expect(RULINGS).not.toMatch(/is_super_admin\(\) OR/);
    expect(SQL).not.toMatch(/'hr\.payroll\.salary_revision\.approve', true/);
  });

  it('names roles ONLY in the data grant, never in an access check', () => {
    const grantStart = SQL.indexOf('-- 12. The ask and check keys');
    expect(grantStart).toBeGreaterThan(0);
    const checks = SQL.slice(0, grantStart);
    // A role key compared with a literal, or the legacy single role read, is a
    // hardcoded role check. (asked_as 'hod' / 'principal' are labels of the
    // lane a request came through, decided from permission keys above them.)
    expect(checks).not.toMatch(/role_key\s*(=|IN)\s*\(?\s*'/);
    expect(checks).not.toMatch(/\.role\s*(=|IN)\s*\(?\s*'/);
    expect(checks).not.toMatch(/get_current_user_role|get_my_role/);
    const grant = SQL.slice(grantStart);
    expect(grant.match(/WHERE role_key = '(principal|hod|hr_head)';/g)).toHaveLength(3);
  });

  it('starts a yes on the 1st of the NEXT month in India (ruling 4)', () => {
    expect(SQL).toContain("SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date");
    expect(SQL).toContain("v_start date := (date_trunc('month', p_today) + interval '1 month')::date;");
  });

  it('writes the pay through fn_hr_set_staff_salary with effective_from = the start date', () => {
    expect(SQL).toMatch(/v_new := public\.fn_hr_set_staff_salary\(/);
    expect(SQL).toMatch(/p_effective_from\s+=> v_r\.starts_on,/);
    expect(SQL).toMatch(/WHERE status = 'approved' AND starts_on <= p_today/);
  });
});

describe('the pay readers', () => {
  it('the register reads the pay IN FORCE on the 1st of its month, not the current row', () => {
    const block = REGISTER.slice(REGISTER.indexOf('const monthStart = registerMonthStart(year, month);'));
    expect(block.length).toBeGreaterThan(0);
    expect(block.slice(0, 900)).toMatch(/\.rpc\(SALARIES_IN_FORCE_RPC, \{\s+p_staff_ids: ids,\s+p_on: on,/);
    expect(block.slice(0, 1400)).toMatch(/readInForce\(ids, monthStart\)/);
    expect(REGISTER).not.toMatch(/from\('hr_staff_salaries'\)[\s\S]{0,300}\.is\('superseded_by', null\)/);
  });

  it('the payslip generator does not read hr_staff_salaries (if it ever does, it must use the in-force read)', () => {
    expect(PAYSLIP).not.toContain('hr_staff_salaries');
  });
});
