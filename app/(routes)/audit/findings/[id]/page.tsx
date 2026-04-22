// Audit Workflow Sprint 01 — finding detail redirect.
// A finding IS a service_request (decision #1), so its detail page is the canonical
// /service-requests/[id] view. We redirect rather than duplicate the UI.

import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AuditFindingDetailRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/service-requests/${id}`);
}
