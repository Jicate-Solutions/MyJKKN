// ============================================================================
// Loop owner fallback (Director decisions 2026-09-13)
//
// The resolver rule in one sentence: a scoped owner wins; a missing or blank
// scope falls back to the registry owner. It is written twice on purpose —
// once in SQL (fn_loop_owner_for_institution, 20261210020000) for the
// notification route, once in TypeScript (lib/services/loops/loop-owner-
// fallback.ts) for the two surfaces that must SHOW the fallback. The
// migration is a FILE in this PR and is never applied by the builder, so:
//
//   1-3. The TypeScript rule is exercised directly: scoped → scoped;
//        none → registry; blank scope → registry; no registry → nobody.
//   4.   The set form names exactly the colleges without a usable scope, in
//        the caller's order, and ignores other loops' scopes.
//   5.   The summary line reads as the Director asked: "N colleges fall back
//        to <owner>", singular at one, honest when there is no owner at all.
//   6.   The SQL twin carries the same COALESCE(scoped, registry) rule, the
//        blank-as-absent normalisation, an authorization guard, and the
//        REVOKE FROM anon, PUBLIC every SECURITY DEFINER function must state.
// ============================================================================

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  fallbackSummaryLine,
  institutionsFallingBack,
  resolveLoopOwnerEmail,
  type LoopOwnerInstitution,
  type LoopOwnerScope,
} from '@/lib/services/loops/loop-owner-fallback';

const LOOP = 'attendance-intervention';
const REGISTRY = 'director@jkkn.ac.in';

const INSTITUTIONS: LoopOwnerInstitution[] = [
  { id: 'inst-allied', name: 'JKKN College of Allied Health Sciences' },
  { id: 'inst-arts-self', name: 'JKKN College of Arts and Science (Self)' },
  { id: 'inst-dental', name: 'JKKN Dental College and Hospital' },
  { id: 'inst-education', name: 'JKKN College of Education' },
  { id: 'inst-nursing', name: 'JKKN College of Nursing and Research' },
];

const SCOPES: LoopOwnerScope[] = [
  { loop_key: LOOP, institution_id: 'inst-dental', owner_email: 'dentalprincipal@jkkn.ac.in' },
  { loop_key: LOOP, institution_id: 'inst-nursing', owner_email: 'nursingprincipal@jkkn.ac.in' },
  // A scope for a DIFFERENT loop must not count for this one.
  { loop_key: 'scf', institution_id: 'inst-allied', owner_email: 'someone@jkkn.ac.in' },
];

describe('resolveLoopOwnerEmail — one college, one answer', () => {
  it('a scoped owner wins over the registry owner', () => {
    expect(resolveLoopOwnerEmail('dentalprincipal@jkkn.ac.in', REGISTRY)).toBe(
      'dentalprincipal@jkkn.ac.in'
    );
  });

  it('no scope row falls back to the registry owner', () => {
    expect(resolveLoopOwnerEmail(null, REGISTRY)).toBe(REGISTRY);
    expect(resolveLoopOwnerEmail(undefined, REGISTRY)).toBe(REGISTRY);
  });

  it('a blank or whitespace scope is treated as absent — never resolves to ""', () => {
    expect(resolveLoopOwnerEmail('', REGISTRY)).toBe(REGISTRY);
    expect(resolveLoopOwnerEmail('   ', REGISTRY)).toBe(REGISTRY);
  });

  it('no registry owner either resolves to nobody, not to an empty string', () => {
    expect(resolveLoopOwnerEmail(null, null)).toBeNull();
    expect(resolveLoopOwnerEmail(' ', '')).toBeNull();
  });

  it('trims the winning value so the profile lookup matches what was typed', () => {
    expect(resolveLoopOwnerEmail('  nursingprincipal@jkkn.ac.in ', REGISTRY)).toBe(
      'nursingprincipal@jkkn.ac.in'
    );
  });
});

describe('institutionsFallingBack — which colleges the registry owner still covers', () => {
  it('names exactly the colleges with no usable scope for THIS loop, in the given order', () => {
    const falling = institutionsFallingBack(LOOP, SCOPES, INSTITUTIONS);
    expect(falling.map((i) => i.id)).toEqual(['inst-allied', 'inst-arts-self', 'inst-education']);
  });

  it('a scope whose owner was blanked counts as falling back', () => {
    const blanked: LoopOwnerScope[] = [
      ...SCOPES,
      { loop_key: LOOP, institution_id: 'inst-allied', owner_email: '   ' },
    ];
    const falling = institutionsFallingBack(LOOP, blanked, INSTITUTIONS);
    expect(falling.map((i) => i.id)).toContain('inst-allied');
  });

  it('every college scoped → nobody falls back', () => {
    const all: LoopOwnerScope[] = INSTITUTIONS.map((i) => ({
      loop_key: LOOP,
      institution_id: i.id,
      owner_email: `${i.id}@jkkn.ac.in`,
    }));
    expect(institutionsFallingBack(LOOP, all, INSTITUTIONS)).toEqual([]);
  });

  it('no scopes at all → every college falls back', () => {
    expect(institutionsFallingBack(LOOP, [], INSTITUTIONS)).toHaveLength(INSTITUTIONS.length);
  });

  it('only colleges and schools count — a company or the back office is never "falling back"', () => {
    // Live estate 2026-09-13: Jicate Solutions (company), JKKN Main Office
    // (admin_office), Nattraja Incubation Forum (company) have no learners
    // and were the ONLY names the line would have printed.
    const estate: LoopOwnerInstitution[] = [
      { id: 'vendor', name: 'Jicate Solutions', entity_type: 'company' },
      { id: 'office', name: 'JKKN Main Office', entity_type: 'admin_office' },
      { id: 'forum', name: 'Nattraja Incubation Forum', entity_type: 'company' },
      { id: 'inst-allied', name: 'JKKN College of Allied Health Sciences', entity_type: 'institution' },
      { id: 'school', name: 'Nattraja Vidhyalya CBSE', entity_type: 'school' },
      { id: 'unknown', name: 'Row with no entity_type', entity_type: null },
    ];
    expect(institutionsFallingBack(LOOP, [], estate).map((i) => i.id)).toEqual([
      'inst-allied',
      'school',
      'unknown',
    ]);
  });
});

describe('fallbackSummaryLine — the one line the weekly summary carries', () => {
  it('reads "N colleges fall back to <owner>"', () => {
    expect(fallbackSummaryLine(3, REGISTRY)).toBe('3 colleges fall back to director@jkkn.ac.in');
  });

  it('is singular at one', () => {
    expect(fallbackSummaryLine(1, REGISTRY)).toBe('1 college falls back to director@jkkn.ac.in');
  });

  it('says plainly when there is no registry owner to fall back to', () => {
    expect(fallbackSummaryLine(2, null)).toBe(
      '2 colleges fall back to nobody — the loop has no registry owner'
    );
  });
});

describe('fn_loop_owner_for_institution — the SQL twin states the same rule', () => {
  const file = path.join(
    process.cwd(),
    'supabase/migrations/20261210020000_fn_loop_owner_for_institution.sql'
  );
  const raw = readFileSync(file, 'utf8');
  // Comment-stripped, the way the CI secdef gate reads it: a rule that only
  // exists in a comment is not a rule.
  const sql = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  it('is a SECURITY DEFINER read of (loop_key, institution_id) returning text', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_loop_owner_for_institution\(\s*p_loop_key text,\s*p_institution_id uuid\s*\)/);
    expect(sql).toMatch(/RETURNS text/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
  });

  it('scoped wins, registry is the fallback — COALESCE(scoped, registry), blank treated as absent', () => {
    expect(sql).toMatch(/RETURN COALESCE\(v_scoped, v_registry\)/);
    expect(sql).toMatch(/NULLIF\(btrim\(s\.owner_email\), ''\)/);
    expect(sql).toMatch(/NULLIF\(btrim\(r\.owner_email\), ''\)/);
    expect(sql).toMatch(/FROM loop_owner_scopes s/);
    expect(sql).toMatch(/FROM loop_registry r/);
  });

  it('refuses callers that are not the service role, a super admin or an admin', () => {
    expect(sql).toMatch(/auth\.role\(\) = 'service_role'/);
    expect(sql).toMatch(/is_super_admin\(\)/);
    expect(sql).toMatch(/is_admin\(\)/);
    expect(sql).toMatch(/RAISE EXCEPTION 'not authorized'/);
  });

  it('the guard is NULL-safe — a session with no JWT claims is refused, not waved through', () => {
    // auth.role() is NULL without claims; NULL = 'service_role' is NULL and
    // plpgsql's IF NOT (NULL OR false OR false) takes neither branch.
    expect(sql).toMatch(/COALESCE\(auth\.role\(\) = 'service_role', false\)/);
  });

  it('a NULL institution resolves to nobody, never to the estate-level owner', () => {
    expect(sql).toMatch(/IF p_loop_key IS NULL OR p_institution_id IS NULL THEN\s+RETURN NULL;/);
  });

  it('re-asserts REVOKE FROM anon, PUBLIC and grants authenticated in the same file', () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_loop_owner_for_institution\(text, uuid\) FROM anon, PUBLIC;/
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.fn_loop_owner_for_institution\(text, uuid\) TO authenticated, service_role;/
    );
  });

  it('writes nothing and never touches loop_registry.owner_email', () => {
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    expect(sql).not.toMatch(/ALTER TABLE/i);
  });
});
