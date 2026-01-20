/**
 * Redirect: /learners/attendance → /learners/my-attendance
 *
 * This route has been moved to follow the learner portal naming convention.
 * All learner self-service pages now use the "my-" prefix.
 *
 * Migration date: 2025-01-20
 */

import { redirect } from 'next/navigation';

export default function AttendanceRedirect() {
  // Redirect old route to new route
  redirect('/learners/my-attendance');
}
