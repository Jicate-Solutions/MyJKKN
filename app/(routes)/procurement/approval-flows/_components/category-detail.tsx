'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
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

/** One list of one scope: `institutionId` null = the default chain, set = that college's own chain. */
export const stepsOf = (c: ProcurementCategory, stage: ApprovalStage, institutionId: string | null = null) =>
  (c.steps ?? []).filter((s) => (s.stage ?? 'request') === stage && (s.institution_id ?? null) === institutionId);

/** Colleges that have a chain of their own for this category. */
export const customisedColleges = (c: ProcurementCategory): string[] => [
  ...new Set((c.steps ?? []).map((s) => s.institution_id).filter((id): id is string => !!id)),
];

/**
 * The selected category, top to bottom:
 *   header        — name (click to rename) · Open for requests
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
  // null = the default chain. A college picked with "Add a college" is only a tab until its
  // first approver is saved.
  const [scope, setScope] = useState<string | null>(null);
  const [draftColleges, setDraftColleges] = useState<string[]>([]);

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

  const requestSteps = stepsOf(category, 'request', scope);
  const finalSteps = stepsOf(category, 'final', scope);

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

      <CollegeBar
        category={category}
        scope={scope}
        onScope={setScope}
        draftColleges={draftColleges}
        onDraft={(id) => {
          setDraftColleges((d) => (d.includes(id) ? d : [...d, id]));
          setScope(id);
        }}
        onRemoved={(id) => {
          setDraftColleges((d) => d.filter((x) => x !== id));
          setScope(null);
        }}
      />

      {/* Side by side when there is room for both, stacked otherwise. Sized to the
          panel itself rather than the viewport, since the category list shares the row. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-x-6 gap-y-5 p-4">
        <ApproverList
          category={category}
          categories={categories}
          institutionId={scope}
          stage="request"
          marker="A"
          title="Request approval"
          empty="No approvers yet. Requesters can’t pick this category until you add one."
        />
        <ApproverList
          category={category}
          categories={categories}
          institutionId={scope}
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

/**
 * Which chain is being edited: the default (every college) or one college's own.
 * A college chain replaces the whole default for that college; colleges without one use the default.
 */
function CollegeBar({
  category,
  scope,
  onScope,
  draftColleges,
  onDraft,
  onRemoved,
}: {
  category: ProcurementCategory;
  scope: string | null;
  onScope: (id: string | null) => void;
  draftColleges: string[];
  onDraft: (id: string) => void;
  onRemoved: (id: string) => void;
}) {
  const { institutions } = useUserInstitutionAccess();
  const saveSteps = useSaveCategorySteps();
  const nameOf = (id: string) => institutions.find((i) => i.institution_id === id)?.institution_name ?? 'College';
  const tabs = [...new Set([...customisedColleges(category), ...draftColleges])];
  const addable = institutions.filter((i) => !tabs.includes(i.institution_id));
  const hasOwn = scope !== null && customisedColleges(category).includes(scope);
  const requestMissing = scope !== null && stepsOf(category, 'request', scope).length === 0;

  const removeChain = async () => {
    if (!scope) return;
    try {
      await saveSteps.mutateAsync({ categoryId: category.id, steps: [], stage: 'request', institutionId: scope });
      await saveSteps.mutateAsync({ categoryId: category.id, steps: [], stage: 'final', institutionId: scope });
      toast.success(`${nameOf(scope)} now uses the default chain`);
      onRemoved(scope);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not remove it'));
    }
  };

  const chip = (active: boolean) =>
    cn(
      'h-9 shrink-0 rounded-md border px-3 text-sm',
      active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
    );

  return (
    <div className="space-y-2 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Which colleges this chain is for">
        <button type="button" role="tab" aria-selected={scope === null} className={chip(scope === null)} onClick={() => onScope(null)}>
          All colleges (default)
        </button>
        {tabs.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={scope === id} className={chip(scope === id)} onClick={() => onScope(id)}>
            {nameOf(id)}
          </button>
        ))}
        {addable.length > 0 && (
          <Select value="" onValueChange={onDraft}>
            <SelectTrigger className="h-9 w-auto gap-1.5 border-dashed bg-background text-sm" aria-label="Add a college chain">
              <Plus className="h-4 w-4" />
              <SelectValue placeholder="Add a college" />
            </SelectTrigger>
            <SelectContent>
              {addable.map((i) => (
                <SelectItem key={i.institution_id} value={i.institution_id}>
                  {i.institution_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {scope === null ? (
        <p className="text-xs text-muted-foreground">
          {tabs.length > 0
            ? `Used by every college except ${tabs.length === 1 ? 'the one' : 'the ones'} with a tab here.`
            : 'Used by every college. Add a college to give it different approvers.'}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn('text-xs', requestMissing ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
            {requestMissing
              ? `Add request approvers first. Until then ${nameOf(scope)} uses the default chain.`
              : `Requests from ${nameOf(scope)} use this chain instead of the default (both lists).`}
          </p>
          {hasOwn && (
            <button
              type="button"
              onClick={() => void removeChain()}
              disabled={saveSteps.isPending}
              className="h-8 rounded-md px-2 text-xs text-destructive hover:bg-destructive/10"
            >
              Use the default for {nameOf(scope)}
            </button>
          )}
        </div>
      )}
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
  institutionId,
  stage,
  marker,
  title,
  empty,
  emptyIsFine = false,
}: {
  category: ProcurementCategory;
  categories: ProcurementCategory[];
  /** null = the default chain; set = that college's own chain. */
  institutionId: string | null;
  stage: ApprovalStage;
  /** "A" / "B" */
  marker: string;
  title: string;
  empty: string;
  /** An empty final list falls back to the Super Admin, so it is not a warning. */
  emptyIsFine?: boolean;
}) {
  const steps = stepsOf(category, stage, institutionId);
  const saveSteps = useSaveCategorySteps();
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const persist = async (next: CategoryStep[], done: string, undo?: CategoryStep[]) => {
    try {
      await saveSteps.mutateAsync({ categoryId: category.id, steps: next, stage, institutionId });
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
      institution_id: institutionId,
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

  // "Default chain" (this category) is offered inside a college tab; other categories copy their default.
  const DEFAULT_KEY = '__default';
  const copySources: Array<{ id: string; name: string }> = [
    ...(institutionId && stepsOf(category, stage).length > 0 ? [{ id: DEFAULT_KEY, name: 'Default chain' }] : []),
    ...categories.filter((c) => c.id !== category.id && stepsOf(c, stage).length > 0).map((c) => ({ id: c.id, name: c.name })),
  ];
  const copyFrom = (sourceId: string) => {
    const source = sourceId === DEFAULT_KEY ? category : categories.find((c) => c.id === sourceId);
    const from = source ? stepsOf(source, stage) : [];
    if (!from.length) return;
    void persist(
      // New rows for this scope: never the source's step ids, or saving moves its rows here.
      from.map(({ id: _id, ...s }) => ({ ...s, institution_id: institutionId })),
      `Copied ${title.toLowerCase()} from ${sourceId === DEFAULT_KEY ? 'the default chain' : source!.name}`,
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
