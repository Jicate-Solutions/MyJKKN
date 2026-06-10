import { redirect } from 'next/navigation';

/**
 * Offboarding case landing — redirects to the Full & Final calculator.
 *
 * /hr/admin/offboarding/[id] previously 404'd because no page.tsx existed
 * at the dynamic segment. fnf is the only child, so it is trivially the
 * default.
 *
 * Hardcoded redirect (not config-driven) because the target path depends on
 * the [id] segment — generic policy lookup can't synthesise the URL.
 *
 * Pattern source: app/(routes)/pde/faculty/cases/[id]/page.tsx (PDE
 * hub-page-404 sweep). Added 2026-06-10 with the /admin/hr → /hr/admin
 * relocation (PR #1306) — the move reset the grandfathering these dirs had
 * under the old path, surfacing them to the Hub Page Reachability gate.
 */
export default async function OffboardingCaseIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/hr/admin/offboarding/${id}/fnf`);
}
