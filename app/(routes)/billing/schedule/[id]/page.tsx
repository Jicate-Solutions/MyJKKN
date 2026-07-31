import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

// Hub for /billing/schedule/[id] — there is no standalone bill detail page;
// the only child route is ./edit. A bare hit here (deep link / hand-edited
// URL) previously 404'd in the App Router because the segment had children
// but no page.tsx of its own. Bounce to the edit page so the URL never 404s.
export default async function BillingScheduleBillHubRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/billing/schedule/${id}/edit`);
}
