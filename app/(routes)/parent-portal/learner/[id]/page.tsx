import { Metadata } from 'next';
import { LearnerDetailClient } from './learner-detail-client';

export const metadata: Metadata = {
  title: 'Learner Details | Parent Portal',
  description: 'View detailed information about your child\'s academic progress',
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function LearnerDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <LearnerDetailClient learnerId={id} />;
}
