import { redirect } from 'next/navigation';

/**
 * Redirects /team/[enrollmentId]/pivots → /team/[enrollmentId]?tab=pivots
 */
interface PivotsPageProps {
  params: Promise<{ enrollmentId: string }>;
}

export default async function PivotsPage({ params }: PivotsPageProps) {
  const { enrollmentId } = await params;
  redirect(`/startup-studio/solve-for-100/team/${enrollmentId}?tab=pivots`);
}
