import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SubmissionsList } from './_components/submissions-list';


/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 * Added 2026-04-24 in the matchPaths-only sweep (PR follow-up to #408).
 */
export const navMeta = {
  invokedFrom: '/startup-studio/problem-bank',
} as const;

export const metadata: Metadata = {
  title: 'Submissions',
};

export default function SubmissionsPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Submissions' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Submissions</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Review and manage appathon submissions and judging
          </p>
        </div>
        <SubmissionsList />
      </div>
    </ContentLayout>
  );
}
