'use client';

// OneMark review queue — the list. One subject at a time (the two OneMark
// exams are separate exam_definitions rows), drafts oldest-paper-first so a
// reviewer works a paper top to bottom the way it was printed.

import { useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  normaliseStem,
  useDraftTags,
  useDraftTopics,
  useDrafts,
  useOneMarkExams,
  useStemIndex,
  type StemTwin,
} from '../_lib/drafts';
import { DraftCard } from './draft-card';

interface DraftQueueProps {
  userId: string;
}

export function DraftQueue({ userId }: DraftQueueProps) {
  const { data: exams, isLoading: examsLoading, isError: examsError } = useOneMarkExams();
  const [selectedExamId, setExamId] = useState<string | null>(null);
  // First subject by default; a tab click overrides. Derived, not synced.
  const examId = selectedExamId ?? exams?.[0]?.id ?? null;

  const exam = useMemo(() => exams?.find((e) => e.id === examId) ?? null, [exams, examId]);

  const { data: drafts, isLoading: draftsLoading, isError: draftsError } = useDrafts(examId);
  const { data: topics } = useDraftTopics(examId);
  const { data: tags } = useDraftTags(examId);
  // Every item of the subject keyed by normalised stem — a draft whose stem
  // matches another row (live or draft) shows "Possible duplicate" with the
  // twin in view. Derived, not stored: editing the stem clears or raises it.
  const { data: stemIndex } = useStemIndex(examId);
  const twinsFor = useMemo(() => {
    return (id: string, stem: string): StemTwin[] => {
      if (!stemIndex) return [];
      const list = stemIndex.get(normaliseStem(stem)) ?? [];
      return list.filter((t) => t.id !== id);
    };
  }, [stemIndex]);

  if (examsLoading) return <Skeleton className="h-40 w-full rounded-xl" />;

  if (examsError) {
    return (
      <div className="rounded-xl border border-dashed border-destructive/40 p-8 text-center text-sm text-muted-foreground">
        The subject list could not be loaded. Reload to try again.
      </div>
    );
  }

  if (!exams || exams.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No OneMark subject exams are switched on yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Subject" className="flex flex-wrap gap-1 border-b border-border">
        {exams.map((e) => {
          const active = e.id === examId;
          return (
            <button
              key={e.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setExamId(e.id)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
                active
                  ? 'border-[#0b6d41] font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {e.display_name.replace(/^TN State Board — HSC /, '')}
            </button>
          );
        })}
      </div>

      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5" />
        Drafts waiting for a tick
        {drafts && drafts.length > 0 && (
          <span className="ml-1 font-mono tabular-nums">{drafts.length}</span>
        )}
      </h3>

      {draftsLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : draftsError ? (
        <div className="rounded-xl border border-dashed border-destructive/40 p-8 text-center text-sm text-muted-foreground">
          The draft queue could not be loaded. It was not empty — the read failed.
        </div>
      ) : !drafts || drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nothing waiting for {exam?.display_name ?? 'this subject'}. Drafts arrive
          from an ingested past paper (scripts/onemark/ingest-board-paper.ts) or an
          AI drafting request; each one sits here until a subject Senior Learner
          approves it.
        </div>
      ) : (
        <ul className="space-y-4">
          {drafts.map((d) => (
            <DraftCard
              key={`${d.id}:${d.updated_at}`}
              draft={d}
              examId={examId as string}
              examKey={exam?.config_key ?? ''}
              topics={topics ?? []}
              tags={tags ?? []}
              userId={userId}
              twins={twinsFor(d.id, d.stem)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
