import { redirect } from 'next/navigation';

/**
 * Faculty case detail landing — redirects to the preview view by default.
 *
 * /pde/faculty/cases/[id] previously 404'd because no page.tsx existed at
 * the dynamic segment. Its children (attempts, edit, preview) are all
 * specific sub-actions; preview is the safest default (read-only).
 *
 * Hardcoded redirect (not config-driven) because the target path depends on
 * the [id] segment — generic policy lookup can't synthesise the URL. Faculty
 * who want a different default can edit this file.
 *
 * Part of the PDE hub-page-404 sweep (follow-up to #1206).
 */
export default async function FacultyCaseIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/pde/faculty/cases/${id}/preview`);
}
