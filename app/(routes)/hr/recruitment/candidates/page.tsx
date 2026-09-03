// app/(routes)/hr/recruitment/candidates/page.tsx
//
// Hub page for /hr/recruitment/candidates.
//
// The directory holds only [id]/page.tsx — a single candidate's detail view.
// Next.js App Router needs a page.tsx at every level you want reachable as a
// URL, so without this file the parent URL 404s in production. The
// hub-page-404 class has reached prod three times in 2026 (HR Apr, PDE Jun,
// PDE sweep Jun), which is why there is a CI ratchet for it.
//
// There is no standalone "all candidates" list to land on. Unlike the
// applications sibling — which is worked from exactly one screen (the job
// detail) — candidate detail links are reached from four, spanning two
// permission tiers: /hr/recruitment/approvals (page.tsx + its
// _components/my-pending-candidates.tsx) and /hr/recruitment/approvals/[jobId]
// are gated hr.recruitment.approve, while /hr/recruitment/my and
// /hr/recruitment/jobs/[id] are gated hr.recruitment.view. No single one of
// them is "the" screen candidates are worked from.
//
// So the bare URL goes to the recruitment hub, /hr/recruitment, for two
// reasons. First, permissions: MENU_PERMISSIONS in lib/sidebarMenuLink.ts gates
// /hr/recruitment/candidates at hr.recruitment.view, and /hr/recruitment
// carries that same gate — redirecting to the approve-gated approvals queue
// instead would bounce every view-only holder into a permission denial they
// did not ask for. Second, routing: the hub's three tiles (Submit Candidate,
// My Candidates, Approvals) are precisely the candidate-working screens, so
// whichever tier the visitor holds, they land one click from the one they can
// actually use.
//
// Note this route is NOT dead config: it is present in MENU_PERMISSIONS, but
// its nav entry was removed from app/(routes)/hr/nav-config.ts on 2026-05-11
// so the nav-config-href-audit gate could ship as-enforcing. This redirect
// makes the URL honest; it does not make it a nav destination.
//
// navMeta mirrors the sibling hubs (jobs/[id], approvals/[jobId]) so the
// generated route manifest keeps a label for this path instead of showing it
// as an orphan.

import { redirect } from 'next/navigation';

export const navMeta = { invokedFrom: '/hr/recruitment' } as const;

export default function RecruitmentCandidatesHubPage() {
  redirect('/hr/recruitment');
}
