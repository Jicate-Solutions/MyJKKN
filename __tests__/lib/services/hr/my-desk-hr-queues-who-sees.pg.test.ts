/**
 * Who sees two of the HR queues that 20270613101149 adds to fn_my_desk_waiting.
 *
 *   leave_eligibility — a step pinned by name to the Director (approver_user_id
 *     set, an approvers list of one, no role) is on the Director's desk and on
 *     nobody else's: not an HR officer who can decide role-routed steps in the
 *     same organisation, not a super admin, not the employee.
 *   salary_revision — a 'waiting_director' raise shows to every holder of
 *     fn_hr_salary_revision_can_approve() (super admin or .approve), never on
 *     the desk of the person whose pay it is. PR #4190 (draft) adds the
 *     platform_policies key 'hr.salary_revision.list_member_raise_decider_profile_id';
 *     it is not on main, so this pins TODAY's behaviour, and the branch carries
 *     a comment saying where to narrow it when #4190 lands.
 *
 * The whole function reads ~38 tables, so this does not install it. It runs the
 * three CTEs that decide these rows — my_roles, leave_eligibility,
 * salary_revision — sliced VERBATIM from the migration file, inside a wrapper
 * whose v_* variables come from a persona row (the values the helper RPCs would
 * return for that person). fn_leave_step_approvers and fn_my_desk_ts_or_null
 * are the real definitions, also read from the migration files.
 * fn_hr_leave_scope_admits is stubbed to TRUE so a row is never hidden by the
 * per-applicant scope test: whoever does not see the pinned step is excluded by
 * the pinning rule itself.
 *
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const DESK = readFileSync(path.join(REPO, 'supabase/migrations/20270613101149_fn_my_desk_waiting_hr_queues.sql'), 'utf8');
const LADDER = readFileSync(path.join(REPO, 'supabase/migrations/20260831120000_hr_leave_approval_flow_parallel_ladder.sql'), 'utf8');
const PGHOST = process.env.MYDESK_HR_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.MYDESK_HR_TEST_PGPORT ?? '5432';
const PGUSER = process.env.MYDESK_HR_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');
const DBNAME = `mydesk_hr_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const DIRECTOR = '00000000-0000-4000-8000-00000000a001';
const HR_OFFICER = '00000000-0000-4000-8000-00000000a002';
const SUPER = '00000000-0000-4000-8000-00000000a003';
const HR_HEAD = '00000000-0000-4000-8000-00000000a004';
const EMPLOYEE = '00000000-0000-4000-8000-00000000a005';

const EMP_STAFF = '00000000-0000-4000-8000-00000000b001';
const ORG = '00000000-0000-4000-8000-00000000c001';
const INST = '00000000-0000-4000-8000-00000000c002';
const ROLE_HR = '00000000-0000-4000-8000-00000000d001';
const LEAVE_TYPE = '00000000-0000-4000-8000-00000000e001';
const ELIG_PINNED = '00000000-0000-4000-8000-00000000f001';
const ELIG_ROLE = '00000000-0000-4000-8000-00000000f002';
const REV_DIRECTOR = '00000000-0000-4000-8000-00000000f003';

/** One whole `CREATE … FUNCTION <name>(…) … $function$;` block from a file. */
function fnBlock(src: string, name: string): string {
  const m = src.match(new RegExp(`^CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?^\\$function\\$;$`, 'm'));
  if (!m) throw new Error(`${name} not found`);
  return m[0];
}

/** One `  <name> AS (` CTE of fn_my_desk_waiting, verbatim, ending at its closing `  )`. */
function cte(name: string): string {
  const lines = DESK.split('\n');
  // my_roles opens the query: `  WITH my_roles AS (`.
  const start = lines.findIndex((l) => l === `  ${name} AS (` || l === `  WITH ${name} AS (`);
  if (start < 0) throw new Error(`CTE ${name} not found`);
  const end = lines.findIndex((l, i) => i > start && /^ {2}\),?$/.test(l));
  return [lines[start].replace(/^ {2}(WITH )?/, '  '), ...lines.slice(start + 1, end), '  )'].join('\n');
}

const SCHEMA = `
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

CREATE TABLE public.staff (id uuid PRIMARY KEY, first_name text, last_name text);
CREATE TABLE public.custom_roles (id uuid PRIMARY KEY, role_key text, role_name text, is_active boolean);
CREATE TABLE public.user_roles (user_id uuid, role_id uuid);
CREATE TABLE public.hr_leave_types (id uuid PRIMARY KEY, leave_type_name text);
CREATE TABLE public.hr_leave_eligibilities (
  id uuid PRIMARY KEY, employee_id uuid, leave_type_id uuid, status text,
  approval_chain jsonb, current_step integer, hr_organization_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.hr_salary_revision_requests (
  id uuid PRIMARY KEY, staff_id uuid, institution_id uuid, status text, is_cut boolean DEFAULT false,
  asked_monthly_gross numeric, principal_decided_at timestamptz, created_at timestamptz DEFAULT now());
CREATE FUNCTION public.fn_hr_leave_scope_admits(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

-- What the helper RPCs return for each person (is_super_admin, user_has_permission,
-- fn_my_hr_organization_ids, fn_my_designated_hr_org_ids, fn_my_staff_ids,
-- fn_my_staff_institution_ids), as fn_my_desk_waiting computes them once.
CREATE TABLE public.test_persona (
  uid uuid PRIMARY KEY, is_super boolean, has_leave_perm boolean, org_ids uuid[], designated_org_ids uuid[],
  staff_ids uuid[], has_rev_college boolean, can_rev_approve boolean, staff_inst_ids uuid[]);

${fnBlock(LADDER, 'fn_leave_step_approvers')}
${fnBlock(DESK, 'fn_my_desk_ts_or_null')}

CREATE FUNCTION public.test_desk()
RETURNS TABLE(source text, item_id uuid, detail text)
LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_is_super boolean; v_has_leave_perm boolean; v_org_ids uuid[]; v_designated_org_ids uuid[];
  v_staff_ids uuid[]; v_has_rev_college boolean; v_can_rev_approve boolean; v_staff_inst_ids uuid[];
BEGIN
  SELECT p.is_super, p.has_leave_perm, p.org_ids, p.designated_org_ids, p.staff_ids,
         p.has_rev_college, p.is_super OR p.can_rev_approve, p.staff_inst_ids
    INTO v_is_super, v_has_leave_perm, v_org_ids, v_designated_org_ids, v_staff_ids,
         v_has_rev_college, v_can_rev_approve, v_staff_inst_ids
    FROM public.test_persona p WHERE p.uid = v_uid;
  RETURN QUERY
  WITH
${cte('my_roles')},
${cte('leave_eligibility')},
${cte('salary_revision')}
  SELECT x.source, x.item_id, x.detail FROM leave_eligibility x
  UNION ALL SELECT y.source, y.item_id, y.detail FROM salary_revision y;
END;
$function$;

INSERT INTO public.staff VALUES ('${EMP_STAFF}', 'Kavya', 'Subramani');
INSERT INTO public.hr_leave_types VALUES ('${LEAVE_TYPE}', 'Earned leave');
INSERT INTO public.custom_roles VALUES ('${ROLE_HR}', 'hr_officer', 'HR Officer', true);
INSERT INTO public.user_roles VALUES ('${HR_OFFICER}', '${ROLE_HR}'), ('${SUPER}', '${ROLE_HR}');

INSERT INTO public.test_persona VALUES
  ('${DIRECTOR}',   false, false, '{}',       '{}', '{}',            false, true,  '{}'),
  ('${HR_OFFICER}', false, true,  '{${ORG}}', '{}', '{}',            true,  false, '{${INST}}'),
  ('${SUPER}',      true,  true,  '{${ORG}}', '{}', '{}',            true,  true,  '{${INST}}'),
  ('${HR_HEAD}',    false, false, '{}',       '{}', '{}',            false, true,  '{}'),
  ('${EMPLOYEE}',   false, false, '{}',       '{}', '{${EMP_STAFF}}', false, true,  '{}');

-- Pinned by name to the Director: top-level approver_user_id, approvers list of one, no role.
INSERT INTO public.hr_leave_eligibilities VALUES
  ('${ELIG_PINNED}', '${EMP_STAFF}', '${LEAVE_TYPE}', 'pending',
   '[{"approver_user_id":"${DIRECTOR}","approvers":[{"approver_user_id":"${DIRECTOR}"}]}]'::jsonb, 0, '${ORG}'),
-- Control: the same request routed to a role, so the HR officer persona is shown to be live.
  ('${ELIG_ROLE}', '${EMP_STAFF}', '${LEAVE_TYPE}', 'pending',
   '[{"approvers":[{"approver_role":"hr_officer"}]}]'::jsonb, 0, '${ORG}');

INSERT INTO public.hr_salary_revision_requests (id, staff_id, institution_id, status, asked_monthly_gross)
VALUES ('${REV_DIRECTOR}', '${EMP_STAFF}', '${INST}', 'waiting_director', 52000);
`;

function psql(args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let client: Client;

async function deskOf(uid: string): Promise<Array<{ source: string; item_id: string; detail: string }>> {
  await client.query(`SELECT set_config('test.uid', $1, false)`, [uid]);
  return (await client.query('SELECT source, item_id, detail FROM public.test_desk() ORDER BY source, item_id')).rows;
}
const ids = async (uid: string, source: string) =>
  (await deskOf(uid)).filter((r) => r.source === source).map((r) => r.item_id);

beforeAll(async () => {
  try { psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]); }
  catch (e) { throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`); }
  psql(['-d', DBNAME, '-c', SCHEMA]);
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
});
afterAll(async () => {
  await client?.end();
  try { psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME}`]); } catch { /* best effort */ }
});

describe('leave_eligibility — a step pinned by name to the Director', () => {
  it("is on the Director's desk, marked as pinned to them", async () => {
    const rows = (await deskOf(DIRECTOR)).filter((r) => r.source === 'leave_eligibility');
    expect(rows).toEqual([{ source: 'leave_eligibility', item_id: ELIG_PINNED, detail: 'pinned to you by name' }]);
  });

  it("is on nobody else's: not the HR officer, not a super admin, not the employee, not another approver", async () => {
    for (const uid of [HR_OFFICER, SUPER, HR_HEAD, EMPLOYEE]) {
      expect(await ids(uid, 'leave_eligibility')).not.toContain(ELIG_PINNED);
    }
  });

  it('control: the HR officer does see the same request when its step is routed to their role', async () => {
    expect(await ids(HR_OFFICER, 'leave_eligibility')).toEqual([ELIG_ROLE]);
  });
});

describe('salary_revision — waiting_director, until #4190 names a single decider', () => {
  it('shows to every holder of the approve test (Director, HR head with .approve, super admin)', async () => {
    for (const uid of [DIRECTOR, HR_HEAD, SUPER]) {
      expect(await ids(uid, 'salary_revision')).toEqual([REV_DIRECTOR]);
    }
  });

  it('never to someone without .approve, and never on the desk of the person whose pay it is', async () => {
    expect(await ids(HR_OFFICER, 'salary_revision')).toEqual([]);
    expect(await ids(EMPLOYEE, 'salary_revision')).toEqual([]);
  });

  it('the branch says where #4190 narrows it', () => {
    expect(cte('salary_revision')).toContain("'hr.salary_revision.list_member_raise_decider_profile_id'");
    expect(cte('salary_revision')).toContain('#4190');
  });
});
