'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

/** One list of one scope: `institutionId` null = the common approvers, set = that college's own (asked first). */
export const stepsOf = (c: ProcurementCategory, stage: ApprovalStage, institutionId: string | null = null) =>
  (c.steps ?? []).filter((s) => (s.stage ?? 'request') === stage && (s.institution_id ?? null) === institutionId);

/** Colleges that have approvers of their own for this category. */
export const customisedColleges = (c: ProcurementCategory): string[] => [
  ...new Set((c.steps ?? []).map((s) => s.institution_id).filter((id): id is string => !!id)),
];

/**
 * The selected category, top to bottom:
 *   header        — name (click to rename) · Open for requests
 *   college picker — one dropdown: Common (all colleges) · colleges with their own approvers · add a college
 *   A and B       — the two approver lists, side by side when there is room
 *       A Request approval — approves the items asked for
 *       B Final approval   — approves the vendors and prices chosen after quotations
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
  // null = the common approvers. A college picked under "Add approvers for a college" stays in
  // the dropdown's own group until its first approver is saved.
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
          empty={
            scope
              ? 'No college approvers. Requests go straight to the common approvers.'
              : customisedColleges(category).length > 0
                ? 'No common approvers. Only colleges with their own approvers (see the college list above) can pick this category.'
                : 'No common approvers yet. Requesters can’t pick this category until it has at least one.'
          }
        />
        <ApproverList
          category={category}
          categories={categories}
          institutionId={scope}
          stage="final"
          marker="B"
          title="Final approval"
          empty={
            scope
              ? 'No college approvers. The common final approvers decide.'
              : 'No common approvers. A Super Admin gives the final approval when a college has none either.'
          }
          emptyIsFine
        />
      </div>
    </section>
  );
}

/**
 * Which list is being edited: the common approvers (every college) or one college's own.
 * A college's approvers are asked first, then the common approvers — never instead of them.
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
  // Other colleges already set up for this category; their two lists can be copied here.
  const copyColleges = scope ? customisedColleges(category).filter((id) => id !== scope) : [];

  /** Replace this college's request and final lists with another college's (Undo restores them). */
  const copyCollege = async (fromId: string) => {
    if (!scope) return;
    const fresh = (stage: ApprovalStage, id: string) =>
      // New rows for this college: never the source's step ids, or saving moves its rows here.
      stepsOf(category, stage, id).map(({ id: _id, ...st }) => ({ ...st, institution_id: scope }));
    const before = { request: fresh('request', scope), final: fresh('final', scope) };
    const save = (lists: { request: CategoryStep[]; final: CategoryStep[] }) =>
      Promise.all(
        (['request', 'final'] as const).map((stage) =>
          saveSteps.mutateAsync({ categoryId: category.id, steps: lists[stage], stage, institutionId: scope })
        )
      );
    try {
      await save({ request: fresh('request', fromId), final: fresh('final', fromId) });
      onDraft(scope);
      const hadAny = before.request.length + before.final.length > 0;
      toast.success(
        `Copied ${nameOf(fromId)}’s approvers to ${nameOf(scope)}`,
        hadAny
          ? { action: { label: 'Undo', onClick: () => void save(before).then(() => toast.success('Restored')) } }
          : undefined
      );
    } catch (e) {
      toast.error(errorMessage(e, 'Could not copy'));
    }
  };

  const removeChain = async () => {
    if (!scope) return;
    try {
      await saveSteps.mutateAsync({ categoryId: category.id, steps: [], stage: 'request', institutionId: scope });
      await saveSteps.mutateAsync({ categoryId: category.id, steps: [], stage: 'final', institutionId: scope });
      toast.success(`${nameOf(scope)} now uses only the common approvers`);
      onRemoved(scope);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not remove it'));
    }
  };

  // One dropdown instead of a button per college: with ten colleges the buttons wrapped to four rows.
  const COMMON = '__common';
  const pick = (v: string) => {
    if (v === COMMON) onScope(null);
    else if (tabs.includes(v)) onScope(v);
    else onDraft(v); // a college without approvers yet: shown until its first one is saved
  };

  return (
    // One row: which list · copy from another college · remove. No help text; the greyed
    // "Then the common approvers" under each list already shows how the two combine.
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
      <span className="text-sm font-medium text-muted-foreground">Approvers for</span>
      <Select value={scope ?? COMMON} onValueChange={pick}>
        <SelectTrigger className="h-9 w-full bg-background text-sm sm:w-[360px]" aria-label="Which approvers to edit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={COMMON}>Common (all colleges)</SelectItem>
          {tabs.length > 0 && (
            <SelectGroup>
              <SelectLabel>Colleges with their own approvers</SelectLabel>
              {tabs.map((id) => (
                <SelectItem key={id} value={id}>
                  {nameOf(id)}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {addable.length > 0 && (
            <SelectGroup>
              <SelectLabel>Add approvers for a college</SelectLabel>
              {addable.map((i) => (
                <SelectItem key={i.institution_id} value={i.institution_id}>
                  {i.institution_name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      {scope !== null && copyColleges.length > 0 && (
        <Select value="" onValueChange={(id) => void copyCollege(id)}>
          <SelectTrigger
            className="h-9 w-auto gap-2 bg-background text-sm"
            aria-label={`Copy another college's approvers to ${nameOf(scope)}`}
          >
            <SelectValue placeholder="Copy from college…" />
          </SelectTrigger>
          <SelectContent>
            {copyColleges.map((id) => (
              <SelectItem key={id} value={id}>
                {nameOf(id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {hasOwn && (
        <button
          type="button"
          onClick={() => void removeChain()}
          disabled={saveSteps.isPending}
          aria-label={`Remove ${nameOf(scope!)}’s approvers`}
          className="ml-auto h-9 rounded-md px-2 text-sm text-destructive hover:bg-destructive/10"
        >
          Remove
        </button>
      )}
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
  /** null = the common approvers; set = that college's own (the common ones are shown after). */
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
  // In a college tab the common approvers follow; shown read-only so the whole route is visible.
  const commonAfter = institutionId ? stepsOf(category, stage) : [];
  const saveSteps = useSaveCategorySteps();
  const { institutions } = useUserInstitutionAccess();
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

  // Copy sources for this one list: other colleges' lists in this category, and other
  // categories' common lists. This category's own common list is not offered in a college
  // tab: those approvers are asked anyway, so copying them would ask them twice.
  const nameOf = (id: string) => institutions.find((i) => i.institution_id === id)?.institution_name ?? 'College';
  const collegeSources = customisedColleges(category)
    .filter((id) => id !== institutionId && stepsOf(category, stage, id).length > 0)
    .map((id) => ({ key: `college:${id}`, name: nameOf(id), steps: stepsOf(category, stage, id) }));
  const categorySources = categories
    .filter((c) => c.id !== category.id && stepsOf(c, stage).length > 0)
    .map((c) => ({ key: `category:${c.id}`, name: c.name, steps: stepsOf(c, stage) }));
  const copyFrom = (key: string) => {
    const source = [...collegeSources, ...categorySources].find((x) => x.key === key);
    if (!source) return;
    void persist(
      // New rows for this scope: never the source's step ids, or saving moves its rows here.
      source.steps.map(({ id: _id, ...s }) => ({ ...s, institution_id: institutionId })),
      `Copied ${title.toLowerCase()} from ${source.name}`,
      steps.length ? steps : undefined
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-bold">
          {marker} · {title}
        </h3>
        {collegeSources.length + categorySources.length > 0 && (
          <Select value="" onValueChange={copyFrom}>
            <SelectTrigger className="h-8 w-auto gap-2 bg-background text-xs" aria-label={`Copy ${title} from another college or category`}>
              <SelectValue placeholder="Copy from…" />
            </SelectTrigger>
            <SelectContent>
              {collegeSources.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Another college</SelectLabel>
                  {collegeSources.map((x) => (
                    <SelectItem key={x.key} value={x.key}>
                      {x.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {categorySources.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Another category (common)</SelectLabel>
                  {categorySources.map((x) => (
                    <SelectItem key={x.key} value={x.key}>
                      {x.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
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

      {commonAfter.length > 0 && (
        <div className="mt-1 border-t border-dashed pt-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Then the common approvers</p>
          <ol aria-label={`Common ${title.toLowerCase()}, asked after these`}>
            {commonAfter
              // A named person already on the college list is asked once, at the college position.
              .filter((s) => !(s.approver_kind === 'user' && steps.some((o) => o.user_id === s.user_id)))
              .map((s, i) => (
                <li key={s.id ?? i} className="flex items-center gap-2.5 py-1 opacity-70">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/40 text-xs font-bold text-primary">
                    {steps.length + i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{s.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{stepDetail(s)}</span>
                  </div>
                </li>
              ))}
          </ol>
        </div>
      )}
    </div>
  );
}
