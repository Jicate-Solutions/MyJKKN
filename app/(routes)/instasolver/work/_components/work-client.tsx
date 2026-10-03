'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Inbox, RefreshCw } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { AccessGate } from '@/components/instasolver/access-gate';
import { CompleteDialog } from '@/components/instasolver/issue-dialogs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInstaSolverMutation, useWorkQueue, useWorkTabCounts } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverIssueService } from '@/lib/services/instasolver/issue-service';
import { WORK_TABS } from '@/lib/instasolver/constants';
import type { Issue, WorkTab } from '@/types/instasolver';
import { WorkList } from './work-list';

const EMPTY: Record<WorkTab, string> = {
  assigned: 'Nothing is assigned to you right now.',
  in_progress: 'You have nothing in progress. Start something from Assigned to me or To claim.',
  to_claim: 'Nothing is waiting for your team to claim.',
  completed: 'You have not completed any issues yet.'
};

function parseTab(raw: string | null): WorkTab {
  return WORK_TABS.some((t) => t.value === raw) ? (raw as WorkTab) : WORK_TABS[0].value;
}

export function WorkClient() {
  return (
    <AccessGate need="maintenance">
      <WorkDesk />
    </AccessGate>
  );
}

function WorkDesk() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [completeTarget, setCompleteTarget] = useState<Issue | null>(null);

  const { data: counts } = useWorkTabCounts();
  const { data, isLoading, isFetching, error, refetch } = useWorkQueue(tab, page);

  const go = (nextTab: WorkTab, nextPage: number) => {
    const q = new URLSearchParams();
    q.set('tab', nextTab);
    if (nextPage > 1) q.set('page', String(nextPage));
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const claim = useInstaSolverMutation(
    (issue: Issue) => InstaSolverIssueService.claim(issue.id),
    (_r, issue) => `${issue.reference_no} is yours — start it when you are ready`
  );
  const start = useInstaSolverMutation(
    (issue: Issue) => InstaSolverIssueService.start(issue),
    (_r, issue) => `${issue.reference_no} started`
  );
  const busyId =
    (claim.isPending ? claim.variables?.id : undefined) ?? (start.isPending ? start.variables?.id : undefined) ?? null;

  const rows = data?.data ?? [];
  const meta = data?.metadata;
  const activeTab = WORK_TABS.find((t) => t.value === tab) ?? WORK_TABS[0];

  return (
    <div className="space-y-4">
      <PageBreadcrumb
        items={[
          { label: 'InstaSolver', href: '/instasolver/dashboard' },
          { label: 'My work', isCurrent: true }
        ]}
      />
      <PageHeader
        title="My work"
        description={activeTab.description}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => go(v as WorkTab, 1)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:inline-flex md:w-auto">
          {WORK_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="min-h-[2.75rem] gap-2 md:min-h-0">
              {t.label}
              {counts && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[11px] tabular-nums">
                  {counts[t.value]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <p className="font-medium">Your work could not be loaded</p>
            <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 p-8 text-center">
            <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{EMPTY[tab]}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <WorkList
            tab={tab}
            rows={rows}
            handlers={{
              onClaim: (i) => claim.mutate(i),
              onStart: (i) => start.mutate(i),
              onComplete: setCompleteTarget,
              busyId
            }}
          />
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Page {meta.page} of {meta.totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => go(tab, page - 1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages || isFetching}
                  onClick={() => go(tab, page + 1)}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <CompleteDialog issue={completeTarget} open={!!completeTarget} onOpenChange={(o) => !o && setCompleteTarget(null)} />
    </div>
  );
}
