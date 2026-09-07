'use client';

// OneMark — after the real board paper: tick what turned up.
//
// A once-a-year job with the printed paper in hand. Pick the subject, the year
// and (if the year had more than one) the sitting; search the bank by wording;
// tick each question that appeared, as EXACT or NEAR, with the board's own
// question number where it is known.
//
// The record is APPEND-ONLY. There is no edit control anywhere on this screen:
// a tick that turns out to be wrong is removed by the person who made it and
// made again if they still mean it. That is the difference between a correction
// and a number nudged until it agreed.
//
// Nothing here shows an answer or an explanation — the wording is what gets
// compared against the printed paper, and it is all this screen asks for.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  BOARD_MATCH_LABELS,
  MIN_SEARCH_LENGTH,
  alreadyTicked,
  describeHit,
  hitsByItem,
  normalizeSitting,
  type BoardMatchKind,
} from '@/lib/services/onemark/sources-board-paper';
import { sourceLabel, type OneMarkSourceRow } from '@/lib/services/onemark/sources-service';
import {
  useBoardPaperHits,
  useOneMarkSources,
  useRecordBoardHit,
  useRemoveBoardHit,
} from '../../_lib/use-sources';

interface BoardPaperTaggerProps {
  userId: string;
}

export function BoardPaperTagger({ userId }: BoardPaperTaggerProps) {
  const thisYear = new Date().getFullYear();
  const [examId, setExamId] = useState('');
  const [year, setYear] = useState<number>(thisYear);
  const [sitting, setSitting] = useState('');
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');

  const sourcesQuery = useOneMarkSources();
  const sources = (sourcesQuery.data?.sources ?? []) as OneMarkSourceRow[];

  const boardQuery = useBoardPaperHits({
    examId,
    year,
    sitting,
    search: submitted,
    enabled: true,
  });
  const record = useRecordBoardHit();
  const remove = useRemoveBoardHit();

  const exams = boardQuery.data?.exams ?? [];
  const available = boardQuery.data?.available !== false;
  const hits = useMemo(() => boardQuery.data?.hits ?? [], [boardQuery.data]);
  const questions = boardQuery.data?.questions ?? [];
  const byItem = useMemo(() => hitsByItem(hits), [hits]);
  const normalisedSitting = normalizeSitting(sitting);

  const years = useMemo(() => {
    const max = boardQuery.data?.year_range.max ?? thisYear + 1;
    const out: number[] = [];
    for (let y = max; y >= max - 12; y -= 1) out.push(y);
    return out;
  }, [boardQuery.data, thisYear]);

  async function tick(itemId: string, matchKind: BoardMatchKind, boardQno: string) {
    if (!examId) {
      toast.error('Choose a subject first.');
      return;
    }
    const existing = alreadyTicked(hits, { item_id: itemId, exam_year: year, sitting: normalisedSitting });
    if (existing) {
      toast.error('That question is already recorded for this board year and sitting.');
      return;
    }
    const qno = boardQno.trim() === '' ? null : Number(boardQno);
    if (qno !== null && !Number.isInteger(qno)) {
      toast.error('Question number must be a whole number.');
      return;
    }
    try {
      await record.mutateAsync({
        exam_definition_id: examId,
        exam_year: year,
        sitting: normalisedSitting,
        item_id: itemId,
        match_kind: matchKind,
        board_qno: qno,
      });
      toast.success('Recorded.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That could not be recorded.');
    }
  }

  async function untick(hitId: string) {
    try {
      await remove.mutateAsync(hitId);
      toast.success('Removed.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That could not be removed.');
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Which paper are you reading?</CardTitle>
          <CardDescription>
            Pick the subject and the board year. Leave the sitting empty when the year had only one.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a subject" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Board year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sitting">Sitting (optional)</Label>
            <Input
              id="sitting"
              value={sitting}
              onChange={(e) => setSitting(e.target.value)}
              placeholder="March"
            />
          </div>
        </CardContent>
      </Card>

      {!available ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Not switched on yet</CardTitle>
            <CardDescription>
              {boardQuery.data?.reason ??
                'Recording board-paper matches is not switched on yet.'}{' '}
              Nothing is lost — come back once it is in place.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : !examId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Choose a subject to begin</CardTitle>
            <CardDescription>
              Then search the bank by a few words from a question on the printed paper.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Find the question in our bank</CardTitle>
              <CardDescription>
                Type a few words from the printed paper. At least {MIN_SEARCH_LENGTH} characters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitted(search);
                }}
              >
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="the SI unit of magnetic flux"
                  aria-label="Search the question bank by wording"
                />
                <Button type="submit" disabled={search.trim().length < MIN_SEARCH_LENGTH}>
                  <Search className="mr-1.5 h-4 w-4" />
                  Search
                </Button>
              </form>

              {boardQuery.isLoading ? (
                <Skeleton className="h-40 w-full rounded-lg" />
              ) : submitted === '' ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing searched yet.
                </p>
              ) : questions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No question in the bank matches those words. That is itself an answer: this board question is
                  one we did not have.
                </p>
              ) : (
                <ul className="divide-y">
                  {questions.map((q) => (
                    <QuestionRow
                      key={q.id}
                      question={q}
                      sources={sources}
                      existing={byItem.get(q.id) ?? []}
                      year={year}
                      sitting={normalisedSitting}
                      busy={record.isPending}
                      onTick={tick}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Recorded for {year}
                {normalisedSitting ? ` · ${normalisedSitting}` : ''}
              </CardTitle>
              <CardDescription>
                {hits.length} match{hits.length === 1 ? '' : 'es'} on record for this subject and year. Only the
                person who recorded one can remove it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hits.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing recorded for this year yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {hits.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{describeHit(h)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <code className="rounded bg-muted px-1 py-0.5">{h.item_id.slice(0, 8)}</code>
                          {h.note ? ` — ${h.note}` : ''}
                        </p>
                      </div>
                      {h.noted_by === userId ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remove.isPending}
                          onClick={() => untick(h.id)}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Remove
                        </Button>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">recorded by someone else</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function QuestionRow({
  question,
  sources,
  existing,
  year,
  sitting,
  busy,
  onTick,
}: {
  question: { id: string; stem: string; source_key: string | null; source_year: number | null; is_active: boolean };
  sources: OneMarkSourceRow[];
  existing: Array<{ exam_year: number; sitting: string | null; match_kind: BoardMatchKind }>;
  year: number;
  sitting: string | null;
  busy: boolean;
  onTick: (itemId: string, kind: BoardMatchKind, qno: string) => void;
}) {
  const [qno, setQno] = useState('');
  const ticked = existing.find((h) => h.exam_year === year && (h.sitting ?? '') === (sitting ?? ''));

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px]">
          {sourceLabel(sources, question.source_key)}
        </Badge>
        {question.source_year ? (
          <Badge variant="outline" className="text-[10px]">
            {question.source_year}
          </Badge>
        ) : null}
        {!question.is_active ? (
          <Badge variant="secondary" className="text-[10px]">
            still a draft
          </Badge>
        ) : null}
      </div>
      <p className={cn('text-sm', !question.is_active && 'text-muted-foreground')}>{question.stem}</p>

      {ticked ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-[#0b6d41]">
          <Check className="h-3.5 w-3.5" aria-hidden />
          Already recorded for {year}
          {sitting ? ` · ${sitting}` : ''} as {ticked.match_kind === 'exact' ? 'an exact' : 'a near'} match.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`qno-${question.id}`} className="text-[11px]">
              Board question no.
            </Label>
            <Input
              id={`qno-${question.id}`}
              value={qno}
              onChange={(e) => setQno(e.target.value)}
              inputMode="numeric"
              className="h-8 w-28"
              placeholder="optional"
            />
          </div>
          <Button size="sm" disabled={busy} onClick={() => onTick(question.id, 'exact', qno)}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {BOARD_MATCH_LABELS.exact}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onTick(question.id, 'near', qno)}>
            {BOARD_MATCH_LABELS.near}
          </Button>
        </div>
      )}
    </li>
  );
}
