'use client';

/**
 * Waiting for my approval — every request whose current approval step is mine
 * (HOD, Principal, CAO, Chairperson…). Approvers without other procurement access
 * land here from their notification or from the Overview card.
 */

import Link from 'next/link';
import { ChevronRight, Inbox } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageHeader } from '@/components/procurement/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { useMyApprovals } from '@/hooks/procurement/use-approval-chains';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { formatDateDMY } from '@/lib/utils/date-format';

export default function MyApprovalsPage() {
  const { data = [], isLoading } = useMyApprovals();

  return (
    <ContentLayout title="My approvals">
      <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-6">
        <PageHeader title="Waiting for my approval" description="Purchase requests where it is your turn to approve." />
        {isLoading ? (
          <div className="flex justify-center py-10">
            <BeatLoader size={10} />
          </div>
        ) : data.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Inbox className="h-8 w-8" />
              Nothing is waiting for you.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {data.map((a) => (
              <li key={a.request_id}>
                <Link
                  href={`/procurement/requests/${a.request_id}`}
                  className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{a.title || 'Purchase request'}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {displayRequestNumber(a.request_number)}
                      {a.requested_by_name ? ` · ${a.requested_by_name}` : ''}
                      {a.institution_name ? ` · ${a.institution_name}` : ''}
                      {a.submitted_at ? ` · ${formatDateDMY(a.submitted_at)}` : ''}
                    </p>
                    <p className="mt-1 text-xs">
                      {a.category_name && <span className="mr-2 rounded bg-muted px-1.5 py-0.5">{a.category_name}</span>}
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        {a.stage === 'final' ? 'Final approval · ' : 'Request approval · '}
                        {a.step_order <= a.steps_total ? `${a.step_order} of ${a.steps_total} — ` : ''}
                        {a.step_label}
                      </span>
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ContentLayout>
  );
}
