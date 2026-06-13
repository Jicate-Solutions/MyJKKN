import { redirect } from 'next/navigation';

/**
 * Termination case landing — redirects to the review view by default.
 *
 * /hr/admin/terminations/[id] previously 404'd because no page.tsx existed
 * at the dynamic segment. Its children are initiate and review; review is
 * the safe default — initiate is a creation flow (its id='new' mode creates
 * the case, and for an existing uuid it only renders a "case already
 * initiated" CTA pointing at /review anyway). An existing case id always
 * belongs on the SEDC/Legal/Director review chain.
 *
 * Hardcoded redirect (not config-driven) because the target path depends on
 * the [id] segment — generic policy lookup can't synthesise the URL.
 *
 * Pattern source: app/(routes)/pde/faculty/cases/[id]/page.tsx (PDE
 * hub-page-404 sweep). Added 2026-06-10 with the /admin/hr → /hr/admin
 * relocation (PR #1306) — the move reset the grandfathering these dirs had
 * under the old path, surfacing them to the Hub Page Reachability gate.
 */
export default async function TerminationCaseIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/hr/admin/terminations/${id}/review`);
}
