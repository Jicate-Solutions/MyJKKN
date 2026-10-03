'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Download, Inbox, Loader2, Plus, UserPlus } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useInstaSolverAccess, useIssues } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverIssueService } from '@/lib/services/instasolver/issue-service';
import type { IssueFilters } from '@/types/instasolver';
import { BulkAssignDialog } from './bulk-assign-dialog';
import { downloadCsv, issuesToCsv } from './export-csv';
import { hasActiveFilters, loadStoredFilters, parseFilters, storeFilters, toParams } from './filter-state';
import { IssueFilterBar } from './issue-filters';
import { IssueList } from './issue-list';

export function IssuesClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: access } = useInstaSolverAccess();

  const query = searchParams.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(query)), [query]);

  // Restore the person's last filters when they arrive with a bare URL.
  // Decided once, during render, as soon as we know who they are; the effect
  // below only performs the navigation. `restoreTarget` stays set until the
  // URL actually carries it, and the list is held back until then.
  const [restoreDecided, setRestoreDecided] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  if (!restoreDecided && access?.user_id) {
    setRestoreDecided(true);
    setRestoreTarget(query ? null : loadStoredFilters(access.user_id) || null);
  }
  if (restoreTarget !== null && query === restoreTarget) {
    setRestoreTarget(null);
  }
  const restored = restoreDecided && restoreTarget === null;

  useEffect(() => {
    if (restoreTarget) router.replace(`${pathname}?${restoreTarget}`, { scroll: false });
  }, [restoreTarget, pathname, router]);

  useEffect(() => {
    if (restored && access?.user_id) storeFilters(access.user_id, query);
  }, [restored, access?.user_id, query]);

  const update = useCallback(
    (patch: Partial<IssueFilters>) => {
      const next = { ...filters, ...patch };
      // Any change other than paging goes back to the first page.
      if (!('page' in patch)) next.page = 1;
      const qs = toParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filters, pathname, router]
  );

  const clear = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  const canReport = !!access?.can_report;
  const actions = canReport ? (
    <Button asChild>
      <Link href="/instasolver/issues/new">
        <Plus className="mr-1.5 h-4 w-4" /> Report an issue
      </Link>
    </Button>
  ) : undefined;

  return (
    <div className="space-y-4">
      <PageBreadcrumb items={[{ label: 'InstaSolver', href: '/instasolver/dashboard' }, { label: 'Issues', isCurrent: true }]} />
      <PageHeader title="Issues" description="Faults reported across the campus" actions={actions} />
      {access && restored ? (
        <IssuesBody filters={filters} access={access} update={update} clear={clear} />
      ) : (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
    </div>
  );
}

function IssuesBody({
  filters,
  access,
  update,
  clear
}: {
  filters: IssueFilters;
  access: NonNullable<ReturnType<typeof useInstaSolverAccess>['data']>;
  update: (patch: Partial<IssueFilters>) => void;
  clear: () => void;
}) {
  const router = useRouter();
  const { data, isLoading, isFetching, error } = useIssues(filters);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filterKey = JSON.stringify(filters);
  useEffect(() => setSelected(new Set()), [filterKey]);

  const rows = data?.data ?? [];
  const meta = data?.metadata;
  const page = filters.page ?? 1;

  const exportCsv = async () => {
    try {
      setExporting(true);
      const res = await InstaSolverIssueService.list({ ...filters, page: 1, limit: 500 });
      downloadCsv(`instasolver-issues-${new Date().toISOString().slice(0, 10)}.csv`, issuesToCsv(res.data));
      toast.success(
        res.metadata.total > res.data.length
          ? `Exported the first ${res.data.length} of ${res.metadata.total} issues — narrow the filters for the rest`
          : `Exported ${res.data.length} ${res.data.length === 1 ? 'issue' : 'issues'}`
      );
    } catch (e) {
      toast.error((e as Error).message || 'The export did not go through');
    } finally {
      setExporting(false);
    }
  };

  const emptyText = () => {
    if (hasActiveFilters(filters)) return { title: 'No issues match these filters', hint: 'Try removing a filter.' };
    if (access.is_principal && !access.is_manager) return { title: 'No issues for your institution yet', hint: '' };
    if (access.is_manager) return { title: 'No issues have been reported yet', hint: '' };
    return { title: 'No issues to show yet', hint: access.can_report ? 'Report one when you see a fault.' : '' };
  };

  return (
    <>
      <IssueFilterBar filters={filters} access={access} onChange={update} onClear={clear} />

      {access.is_manager && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={selected.size === 0}
            onClick={() => setAssignOpen(true)}
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            Assign selected{selected.size ? ` (${selected.size})` : ''}
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            Export CSV
          </Button>
          <span className="text-xs text-muted-foreground">Only issues awaiting triage can be selected.</span>
        </div>
      )}

      {error ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-destructive">
            {(error as Error).message || 'The issues could not be loaded.'}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Inbox className="h-9 w-9 text-muted-foreground" />
            <p className="font-medium">{emptyText().title}</p>
            {emptyText().hint && <p className="text-sm text-muted-foreground">{emptyText().hint}</p>}
            {hasActiveFilters(filters) && (
              <Button variant="outline" size="sm" onClick={clear}>
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          <IssueList
            rows={rows}
            selectable={access.is_manager}
            selected={selected}
            onToggle={(id) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onToggleAll={(checked) =>
              setSelected(checked ? new Set(rows.filter((r) => r.status === 'pending').map((r) => r.id)) : new Set())
            }
            onOpen={(id) => router.push(`/instasolver/issues/${id}`)}
          />
        </div>
      )}

      {meta && meta.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => update({ page: page + 1 })}
            >
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <BulkAssignDialog
        ids={[...selected]}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onDone={() => setSelected(new Set())}
      />
    </>
  );
}
