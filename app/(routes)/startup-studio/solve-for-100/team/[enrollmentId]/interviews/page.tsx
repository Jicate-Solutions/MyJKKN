import { redirect } from 'next/navigation';

/**
 * Redirects /team/[enrollmentId]/interviews → /team/[enrollmentId]?tab=interviews
 */
interface InterviewsPageProps {
  params: Promise<{ enrollmentId: string }>;
}

export default async function InterviewsPage({ params }: InterviewsPageProps) {
  const { enrollmentId } = await params;
  redirect(`/startup-studio/solve-for-100/team/${enrollmentId}?tab=interviews`);
}
