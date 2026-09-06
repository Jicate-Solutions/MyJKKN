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
