// Retired: hostel leave REQUESTS are superseded by the global learner
// leave/on-duty application flow (learner_leave_types + fn_lo_* RPCs), which
// covers hostelers and day scholars alike. See
// app/(routes)/learners/leave-onduty/my-applications/page.tsx.
import { redirect } from 'next/navigation';

export default function LeaveRequestsPage() {
  redirect('/learners/leave-onduty/my-applications');
}
