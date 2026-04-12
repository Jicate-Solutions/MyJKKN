import { redirect } from 'next/navigation';

/**
 * Redirects /team/[enrollmentId]/check-ins → /team/[enrollmentId]
 * The team detail page handles tab selection via defaultTab prop.
 * Since we can't pass tab state through a server redirect to a client component,
 * we redirect to the base URL — the Check-ins tab link on the detail page is the
 * canonical entry point.
 */
interface CheckInsPageProps {
  params: Promise<{ enrollmentId: string }>;
}

export default async function CheckInsPage({ params }: CheckInsPageProps) {
  const { enrollmentId } = await params;
  redirect(`/startup-studio/solve-for-100/team/${enrollmentId}?tab=check-ins`);
}
