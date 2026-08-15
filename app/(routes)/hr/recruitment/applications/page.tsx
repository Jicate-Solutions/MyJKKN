// app/(routes)/hr/recruitment/applications/page.tsx
//
// Hub page for /hr/recruitment/applications.
//
// The directory holds only [id]/page.tsx — a single application's detail view.
// Next.js App Router needs a page.tsx at every level you want reachable as a
// URL, so without this file the parent URL 404s in production. The
// hub-page-404 class has reached prod three times in 2026 (HR Apr, PDE Jun,
// PDE sweep Jun), which is why there is a CI ratchet for it.
//
// There is no standalone "all applications" list to land on: applications are
// worked per job, through app/(routes)/hr/recruitment/jobs/[id] and its
// _components/applications-section.tsx. /hr/recruitment/applications is
// correspondingly absent from MENU_PERMISSIONS in lib/sidebarMenuLink.ts — it
// is a detail-only route that is never linked as a destination. So the honest
// behaviour for the bare URL is to send the visitor to the jobs list, which is
// where applications are actually reachable from.
//
// navMeta mirrors the sibling hubs (jobs/new, jobs/[id]) so the generated route
// manifest keeps a label for this path instead of showing it as an orphan.

import { redirect } from 'next/navigation';

export const navMeta = { invokedFrom: '/hr/recruitment/jobs' } as const;

export default function RecruitmentApplicationsHubPage() {
  redirect('/hr/recruitment/jobs');
}
