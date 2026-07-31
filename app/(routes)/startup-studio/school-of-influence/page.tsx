import { redirect } from 'next/navigation';

// School of Influence module landing. Without a page.tsx here the URL 404s —
// the hub-page-404 class the "Hub Page Reachability" CI gate exists to catch.
//
// The programme's participant-facing surfaces (apply, roster, attendance) ship
// in later sections of specs/school-of-influence-batches-2026-07-30.md; until
// then the only thing behind this path is the Director's settings screen, which
// applies its own permission gate. Redirecting there rather than rendering a
// placeholder keeps one landing target to change when the participant view
// arrives.
export default function SchoolOfInfluenceLandingPage() {
  redirect('/startup-studio/school-of-influence/admin/settings');
}
