'use client';

import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ContentLayout } from '@/components/layout/content-layout';
import { useJob } from '@/hooks/hr/use-recruitment';

import { EditJobForm } from './_components/edit-job-form';

export const navMeta = { invokedFrom: '/hr/recruitment/jobs' } as const;

export default function EditJobPage() {
  const { id } = useParams();
  const jobId = id as string;
  const { data: job, isLoading, error } = useJob(jobId);

  if (isLoading) {
    return (
      <ContentLayout title="Edit Job Posting">
        <div className="space-y-6 max-w-3xl">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !job) {
    return (
      <ContentLayout title="Job Not Found">
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <AlertCircle className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold">
              {error ? 'Failed to load job posting' : 'Job posting not found'}
            </p>
            <p className="text-sm text-muted-foreground max-w-sm">
              {error instanceof Error ? error.message : 'This posting may have been deleted.'}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/hr/recruitment/jobs">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Jobs
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return <EditJobForm job={job} />;
}
