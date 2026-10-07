/**
 * Migration 20270613101149 adds eleven HR queues and a `due_at` column to
 * fn_my_desk_waiting — and is allowed to change NOTHING else about the six
 * queues that were already there.
 *
 * Like my-desk-offer-branch-widening.test.ts, this re-derives the claim from
 * the files every run instead of trusting the header's prose. It reads file
 * text only; nothing here connects to a database. (The behaviour itself was
 * rehearsed on a throwaway local PostgreSQL 16; there is no pg harness for
 * the desk in this repo to commit that run into.)
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'supabase', 'migrations');
/** The newest body before this change — see that file's header on why it, not a higher prefix. */
const PREV = path.join(DIR, '20261202090000_fn_my_desk_waiting_offer_issued.sql');
const NEXT = path.join(DIR, '20270613101149_fn_my_desk_waiting_hr_queues.sql');
const SETUP = path.join(process.cwd(), 'supabase', 'setup', '02_functions.sql');

const OLD_BRANCHES = ['recruitment', 'refund', 'leave', 'meeting_trigger', 'grievance', 'offer'] as const;
const NEW_BRANCHES = [
  'comp_off',
  'leave_eligibility',
  'regularisation',
  'attendance_close',
  'salary_revision',
  'payroll_period',
  'staff_photo',
  'employee_document',
  'promotion',
  'termination',
  'onboarding_step',
] as const;
const ALL = [...OLD_BRANCHES, ...NEW_BRANCHES, 'everything'] as const;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** The function block, whole: CREATE … $function$; */
function fnBlocks(src: string): string[] {
  return [
    ...src.matchAll(
      /^CREATE (?:OR REPLACE )?FUNCTION public\.fn_my_desk_waiting\(\)[\s\S]*?^\$function\$;$/gm,
    ),
  ].map((m) => m[0]);
}

/** Slice each `  <name> AS (` CTE out of a function block, in order. */
function ctes(block: string): Record<string, string> {
  const lines = block.split('\n');
  const starts: Array<[string, number]> = [];
  lines.forEach((ln, i) => {
    for (const n of ALL) {
      if (ln === `  ${n} AS (` && !starts.some(([m]) => m === n)) starts.push([n, i]);
    }
  });
  starts.sort((a, b) => a[1] - b[1]);
  const out: Record<string, string> = {};
  starts.forEach(([n, s], idx) => {
    const e = idx + 1 < starts.length ? starts[idx + 1][1] : lines.length;
    out[n] = lines.slice(s, e).join('\n');
  });
  return out;
}

const prevSrc = readFileSync(PREV, 'utf8');
const nextSrc = readFileSync(NEXT, 'utf8');
const prevFn = fnBlocks(prevSrc)[0];
const nextFn = fnBlocks(nextSrc)[0];
const prev = ctes(prevFn);
const next = ctes(nextFn);

/** Lines of `after` that are not in `before`, and vice versa, ignoring nothing. */
function lineDiff(before: string, after: string) {
  const b = before.split('\n');
  const a = after.split('\n');
  return {
    removed: b.filter((l) => !a.includes(l)),
    added: a.filter((l) => !b.includes(l)),
  };
}

describe('fn_my_desk_waiting 20270613101149 — the six existing queues keep their meaning', () => {
  it('finds every branch in the new body', () => {
    for (const n of ALL) expect(next[n], `${n} missing`).toBeTruthy();
  });

  it.each(OLD_BRANCHES)('the %s branch loses no line — it only gains its due_at expression', (name) => {
    const { removed, added } = lineDiff(prev[name], next[name]);
    expect(removed).toEqual([]);
    // Every added line is part of the due_at expression or its comment.
    expect(added.length).toBeGreaterThan(0);
    expect(added.some((l) => /AS due_at,/.test(l))).toBe(true);
    for (const l of added) {
      expect(
        /due_at|^\s*--|escalate_after_hours|fn_my_desk_ts_or_null|^\s*(CASE|END|THEN|WHEN|ELSE)\b|^\s*COALESCE\(|^\s*\+ make_interval|^\s*[a-z]\.(submitted_at|created_at)\)$/.test(
          l,
        ),
        `unexpected added line in ${name}: ${l}`,
      ).toBe(true);
    }
  });

  it('the recruitment and leave branches count due from the stored escalate_after_hours', () => {
    for (const n of ['recruitment', 'leave'] as const) {
      expect(next[n]).toContain("(s.step ->> 'escalate_after_hours') ~ '^[0-9]{1,5}$'");
      expect(next[n]).toContain("make_interval(hours => (s.step ->> 'escalate_after_hours')::int)");
      expect(next[n]).toContain("->> 'decided_at')");
    }
  });

  it('refund, meeting_trigger, grievance and offer store no deadline, so due_at is NULL', () => {
    for (const n of ['refund', 'meeting_trigger', 'grievance', 'offer'] as const) {
      expect(next[n]).toMatch(/NULL::timestamptz\s+AS due_at,/);
    }
  });

  it('keeps the leave org-scope test that 20260908170000 added', () => {
    expect(next.leave).toContain('public.fn_hr_leave_scope_admits(a.employee_id, m.scope_role)');
    expect(next.leave).toContain('WHEN v_is_super THEN true');
  });

  it('keeps the offer gate and both halves of isPostApproval', () => {
    expect(next.offer).toContain('WHERE v_has_recruit_edit');
    expect(next.offer).toContain('AND c.hr_organization_id = ANY (v_org_ids)');
    expect(next.offer).toContain("(c.role_specific_details->>'staff_record_id') IS NULL");
  });

  it('the UNION keeps the six old branches first, in order, then the eleven new ones', () => {
    const unions = [...next.everything.matchAll(/SELECT \* FROM ([a-z_]+)/g)].map((m) => m[1]);
    expect(unions).toEqual([...OLD_BRANCHES, ...NEW_BRANCHES]);
  });

  it('due_at is the LAST output column, after the eight that were already there', () => {
    expect(nextFn).toContain(
      'RETURNS TABLE(source text, item_id uuid, title text, detail text, amount numeric, waiting_since timestamp with time zone, age_days integer, href text, due_at timestamp with time zone)',
    );
    expect(nextFn).toMatch(/ {4}x\.href,\n {4}x\.due_at\n {2}FROM everything x/);
  });

  it('keeps the 500 cap, the oldest-first order and age_days floored at 0', () => {
    expect(nextFn).toContain('ORDER BY x.waiting_since ASC NULLS LAST, x.source, x.item_id');
    expect(nextFn).toContain('LIMIT 500;');
    expect(nextFn).toContain(
      'GREATEST(0, floor(extract(epoch FROM (now() - COALESCE(x.waiting_since, now()))) / 86400))::integer AS age_days',
    );
  });
});

describe('fn_my_desk_waiting 20270613101149 — each new queue carries its own gate', () => {
  it('comp_off: hr.leave.approve + my organisations, not my own claim, not expired', () => {
    expect(next.comp_off).toContain('WHERE v_has_leave_perm');
    expect(next.comp_off).toContain('cc.hr_organization_id = ANY (v_org_ids)');
    expect(next.comp_off).toContain('NOT (cc.employee_id = ANY (v_staff_ids))');
    expect(next.comp_off).toContain('cc.expires_on >= v_today');
    expect(next.comp_off).toContain("((cc.expires_on + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') AS due_at");
  });

  it('leave_eligibility: the leave rule on its own chain, with the scope test in CASE', () => {
    expect(next.leave_eligibility).toContain('public.fn_hr_leave_scope_admits(e.employee_id, m.scope_role)');
    expect(next.leave_eligibility).toContain('NOT (e.employee_id = ANY (v_staff_ids))');
    expect(next.leave_eligibility).toContain("e.status = 'pending'");
  });

  it('regularisation: the approver keys, the included-in-HR gate, not my own', () => {
    expect(next.regularisation).toContain('WHERE v_has_regularise');
    expect(next.regularisation).toContain('o.included_in_hr');
    expect(next.regularisation).toContain('NOT (r.employee_id = ANY (v_staff_ids))');
    expect(nextFn).toContain("user_has_permission('hr.attendance.regularize_approve')");
    // hr.attendance.edit opens the screen but cannot write — it must not admit.
    expect(nextFn).not.toContain("user_has_permission('hr.attendance.edit')");
  });

  it('attendance_close: manage AND view, institution access, unlocked months with records', () => {
    expect(next.attendance_close).toContain('WHERE v_has_period_close');
    expect(nextFn).toContain("user_has_permission('hr.attendance.period.manage')");
    expect(nextFn).toContain("user_has_permission('hr.attendance.period.view')");
    expect(next.attendance_close).toContain("COALESCE(ap.status, 'open') <> 'locked'");
    expect(next.attendance_close).toContain('public.role_has_institution_access(i.id)');
  });

  it('salary_revision: the college-check RPC test and the Director test, never my own pay', () => {
    expect(next.salary_revision).toContain('q.institution_id = ANY (v_staff_inst_ids)');
    expect(next.salary_revision).toContain('v_can_rev_approve');
    expect(next.salary_revision).toContain('NOT (q.staff_id = ANY (v_staff_ids))');
    expect(nextFn).toContain("user_has_permission('hr.payroll.salary_revision.college_check')");
    expect(nextFn).toContain("user_has_permission('hr.payroll.salary_revision.approve')");
  });

  it.each(['payroll_period', 'promotion', 'termination'] as const)(
    '%s: SuperAdminOnly screens, so super admins only — and the detail says it is a broadcast',
    (n) => {
      expect(next[n]).toContain('WHERE v_is_super');
      expect(next[n]).toContain('shown to every super admin');
    },
  );

  it('staff_photo and employee_document: the key AND institution access, via CASE', () => {
    expect(next.staff_photo).toContain(
      'WHEN v_has_photo_review THEN public.role_has_institution_access(ps.institution_id)',
    );
    expect(next.employee_document).toContain(
      'WHEN v_has_emp_edit THEN public.role_has_institution_access(d.institution_id)',
    );
    expect(next.employee_document).toContain('nd.replaces_document_id = d.id');
    expect(next.employee_document).toContain('d.expires_at                                         AS due_at');
  });

  it('onboarding_step: the route assignee rule, no super-admin override, edit + view + scope', () => {
    expect(next.onboarding_step).toContain("(sa.value ->> 'assigned_user_id') = v_uid::text");
    expect(next.onboarding_step).toContain("lower(sa.value ->> 'assigned_role') = ANY (v_all_role_keys)");
    expect(next.onboarding_step).toContain("ARRAY['hr_officer', 'hr_head', 'director_jkkn']");
    expect(next.onboarding_step).toContain('WHEN v_has_recruit_edit AND v_has_recruit_view');
    expect(next.onboarding_step).toContain("c.status IN ('approved', 'package_fixed', 'offer_issued')");
  });

  it('super admins are kept OFF the operational queues they reach only through the permission bypass', () => {
    // Coordinator ruling (design decision 2): the Director gets no item-level
    // queue of other people's work — even a super admin holding the key.
    for (const n of ['comp_off', 'regularisation', 'attendance_close'] as const) {
      expect(next[n], n).toContain('AND NOT v_is_super');
    }
    expect(next.attendance_close).toContain('WHEN v_is_super THEN false');
    for (const n of ['staff_photo', 'employee_document', 'onboarding_step'] as const) {
      expect(next[n], n).toContain('WHEN v_is_super THEN false');
      expect(next[n], n).not.toContain('WHEN v_is_super THEN true');
    }
    // The college-check half is guarded; the Director half is not.
    expect(next.salary_revision).toMatch(
      /q\.status = 'waiting_principal'\n\s+AND NOT v_is_super\n\s+AND v_has_rev_college/,
    );
    expect(next.salary_revision).toMatch(/q\.status = 'waiting_director'\n\s+AND v_can_rev_approve\)/);
    expect(nextFn).toContain("v_can_rev_approve    := v_is_super");
  });

  it('super admins stay where they are the actual actor, and the six old branches are untouched', () => {
    for (const n of ['payroll_period', 'promotion', 'termination'] as const) {
      expect(next[n], n).toContain('WHERE v_is_super');
      expect(next[n], n).not.toContain('NOT v_is_super');
    }
    for (const n of OLD_BRANCHES) expect(next[n], n).not.toContain('NOT v_is_super');
  });

  it('the five queues nobody can act on are NOT in the function', () => {
    for (const s of ['short_time_off', 'leave_encashment', 'attendance_exception', 'hr_form', 'appraisal']) {
      expect(nextFn).not.toContain(`'${s}'::text`);
    }
  });

  it('never casts jsonb text straight to timestamptz — every such read is throw-proof', () => {
    expect(nextFn).not.toMatch(/->>\s*'[a-z_]+'\)?::timestamptz/);
    expect(nextSrc).toContain('CREATE OR REPLACE FUNCTION public.fn_my_desk_ts_or_null(p_text text)');
    expect(nextSrc).toContain('EXCEPTION WHEN others THEN');
  });
});

describe('fn_my_desk_waiting 20270613101149 — apply, privileges and the setup mirror', () => {
  it('drops before creating (the return type changes) and runs a preflight first', () => {
    const pre = nextSrc.indexOf('DO $preflight$');
    const drop = nextSrc.indexOf('DROP FUNCTION IF EXISTS public.fn_my_desk_waiting();');
    const create = nextSrc.indexOf('CREATE FUNCTION public.fn_my_desk_waiting()');
    expect(pre).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(pre);
    expect(create).toBeGreaterThan(drop);
    expect(fnBlocks(nextSrc)).toHaveLength(1);
  });

  it('re-grants exactly as before: REVOKE anon, PUBLIC; GRANT authenticated', () => {
    expect(nextSrc).toContain('SECURITY DEFINER');
    expect(nextSrc).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_my_desk_waiting\(\) FROM anon, PUBLIC;/);
    expect(nextSrc).toMatch(/GRANT {2}EXECUTE ON FUNCTION public\.fn_my_desk_waiting\(\) TO authenticated;/);
    expect(prevSrc).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_my_desk_waiting\(\) FROM anon, PUBLIC;/);
    expect(prevSrc).toMatch(/GRANT {2}EXECUTE ON FUNCTION public\.fn_my_desk_waiting\(\) TO authenticated;/);
  });

  it('the cast helper is not a definer and no client may call it', () => {
    const helper = nextSrc.slice(
      nextSrc.indexOf('CREATE OR REPLACE FUNCTION public.fn_my_desk_ts_or_null'),
      nextSrc.indexOf('DROP FUNCTION IF EXISTS public.fn_my_desk_waiting'),
    );
    expect(helper).not.toContain('SECURITY DEFINER');
    expect(helper).toContain(
      'REVOKE EXECUTE ON FUNCTION public.fn_my_desk_ts_or_null(text) FROM anon, authenticated, PUBLIC;',
    );
  });

  it('the setup file carries the function ONCE, byte-identical to the migration', () => {
    const setup = readFileSync(SETUP, 'utf8');
    const blocks = fnBlocks(setup);
    expect(blocks).toHaveLength(1);
    expect(sha(blocks[0])).toBe(sha(nextFn));
    expect(setup).toContain('DROP FUNCTION IF EXISTS public.fn_my_desk_waiting();');
    expect(setup).toContain('CREATE OR REPLACE FUNCTION public.fn_my_desk_ts_or_null(p_text text)');
  });

  it("the setup file's COMMENT ON FUNCTION is the migration's", () => {
    const re = /^COMMENT ON FUNCTION public\.fn_my_desk_waiting\(\) IS\n {2}'[\s\S]*?';$/gm;
    const mig = [...nextSrc.matchAll(re)].map((m) => m[0]);
    const setup = [...readFileSync(SETUP, 'utf8').matchAll(re)].map((m) => m[0]);
    expect(mig).toHaveLength(1);
    expect(setup).toHaveLength(1);
    expect(sha(setup[0])).toBe(sha(mig[0]));
  });
});
