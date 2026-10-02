import { redirect } from 'next/navigation';

/**
 * A quotation used to have a detail page (items + vendor list) in front of the page
 * where the work happens. Users landed there, saw two buttons to the same place and
 * got lost — so the quotation now opens straight on its working screen: add quotes,
 * compare, choose, send to the Super Admin. The item list PDF moved there too.
 * Kept as a redirect so old links and bookmarks still work.
 */
export default async function RfqDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/procurement/rfqs/${id}/quotations`);
}
