import { redirect } from 'next/navigation';

/**
 * Learners Leave/On-Duty landing — redirects to the default sub-page.
 *
 * /learners/leave-onduty previously 404'd because no page.tsx existed here.
 * Redirects to /learners/leave-onduty/my-applications as the student default view.
 *
 * Part of the nav-landing sweep (follow-up to #348).
 */
export default function LearnersLeaveOndutyIndex() {
  redirect('/learners/leave-onduty/my-applications');
}
