/**
 * Mark-entry authorization.
 *
 * Reuses resolveQpScope so this page and Question Papers can never drift apart:
 * a faculty sees exactly the courses staff planning assigned them, an HOD sees
 * their program, leadership sees everything.
 *
 * The one deliberate difference from Question Papers is WHO MAY WRITE. Papers are
 * authored by whoever holds the tier; marks are entered by the person who taught
 * (or the HOD covering for them). The 'all' tier — principal, registrar,
 * administrator, CoE office — is therefore READ-ONLY here. super_admin is exempt,
 * as everywhere else.
 */

import { resolveQpScope } from '@/lib/utils/question-papers/qp-scope';
import type { MarkEntryAccess } from '@/types/mark-entry';

export interface MarkEntryGuardInput {
  courseCode: string;
  programCode?: string;
  /** CIA assessment period — widens the staff-plan window. */
  sessionFrom?: string | null;
  sessionTo?: string | null;
  /** True for save requests; adds the leadership read-only rule. */
  write?: boolean;
}

/**
 * A single shape rather than a discriminated union: this project compiles with
 * `strictNullChecks: false`, where narrowing a union on `if (!result.ok)` does
 * not eliminate the success member, so `result.error` would not typecheck.
 * `access` is always populated, so a caller that ignores a denial still has a
 * sane value rather than undefined.
 */
export interface MarkEntryGuardResult {
  ok: boolean;
  access: MarkEntryAccess;
  error?: string;
  status?: number;
}

export async function guardMarkEntryScope(
  supabase: any,
  userId: string,
  isSuperAdmin: boolean,
  role: string | null,
  input: MarkEntryGuardInput
): Promise<MarkEntryGuardResult> {
  const scope = await resolveQpScope(supabase, userId, isSuperAdmin, role, {
    activeWithin: { from: input.sessionFrom, to: input.sessionTo },
  });

  const canEnter = isSuperAdmin || scope.level !== 'all';
  const access: MarkEntryAccess = { level: scope.level, can_enter: canEnter };

  if (scope.level === 'course' && !scope.courseCodes.includes(input.courseCode)) {
    return { ok: false, access, error: 'You are not assigned to this course', status: 403 };
  }

  if (
    scope.level === 'program' &&
    scope.programCodes.length > 0 &&
    (!input.programCode || !scope.programCodes.includes(input.programCode))
  ) {
    return {
      ok: false,
      access,
      error: 'You can only access marks for your own program',
      status: 403,
    };
  }

  if (input.write && !canEnter) {
    return {
      ok: false,
      access,
      error:
        'Your role has view-only access to mark entry. Marks are entered by the assigned faculty or the HOD.',
      status: 403,
    };
  }

  return { ok: true, access };
}
