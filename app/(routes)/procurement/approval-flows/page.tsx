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
import { AlertCircle, Check, ChevronLeft, Plus, ShieldAlert } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/use-permissions';
import { useProcurementCategories, useSaveProcurementCategory } from '@/hooks/procurement/use-approval-chains';
import { errorMessage } from '@/lib/utils/supabase-error';
import { cn } from '@/lib/utils';
import type { ProcurementCategory } from '@/types/procurement';
import { CategoryDetail, stepsOf } from './_components/category-detail';

const isReady = (c: ProcurementCategory) => c.is_active && stepsOf(c, 'request').length > 0;
const names = (c: ProcurementCategory, stage: 'request' | 'final') => stepsOf(c, stage).map((s) => s.label).join(' → ');

function StatusPill({ c }: { c: ProcurementCategory }) {
  const [label, tone] = !c.is_active
    ? ['Hidden', 'bg-muted text-muted-foreground']
    : isReady(c)
      ? ['Ready', 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300']
      : ['Not set up', 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'];
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

  const chosenId = searchParams.get('c');
  const selected = categories.find((c) => c.id === chosenId) ?? null;
  // Wide screens always show a category; on a phone the list comes first.
  const shown = selected ?? categories[0] ?? null;
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

  const ready = categories.filter(isReady).length;
  const needSetup = categories.filter((c) => c.is_active && !isReady(c)).length;

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
      <div className="mx-auto w-full max-w-5xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight">Approval flows</h1>
          <Button size="sm" className="h-9" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New category
          </Button>
        </div>

        {!loadingCats && categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800 dark:bg-green-950/50 dark:text-green-300">
              <Check className="h-3.5 w-3.5" /> {ready} {ready === 1 ? 'category' : 'categories'} ready
            </span>
            {needSetup > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                <AlertCircle className="h-3.5 w-3.5" /> {needSetup} need approvers
              </span>
            )}
          </div>
        )}

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
              className={cn('flex flex-col divide-y overflow-hidden rounded-xl border bg-card lg:w-64 lg:shrink-0', selected && 'hidden lg:flex')}
            >
              {categories.map((c) => {
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
