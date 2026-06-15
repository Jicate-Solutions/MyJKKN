'use client';

// =============================================================================
// RCLTP teacher — Part B question-review console (Phase 4c)
// =============================================================================
// Passages (useRcltpPassages) grouped with their draft Part B questions
// (useRcltpQuestions, status='draft'); approve/retire each via
// useReviewRcltpQuestion. "Generate questions with AI" calls
// RcltpPassagesService.generatePartBQuestions in a try/catch and, on the gated
// 501/"awaiting EKSAQ" error, shows an honest toast — it never fabricates a
// question.
//
// CONTENT-SAFETY: a <ValidationBanner draftCount /> renders wherever drafts show.
// Draft questions are never served to students until a reviewer approves them.
// =============================================================================

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Sparkles,
  Check,
  Archive,
  ListChecks,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useRcltpPassages,
  useRcltpQuestions,
  useReviewRcltpQuestion,
} from '@/hooks/rcltp/use-rcltp-passages';
import { RcltpPassagesService } from '@/lib/services/rcltp/passages-service';
import { ValidationBanner } from '../../../_components/validation-banner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RcltpPassage, RcltpPartBQuestion } from '@/types/rcltp';

interface Institution {
  id: string;
  name: string;
}

function useInstitutions() {
  return useQuery({
    queryKey: ['rcltp', 'institutions', 'active'],
    queryFn: async (): Promise<Institution[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Institution[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// One passage's draft-question panel (only drafts are fetched here).
// ---------------------------------------------------------------------------
function PassageQuestions({ passage }: { passage: RcltpPassage }) {
  const { data, isLoading } = useRcltpQuestions({
    passage_id: passage.id,
    status: 'draft',
  });
  const reviewQuestion = useReviewRcltpQuestion();
  const [generating, setGenerating] = useState(false);

  const questions = data?.data ?? [];
  const draftCount = questions.length;

  async function approve(q: RcltpPartBQuestion) {
    const supabase = createClientSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await reviewQuestion.mutateAsync({
      id: q.id,
      input: {
        status: 'approved',
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      },
    });
  }

  async function retire(q: RcltpPartBQuestion) {
    const supabase = createClientSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await reviewQuestion.mutateAsync({
      id: q.id,
      input: {
        status: 'retired',
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      },
    });
  }

  async function generateWithAI() {
    setGenerating(true);
    try {
      await RcltpPassagesService.generatePartBQuestions(passage.id);
      // If the route ever succeeds, generated questions land as drafts; the
      // query invalidation in the service/hook layer surfaces them for review.
      toast.success('Draft questions generated — review them below.');
    } catch (e) {
      // EKSAQ-gated path: the route returns an honest "awaiting EKSAQ" error.
      toast.error('AI question generation is awaiting EKSAQ content.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className='space-y-3 rounded-lg border border-border bg-muted/20 p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h4 className='text-sm font-semibold'>Draft questions</h4>
        <Button
          size='sm'
          variant='outline'
          onClick={generateWithAI}
          disabled={generating || passage.language === 'ta'}
          title={
            passage.language === 'ta'
              ? 'AI generation is disabled for Tamil'
              : 'Generate draft questions with AI'
          }
        >
          {generating ? (
            <Loader2 className='mr-1 h-3.5 w-3.5 animate-spin' />
          ) : (
            <Sparkles className='mr-1 h-3.5 w-3.5' />
          )}
          Generate questions with AI
        </Button>
      </div>

      {draftCount > 0 && <ValidationBanner draftCount={draftCount} />}

      {isLoading ? (
        <Skeleton className='h-20 w-full' />
      ) : questions.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          No draft questions awaiting review for this passage.
        </p>
      ) : (
        <ul className='space-y-2'>
          {questions.map((q) => (
            <li
              key={q.id}
              className='flex items-start justify-between gap-3 rounded-md border bg-card p-3'
            >
              <div className='min-w-0'>
                <p className='text-sm'>{q.question_text}</p>
                <div className='mt-1 flex items-center gap-2'>
                  <Badge className='bg-amber-100 text-amber-900 hover:bg-amber-100'>
                    Draft
                  </Badge>
                  {q.source === 'ai_generated' && (
                    <span className='text-xs text-amber-700'>AI-drafted</span>
                  )}
                </div>
              </div>
              <div className='flex shrink-0 gap-1'>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => approve(q)}
                  disabled={reviewQuestion.isPending}
                >
                  <Check className='mr-1 h-3.5 w-3.5' /> Approve
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => retire(q)}
                  disabled={reviewQuestion.isPending}
                  aria-label='Retire question'
                >
                  <Archive className='h-3.5 w-3.5' />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A passage row that expands to its draft-question panel.
// ---------------------------------------------------------------------------
function PassageRow({ passage }: { passage: RcltpPassage }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className='rounded-md border'>
      <button
        onClick={() => setExpanded((v) => !v)}
        className='flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30'
        aria-expanded={expanded}
      >
        <div className='flex min-w-0 items-center gap-2'>
          {expanded ? (
            <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground' />
          ) : (
            <ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground' />
          )}
          <span className='truncate font-medium'>{passage.title}</span>
          {passage.grade_level != null && (
            <Badge variant='outline' className='shrink-0 text-xs'>
              Grade {passage.grade_level}
            </Badge>
          )}
          <span className='shrink-0 text-xs uppercase text-muted-foreground'>
            {passage.language}
          </span>
        </div>
      </button>
      {expanded && (
        <div className='border-t p-3'>
          <PassageQuestions passage={passage} />
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Main console
// ===========================================================================
export function QuestionsConsole() {
  const { data: institutions = [] } = useInstitutions();
  const [instFilter, setInstFilter] = useState<string>('all');

  // Passages are the grouping unit; draft questions hang under each.
  const passagesQuery = useRcltpPassages(
    instFilter === 'all' ? {} : { institution_id: instFilter }
  );
  const passages = passagesQuery.data?.data ?? [];

  const instName = useMemo(() => {
    const m = new Map(institutions.map((i) => [i.id, i.name]));
    return (id: string | null) => (id ? m.get(id) ?? 'School' : 'Global');
  }, [institutions]);

  return (
    <div className='space-y-5'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h2 className='text-lg font-semibold'>Question review</h2>
          <p className='text-sm text-muted-foreground'>
            Expand a passage to review its draft comprehension questions. Approve
            the good ones, retire the rest — drafts never reach students until you
            approve them.
          </p>
        </div>
        <Select value={instFilter} onValueChange={setInstFilter}>
          <SelectTrigger className='w-56'>
            <SelectValue placeholder='Filter by school' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All schools + global</SelectItem>
            {institutions.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {passagesQuery.isLoading ? (
        <div className='space-y-3'>
          <Skeleton className='h-14 w-full' />
          <Skeleton className='h-14 w-full' />
          <Skeleton className='h-14 w-full' />
        </div>
      ) : passages.length === 0 ? (
        <div className='rounded-md border border-dashed p-10 text-center'>
          <ListChecks className='mx-auto mb-2 h-8 w-8 text-muted-foreground' />
          <p className='text-sm text-muted-foreground'>
            No passages found for {instName(instFilter === 'all' ? null : instFilter)}.
            Questions are reviewed per passage — add passages in Content Authoring
            first.
          </p>
        </div>
      ) : (
        <div className='space-y-3'>
          {passages.map((p) => (
            <PassageRow key={p.id} passage={p} />
          ))}
        </div>
      )}
    </div>
  );
}
