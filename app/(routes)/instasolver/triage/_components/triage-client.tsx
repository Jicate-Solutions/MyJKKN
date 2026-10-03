'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { AccessGate } from '@/components/instasolver/access-gate';
import { AssignDialog } from '@/components/instasolver/issue-dialogs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInstitutions, useTriageQueue } from '@/hooks/instasolver/use-instasolver';
import type { TriageFilters, TriagedIssue } from '@/types/instasolver';
import { ReopenDialog } from './reopen-dialog';
import { TriageLegend } from './triage-legend';
import { TriageList } from './triage-list';

type View = NonNullable<TriageFilters['view']>;

const VIEWS: { value: View; label: string; empty: string }[] = [
  { value: 'decide', label: 'Needs a decision', empty: 'Nothing is waiting for a decision. New reports and disputed fixes appear here.' },
  { value: 'open', label: 'All open', empty: 'There are no open issues.' },
  { value: 'all', label: 'Everything', empty: 'No issues have been reported yet.' }
];

export function TriageClient() {
  return (
    <AccessGate need="manager">
      <TriageDesk />
    </AccessGate>
  );
}

function TriageDesk() {
  const [view, setView] = useState<View>('decide');
  const [institutionId, setInstitutionId] = useState('all');
  const [page, setPage] = useState(1);

  const [assignTarget, setAssignTarget] = useState<TriagedIssue | null>(null);
  const [reopenTarget, setReopenTarget] = useState<TriagedIssue | null>(null);

  const { data: institutions } = useInstitutions();
  const { data, isLoading, isFetching, error, refetch } = useTriageQueue({
    view,
    institution_id: institutionId === 'all' ? undefined : institutionId,
    page
  });

  const rows = data?.data ?? [];
  const meta = data?.metadata;
  const viewMeta = VIEWS.find((v) => v.value === view) ?? VIEWS[0];

  return (
    <div className="space-y-4">
      <PageBreadcrumb
        items={[
          { label: 'InstaSolver', href: '/instasolver/dashboard' },
          { label: 'Triage', isCurrent: true }
        ]}
      />
      <PageHeader
        title="Triage"
        description="Issues ranked by the database, most pressing first. You decide the priority and who takes each one — nothing is assigned automatically."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          value={view}
          onValueChange={(v) => {
            setView(v as View);
            setPage(1);
          }}
          className="min-w-0"
        >
          <TabsList className="h-auto w-full flex-wrap justify-start md:w-auto">
            {VIEWS.map((v) => (
              <TabsTrigger key={v.value} value={v.value} className="flex-1 md:flex-none">
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Select
          value={institutionId}
          onValueChange={(v) => {
            setInstitutionId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full md:w-72" aria-label="Filter by institution">
            <SelectValue placeholder="All institutions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All institutions</SelectItem>
            {institutions?.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <p className="font-medium">The queue could not be loaded</p>
            <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 p-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="text-sm text-muted-foreground">{viewMeta.empty}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <TriageList
            rows={rows}
            handlers={{ onAssign: setAssignTarget, onReopen: setReopenTarget }}
          />

          {meta && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Page {meta.page} of {Math.max(meta.totalPages, 1)} · {meta.total} {meta.total === 1 ? 'issue' : 'issues'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <TriageLegend />

      <AssignDialog issue={assignTarget} open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)} />
      <ReopenDialog issue={reopenTarget} open={!!reopenTarget} onOpenChange={(o) => !o && setReopenTarget(null)} />
    </div>
  );
}
