'use client';

/**
 * Approval flows — Super Admin only.
 *
 * Left: the purchase categories, each with its path in one line and Ready / Not
 * set up. Right: the chosen category's path as a timeline (Requester → 1 HOD →
 * 2 Principal → … → Approved), edited in place, plus "Check who it reaches".
 * Requesters only pick the category; they and the approvers never see this page.
 */

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Plus, Search, ShieldAlert } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import { useProcurementCategories, useSaveProcurementCategory } from '@/hooks/procurement/use-approval-chains';
import { errorMessage } from '@/lib/utils/supabase-error';
import { cn } from '@/lib/utils';
import type { ProcurementCategory } from '@/types/procurement';
import { CategoryDetail, customisedColleges, stepsOf } from './_components/category-detail';

const isReady = (c: ProcurementCategory) => c.is_active && stepsOf(c, 'request').length > 0;
const names = (c: ProcurementCategory, stage: 'request' | 'final') => stepsOf(c, stage).map((s) => s.label).join(' → ');

type StatusFilter = 'all' | 'ready' | 'setup' | 'hidden';
const statusOf = (c: ProcurementCategory): Exclude<StatusFilter, 'all'> =>
  !c.is_active ? 'hidden' : isReady(c) ? 'ready' : 'setup';

function StatusPill({ c }: { c: ProcurementCategory }) {
  const [label, tone] = !c.is_active
    ? ['Hidden', 'bg-muted text-muted-foreground']
    : isReady(c)
      ? ['Ready', 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300']
      : ['Needs approvers', 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'];
  return <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold', tone)}>{label}</span>;
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

  // Search and the status dropdown narrow the left list; a category opened by
  // link (?c=) stays open even if the filter would hide it.
  const term = search.trim().toLowerCase();
  const listed = categories.filter(
    (c) =>
      (status === 'all' || statusOf(c) === status) &&
      (!term || c.name.toLowerCase().includes(term) || (c.steps ?? []).some((st) => st.label.toLowerCase().includes(term)))
  );
  const chosenId = searchParams.get('c');
  const selected = categories.find((c) => c.id === chosenId) ?? null;
  // Wide screens always show a category; on a phone the list comes first.
  const shown = selected ?? listed[0] ?? null;
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
    { value: 'all', label: 'All categories' },
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

  return (
    <ContentLayout title="Approval flows">
      <div className="mx-auto w-full max-w-6xl space-y-3">
        {/* One toolbar row, as on Requests: search · status · the primary action last. */}
        <div className="flex flex-wrap gap-2">
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
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-full sm:w-52" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label} ({count(o.value)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                <Button size="sm" className="h-9" onClick={addCategory} disabled={!newName.trim() || saveCategory.isPending}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" className="h-9" onClick={() => setAdding(false)}>
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
        ) : (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <nav
              aria-label="Categories"
              className={cn('flex flex-col divide-y overflow-hidden rounded-xl border bg-background shadow lg:w-72 lg:shrink-0', selected && 'hidden lg:flex')}
            >
              {listed.length === 0 && (
                <p className="px-3 py-4 text-sm text-muted-foreground">No categories match.</p>
              )}
              {listed.map((c) => {
                const active = shown?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => select(c.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex flex-col gap-0.5 border-l-[3px] border-l-transparent px-3 py-2 text-left transition-colors hover:bg-muted/40',
                      active && 'lg:border-l-primary lg:bg-primary/5',
                      !c.is_active && 'opacity-70'
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{c.name}</span>
                      <StatusPill c={c} />
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {stepsOf(c, 'request').length ? names(c, 'request') : 'No approvers yet'}
                      {stepsOf(c, 'final').length > 0 && ` · Final: ${names(c, 'final')}`}
                      {customisedColleges(c).length > 0 &&
                        ` · ${customisedColleges(c).length} college${customisedColleges(c).length === 1 ? '' : 's'} customised`}
                    </span>
                  </button>
                );
              })}
            </nav>

            {shown && (
              <div className={cn('min-w-0 flex-1 space-y-3', !selected && 'hidden lg:block')}>
                <Button variant="link" className="h-9 px-0 lg:hidden" onClick={() => select(null)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> All categories
                </Button>
                <CategoryDetail key={shown.id} category={shown} categories={categories} />
              </div>
            )}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
