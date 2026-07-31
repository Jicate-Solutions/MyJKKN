import { redirect } from 'next/navigation';

// School of Influence admin hub. Without a page.tsx here the URL 404s — the
// hub-page-404 class the "Hub Page Reachability" CI gate exists to catch.
//
// Settings is the only admin surface today; the applications queue (S5) and the
// attendance tick-list (S6) land later and may move this landing target. Kept as
// a plain redirect so whichever section arrives first can change one line.
export default function SchoolOfInfluenceAdminHubPage() {
  redirect('/startup-studio/school-of-influence/admin/settings');
}
