'use client';

// Step 1 — unit & chapter scope (PRD §3.1 / §3.3). Chapters come from
// exam_topic_map. For English the grammar-general pool (items anchored to no
// lesson) is shown separately and is never excluded by a chapter tick
// (PRD English §4.4).

import { useEffect, useRef } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { ExamReference, PaperParams, SelectionMode } from '@/lib/services/onemark/paper-service';

const MODES: { value: SelectionMode; label: string; hint: string }[] = [
  { value: 'single', label: 'Single chapter', hint: 'One chapter only' },
  { value: 'multi', label: 'Chosen chapters', hint: 'Tick the chapters you want' },
  { value: 'unit', label: 'By unit', hint: 'Whole units' },
  { value: 'volume', label: 'By volume', hint: 'Volume 1 (units 1–5) or Volume 2 (6–11)' },
  { value: 'full_syllabus', label: 'Full unit list', hint: 'Every chapter' },
];

// Only Physics has volumes (PRD Physics §1: "Volume 1 (Units 1–5) and
// Volume 2 (Units 6–11)"); the English PRD's scope modes have no volume.
// Volume 1 is matched by the unit's key, not its position: the seed tags
// onemark_phy_u01..u05 "(Vol. 1)", and halving the list put Unit 6 (Ray
// Optics) in Volume 1 and moved again whenever a unit was retired.
// Volume 2 is an explicit list too (seed 20260917111500 tags u06..u11
// "(Vol. 2)"): a topic in neither list belongs to neither volume, rather than
// landing in Volume 2 by default.
const VOLUME_EXAM_KEY = 'tn_hsc_physics';
const PHYSICS_VOLUME_1 = new Set(['onemark_phy_u01', 'onemark_phy_u02', 'onemark_phy_u03', 'onemark_phy_u04', 'onemark_phy_u05']);
const PHYSICS_VOLUME_2 = new Set(['onemark_phy_u06', 'onemark_phy_u07', 'onemark_phy_u08', 'onemark_phy_u09', 'onemark_phy_u10', 'onemark_phy_u11']);

interface StepScopeProps {
  draft: PaperParams;
  patch: (p: Partial<PaperParams>) => void;
  title: string;
  setTitle: (t: string) => void;
  reference: ExamReference;
  disabled: boolean;
}

export function StepScope({ draft, patch, title, setTitle, reference, disabled }: StepScopeProps) {
  const isEnglish = reference.exam.config_key === 'tn_hsc_english';
  const hasVolumes = reference.exam.config_key === VOLUME_EXAM_KEY;
  const modes = hasVolumes ? MODES : MODES.filter((m) => m.value !== 'volume');
  // A draft saved in a mode this subject does not offer is shown as its
  // chosen chapters, so the radio group is never left with nothing picked.
  const modeOffered = modes.some((m) => m.value === draft.selection_mode);
  const shownMode = modeOffered ? draft.selection_mode : 'multi';
  // ...and the draft itself is moved to that mode (same chapters), once, so
  // what the next save persists is what the teacher sees — otherwise an
  // untouched English draft would be saved back as 'volume'.
  const normalised = useRef(false);
  useEffect(() => {
    if (modeOffered || disabled || normalised.current) return;
    normalised.current = true;
    patch({ selection_mode: 'multi', chapter_ids: draft.chapter_ids });
  }, [modeOffered, disabled, patch, draft.chapter_ids]);
  const chapters = reference.chapters;
  const selected = new Set(draft.chapter_ids);
  const inScope = selected.size === 0 ? chapters.reduce((s, c) => s + c.pool_count, 0) : chapters.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.pool_count, 0);

  function setMode(mode: SelectionMode) {
    if (mode === 'full_syllabus') patch({ selection_mode: mode, chapter_ids: [] });
    else if (mode === 'volume') patch({ selection_mode: mode, chapter_ids: volumeChapterIds(1) });
    else if (mode === 'single') patch({ selection_mode: mode, chapter_ids: draft.chapter_ids.slice(0, 1) });
    else patch({ selection_mode: mode });
  }

  function toggle(id: string) {
    if (draft.selection_mode === 'single') {
      patch({ chapter_ids: [id] });
      return;
    }
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    patch({ chapter_ids: [...next], selection_mode: shownMode === 'full_syllabus' ? 'multi' : shownMode });
  }

  function volumeChapterIds(v: 1 | 2) {
    const keys = v === 1 ? PHYSICS_VOLUME_1 : PHYSICS_VOLUME_2;
    return chapters.filter((c) => keys.has(c.config_key)).map((c) => c.id);
  }

  function volume(v: 1 | 2) {
    patch({ selection_mode: 'volume', chapter_ids: volumeChapterIds(v) });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="onemark-title">Paper title</Label>
        <Input id="onemark-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={disabled} />
      </div>

      <div className="space-y-2">
        <Label>Selection mode</Label>
        <RadioGroup
          value={shownMode}
          onValueChange={(v) => setMode(v as SelectionMode)}
          className={['grid gap-2 sm:grid-cols-2', hasVolumes ? 'lg:grid-cols-5' : 'lg:grid-cols-4'].join(' ')}
          disabled={disabled}
        >
          {modes.map((m) => (
            <label
              key={m.value}
              className={[
                'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                shownMode === m.value ? 'border-[#0b6d41] bg-[#0b6d41]/5' : 'border-border hover:bg-muted',
              ].join(' ')}
            >
              <RadioGroupItem value={m.value} className="mt-0.5" />
              <span>
                <span className="block font-medium text-foreground">{m.label}</span>
                <span className="block text-xs text-muted-foreground">{m.hint}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
        {shownMode === 'volume' && (
          <div className="flex gap-2">
            <button type="button" disabled={disabled} onClick={() => volume(1)} className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted">
              Volume 1
            </button>
            <button type="button" disabled={disabled} onClick={() => volume(2)} className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted">
              Volume 2
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Chapters</Label>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {selected.size === 0 ? 'all chapters' : `${selected.size} selected`} · {inScope} approved questions in scope
          </span>
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {chapters.map((c) => {
            const on = selected.size === 0 ? draft.selection_mode === 'full_syllabus' : selected.has(c.id);
            return (
              <li key={c.id}>
                <label
                  className={[
                    'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm',
                    on ? 'border-[#0b6d41]/60 bg-[#0b6d41]/5' : 'border-border hover:bg-muted',
                    draft.selection_mode === 'full_syllabus' ? 'opacity-80' : '',
                  ].join(' ')}
                >
                  <Checkbox
                    checked={on}
                    disabled={disabled || draft.selection_mode === 'full_syllabus'}
                    onCheckedChange={() => toggle(c.id)}
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground">{c.display_name}</span>
                  <span className={['font-mono text-xs tabular-nums', c.pool_count === 0 ? 'text-destructive' : 'text-muted-foreground'].join(' ')}>
                    {c.pool_count}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {chapters.length === 0 && (
          <p className="text-sm text-muted-foreground">No chapters are mapped to this subject yet.</p>
        )}
      </div>

      {isEnglish && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <span className="font-medium text-foreground">Grammar-general pool: {reference.chapter_agnostic_count} questions.</span>{' '}
          <span className="text-muted-foreground">
            These are anchored to no lesson (prepositions, linkers, question tags, spelling…). They stay eligible whatever chapters you tick — a board paper is never only synonyms and antonyms.
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Approved questions only. Drafts awaiting a Senior Learner&apos;s tick are not counted and are never drawn.
      </p>
    </div>
  );
}
