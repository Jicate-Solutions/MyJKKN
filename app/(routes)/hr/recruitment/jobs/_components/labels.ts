// Shared display labels for the HR Recruitment Jobs UI (columns + filters +
// form). RoleCategory labels live here so the table, filter bar and create/edit
// form stay in sync.

import type { EnumOption } from '@/lib/admin/policy-shell';
import type { RoleCategory } from '@/types/hr-recruitment';

export const ROLE_CATEGORY_LABELS: Record<RoleCategory, string> = {
  teaching_faculty: 'Teaching Faculty',
  medical: 'Medical',
  non_teaching: 'Non-Teaching',
  senior_leadership: 'Senior Leadership',
  contract: 'Contract',
};

export const ROLE_CATEGORY_OPTIONS: ReadonlyArray<EnumOption> = (
  Object.keys(ROLE_CATEGORY_LABELS) as RoleCategory[]
).map((value) => ({ value, label: ROLE_CATEGORY_LABELS[value] }));
