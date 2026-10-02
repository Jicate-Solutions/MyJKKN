// Retired: see app/(routes)/campus-living/leave/page.tsx — hostel leave
// requests are superseded by the global learner leave/on-duty application flow.
import { redirect } from 'next/navigation';

export default function NewLeaveRequestPage() {
  redirect('/learners/leave-onduty/my-applications');
}
