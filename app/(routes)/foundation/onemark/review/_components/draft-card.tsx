'use client';

// OneMark review queue — one draft, edited in place.
//
// Layout mirrors the board paper the item came from: the Tamil block sits
// above the English block (PRD §5.1), the provenance stamp reads like the
// paper's own code line, and the four options are edited where they print.
// The right rail holds what the paper does not carry and the reviewer must
// supply: the answer, the unit, the tag(s) and the JABT level.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Loader2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  BLOOM_LABELS,
  BLOOM_LEVELS,
  OPTION_KEYS,
  approvalBlockers,
  useApproveDraft,
  useSaveDraft,
  type BloomLevel,
  type DraftItem,
  type DraftPatch,
  type DraftTag,
  type DraftTopic,
  type ItemOption,
  type OptionKey,
  type StemTwin,
} from '../_lib/drafts';

const NO_TOPIC = '__none__';
const NO_ANSWER = '__unset__';
const LAYOUTS = [
  { value: 'auto', label: 'Auto (from option length)' },
  { value: 'inline_4', label: 'Four across' },
  { value: 'inline_2x2', label: 'Two by two' },
  { value: 'stacked', label: 'One per line' },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  textbook_back: 'Textbook back exercise',
  past_board_exam: 'Past board paper',
  district_revision: 'District revision test',
  model_paper: 'Model paper',
  internal: 'Internal draft',
};

interface DraftCardProps {
  draft: DraftItem;
  examId: string;
  examKey: string;
  topics: DraftTopic[];
  tags: DraftTag[];
  userId: string;
  /** Other items of this subject whose normalised stem equals this draft's
   *  (PRD English B.3: a stem-only collision is flagged, not skipped). */
  twins?: StemTwin[];
}

function twinStamp(t: StemTwin): string {
  return [
    t.source_year,
    t.source_sitting ? t.source_sitting.toUpperCase() : null,
    t.source_series ? `Series ${t.source_series}` : null,
    t.source_qno != null ? `Q${t.source_qno}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Show a stem's <u>word</u> span as an underline without trusting any other
 *  markup — no innerHTML. */
function renderUnderline(stem: string) {
  const parts = stem.split(/(<u>.*?<\/u>)/g);
  return parts.map((part, i) => {
    const m = /^<u>(.*?)<\/u>$/.exec(part);
    return m ? <u key={i}>{m[1]}</u> : <span key={i}>{part}</span>;
  });
}

function optionText(list: ItemOption[] | null | undefined, key: OptionKey): string {
  return list?.find((o) => o.key === key)?.text ?? '';
}

function toOptions(map: Record<OptionKey, string>): ItemOption[] {
  return OPTION_KEYS.filter((k) => map[k].trim().length > 0).map((k) => ({
    key: k,
    text: map[k].trim(),
  }));
}

export function DraftCard({ draft, examId, examKey, topics, tags, userId, twins = [] }: DraftCardProps) {
  const isPhysics = examKey === 'tn_hsc_physics';
  const [showTwins, setShowTwins] = useState(false);

  const [stem, setStem] = useState(draft.stem ?? '');
  const [stemTa, setStemTa] = useState(draft.stem_ta ?? '');
  const [optsEn, setOptsEn] = useState<Record<OptionKey, string>>({
    A: optionText(draft.options, 'A'),
    B: optionText(draft.options, 'B'),
    C: optionText(draft.options, 'C'),
    D: optionText(draft.options, 'D'),
  });
  const [optsTa, setOptsTa] = useState<Record<OptionKey, string>>({
    A: optionText(draft.options_ta as ItemOption[] | null, 'A'),
    B: optionText(draft.options_ta as ItemOption[] | null, 'B'),
    C: optionText(draft.options_ta as ItemOption[] | null, 'C'),
    D: optionText(draft.options_ta as ItemOption[] | null, 'D'),
  });
  const [correct, setCorrect] = useState<OptionKey | null>(draft.answer?.correct ?? null);
  const [explanation, setExplanation] = useState(draft.explanation ?? '');
  const [explanationTa, setExplanationTa] = useState(draft.explanation_ta ?? '');
  const [topicId, setTopicId] = useState<string | null>(draft.topic_id);
  const [selectedTags, setSelectedTags] = useState<string[]>(draft.tags ?? []);
  const [bloom, setBloom] = useState<BloomLevel | null>(draft.bloom_level);
  const [layout, setLayout] = useState<DraftPatch['option_layout']>(draft.option_layout ?? 'auto');

  const save = useSaveDraft(examId);
  const approve = useApproveDraft(examId);
  const busy = save.isPending || approve.isPending;

  const filledEn = useMemo(() => toOptions(optsEn), [optsEn]);
  const filledTa = useMemo(() => toOptions(optsTa), [optsTa]);

  // Same rules the server action enforces (_lib/approve-rules.ts). This copy
  // only decides whether the button is enabled and what the hint says; the
  // server run is the gate.
  const blockers = useMemo(
    () =>
      approvalBlockers(
        {
          stem,
          stem_ta: stemTa,
          options: filledEn,
          answer: correct ? { correct } : { correct: null, pending: true },
          bloom_level: bloom,
        },
        examKey,
      ),
    [stem, stemTa, filledEn, correct, bloom, examKey],
  );

  function buildPatch(): DraftPatch {
    return {
      stem: stem.trim(),
      stem_ta: stemTa.trim() || null,
      options: filledEn,
      options_ta: filledTa.length ? filledTa : null,
      answer: correct ? { correct } : { correct: null, pending: true },
      explanation: explanation.trim() || null,
      explanation_ta: explanationTa.trim() || null,
      topic_id: topicId,
      tags: selectedTags,
      bloom_level: bloom,
      option_layout: layout,
    };
  }

  async function onSave() {
    try {
      await save.mutateAsync({ id: draft.id, patch: buildPatch(), userId });
      toast.success('Draft saved');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not save the draft');
    }
  }

  async function onApprove() {
    if (blockers.length) return;
    try {
      await approve.mutateAsync({ id: draft.id, patch: buildPatch() });
      toast.success('Approved — it is now in the live bank');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not approve the draft');
    }
  }

  function toggleTag(key: string) {
    setSelectedTags((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key],
    );
  }

  const provenance = [
    draft.source_year,
    draft.source_sitting ? draft.source_sitting.toUpperCase() : null,
    draft.source_series ? `Series ${draft.source_series}` : null,
    draft.source_qno != null ? `Q${draft.source_qno}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="rounded-xl border border-border bg-card">
      {/* Stamp — the paper's own code line */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#0b6d41]">
            {SOURCE_LABELS[draft.source_key ?? ''] ?? (draft.source_key || 'Unknown source')}
          </span>
          {provenance && (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {provenance}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {twins.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTwins((v) => !v)}
              aria-expanded={showTwins}
              className="inline-flex items-center gap-1 rounded-full border border-amber-400 px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
              title="Another item of this subject has the same stem. Open it to compare before approving."
            >
              <Copy className="h-3 w-3" />
              Possible duplicate · {twins.length}
            </button>
          )}
          {draft.answer?.correct ? null : (
            <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-700 dark:text-amber-400">
              No answer yet
            </Badge>
          )}
          {draft.bloom_level ? (
            <Badge variant="secondary" className="text-[10px]">{draft.bloom_level}</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">No JABT level</Badge>
          )}
          {(draft.tags ?? []).length === 0 && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">Untagged</Badge>
          )}
        </div>
      </div>

      {twins.length > 0 && showTwins && (
        <div className="border-b border-amber-300/60 bg-amber-50/60 px-4 py-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
          <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-amber-800 dark:text-amber-300">
            Same stem already in the bank — the ingester flags this, it does not skip it (PRD B.3).
            Approve only if the options or the underlined word make it a different question.
          </p>
          <ul className="space-y-2">
            {twins.map((t) => (
              <li key={t.id} className="rounded-md border border-amber-200/70 bg-card p-2 dark:border-amber-900/50">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <Badge variant={t.is_active ? 'secondary' : 'outline'} className="text-[10px]">
                    {t.is_active ? 'Live' : 'Draft'}
                  </Badge>
                  <span className="font-mono uppercase tracking-[0.12em]">
                    {SOURCE_LABELS[t.source_key ?? ''] ?? (t.source_key || 'Unknown source')}
                  </span>
                  {twinStamp(t) && <span className="font-mono tabular-nums">{twinStamp(t)}</span>}
                  {t.tags.length > 0 && <span>tags: {t.tags.join(', ')}</span>}
                </div>
                <p className="mt-1 text-[13px]">{renderUnderline(t.stem)}</p>
                <div className="mt-1 grid gap-x-4 gap-y-0.5 text-[12px] sm:grid-cols-2">
                  {t.options.map((o) => (
                    <span key={o.key}>
                      <span className="font-mono text-muted-foreground">({String(o.key).toLowerCase()})</span> {o.text}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* The paper block */}
        <div className="space-y-5">
          {isPhysics && (
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                தமிழ் · Tamil block
              </Label>
              <Textarea
                value={stemTa}
                onChange={(e) => setStemTa(e.target.value)}
                rows={2}
                lang="ta"
                className="text-[15px] leading-relaxed"
                placeholder="Tamil stem"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {OPTION_KEYS.map((k, i) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
                      ({['அ', 'ஆ', 'இ', 'ஈ'][i]})
                    </span>
                    <Input
                      value={optsTa[k]}
                      onChange={(e) => setOptsTa({ ...optsTa, [k]: e.target.value })}
                      lang="ta"
                      className="h-8"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              English block
            </Label>
            <Textarea
              value={stem}
              onChange={(e) => setStem(e.target.value)}
              rows={2}
              className="text-[15px] leading-relaxed"
              placeholder="English stem — mark an underlined word as <u>word</u>"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {OPTION_KEYS.map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrect(k)}
                    aria-pressed={correct === k}
                    title={correct === k ? 'Marked correct' : 'Mark as the correct option'}
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border font-mono text-xs transition-colors',
                      correct === k
                        ? 'border-[#0b6d41] bg-[#0b6d41] text-white'
                        : 'border-border text-muted-foreground hover:border-[#0b6d41]/50',
                    )}
                  >
                    {k.toLowerCase()}
                  </button>
                  <Input
                    value={optsEn[k]}
                    onChange={(e) => setOptsEn({ ...optsEn, [k]: e.target.value })}
                    className="h-8"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Explanation (English)</Label>
              <Textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                rows={2}
                placeholder="Shown to a learner after they answer in practice"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">விளக்கம் (Tamil)</Label>
              <Textarea
                value={explanationTa}
                onChange={(e) => setExplanationTa(e.target.value)}
                rows={2}
                lang="ta"
              />
            </div>
          </div>
        </div>

        {/* The rail — what the paper does not print */}
        <div className="space-y-4 lg:border-l lg:border-border lg:pl-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Correct option</Label>
            <Select
              value={correct ?? NO_ANSWER}
              onValueChange={(v) => setCorrect(v === NO_ANSWER ? null : (v as OptionKey))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ANSWER}>Not set</SelectItem>
                {OPTION_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    ({k.toLowerCase()}) {optsEn[k] ? optsEn[k].slice(0, 32) : '—'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">JABT level</Label>
            <Select
              value={bloom ?? NO_ANSWER}
              onValueChange={(v) => setBloom(v === NO_ANSWER ? null : (v as BloomLevel))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choose K1–K6" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ANSWER}>Not reviewed</SelectItem>
                {BLOOM_LEVELS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {BLOOM_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Unit</Label>
            <Select
              value={topicId ?? NO_TOPIC}
              onValueChange={(v) => setTopicId(v === NO_TOPIC ? null : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TOPIC}>Not anchored to a unit</SelectItem>
                {topics.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Option layout on paper</Label>
            <Select value={layout} onValueChange={(v) => setLayout(v as DraftPatch['option_layout'])}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAYOUTS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tags</Label>
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => {
                const on = selectedTags.includes(t.key);
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => toggleTag(t.key)}
                    aria-pressed={on}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                      on
                        ? 'border-[#0b6d41] bg-[#0b6d41]/10 text-[#0b6d41] dark:text-emerald-300'
                        : 'border-border text-muted-foreground hover:border-[#0b6d41]/50',
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 flex-1 text-xs"
                disabled={busy}
                onClick={onSave}
              >
                {save.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3.5 w-3.5" />
                )}
                Save draft
              </Button>
              <Button
                size="sm"
                className="h-8 flex-1 bg-[#0b6d41] text-xs hover:bg-[#0a5c37]"
                disabled={busy || blockers.length > 0}
                onClick={onApprove}
              >
                {approve.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1 h-3.5 w-3.5" />
                )}
                Approve
              </Button>
            </div>
            {blockers.length > 0 && (
              <p className="text-[11px] leading-snug text-muted-foreground">
                To approve, add {blockers.join(', ')}.
              </p>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
