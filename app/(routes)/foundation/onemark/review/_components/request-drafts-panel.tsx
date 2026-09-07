'use client';

// OneMark — "Ask for AI questions": the door a subject Senior Learner uses to
// request drafts (Wave 3, Lane G).
//
// Director ruling 2026-09-06 10:0x IST, after "Where is the AI button on the UI
// for senior learners": there was none. The drafting route had been live and
// callerless; the only way to start a run by hand was the super-admin console.
// The panel sits above the queue it fills, so asking and approving live on one
// screen — the same person, the same visit.
//
// FOUR THINGS THIS SCREEN REFUSES TO FAKE:
//   1. The caps are read live from the contract row BEFORE the click, so a
//      spent day is visible, not discovered by a refusal.
//   2. There is no spinner theatre. Drafts land in the queue below after the
//      collect pass (9 and 39 minutes past the hour), and the panel says so.
//   3. The queue position shown is the caller's OWN — ai_jobs RLS shows a
//      person their own rows only, so an estate-wide position would be a guess.
//   4. Every drafted question arrives switched off and unapproved. Asking is
//      not approving; decision 7's single tick still stands in between.
//
// The bank is nearly empty today (read live 2026-09-07: 1 approved English
// item, 0 Physics, 0 drafts), so "nothing here yet" is the NORMAL state of the
// queue underneath and the panel is written for it.

import { useMemo, useState } from 'react';
import { Sparkles, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  BLOOM_LEVELS,
  DRAFT_MAX_COUNT,
  DRAFT_MIN_COUNT,
  describeLane,
  describeRemaining,
  ownQueuePosition,
  validateRequest,
  type BloomLevel,
  type DraftRequestInput,
  type RequestOutcome,
} from '@/lib/services/onemark/draft-request';
import { useDraftBudget, useDraftJobStatus, useSubmitDraftRequest } from '@/hooks/onemark/use-draft-request';
import { BLOOM_LABELS, useDraftTags, useDraftTopics, useOneMarkExams } from '../_lib/drafts';

// Radix crashes on an empty-string SelectItem value; sentinels instead.
const ANY_UNIT = '__any_unit';
const DEFAULT_COUNT = 5;

export function RequestDraftsPanel() {
  const { data: exams, isLoading: examsLoading } = useOneMarkExams();
  const [examId, setExamId] = useState<string | null>(null);
  const activeExamId = examId ?? exams?.[0]?.id ?? null;
  const exam = useMemo(
    () => exams?.find((e) => e.id === activeExamId) ?? null,
    [exams, activeExamId],
  );

  const { data: topics } = useDraftTopics(activeExamId);
  const { data: tags } = useDraftTags(activeExamId);

  const [topicId, setTopicId] = useState<string>(ANY_UNIT);
  const [tagKeys, setTagKeys] = useState<string[]>([]);
  const [count, setCount] = useState<number>(DEFAULT_COUNT);
  const [bloom, setBloom] = useState<BloomLevel>('K1');
  const [outcome, setOutcome] = useState<RequestOutcome | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const budget = useDraftBudget();
  const submit = useSubmitDraftRequest();
  const { view } = useDraftJobStatus(jobId);

  const topic = topics?.find((t) => t.id === topicId) ?? null;

  const input: DraftRequestInput = {
    exam_definition_id: activeExamId ?? '',
    exam_label: exam?.display_name.replace(/^TN State Board — HSC /, '') ?? '',
    topic_id: topicId === ANY_UNIT ? null : topicId,
    topic_label: topic?.display_name ?? null,
    tag_keys: tagKeys,
    count,
    bloom_level: bloom,
  };

  const refusal = validateRequest(input);
  const caps = budget.caps;
  const busy = submit.isPending;
  const disabled = !!refusal || caps.blocked || busy || budget.isLoading;

  function pickSubject(id: string) {
    setExamId(id);
    setTopicId(ANY_UNIT);
    setTagKeys([]);
  }

  function toggleTag(key: string) {
    setTagKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function ask() {
    setOutcome(null);
    const result = await submit.mutateAsync({ input, dailyCap: caps.dailyCap });
    setOutcome(result);
    setJobId(result.jobId);
  }

  const position = jobId ? ownQueuePosition(budget.today, jobId) : null;

  if (examsLoading) return <Skeleton className="h-56 w-full rounded-xl" />;
  if (!exams || exams.length === 0) return null;

  return (
    <section
      aria-labelledby="request-drafts-heading"
      className="rounded-xl border border-border bg-card p-4 md:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="request-drafts-heading"
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            Ask for AI questions
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Describe what you want written and the free AI lane drafts it. Everything
            it writes lands in the queue below switched off and unapproved — asking is
            not approving, and your tick is still what puts a question in front of a
            learner.
          </p>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          {budget.isLoading ? (
            <Skeleton className="h-4 w-28" />
          ) : (
            <>
              <div className="font-mono tabular-nums text-foreground">
                {describeRemaining(caps) ?? 'Not switched on'}
              </div>
              <div className="mt-0.5">{describeLane(caps)}</div>
            </>
          )}
        </div>
      </div>

      {!caps.live && !budget.isLoading && (
        <p className="mt-4 rounded-lg border border-dashed border-border p-3 text-[13px] text-muted-foreground">
          AI drafting is not switched on for this estate yet. Nothing can be queued and
          nothing can be spent from here.
        </p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="draft-subject" className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Subject
          </Label>
          <Select value={activeExamId ?? undefined} onValueChange={pickSubject}>
            <SelectTrigger id="draft-subject" className="h-9">
              <SelectValue placeholder="Choose a subject" />
            </SelectTrigger>
            <SelectContent>
              {exams.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.display_name.replace(/^TN State Board — HSC /, '')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="draft-unit" className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Unit
          </Label>
          <Select value={topicId} onValueChange={setTopicId}>
            <SelectTrigger id="draft-unit" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_UNIT}>Any unit — draw on the whole subject</SelectItem>
              {(topics ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="draft-count" className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            How many
          </Label>
          <Input
            id="draft-count"
            type="number"
            inputMode="numeric"
            min={DRAFT_MIN_COUNT}
            max={DRAFT_MAX_COUNT}
            value={count}
            onChange={(e) => setCount(Number.parseInt(e.target.value, 10) || 0)}
            className="h-9 w-28"
          />
          <p className="text-[11px] text-muted-foreground">
            {DRAFT_MIN_COUNT}–{DRAFT_MAX_COUNT} per request.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="draft-bloom" className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            JABT level
          </Label>
          <Select value={bloom} onValueChange={(v) => setBloom(v as BloomLevel)}>
            <SelectTrigger id="draft-bloom" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLOOM_LEVELS.map((k) => (
                <SelectItem key={k} value={k}>
                  {BLOOM_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <span className="block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Category tags
        </span>
        {tags && tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const on = tagKeys.includes(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(t.key)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                    on
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            No category tags are set up for this subject yet.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={ask} disabled={disabled}>
          {busy ? 'Sending…' : 'Ask for these questions'}
        </Button>
        {refusal && <span className="text-[12px] text-muted-foreground">{refusal}</span>}
        {!refusal && caps.blocked && caps.live && (
          <span className="text-[12px] text-muted-foreground">
            None left today — the count resets at midnight, India time.
          </span>
        )}
      </div>

      {outcome && (
        <div
          className={cn(
            'mt-4 rounded-lg border p-3 text-[13px]',
            outcome.ok
              ? 'border-primary/40 bg-primary/5'
              : 'border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20',
          )}
        >
          <p className="text-foreground">{outcome.message}</p>
          {outcome.ok && position !== null && (
            <p className="mt-1 text-muted-foreground">
              This is number {position} of your own requests still waiting.
            </p>
          )}
        </div>
      )}

      {view && (
        <div className="mt-3 rounded-lg border border-border p-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {view.phase}
            </Badge>
            <span className="font-medium text-foreground">{view.headline}</span>
          </div>
          <p className="mt-1 text-muted-foreground">{view.detail}</p>
          {view.shortfallReason && (
            <p className="mt-1 text-muted-foreground">
              Fewer than asked: {view.shortfallReason}
            </p>
          )}
          {view.rejected.length > 0 && (
            <ul className="mt-2 space-y-1 text-[12px] text-muted-foreground">
              {view.rejected.map((r, i) => (
                <li key={`${r.index ?? i}`}>
                  Rejected{r.index === null ? '' : ` #${r.index}`}: {r.why}
                  {r.stem_preview ? ` — “${r.stem_preview}”` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-4 flex items-start gap-1.5 text-[12px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Drafts do not appear the moment the AI finishes. They are filed into the queue
        below on the collect pass, 9 and 39 minutes past every hour.
      </p>
    </section>
  );
}
