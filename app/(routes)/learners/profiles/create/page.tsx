'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { LearnerCreateForm } from './_components/learner-create-form';

export default function LearnerCreatePage() {
  return (
    <ContentLayout title="Create Learner">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners', href: '/learners' },
          { label: 'Profiles', href: '/learners/profiles' },
          { label: 'Create' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Create Learner Profile</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Enter learner details below. Required fields mirror the bulk-upload
            template; on successful save the learner is activated and visible
            on{' '}
            <Link
              href="/learners/profiles"
              className="underline underline-offset-2"
            >
              Learners Management
            </Link>
            .
          </p>
        </div>

        <LearnerCreateForm />
      </div>
    </ContentLayout>
  );
}
