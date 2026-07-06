// app/(routes)/learners/my-attendance-feedback/page.tsx
// 2026-07-06: "My Attendance Feedback" was consolidated into "Class Feedback".
// That single tab now shows both the pending sessions (with inline confirm) AND
// the confirmed-session history this page used to show — so students have one
// feedback tab, not two. This route stays only to redirect old bookmarks and any
// deep-links (e.g. the in-app guide) to the merged page.
// (Excluded from the nav-reachability gate via NAV_EXCLUDE in
//  scripts/check-nav-reachability.ts — it is intentionally chip-less.)

import { redirect } from 'next/navigation';

export default function MyAttendanceFeedbackRedirect() {
  redirect('/learners/class-feedback');
}
