'use client';

/**
 * Approval flows — Super Admin only.
 *
 * List: one row per purchase category (table on md+, cards on a phone, via
 * ResponsiveList like every procurement list): its request and final approvers
 * as chips, how many colleges have approvers of their own, and its status.
 * Categories that still need approvers come first.
 * A row opens the category's editor full width (?c=<id>); "All categories" goes back.
 * Requesters only pick the category; they and the approvers never see this page.
 */

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, GitBranch, Plus, Search, ShieldAlert } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { EmptyState } from '@/components/empty-state';
import { ResponsiveList, type ResponsiveColumn } from '@/components/procurement/responsive-list';
import { StatusBadge } from '@/components/procurement/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/use-permissions';
import { useProcurementCategories, useSaveProcurementCategory } from '@/hooks/procurement/use-approval-chains';
import { errorMessage } from '@/lib/utils/supabase-error';
import { cn } from '@/lib/utils';
import type { ApprovalStage, ProcurementCategory } from '@/types/procurement';
import { CategoryDetail, customisedColleges, stepsOf } from './_components/category-detail';

/** Colleges whose own request approvers let them use the category even with no common ones. */
const collegesWithOwn = (c: ProcurementCategory) =>
  customisedColleges(c).filter((id) => stepsOf(c, 'request', id).length > 0);
/** Usable by someone: common request approvers, or at least one college with its own. */
const isReady = (c: ProcurementCategory) =>
  c.is_active && (stepsOf(c, 'request').length > 0 || collegesWithOwn(c).length > 0);
const plural = (n: number) => `${n} college${n === 1 ? '' : 's'}`;

type Status = 'setup' | 'ready' | 'hidden';
type StatusFilter = 'all' | Status;
const statusOf = (c: ProcurementCategory): Status => (!c.is_active ? 'hidden' : isReady(c) ? 'ready' : 'setup');
/** Needs approvers first: that is the work left on this page. */
const STATUS_RANK: Record<Status, number> = { setup: 0, ready: 1, hidden: 2 };
const STATUS_CONFIG = {
  ready: { label: 'Ready', color: 'green' },
  setup: { label: 'Needs approvers', color: 'amber' },
  hidden: { label: 'Hidden', color: 'gray' },
};

/** Chips shown per list before "+N more". */
const MAX_CHIPS = 3;

/** One list of a category, as step chips: common approvers, else "Per college", else the fallback. */
function ChainCell({ c, stage }: { c: ProcurementCategory; stage: ApprovalStage }) {
  const steps = stepsOf(c, stage);
  if (steps.length === 0) {
    const perCollege = customisedColleges(c).some((id) => stepsOf(c, stage, id).length > 0);
    if (perCollege) {
      return (
        <span className="inline-block whitespace-nowrap rounded-md border border-dashed border-primary/40 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
          Per college
        </span>
      );
    }
    // An empty final list falls back to the Super Admin, so it is never "no approval".
    return <span className="text-sm text-muted-foreground">{stage === 'final' ? 'Super Admin (default)' : 'Not set'}</span>;
  }
  const shown = steps.slice(0, MAX_CHIPS);
  return (
    <span className="flex flex-wrap items-center gap-1" title={steps.map((s) => s.label).join(' → ')}>
      {shown.map((s, i) => (
        <span key={s.id ?? i} className="inline-flex items-center gap-1">
          <span className="max-w-[160px] truncate rounded-md border bg-muted/40 px-2 py-0.5 text-xs font-medium">{s.label}</span>
          {i < shown.length - 1 && <span aria-hidden className="text-muted-foreground">→</span>}
        </span>
      ))}
      {steps.length > MAX_CHIPS && <span className="text-xs text-muted-foreground">+{steps.length - MAX_CHIPS} more</span>}
    </span>
  );
}

export default function ApprovalFlowsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin, isLoading } = usePermissions();
  const { data: categories = [], isLoading: loadingCats } = useProcurementCategories(true);
  const saveCategory = useSaveProcurementCategory();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const term = search.trim().toLowerCase();
  const listed = categories
    .filter(
      (c) =>
        (status === 'all' || statusOf(c) === status) &&
        (!term || c.name.toLowerCase().includes(term) || (c.steps ?? []).some((st) => st.label.toLowerCase().includes(term)))
    )
    // Stable sort keeps the Super Admin's sort_order inside each status.
    .sort((a, b) => STATUS_RANK[statusOf(a)] - STATUS_RANK[statusOf(b)]);
  const selected = categories.find((c) => c.id === searchParams.get('c')) ?? null;
  const select = (id: string | null) =>
    router.replace(id ? `/procurement/approval-flows?c=${id}` : '/procurement/approval-flows', { scroll: false });

  if (isLoading) return null;
  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Approval flows">
        <Card className="mx-auto mt-10 max-w-md">
          <CardContent className="space-y-3 pt-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">Only a Super Admin can set approval flows.</p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const count = (f: StatusFilter) => (f === 'all' ? categories.length : categories.filter((c) => statusOf(c) === f).length);
  const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'ready', label: 'Ready' },
    { value: 'setup', label: 'Needs approvers' },
    { value: 'hidden', label: 'Hidden' },
  ];

  const addCategory = async () => {
    if (!newName.trim()) return;
    try {
      const created = await saveCategory.mutateAsync({ name: newName });
      toast.success(`${created.name} added — now add its approvers`);
      setNewName('');
      setAdding(false);
      select(created.id);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not add the category'));
    }
  };

  const columns: ResponsiveColumn<ProcurementCategory>[] = [
    {
      key: 'name',
      header: 'Category',
      mobile: 'title',
      className: 'w-[24%]',
      cell: (c) => (
        <span className={cn('flex min-w-0 flex-col', !c.is_active && 'opacity-60')}>
          <span className="truncate font-semibold">{c.name}</span>
          {c.description && <span className="truncate text-xs font-normal text-muted-foreground">{c.description}</span>}
        </span>
      ),
    },
    { key: 'request', header: 'A · Request approval', mobileLabel: 'Request approval', cell: (c) => <ChainCell c={c} stage="request" /> },
    { key: 'final', header: 'B · Final approval', mobileLabel: 'Final approval', cell: (c) => <ChainCell c={c} stage="final" /> },
    {
      key: 'colleges',
      header: 'Colleges',
      cell: (c) => {
        const n = customisedColleges(c).length;
        return n ? <span className="text-sm">{plural(n)}</span> : <span className="text-sm text-muted-foreground">—</span>;
      },
    },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (c) => <StatusBadge status={statusOf(c)} config={STATUS_CONFIG} /> },
    {
      key: 'action',
      header: <span className="sr-only">Action</span>,
      mobile: 'hidden',
      className: 'text-right',
      // The row opens the editor too; the link makes the open job obvious.
      cell: (c) => (
        <Button variant="link" size="sm" className="h-8 px-0">
          {statusOf(c) === 'setup' ? 'Set approvers' : 'Edit'}
        </Button>
      ),
    },
  ];

  if (selected) {
    return (
      <ContentLayout title="Approval flows">
        <div className="mx-auto w-full max-w-6xl space-y-3">
          <Button variant="link" className="h-9 px-0" onClick={() => select(null)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> All categories
          </Button>
          <CategoryDetail key={selected.id} category={selected} categories={categories} />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Approval flows">
      <div className="mx-auto w-full max-w-6xl space-y-3">
        {/* One toolbar row, as on Requests: search · status with counts · the primary action last. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search category or approver"
              aria-label="Search categories"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <div role="group" aria-label="Status" className="flex w-full gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px] sm:w-auto">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={status === o.value}
                onClick={() => setStatus(o.value)}
                className={cn(
                  'h-8 shrink-0 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors',
                  status === o.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {o.label} {count(o.value)}
              </button>
            ))}
          </div>
          <Button className="h-9 w-full sm:w-auto" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New category
          </Button>
        </div>

        {adding && (
          <Card>
            <CardContent className="flex flex-col gap-2 p-3 sm:flex-row">
              <Input
                autoFocus
                className="h-9"
                placeholder="Category name, e.g. Sports equipment"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCategory()}
              />
              <div className="flex gap-2">
                <Button size="sm" className="h-10 sm:h-9" onClick={addCategory} disabled={!newName.trim() || saveCategory.isPending}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" className="h-10 sm:h-9" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loadingCats ? (
          <div className="flex justify-center py-10">
            <BeatLoader size={10} />
          </div>
        ) : categories.length === 0 ? (
          <EmptyState
            icon={<GitBranch className="h-10 w-10 text-muted-foreground" />}
            title="No categories yet"
            description="Add a category, then choose who approves its purchases."
            action={
              <Button onClick={() => setAdding(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> New category
              </Button>
            }
          />
        ) : listed.length === 0 ? (
          <EmptyState
            title="No categories match"
            description="Try another search or status."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('');
                  setStatus('all');
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <ResponsiveList
            className="overflow-hidden rounded-xl border bg-background shadow"
            rows={listed}
            columns={columns}
            getRowKey={(c) => c.id}
            onRowClick={(c) => select(c.id)}
            rowLabel={(c) => `Open ${c.name} approvers`}
          />
        )}
      </div>
    </ContentLayout>
  );
}
