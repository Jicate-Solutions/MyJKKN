import { redirect } from 'next/navigation';

/**
 * Form detail landing — redirects to the builder view by default.
 *
 * /hr/admin/forms/[id] previously 404'd because no page.tsx existed at the
 * dynamic segment. Its children (builder, workflow) are both specific
 * sub-editors; builder is the primary surface (the forms list page presents
 * it first, and a form must have a schema before its approval workflow
 * matters).
 *
 * Hardcoded redirect (not config-driven) because the target path depends on
 * the [id] segment — generic policy lookup can't synthesise the URL.
 *
 * Pattern source: app/(routes)/pde/faculty/cases/[id]/page.tsx (PDE
 * hub-page-404 sweep). Added 2026-06-10 with the /admin/hr → /hr/admin
 * relocation (PR #1306) — the move reset the grandfathering these dirs had
 * under the old path, surfacing them to the Hub Page Reachability gate.
 */
export default async function FormDetailIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/hr/admin/forms/${id}/builder`);
}
