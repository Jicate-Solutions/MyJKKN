'use client';

// ClinicalAnswerFormats — the authoring controls for the three progressive-vignette
// question types: multi_select, matching and sequencing.
//
// WHERE EACH ONE PUTS ITS ANSWER KEY
//   Every one of these writes its key somewhere the learner-facing RPC does NOT
//   return. fn_pde_get_case_questions strips options[].is_correct and
//   metadata.exclusion_rationale, and never returns correct_answer at all. So:
//
//     multi_select  key → options[].is_correct       rationale → metadata.exclusion_rationale
//     matching      key → correct_answer  {pair_id: "correct option"}
//                   display → metadata.match_pairs  [{id, left, options[]}]
//     sequencing    key → correct_answer  ["id","id",…] in TRUE order
//                   display → metadata.sequence_items [{id, text}] in the order
//                             a learner first sees them, which is deliberately
//                             NOT the answer order
//
//   Nothing a learner receives mid-attempt contains the key. That matters more
//   here than it used to: stages lock on these scores.

import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, ChevronUp, ChevronDown, Shuffle } from 'lucide-react';
import type {
  CreateClinicalQuestionInput,
  ClinicalMatchPair,
  ClinicalSequenceItem,
  MCQOption,
} from '@/types/pde';

interface EditorProps {
  index: number;
  question: CreateClinicalQuestionInput;
  onChange: (next: CreateClinicalQuestionInput) => void;
}

/** Short, collision-resistant enough for ids inside one question. */
function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseJsonObject(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// multi_select
// ────────────────────────────────────────────────────────────────────────────

/**
 * Choose-all-that-apply, plus the exclusion rationale that makes it teach
 * something: "exclude minor aphthous ulcers — they show no flaccid bullae,
 * desquamative sloughing or Nikolsky sign."
 *
 * Partial credit is (correct picked − wrong picked) / total correct, so ticking
 * everything does NOT earn full marks. Said on screen, because a Senior Learner
 * choosing how many distractors to include should know how it will be scored.
 */
export function MultiSelectEditor({ index, question, onChange }: EditorProps) {
  const options = question.options || [];

  const setOptions = (next: MCQOption[]) => onChange({ ...question, options: next });

  const addOption = () =>
    setOptions([...options, { id: newId('opt'), text: '', is_correct: false } as MCQOption]);

  const correctCount = options.filter((o) => o.is_correct).length;

  return (
    <div className="mb-3 border rounded p-3 bg-muted/30 space-y-3">
      <div className="flex justify-between items-center">
        <Label className="text-xs">Options — tick every one that is correct</Label>
        <Button type="button" size="sm" variant="outline" onClick={addOption}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add option
        </Button>
      </div>

      {options.map((opt, i) => (
        <div key={opt.id || i} className="flex gap-2 items-center">
          <input
            type="checkbox"
            aria-label={`Option ${i + 1} is correct`}
            checked={!!opt.is_correct}
            onChange={(e) => {
              const next = [...options];
              next[i] = { ...next[i], id: next[i].id || newId('opt'), is_correct: e.target.checked };
              setOptions(next);
            }}
          />
          <Input
            value={opt.text}
            onChange={(e) => {
              const next = [...options];
              next[i] = { ...next[i], id: next[i].id || newId('opt'), text: e.target.value };
              setOptions(next);
            }}
            placeholder={`Option ${i + 1}`}
            className="flex-1"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Remove option ${i + 1}`}
            onClick={() => setOptions(options.filter((_o, j) => j !== i))}
            className="text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">No options yet — add at least 2.</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {correctCount} of {options.length} marked correct. Learners score
          (correct picked − wrong picked) ÷ {correctCount || 'n'} correct, so ticking
          everything does not earn full marks.
        </p>
      )}

      <div>
        <Label className="text-xs">
          Exclusion rationale (why the tempting wrong option does not belong)
        </Label>
        <Textarea
          rows={2}
          value={question.metadata.exclusion_rationale || ''}
          onChange={(e) =>
            onChange({
              ...question,
              metadata: { ...question.metadata, exclusion_rationale: e.target.value },
            })
          }
          placeholder="e.g. Exclude minor aphthous ulcers — they show no flaccid bullae, desquamative sloughing or Nikolsky sign."
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Held back during the attempt (it names the distractor) and shown to the learner
          with their feedback afterwards.
        </p>
      </div>
      <input type="hidden" data-q-index={index} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// matching
// ────────────────────────────────────────────────────────────────────────────

/**
 * Each row is one left-hand item with ITS OWN option list — "autoantibody
 * target" offers Desmoglein 3 / BP180 / type IV collagen / transglutaminase,
 * while "antibody class" offers IgG / IgA / IgM / IgE. Rows are graded
 * independently, so getting one right still counts when another is wrong.
 */
export function MatchingEditor({ index, question, onChange }: EditorProps) {
  const pairs: ClinicalMatchPair[] = useMemo(
    () => question.metadata.match_pairs || [],
    [question.metadata.match_pairs]
  );
  const key = useMemo(() => parseJsonObject(question.correct_answer), [question.correct_answer]);

  const commit = (nextPairs: ClinicalMatchPair[], nextKey: Record<string, string>) => {
    // Drop key entries whose row is gone, so a deleted row cannot leave a
    // dangling answer behind for the validator to trip over.
    const live: Record<string, string> = {};
    for (const p of nextPairs) if (nextKey[p.id]) live[p.id] = nextKey[p.id];
    onChange({
      ...question,
      metadata: { ...question.metadata, match_pairs: nextPairs },
      correct_answer: JSON.stringify(live),
    });
  };

  const addPair = () =>
    commit([...pairs, { id: newId('pair'), left: '', options: ['', ''] }], key);

  return (
    <div className="mb-3 border rounded p-3 bg-muted/30 space-y-4">
      <div className="flex justify-between items-center">
        <Label className="text-xs">Items to match</Label>
        <Button type="button" size="sm" variant="outline" onClick={addPair}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add item
        </Button>
      </div>

      {pairs.map((p, i) => (
        <div key={p.id} className="border rounded p-3 bg-background space-y-2">
          <div className="flex gap-2 items-center">
            <Input
              value={p.left}
              onChange={(e) => {
                const next = [...pairs];
                next[i] = { ...next[i], left: e.target.value };
                commit(next, key);
              }}
              placeholder="e.g. Autoantibody target"
              className="flex-1"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Remove item ${i + 1}`}
              onClick={() => commit(pairs.filter((_p, j) => j !== i), key)}
              className="text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Label className="text-xs">Options for this item — tick the correct one</Label>
          {p.options.map((opt, oi) => (
            <div key={oi} className="flex gap-2 items-center">
              <input
                type="radio"
                name={`match-${index}-${p.id}`}
                aria-label={`Option ${oi + 1} is correct for ${p.left || `item ${i + 1}`}`}
                checked={!!opt && key[p.id] === opt}
                onChange={() => commit(pairs, { ...key, [p.id]: opt })}
              />
              <Input
                value={opt}
                onChange={(e) => {
                  const nextOpts = [...p.options];
                  const wasCorrect = key[p.id] === nextOpts[oi];
                  nextOpts[oi] = e.target.value;
                  const next = [...pairs];
                  next[i] = { ...next[i], options: nextOpts };
                  // Renaming the option that IS the answer must move the answer
                  // with it, or the key silently stops matching its own list.
                  commit(next, wasCorrect ? { ...key, [p.id]: e.target.value } : key);
                }}
                placeholder={`Option ${oi + 1}`}
                className="flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remove option ${oi + 1}`}
                onClick={() => {
                  const removed = p.options[oi];
                  const next = [...pairs];
                  next[i] = { ...next[i], options: p.options.filter((_o, j) => j !== oi) };
                  const nextKey = { ...key };
                  if (nextKey[p.id] === removed) delete nextKey[p.id];
                  commit(next, nextKey);
                }}
                className="text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const next = [...pairs];
              next[i] = { ...next[i], options: [...p.options, ''] };
              commit(next, key);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add option
          </Button>
        </div>
      ))}

      {pairs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No items yet — add at least one, each with its own list of options.
        </p>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// sequencing
// ────────────────────────────────────────────────────────────────────────────

/**
 * Enter the steps in their CORRECT order. The learner is shown them shuffled;
 * the shuffle is stored with the question, so every learner sees the same
 * starting arrangement and re-editing the case does not quietly reshuffle it.
 *
 * Scoring counts steps standing in their correct ABSOLUTE position, which is
 * why one step inserted early costs the whole tail. That is the intent — in a
 * management ladder, order is the competency.
 */
export function SequencingEditor({ question, onChange }: EditorProps) {
  const display: ClinicalSequenceItem[] = useMemo(
    () => question.metadata.sequence_items || [],
    [question.metadata.sequence_items]
  );
  const correctIds = useMemo(
    () => parseJsonArray(question.correct_answer),
    [question.correct_answer]
  );

  // The authored (correct) order, reconstructed from the key. Items that are not
  // yet in the key are appended so a half-authored question still renders.
  const ordered: ClinicalSequenceItem[] = useMemo(() => {
    const byId = new Map(display.map((it) => [it.id, it]));
    const out: ClinicalSequenceItem[] = [];
    for (const id of correctIds) {
      const it = byId.get(id);
      if (it) {
        out.push(it);
        byId.delete(id);
      }
    }
    for (const it of byId.values()) out.push(it);
    return out;
  }, [display, correctIds]);

  /** Fisher-Yates, run once here and then stored — never at read time. */
  const shuffled = (items: ClinicalSequenceItem[]): ClinicalSequenceItem[] => {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    // With 2 or 3 steps a shuffle lands on the correct order often enough to
    // matter. Rotate rather than hand the answer over pre-arranged.
    if (a.length > 1 && a.every((it, i) => it.id === items[i].id)) {
      a.push(a.shift() as ClinicalSequenceItem);
    }
    return a;
  };

  const commit = (nextOrdered: ClinicalSequenceItem[], reshuffle: boolean) => {
    const nextDisplay = reshuffle
      ? shuffled(nextOrdered)
      : // Keep the stored starting order, minus anything deleted, plus anything new.
        [
          ...display.filter((d) => nextOrdered.some((o) => o.id === d.id)),
          ...nextOrdered.filter((o) => !display.some((d) => d.id === o.id)),
        ].map((d) => nextOrdered.find((o) => o.id === d.id) as ClinicalSequenceItem);
    onChange({
      ...question,
      metadata: { ...question.metadata, sequence_items: nextDisplay },
      correct_answer: JSON.stringify(nextOrdered.map((it) => it.id)),
    });
  };

  const move = (i: number, delta: -1 | 1) => {
    const t = i + delta;
    if (t < 0 || t >= ordered.length) return;
    const next = [...ordered];
    [next[i], next[t]] = [next[t], next[i]];
    commit(next, false);
  };

  return (
    <div className="mb-3 border rounded p-3 bg-muted/30 space-y-3">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <Label className="text-xs">Steps, in the CORRECT order</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => commit(ordered, true)}
            disabled={ordered.length < 2}
          >
            <Shuffle className="h-3.5 w-3.5 mr-1" /> Reshuffle starting order
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              commit([...ordered, { id: newId('step'), text: '' }], ordered.length === 0)
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add step
          </Button>
        </div>
      </div>

      {ordered.map((it, i) => (
        <div key={it.id} className="flex gap-2 items-center">
          <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
          <Input
            value={it.text}
            onChange={(e) => {
              const next = [...ordered];
              next[i] = { ...next[i], text: e.target.value };
              commit(next, false);
            }}
            placeholder={`Step ${i + 1}`}
            className="flex-1"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Move step ${i + 1} earlier`}
            disabled={i === 0}
            onClick={() => move(i, -1)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Move step ${i + 1} later`}
            disabled={i === ordered.length - 1}
            onClick={() => move(i, 1)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Remove step ${i + 1}`}
            onClick={() => commit(ordered.filter((_o, j) => j !== i), false)}
            className="text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      {ordered.length === 0 ? (
        <p className="text-xs text-muted-foreground">No steps yet — add at least 2.</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Learners first see these shuffled, and are scored on how many end up in the right
          position. Starting order:{' '}
          {display.map((d, i) => `${i + 1}. ${d.text || '(untitled)'}`).join('  ·  ')}
        </p>
      )}
    </div>
  );
}
