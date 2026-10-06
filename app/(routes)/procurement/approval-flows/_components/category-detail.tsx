'use client';

import { useState } from 'react';
import { GripVertical, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSaveCategorySteps, useSaveProcurementCategory } from '@/hooks/procurement/use-approval-chains';
import { errorMessage } from '@/lib/utils/supabase-error';
import { cn } from '@/lib/utils';
import type { ApprovalStage, CategoryStep, ProcurementCategory } from '@/types/procurement';
import { PersonPicker, type PickedPerson } from './person-picker';

/** Second line of a step: the person's email (older role/HOD steps say what they are). */
function stepDetail(s: CategoryStep): string {
  if (s.approver_kind === 'user') return s.user?.email ?? '';
  if (s.approver_kind === 'hod') return 'HOD of the department the request is for';
  return s.same_college ? `${s.role_key} of the request's college` : `${s.role_key}`;
}

export const stepsOf = (c: ProcurementCategory, stage: ApprovalStage) =>
  (c.steps ?? []).filter((s) => (s.stage ?? 'request') === stage);

/**
 * The selected category: its two approver lists, each 1, 2, 3 … in order.
 *   Request approval — approves the items asked for
 *   Final approval   — approves the vendors and prices chosen after quotations
 * Add a person by name or email; drag to reorder; ✕ to remove. Saves straight away.
 */
export function CategoryDetail({
  category,
  categories,
}: {
  category: ProcurementCategory;
  categories: ProcurementCategory[];
}) {
  const saveCategory = useSaveProcurementCategory();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);

  const rename = async () => {
    setRenaming(false);
    if (!name.trim() || name.trim() === category.name) return setName(category.name);
    try {
      await saveCategory.mutateAsync({ id: category.id, name });
    } catch (e) {
      setName(category.name);
      toast.error(errorMessage(e, 'Could not rename'));
    }
  };

  const toggleOpen = async (open: boolean) => {
    try {
      await saveCategory.mutateAsync({ id: category.id, name: category.name, is_active: open });
      toast.success(open ? 'Open for requests' : 'Hidden from new requests');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change it'));
    }
  };

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {renaming ? (
          <Input
            autoFocus
            className="h-8 max-w-sm font-semibold"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => e.key === 'Enter' && rename()}
            aria-label="Category name"
          />
        ) : (
          <button type="button" onClick={() => setRenaming(true)} className="group flex items-center gap-2 text-left">
            <h2 className="text-base font-bold">{category.name}</h2>
            <Pencil className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
        <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Switch checked={category.is_active} onCheckedChange={toggleOpen} aria-label="Open for requests" />
          Open for requests
        </label>
      </div>

      <ApproverList
        category={category}
        categories={categories}
        stage="request"
        title="Request approval"
        hint="Approve the items asked for, before quotations."
        empty="No approvers — requesters can’t choose this category."
      />
      <ApproverList
        category={category}
        categories={categories}
        stage="final"
        title="Final approval"
        hint="Approve the chosen vendors and prices, after quotations. Orders are created on the last approval."
        empty="No approvers — a Super Admin gives the final approval."
      />
    </section>
  );
}

function ApproverList({
  category,
  categories,
  stage,
  title,
  hint,
  empty,
}: {
  category: ProcurementCategory;
  categories: ProcurementCategory[];
  stage: ApprovalStage;
  title: string;
  hint: string;
  empty: string;
}) {
  const steps = stepsOf(category, stage);
  const saveSteps = useSaveCategorySteps();
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const persist = async (next: CategoryStep[], done: string, undo?: CategoryStep[]) => {
    try {
      await saveSteps.mutateAsync({ categoryId: category.id, steps: next, stage });
      toast.success(done, undo ? { action: { label: 'Undo', onClick: () => void persist(undo, 'Restored') } } : undefined);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save'));
    }
  };

  const add = (p: PickedPerson) => {
    if (steps.some((s) => s.user_id === p.id)) {
      toast.error(`${p.full_name ?? p.email} is already in ${title.toLowerCase()}`);
      return;
    }
    const step: CategoryStep = {
      stage,
      step_order: steps.length + 1,
      label: p.full_name || p.email || 'Approver',
      approver_kind: 'user',
      role_key: null,
      same_college: true,
      user_id: p.id,
      user: p,
    };
    void persist([...steps, step], `${step.label} added to ${title.toLowerCase()}`);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= steps.length || from === to) return;
    const next = [...steps];
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s);
    void persist(next, 'Order saved');
  };

  const copySources = categories.filter((c) => c.id !== category.id && stepsOf(c, stage).length > 0);
  const copyFrom = (sourceId: string) => {
    const source = categories.find((c) => c.id === sourceId);
    const from = source ? stepsOf(source, stage) : [];
    if (!from.length) return;
    void persist(
      // New rows for this category: never the source's step ids, or saving moves its rows here.
      from.map(({ id: _id, ...s }) => s),
      `Copied ${title.toLowerCase()} from ${source!.name}`,
      steps.length ? steps : undefined
    );
  };

  return (
    <div className="space-y-2 rounded-lg bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {copySources.length > 0 && (
          <Select value="" onValueChange={copyFrom}>
            <SelectTrigger className="h-8 w-auto gap-2 bg-background text-xs" aria-label={`Copy ${title} from another category`}>
              <SelectValue placeholder="Copy from…" />
            </SelectTrigger>
            <SelectContent>
              {copySources.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {steps.length > 0 ? (
        <ol className="divide-y rounded-lg border bg-background">
          {steps.map((s, i) => (
            <li
              key={`${s.id ?? 'new'}-${i}`}
              className={cn('flex items-center gap-2.5 px-2.5 py-1.5', dragFrom === i && 'opacity-50')}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom !== null) move(dragFrom, i);
                setDragFrom(null);
              }}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                <span className="truncate text-sm font-semibold">{s.label}</span>
                <span className="truncate text-xs text-muted-foreground">{stepDetail(s)}</span>
              </div>
              <button
                type="button"
                draggable
                onDragStart={() => setDragFrom(i)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    move(i, i + (e.key === 'ArrowUp' ? -1 : 1));
                  }
                }}
                disabled={saveSteps.isPending}
                aria-label={`Move ${s.label} — drag, or use the arrow keys`}
                title="Drag to reorder (or focus and press ↑ / ↓)"
                className="flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void persist(steps.filter((_, j) => j !== i), `${s.label} removed`, steps)}
                disabled={saveSteps.isPending}
                aria-label={`Remove ${s.label}`}
                title="Remove"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-400">{empty}</p>
      )}

      {steps.length < 10 && (
        <div className="max-w-sm [&_button]:h-8 [&_button]:bg-background [&_button]:text-sm">
          <PersonPicker value={null} onChange={add} placeholder="+ Add approver by name or email" />
        </div>
      )}
    </div>
  );
}
