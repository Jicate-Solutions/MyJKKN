// @vitest-environment jsdom
//
// The console decides, per cohort, whether its exam is a OneMark subject, and
// hands that to the three shared authoring controls. A OneMark cohort must
// switch them to the OneMark rules; any other cohort must leave them off.
import '@testing-library/jest-dom';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const seen: Record<string, unknown[]> = { author: [], builder: [], review: [] };
let cohorts: unknown[] = [];

vi.mock('@/hooks/foundation/use-foundation', () => ({
  useCohorts: () => ({ data: cohorts, isLoading: false, isError: false }),
  useAssessments: () => ({ data: [], isLoading: false }),
  useRoster: () => ({ data: [], isLoading: false }),
  useSetCohortResourcePerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ canAccess: () => true }),
}));
vi.mock('@/hooks/use-auth-provider', () => ({
  useAuth: () => ({ profile: { id: 'u1' } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/(routes)/foundation/_components/item-author-dialog', () => ({
  ItemAuthorDialog: (p: any) => {
    seen.author.push(p.isOneMark);
    return null;
  },
}));
vi.mock('@/app/(routes)/foundation/_components/assessment-builder-dialog', () => ({
  AssessmentBuilderDialog: (p: any) => {
    seen.builder.push(p.isOneMark);
    return null;
  },
}));
vi.mock('@/app/(routes)/foundation/_components/item-review-panel', () => ({
  ItemReviewPanel: (p: any) => {
    seen.review.push(p.isOneMark);
    return null;
  },
}));
vi.mock('@/app/(routes)/foundation/_components/enroll-learner-dialog', () => ({
  EnrollLearnerDialog: () => null,
}));

import { CohortConsole } from '@/app/(routes)/foundation/_components/cohort-console';

function cohort(configKey: string) {
  return {
    id: `c-${configKey}`,
    exam_definition_id: `exam-${configKey}`,
    resource_person_id: 'u1',
    is_active: true,
    exam_definition: { id: `exam-${configKey}`, config_key: configKey, display_name: configKey },
  };
}

beforeEach(() => {
  seen.author = [];
  seen.builder = [];
  seen.review = [];
});
afterEach(() => cleanup());

describe('CohortConsole — OneMark detection', () => {
  it.each(['tn_hsc_physics', 'tn_hsc_english'])('%s switches the OneMark rules on', (key) => {
    cohorts = [cohort(key)];
    render(<CohortConsole />);
    expect(seen.author).toContain(true);
    expect(seen.builder).toContain(true);
    expect(seen.review).toContain(true);
  });

  it('a non-OneMark exam leaves them off', () => {
    cohorts = [cohort('neet_ug')];
    render(<CohortConsole />);
    expect(seen.author.length).toBeGreaterThan(0);
    expect(seen.author.every((v) => v === false)).toBe(true);
    expect(seen.builder.every((v) => v === false)).toBe(true);
    expect(seen.review.every((v) => v === false)).toBe(true);
  });
});
