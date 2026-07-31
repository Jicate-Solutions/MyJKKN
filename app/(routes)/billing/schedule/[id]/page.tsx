// Hub redirect — the /billing/schedule/[id] level has no detail page of its own
// (only an /edit child), so the bare URL would 404 in production. Redirect to the
// item's edit view (its only page), preserving the id. Mirrors the project pattern
// in app/(routes)/audit/findings/[id]/page.tsx.

import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BillingScheduleDetailRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/billing/schedule/${id}/edit`);
}
