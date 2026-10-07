/**
 * Static guard for supabase/migrations/20271007161151_hr_duty_tower_and_reliability.sql.
 *
 * The HR duty tower and the earned-trust suggestions only measure and list.
 * The Director's rule for this section: nothing in it ever changes anyone's
 * permissions, roles or approval chains. This test reads the migration, pulls
 * out every function body (and DO block) it creates, and fails if any of them
 * writes a role, permission, profile or approval-chain table.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const MIGRATION = path.resolve(
  __dirname, '..', '..', 'supabase/migrations/20271007161151_hr_duty_tower_and_reliability.sql',
);

const FORBIDDEN =
  /(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?(user_roles|custom_roles|profiles|user_institution_access|leave_approval_chains|hr_approval_flows)\b/i;

/** Every dollar-quoted body in the file: $$...$$ and $tag$...$tag$. */
function bodies(sql: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /\$([A-Za-z_]*)\$([\s\S]*?)\$\1\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    // The nearest CREATE ... FUNCTION header before this body names it.
    const before = sql.slice(0, m.index);
    const header = [...before.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_.]+)\s*\(/gi)].pop();
    const sinceHeader = header ? before.slice(header.index ?? 0) : '';
    // A body belongs to that header only if no other statement ended in between.
    const owned = header && !/;\s*$/m.test(sinceHeader.replace(/'[^']*'/g, ''));
    out.push({ name: owned ? header![1] : `block at ${m.index}`, body: m[2] });
  }
  return out;
}

describe('20271007161151 — no function writes a role, permission or approval chain', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const all = bodies(sql);

  it('finds the function bodies it guards (non-vacuity)', () => {
    const names = all.map((b) => b.name);
    for (const fn of [
      'public.fn_hr_duty_item_facts',
      'public.fn_hr_duty_tower_compute',
      'public.fn_hr_my_reliability',
      'public.fn_hr_trust_switch',
      'public.fn_hr_trust_suggestions_generate',
      'public.fn_hr_trust_suggestion_decide',
    ]) {
      expect(names).toContain(fn);
    }
  });

  it('no body inserts into, updates or deletes from a protected table', () => {
    const offenders = all.filter((b) => FORBIDDEN.test(b.body)).map((b) => b.name);
    expect(offenders).toEqual([]);
  });

  it('the only platform_policies write is the switch, on its own row', () => {
    const writers = all.filter((b) => /(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?platform_policies\b/i.test(b.body));
    expect(writers.map((b) => b.name)).toEqual(['public.fn_hr_trust_switch']);
    expect(writers[0].body).toContain("policy_key = 'hr.harness.trust.suggestions_enabled'");
  });

  it('the guard pattern itself catches a forbidden write (self-check)', () => {
    expect(FORBIDDEN.test('INSERT INTO public.user_roles (user_id) VALUES (x)')).toBe(true);
    expect(FORBIDDEN.test('update custom_roles set permissions = x')).toBe(true);
    expect(FORBIDDEN.test('UPDATE public.hr_trust_suggestions SET status = x')).toBe(false);
  });
});
