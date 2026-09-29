// Retired: hostel leave types are now part of the global Learner Leave Types
// list (learner_leave_types), managed from one settings page for every
// residency. See app/(routes)/learners/leave-onduty/settings/page.tsx.
import { redirect } from 'next/navigation';

export default function HostelLeaveTypesPage() {
  redirect('/learners/leave-onduty/settings?tab=types');
}
