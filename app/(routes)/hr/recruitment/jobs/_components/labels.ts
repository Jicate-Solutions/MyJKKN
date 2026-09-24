// Shared display labels for the HR Recruitment Jobs UI (columns + filters +
// form). RoleCategory labels are defined in types/hr-recruitment.ts and
// re-exported here for backward compatibility.

import type { EnumOption } from '@/lib/admin/policy-shell';
import type { RoleCategory } from '@/types/hr-recruitment';
import { ROLE_CATEGORY_LABELS } from '@/types/hr-recruitment';
export { ROLE_CATEGORY_LABELS };

export const ROLE_CATEGORY_OPTIONS: ReadonlyArray<EnumOption> = (
  Object.keys(ROLE_CATEGORY_LABELS) as RoleCategory[]
).map((value) => ({ value, label: ROLE_CATEGORY_LABELS[value] }));

/**
 * Short role-category labels for the narrow Jobs TABLE column only. The full
 * "Learning Facilitator (Teaching Faculty)" wrapped over three lines in a 160px
 * column and crowded the job title out of view (BUG-004905, which asked for
 * "LF"). The full label stays in the cell's tooltip, the filters and the form.
 */
export const ROLE_CATEGORY_SHORT_LABELS: Record<RoleCategory, string> = {
  teaching_faculty: 'LF',
  medical: 'Medical',
  non_teaching: 'Non-Teaching',
  senior_leadership: 'Leadership',
  contract: 'Contract',
};
