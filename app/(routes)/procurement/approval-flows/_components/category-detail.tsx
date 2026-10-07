'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Pencil, X } from 'lucide-react';
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
 * The selected category, top to bottom:
 *   header        — name (click to rename) · Open for requests
 *   journey strip — Requester asks → A → Quotes → B → Order created
 *   A and B       — the two approver lists, side by side when there is room
 *       A Request approval — approves the items asked for
 *       B Final approval   — approves the vendors and prices chosen after quotations
 *   read-back     — the chain as plain sentences
 * Add a person by name or email; ↑ ↓ (or drag) to reorder; ✕ to remove. Saves straight away.
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

  const requestSteps = stepsOf(category, 'request');
  const finalSteps = stepsOf(category, 'final');

  return (
    <section className="overflow-hidden rounded-xl border bg-background shadow">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
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

      <JourneyStrip hasRequest={requestSteps.length > 0} hasFinal={finalSteps.length > 0} />

      {/* Side by side when there is room for both, stacked otherwise. Sized to the
          panel itself rather than the viewport, since the category list shares the row. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-x-6 gap-y-5 p-4">
        <ApproverList
          category={category}
          categories={categories}
          stage="request"
          marker="A"
          title="Request approval"
          empty="No approvers yet. Requesters can’t pick this category until you add one."
        />
        <ApproverList
          category={category}
          categories={categories}
          stage="final"
          marker="B"
          title="Final approval"
          empty="No approvers. A Super Admin gives the final approval."
          emptyIsFine
        />
      </div>

      <ReadBack open={category.is_active} requestSteps={requestSteps} finalSteps={finalSteps} />
    </section>
  );
}

/** Where the two lists sit in a purchase: ask → A → quotes → B → order. */
function JourneyStrip({ hasRequest, hasFinal }: { hasRequest: boolean; hasFinal: boolean }) {
  const points: Array<{ key: string; node: string; label: string; set?: boolean; warn?: boolean }> = [
    { key: 'ask', node: '', label: 'Requester asks' },
    { key: 'a', node: 'A', label: 'Request approval', set: hasRequest, warn: !hasRequest },
    { key: 'quotes', node: '', label: 'Quotes compared' },
    { key: 'b', node: 'B', label: hasFinal ? 'Final approval' : 'Final approval (Super Admin)', set: hasFinal },
    { key: 'order', node: '', label: 'Order created' },
  ];
  return (
    <div className="overflow-x-auto border-b bg-muted/30 px-4 py-3" aria-label="Where each list sits in a purchase">
      <ol className="flex min-w-max items-start">
        {points.map((p, i) => (
          <li key={p.key} className="flex items-start">
            {i > 0 && <span aria-hidden className="mt-[13px] h-0.5 w-6 bg-border sm:w-10" />}
            <span className="flex w-24 flex-col items-center gap-1 text-center">
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold',
                  p.set
                    ? 'border-primary bg-primary text-primary-foreground'
                    : p.warn
                      ? 'border-amber-500 bg-background text-amber-700 dark:text-amber-400'
                      : 'border-border bg-background text-muted-foreground'
                )}
              >
                {p.node || <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              <span className={cn('text-[11px] leading-tight', p.set ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {p.label}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The chain read back as plain sentences, rebuilt on every change. */
function ReadBack({
  open,
  requestSteps,
  finalSteps,
}: {
  open: boolean;
  requestSteps: CategoryStep[];
  finalSteps: CategoryStep[];
}) {
  const lines: string[] = [];
  if (!requestSteps.length) {
    lines.push('Nobody approves the items yet, so requesters can’t pick this category.');
  } else {
    requestSteps.forEach((s, i) => lines.push(`${i === 0 ? '' : 'Then '}${s.label} approves the items asked for.`));
  }
  lines.push('Quotations are collected and compared.');
  if (!finalSteps.length) {
    lines.push('A Super Admin approves the chosen vendors and prices, and the purchase order is created.');
  } else {
    finalSteps.forEach((s, i) =>
      lines.push(
        `${i === 0 ? '' : 'Then '}${s.label} approves the chosen vendors and prices${
          i === finalSteps.length - 1 ? ', and the purchase order is created' : ''
        }.`
      )
    );
  }
  return (
    <div className="mx-4 mb-4 space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <h3 className="text-sm font-semibold">What happens to a request in this category</h3>
      {!open && (
        <p className="text-xs text-amber-700 dark:text-amber-400">Hidden: requesters can’t pick this category for new requests.</p>
      )}
      <ol className="list-decimal space-y-0.5 pl-5 text-sm">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
    </div>
  );
}

function ApproverList({
  category,
  categories,
  stage,
  marker,
  title,
  empty,
  emptyIsFine = false,
}: {
  category: ProcurementCategory;
  categories: ProcurementCategory[];
  stage: ApprovalStage;
  /** "A" / "B" — matches the journey strip above. */
  marker: string;
  title: string;
  empty: string;
  /** An empty final list falls back to the Super Admin, so it is not a warning. */
  emptyIsFine?: boolean;
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
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-bold">
          {marker} · {title}
        </h3>
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
        // Numbered nodes joined by a line: the order is the point of the list.
        <ol>
          {steps.map((s, i) => (
            <li
              key={`${s.id ?? 'new'}-${i}`}
              className={cn('relative flex items-center gap-2.5 py-1.5', dragFrom === i && 'opacity-50')}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom !== null) move(dragFrom, i);
                setDragFrom(null);
              }}
            >
              {i < steps.length - 1 && (
                <span aria-hidden className="absolute bottom-[-6px] left-[13px] top-[34px] w-0.5 bg-primary/20" />
              )}
              <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{s.label}</span>
                <span className="truncate text-xs text-muted-foreground">{stepDetail(s)}</span>
              </div>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0 || saveSteps.isPending}
                  aria-label={`Move ${s.label} up`}
                  title="Move up"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === steps.length - 1 || saveSteps.isPending}
                  aria-label={`Move ${s.label} down`}
                  title="Move down"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                {/* Drag stays as a desktop extra; the arrows above work everywhere. */}
                <span
                  draggable={!saveSteps.isPending}
                  onDragStart={() => setDragFrom(i)}
                  aria-hidden
                  title="Drag to reorder"
                  className="hidden h-8 w-8 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing sm:flex"
                >
                  <GripVertical className="h-4 w-4" />
                </span>
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
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p
          className={cn(
            'rounded-md px-3 py-2 text-xs',
            emptyIsFine
              ? 'bg-muted/50 text-muted-foreground'
              : 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
          )}
        >
          {empty}
        </p>
      )}

      {steps.length < 10 && (
        <div className="[&_button]:h-9 [&_button]:border-dashed [&_button]:bg-background [&_button]:text-sm">
          <PersonPicker value={null} onChange={add} placeholder="+ Add approver by name or email" />
        </div>
      )}
    </div>
  );
}
