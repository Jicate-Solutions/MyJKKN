// Moved to the Academic module (2027-04). Old URL kept as a redirect, with the
// ?tab= (types | flows) preserved for the Campus Living links that use it.
import { redirect } from 'next/navigation';

export default async function LeaveSettingsMovedPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  redirect(`/academic/leave-onduty/settings${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`);
}
