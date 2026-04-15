// app/(routes)/admission/page.tsx
// BUG-003126: https://www.jkkn.ai/admission returned a 404 because no
// page file existed at the admission module root — only sub-routes had
// pages (/admission/dashboard, /admission/leads, ...). Users landing on
// /admission (e.g. from bookmarks, emails, or truncated links) hit the
// global 404 screen. This page redirects them to the admission dashboard,
// which is the module's intended landing view.
//
// Server component with redirect() is preferred over client-side
// window.location so the user never sees a flash of the 404 shell.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AdmissionIndexPage() {
  redirect('/admission/dashboard');
}
