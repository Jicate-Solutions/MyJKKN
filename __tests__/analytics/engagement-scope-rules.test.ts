// __tests__/analytics/engagement-scope-rules.test.ts
//
// The pure scope rules shared by the engagement routes and the filters on
// /users/activity > Engagement (lib/services/analytics/engagement-scope.ts),
// and a check that the filters actually use them to hide choices.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  ENGAGEMENT_INSTITUTION_STAFF_ROLES,
  allChoiceAllowed,
  applyEngagementScope,
  choicesHaveUnits,
  isEngagementInstitutionStaffRole,
  levelOpenToScope,
  placementInScope,
  scopeRefusalReason,
  NO_ENGAGEMENT_SCOPE_REASON
} from '@/lib/services/analytics/engagement-scope';
import type { AccessScope, OrganizationalLevel } from '@/types/analytics';

const LEVELS: OrganizationalLevel[] = ['institution', 'department', 'program', 'semester', 'section'];

describe('levelOpenToScope', () => {
  it('super admin and principal open every level; HOD everything but institution; section scope only sections', () => {
    const open = (type: AccessScope['type']) => LEVELS.filter((l) => levelOpenToScope(type, l));
    expect(open('global')).toEqual(LEVELS);
    expect(open('institution')).toEqual(LEVELS);
    expect(open('department')).toEqual(['department', 'program', 'semester', 'section']);
    expect(open('section')).toEqual(['section']);
  });
});

describe('isEngagementInstitutionStaffRole (own institution, like a principal)', () => {
  it('names the stored role spellings for admin, counsellor and accounts staff', () => {
    expect([...ENGAGEMENT_INSTITUTION_STAFF_ROLES].sort()).toEqual(
      ['accounts', 'admin', 'administrator', 'admission_counselor', 'expo_counselor'].sort()
    );
    for (const role of ENGAGEMENT_INSTITUTION_STAFF_ROLES) {
      expect(isEngagementInstitutionStaffRole(role), role).toBe(true);
    }
  });

  it('leaves every other role alone, including the retired "counselor" name', () => {
    for (const role of [
      'counselor',
      'learner_counselor',
      'staff_counselor',
      'health_counselor',
      'institution_admin',
      'principal',
      'hod',
      'faculty',
      'student',
      '',
      null,
      undefined
    ]) {
      expect(isEngagementInstitutionStaffRole(role), String(role)).toBe(false);
    }
  });
});

describe('placementInScope', () => {
  const at = (institutionId: string | null, departmentId: string | null, sectionId: string | null) => ({
    institutionId,
    departmentId,
    sectionId
  });

  it('principal: matches on institution only', () => {
    const scope: AccessScope = { type: 'institution', institutionIds: ['A'] };
    expect(placementInScope(scope, at('A', 'A2', 'x'))).toBe(true);
    expect(placementInScope(scope, at('B', 'A2', 'x'))).toBe(false);
  });

  it('HOD: matches on department only, so the institution itself never matches', () => {
    const scope: AccessScope = { type: 'department', departmentIds: ['A1'] };
    expect(placementInScope(scope, at('A', 'A1', null))).toBe(true);
    expect(placementInScope(scope, at('A', 'A2', null))).toBe(false);
    expect(placementInScope(scope, at('A', null, null))).toBe(false);
  });

  it('a unit with an unknown institution or department is refused, not shown', () => {
    expect(placementInScope({ type: 'institution', institutionIds: ['A'] }, at(null, null, null))).toBe(false);
    expect(placementInScope({ type: 'section', sectionIds: [] }, at('A', 'A1', 'x'))).toBe(false);
  });

  it('global matches everything', () => {
    expect(placementInScope({ type: 'global' }, at(null, null, null))).toBe(true);
  });
});

describe('applyEngagementScope', () => {
  const recorder = () => {
    const calls: Array<[string, string[]]> = [];
    const q: any = {
      in(column: string, values: string[]) {
        calls.push([column, values]);
        return q;
      }
    };
    return { q, calls };
  };

  it('adds the column that bounds each scope, and nothing for global', () => {
    for (const [scope, expected] of [
      [{ type: 'global' }, []],
      [{ type: 'institution', institutionIds: ['A'] }, [['institution_id', ['A']]]],
      [{ type: 'department', departmentIds: ['A1'] }, [['department_id', ['A1']]]],
      [{ type: 'section', sectionIds: ['x'] }, [['section_id', ['x']]]],
      [{ type: 'section' }, [['section_id', []]]]
    ] as Array<[AccessScope, Array<[string, string[]]>]>) {
      const { q, calls } = recorder();
      expect(applyEngagementScope(q, scope)).toBe(q);
      expect(calls).toEqual(expected);
    }
  });
});

describe('allChoiceAllowed ("All ..." in the filters)', () => {
  it('"All Institutions" is for super admins only', () => {
    expect(allChoiceAllowed('global', 'institutions')).toBe(true);
    expect(allChoiceAllowed('institution', 'institutions')).toBe(false);
    expect(allChoiceAllowed('department', 'institutions')).toBe(false);
    expect(allChoiceAllowed('section', 'institutions')).toBe(false);
  });

  it('a principal keeps "All Departments"; an HOD does not (it would open the institution)', () => {
    expect(allChoiceAllowed('institution', 'departments')).toBe(true);
    expect(allChoiceAllowed('department', 'departments')).toBe(false);
    expect(allChoiceAllowed('department', 'programs')).toBe(true);
    expect(allChoiceAllowed('department', 'sections')).toBe(true);
  });

  it('a section-scoped viewer gets no "All ..." choice at all', () => {
    for (const choice of ['institutions', 'departments', 'programs', 'semesters', 'sections'] as const) {
      expect(allChoiceAllowed('section', choice)).toBe(false);
    }
  });
});

describe('messages', () => {
  it('says plainly why a selection is refused', () => {
    expect(scopeRefusalReason({ type: 'institution', institutionIds: ['A'] })).toMatch(/own institution/);
    expect(scopeRefusalReason({ type: 'department', departmentIds: ['A1'] })).toMatch(/own department/);
    expect(scopeRefusalReason({ type: 'section', sectionIds: ['x'] })).toMatch(/sections you teach/);
    expect(scopeRefusalReason({ type: 'section', sectionIds: [] })).toBe(NO_ENGAGEMENT_SCOPE_REASON);
  });

  it('knows when a viewer has nothing to choose', () => {
    const none = { institutionIds: null, departmentIds: null, programIds: null, semesterIds: null, sectionIds: null };
    expect(choicesHaveUnits({ ...none, type: 'global' })).toBe(true);
    expect(choicesHaveUnits({ ...none, type: 'institution', institutionIds: ['A'] })).toBe(true);
    expect(choicesHaveUnits({ ...none, type: 'section', sectionIds: [] })).toBe(false);
  });
});

describe('the filters on screen use these rules', () => {
  const filters = readFileSync(join(process.cwd(), 'components/analytics/engagement-filters.tsx'), 'utf8');

  it('loads the viewer scope and offers each "All ..." choice only when allowed', () => {
    expect(filters).toMatch(/useEngagementScope\(\)/);
    for (const [choice, label] of [
      ['institutions', 'All Institutions'],
      ['departments', 'All Departments'],
      ['programs', 'All Programs'],
      ['semesters', 'All Semesters'],
      ['sections', 'All Sections']
    ]) {
      expect(filters).toMatch(
        new RegExp(`allowAll\\('${choice}'\\) && \\(\\s*<SelectItem value=\\{ALL_[A-Z]+\\}>${label}</SelectItem>`)
      );
    }
  });

  it('limits every picker to the viewer own ids when the scope lists them', () => {
    for (const key of ['institutionIds', 'departmentIds', 'programIds', 'semesterIds', 'sectionIds']) {
      expect(filters).toMatch(new RegExp(`if \\(scope\\?\\.${key}\\) query = query\\.in\\('id', scope\\.${key}\\)`));
    }
  });

  it('asks for data only once the scope is known and only for a level the viewer can open', () => {
    expect(filters).toMatch(/if \(!scope \|\| !levelOpenToScope\(scope\.type, level\)\) return;/);
  });
});
