'use client';

// OneMark unit list — one section per subject, never one flat list.
//
// The ordering key is the position the API sends, which is the subject's own
// exam_topic_map.sort_order. This component never sorts and never reads a
// global order: the server already ordered each section, and re-ordering is a
// PATCH that swaps two positions inside one subject.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Check, Languages, Layers, Pencil, Plus, RotateCcw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  TAMIL_TBD,
  type SubjectUnits,
  type UnitRow,
  type UnitsPayload,
} from '@/lib/services/onemark/units-service';

const QUERY_KEY = ['onemark-units'] as const;

async function loadUnits(): Promise<UnitsPayload> {
  const res = await fetch('/api/foundation/onemark/units');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'The unit list could not be loaded');
  return body as UnitsPayload;
}

interface PatchBody {
  display_name?: string;
  description?: string | null;
  is_active?: boolean;
  move?: 'up' | 'down';
}

async function patchUnit(topicId: string, body: PatchBody) {
  const res = await fetch(`/api/foundation/onemark/units/${topicId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'The change could not be saved');
  return json;
}

export function UnitsBoard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: loadUnits,
    staleTime: 30 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const patch = useMutation({
    mutationFn: ({ topicId, body }: { topicId: string; body: PatchBody }) => patchUnit(topicId, body),
    onSuccess: () => invalidate(),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'The change could not be saved'),
  });

  const add = useMutation({
    mutationFn: async (body: { exam_definition_id: string; display_name: string; description?: string }) => {
      const res = await fetch('/api/foundation/onemark/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'The unit could not be added');
      return json as { display_name: string; position: number };
    },
    onSuccess: (u) => {
      // Deliberately no number. The API returns the STORED position
      // (exam_topic_map.sort_order), and the badge the user is about to look at
      // shows the unit's place among the LIVE units — the two differ whenever
      // an earlier unit is retired, so quoting the stored one made the toast
      // contradict the screen it was announcing (review finding, 2026-09-08).
      toast.success(`Added "${u.display_name}" to the end of the unit list`);
      invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'The unit could not be added'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>The unit list could not be loaded</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{error instanceof Error ? error.message : 'Something went wrong.'}</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const subjects = data?.subjects ?? [];

  if (subjects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No OneMark subject is switched on yet, so there is no unit list to show. A subject is a row in
        the exam catalogue; once one is active its units appear here.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <BankSummary subjects={subjects} />
      {subjects.map((s) => (
        <SubjectSection
          key={s.exam_definition_id}
          subject={s}
          busy={patch.isPending || add.isPending}
          onPatch={(topicId, body) => patch.mutate({ topicId, body })}
          onAdd={(display_name, description) =>
            add.mutate({ exam_definition_id: s.exam_definition_id, display_name, description })
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function BankSummary({ subjects }: { subjects: SubjectUnits[] }) {
  const total = subjects.reduce((n, s) => n + s.items_total, 0);
  const active = subjects.reduce((n, s) => n + s.items_active, 0);
  const awaiting = subjects.reduce((n, s) => n + s.items_awaiting_review, 0);
  const units = subjects.reduce((n, s) => n + s.units.filter((u) => u.is_active).length, 0);

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Units in use" value={units} />
        <Stat label="Questions in the bank" value={total} />
        <Stat label="Approved and live" value={active} />
        <Stat label="Waiting for a tick" value={awaiting} />
      </div>
      {total === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          The bank is empty. Units can be organised now; questions arrive from an ingested past paper or
          an AI drafting request and appear against their unit here once approved.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface SubjectSectionProps {
  subject: SubjectUnits;
  busy: boolean;
  onPatch: (topicId: string, body: PatchBody) => void;
  onAdd: (displayName: string, description?: string) => void;
}

function SubjectSection({ subject, busy, onPatch, onAdd }: SubjectSectionProps) {
  const [adding, setAdding] = useState(false);
  const live = useMemo(() => subject.units.filter((u) => u.is_active), [subject.units]);
  const retired = useMemo(() => subject.units.filter((u) => !u.is_active), [subject.units]);
  const movable = live.filter((u) => !u.is_sentinel);

  return (
    <section aria-labelledby={`subject-${subject.exam_definition_id}`} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
        <div>
          <h2
            id={`subject-${subject.exam_definition_id}`}
            className="flex items-center gap-2 text-lg font-semibold tracking-tight"
          >
            <Layers className="h-4 w-4 text-[#0b6d41]" aria-hidden />
            {subject.short_name}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {live.length} {live.length === 1 ? 'unit' : 'units'} in use
            {retired.length > 0 ? ` · ${retired.length} retired` : ''} · {subject.items_total}{' '}
            {subject.items_total === 1 ? 'question' : 'questions'} in the bank
            {subject.items_awaiting_review > 0
              ? ` · ${subject.items_awaiting_review} waiting for a tick`
              : ''}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)} disabled={busy}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add a unit
        </Button>
      </div>

      {adding && (
        <AddUnitForm
          busy={busy}
          onCancel={() => setAdding(false)}
          onSubmit={(name, description) => {
            onAdd(name, description);
            setAdding(false);
          }}
        />
      )}

      {live.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {subject.short_name} has no units yet. Add the first one — a question cannot be written
          against a subject that has no unit to hold it.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {live.map((u, i) => (
            <UnitLine
              key={u.topic_id}
              unit={u}
              busy={busy}
              canMoveUp={!u.is_sentinel && movable.findIndex((m) => m.topic_id === u.topic_id) > 0}
              canMoveDown={
                !u.is_sentinel &&
                movable.findIndex((m) => m.topic_id === u.topic_id) > -1 &&
                movable.findIndex((m) => m.topic_id === u.topic_id) < movable.length - 1
              }
              ordinal={i + 1}
              onPatch={onPatch}
            />
          ))}
        </ul>
      )}

      {retired.length > 0 && (
        <details className="rounded-xl border border-dashed border-border">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-muted-foreground">
            {retired.length} retired {retired.length === 1 ? 'unit' : 'units'} — hidden from every
            picker, questions kept
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {retired.map((u) => (
              <UnitLine key={u.topic_id} unit={u} busy={busy} canMoveUp={false} canMoveDown={false} onPatch={onPatch} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function AddUnitForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (displayName: string, description?: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <form
      className="space-y-3 rounded-xl border border-[#0b6d41]/30 bg-[#0b6d41]/[0.04] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit(name.trim(), description.trim() || undefined);
        setName('');
        setDescription('');
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="new-unit-name" className="text-xs font-medium">
          Unit name
        </label>
        <Input
          id="new-unit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Unit 12: Semiconductor Devices"
          maxLength={200}
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="new-unit-desc" className="text-xs font-medium">
          Tamil name or note <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="new-unit-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tamil unit name, or a note saying what this unit covers"
          rows={2}
        />
        <p className="text-[11px] text-muted-foreground">
          Written in Tamil this becomes the unit&apos;s Tamil name; written in English it is shown as a
          note under the unit. Either way it stays editable afterwards.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        The unit is added to the end of this subject&apos;s unit list and mapped to the subject in the
        same action — an unmapped unit would be invisible to the paper wizard and to the drafter.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          <Check className="mr-1.5 h-3.5 w-3.5" />
          Add unit
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

interface UnitLineProps {
  unit: UnitRow;
  busy: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  ordinal?: number;
  onPatch: (topicId: string, body: PatchBody) => void;
}

function UnitLine({ unit, busy, canMoveUp, canMoveDown, ordinal, onPatch }: UnitLineProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(unit.display_name);
  const [draftDesc, setDraftDesc] = useState(unit.description ?? '');

  // The badge shows the unit's place among the LIVE units of this subject; the
  // stored exam_topic_map.sort_order can be a larger number whenever an earlier
  // unit is retired. The tooltip used to quote the stored value while the badge
  // showed the ordinal, so the two openly disagreed the moment anything was
  // retired — retire Physics unit 5 and unit 6 rendered badge "5", tooltip
  // "Position 6" (review finding, 2026-09-08). One number, said once.
  const positionTitle = unit.is_sentinel
    ? 'Not anchored to a lesson — always last in the unit list'
    : ordinal !== undefined
      ? `Unit ${ordinal} of this subject's unit list`
      : 'Retired — it keeps its place for when it is brought back';

  const dirty = draftName.trim() !== unit.display_name || draftDesc.trim() !== (unit.description ?? '');

  return (
    <li className={cn('flex flex-wrap items-start gap-3 px-4 py-3', !unit.is_active && 'opacity-60')}>
      <span
        className="mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-border px-1.5 font-mono text-[11px] tabular-nums text-muted-foreground"
        title={positionTitle}
      >
        {unit.is_sentinel ? '—' : (ordinal ?? '·')}
      </span>

      <div className="min-w-0 flex-1">
        {editing ? (
          // Both fields are editable here, and that is the point of the screen.
          // Spec item 4 asks that unreviewed Tamil names be marked "so the
          // review can actually be run from this screen" — until this review
          // (2026-09-08) the badge said which names needed checking and there
          // was no control anywhere that could correct one. The PATCH route had
          // accepted `description` all along; nothing ever sent it.
          <div className="space-y-2">
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={200}
              className="h-8 max-w-md"
              aria-label="Unit name"
            />
            <Textarea
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              rows={2}
              className="max-w-md text-sm"
              aria-label="Tamil name or note"
              placeholder="Tamil unit name, or a note saying what this unit covers"
            />
            <p className="text-[11px] text-muted-foreground">
              Written in Tamil, this is shown as the unit&apos;s Tamil name. Written in English, it is
              shown as a note under the unit. Clearing it removes both.
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8"
                disabled={busy || !draftName.trim() || !dirty}
                onClick={() => {
                  onPatch(unit.topic_id, {
                    display_name: draftName.trim(),
                    description: draftDesc.trim() || null,
                  });
                  setEditing(false);
                }}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => {
                  setDraftName(unit.display_name);
                  setDraftDesc(unit.description ?? '');
                  setEditing(false);
                }}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm font-medium text-foreground">{unit.display_name}</div>
        )}

        {/*
          The note line. `description` was in the payload and rendered NOWHERE
          (review finding, 2026-09-08) — so all seven English rows, whose only
          content line lives in that field ("Prose: A Nice Cup of Tea (George
          Orwell) · Poem: All the World's a Stage · ...", seeded by
          20260917111500), displayed "[TAMIL_TBD] no Tamil name yet" and never
          showed what the unit actually contains. Worse, the add form invited a
          note and then swallowed it silently. A non-Tamil description is a
          note; a Tamil one is the Tamil name, rendered below.
        */}
        {!editing && unit.description && !unit.tamil_name && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{unit.description}</p>
        )}

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {unit.tamil_name ? (
            <span className="inline-flex items-center gap-1">
              <Languages className="h-3 w-3" aria-hidden />
              <span lang="ta">{unit.tamil_name}</span>
              <span
                className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
                title="No native reviewer has signed this name off yet"
              >
                needs native review
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Languages className="h-3 w-3" aria-hidden />
              <span className="font-mono">{TAMIL_TBD}</span>
              <span className="text-muted-foreground/70">no Tamil name yet</span>
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums" title="Every question written for this unit">
            {unit.items_total} in bank
          </span>
          <span className="font-mono tabular-nums" title="Approved and reachable by a learner">
            {unit.items_active} live
          </span>
          <span className="font-mono tabular-nums" title="Drafts waiting for a Senior Learner's tick">
            {unit.items_awaiting_review} waiting
          </span>
          {unit.is_system && (
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px]">seeded</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {unit.is_active && !editing && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={busy || !canMoveUp}
              onClick={() => onPatch(unit.topic_id, { move: 'up' })}
              aria-label={`Move ${unit.display_name} up`}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={busy || !canMoveDown}
              onClick={() => onPatch(unit.topic_id, { move: 'down' })}
              aria-label={`Move ${unit.display_name} down`}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={busy}
              onClick={() => setEditing(true)}
              aria-label={`Edit ${unit.display_name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() => onPatch(unit.topic_id, { is_active: !unit.is_active })}
        >
          {unit.is_active ? (
            'Retire'
          ) : (
            <>
              <RotateCcw className="mr-1 h-3 w-3" />
              Bring back
            </>
          )}
        </Button>
      </div>
    </li>
  );
}
