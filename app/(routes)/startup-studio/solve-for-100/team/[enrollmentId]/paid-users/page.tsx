import { redirect } from 'next/navigation';

/**
 * Redirects /team/[enrollmentId]/paid-users → /team/[enrollmentId]?tab=paid-users
 */
interface PaidUsersPageProps {
  params: Promise<{ enrollmentId: string }>;
}

export default async function PaidUsersPage({ params }: PaidUsersPageProps) {
  const { enrollmentId } = await params;
  redirect(`/startup-studio/solve-for-100/team/${enrollmentId}?tab=paid-users`);
}
