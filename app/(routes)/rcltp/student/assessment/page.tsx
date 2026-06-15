import { redirect } from 'next/navigation';

/**
 * /rcltp/student/assessment has no index — a sitting is always opened by id at
 * /rcltp/student/assessment/[id]. Redirect the bare URL back to the student
 * portal, where assessments are listed and started.
 *
 * Hub-page guard: every App Router directory with child routes needs a page.tsx
 * or the bare URL 404s in production (mirrors app/(routes)/faculty/page.tsx).
 */
export default function RcltpAssessmentIndex() {
  redirect('/rcltp/student');
}
