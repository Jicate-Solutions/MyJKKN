'use client';

import { useParams } from 'next/navigation';
import { JobDetailView } from './_components/job-detail-view';

export const navMeta = { invokedFrom: '/hr/recruitment/jobs' } as const;

export default function JobDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <JobDetailView id={id} />;
}
