import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { LeaderboardTable } from './_components/leaderboard-table';
import { ExportPDFButton } from './_components/export-pdf-button';

export const metadata: Metadata = {
  title: 'Leaderboard | Paradigm Shift',
  description: 'Department rankings for the Research Paradigm Shift',
};

/**
 * navMeta — invoked from the Paradigm Shift dashboard via a "Leaderboard"
 * CTA. Nav-coverage detector (`scripts/assert-nav-coverage.mjs`) reads this
 * to pass discoverability.
 */
export const navMeta = {
  invokedFrom: '/solutions/paradigm-shift',
} as const;

export default function LeaderboardPage() {
  return (
    <ContentLayout title="Paradigm Shift Leaderboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Paradigm Shift', href: '/solutions/paradigm-shift' },
          { label: 'Leaderboard' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Paradigm Shift Leaderboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Departments ranked by composite score across all 9 metrics
            </p>
          </div>
          <ExportPDFButton />
        </div>

        <LeaderboardTable />
      </div>
    </ContentLayout>
  );
}
