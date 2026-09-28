// Retired: OD sub-categories + the workflow builder are now the global
// Learner Leave Types + Approval Flows settings (learner_leave_types /
// learner_leave_flows). See app/(routes)/learners/leave-onduty/settings/page.tsx.
import { redirect } from 'next/navigation';

export default function FlowSettingsPage() {
  redirect('/learners/leave-onduty/settings?tab=flows');
}
