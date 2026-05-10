'use client';

// rules-tab.tsx — Tab 4 of /admission/counselors/team.
// Mounts the shared AssignmentRulesCascade (Director-grade UX, policy-shell
// substrate). Same component is consumed by /admission/settings/assignment-rules.
//
// Shared component: components/shared/assignment-rules-crud/cascade.tsx
//
// Note: the surrounding rules/page.tsx renders an institution picker for
// super-admin / admission-global-admin — by the time this tab mounts,
// institutionId resolves to the picked (or auto-defaulted) institution.

import { AssignmentRulesCascade } from '@/components/shared/assignment-rules-crud';

interface RulesTabProps {
  institutionId: string | undefined;
}

export function RulesTab({ institutionId }: RulesTabProps) {
  return <AssignmentRulesCascade institutionId={institutionId} />;
}
