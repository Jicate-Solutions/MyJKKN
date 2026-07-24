'use client';

// =============================================================================
// RCLTP teacher — Part B question-review console (Phase 4c)
// =============================================================================
// Passages (useRcltpPassages) grouped with their draft Part B questions
// (useRcltpQuestions, status='draft'); approve/retire each via
// useReviewRcltpQuestion. "Generate questions with AI" calls
// RcltpPassagesService.generatePartBQuestions in a try/catch and, on the gated
// 501/"awaiting MyJKKN" error, shows an honest toast — it never fabricates a
// question.
//
// CONTENT-SAFETY: a <ValidationBanner draftCount /> renders wherever drafts show.
// Draft questions are never served to students until a reviewer approves them.
// =============================================================================

import { useMemo, useState, type ReactNode } from 'react';
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
  AlertTriangle,
  HelpCircle,
  Pencil,
  X,
  Save,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useRcltpPassages,
  useRcltpQuestions,
  useReviewRcltpQuestion,
  useUpdateRcltpQuestion,
} from '@/hooks/rcltp/use-rcltp-passages';
import { RcltpPassagesService } from '@/lib/services/rcltp/passages-service';
import { ValidationBanner } from '../../../_components/validation-banner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  RcltpPassage,
  RcltpPartBQuestion,
  RcltpQuestionAiMeta,
  RcltpMarzanoLevel,
  RcltpKeyCheckVerdict,
  UpdateRcltpPartBQuestionDto,
} from '@/types/rcltp';

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
// AI-draft review chips — rendered from q.ai_meta (already fetched via
// select('*'); no query change). Each chip degrades gracefully: a missing
// ai_meta field simply omits its chip.
// ---------------------------------------------------------------------------

/** Marzano's New Taxonomy level → a Senior-Learner-readable label + plain gloss
 *  + a calm per-level colour so the SPREAD across a passage is eyeball-able
 *  (locked decision #2: the set must cover a spread, never all retrieval). */
const MARZANO: Record<
  RcltpMarzanoLevel,
  { label: string; gloss: string; cls: string }
> = {
  retrieval: {
    label: 'Retrieval',
    gloss: 'recall a stated fact',
    cls: 'bg-sky-100 text-sky-900 hover:bg-sky-100',
  },
  comprehension: {
    label: 'Comprehension',
    gloss: 'integrate or summarise; simple inference',
    cls: 'bg-teal-100 text-teal-900 hover:bg-teal-100',
  },
  analysis: {
    label: 'Analysis',
    gloss: 'compare, classify, cause & effect',
    cls: 'bg-indigo-100 text-indigo-900 hover:bg-indigo-100',
  },
  knowledge_utilization: {
    label: 'Knowledge use',
    gloss: 'use a passage idea to decide or solve',
    cls: 'bg-violet-100 text-violet-900 hover:bg-violet-100',
  },
};

/** Second-pass answer-key check verdict → colour + label + icon. disagree /
 *  ambiguous read as ATTENTION (the Senior Learner should look) — locked
 *  decision #5. */
const CHECKER: Record<
  RcltpKeyCheckVerdict,
  { label: string; cls: string; icon: ReactNode }
> = {
  agree: {
    label: 'Key checked',
    cls: 'bg-emerald-100 text-emerald-900 hover:bg-emerald-100',
    icon: <Check className='h-3 w-3' />,
  },
  disagree: {
    label: 'Key disputed',
    cls: 'bg-red-100 text-red-900 hover:bg-red-100',
    icon: <AlertTriangle className='h-3 w-3' />,
  },
  ambiguous: {
    label: 'Key ambiguous',
    cls: 'bg-amber-100 text-amber-900 hover:bg-amber-100',
    icon: <HelpCircle className='h-3 w-3' />,
  },
  unchecked: {
    label: 'Key unchecked',
    cls: 'bg-muted text-muted-foreground hover:bg-muted',
    icon: null,
  },
};

/** Safely read the jsonb ai_meta column into its typed shape (null when absent
 *  or not an object — e.g. a manually-authored question). */
function parseAiMeta(
  raw: RcltpPartBQuestion['ai_meta']
): RcltpQuestionAiMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as RcltpQuestionAiMeta;
}

function QuestionChips({ meta }: { meta: RcltpQuestionAiMeta | null }) {
  if (!meta) return null;
  const marzano = meta.marzano_level ? MARZANO[meta.marzano_level] : null;
  const checker = meta.checker?.verdict ? CHECKER[meta.checker.verdict] : null;
  return (
    <>
      {marzano && (
        <Badge
          className={`font-normal ${marzano.cls}`}
          title={`Thinking level: ${marzano.label} — ${marzano.gloss}`}
        >
          {marzano.label}
        </Badge>
      )}
      {meta.is_stretch && (
        <Badge
          className='bg-purple-100 font-normal text-purple-900 hover:bg-purple-100'
          title='Harder bonus question — not counted in the core reading score.'
        >
          Stretch · bonus
        </Badge>
      )}
      {checker && (
        <Badge
          className={`inline-flex items-center gap-1 font-normal ${checker.cls}`}
          title={
            meta.checker?.note
              ? `${checker.label}: ${meta.checker.note}`
              : checker.label
          }
        >
          {checker.icon}
          {checker.label}
        </Badge>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// One draft-question row: question text + review chips + approve / edit / retire.
// "Edit" opens an inline edit-before-approve form. Saving writes the Senior
// Learner's final into the row columns via updateQuestion; because the patch
// omits ai_meta, a partial UPDATE leaves ai_meta.ai_draft (the frozen AI
// original) untouched — the human-vs-AI diff that feeds the loop (decision #8).
// ---------------------------------------------------------------------------
function QuestionReviewRow({
  q,
  onApprove,
  onRetire,
  onSaveEdit,
  reviewPending,
  updatePending,
}: {
  q: RcltpPartBQuestion;
  onApprove: (q: RcltpPartBQuestion) => Promise<void> | void;
  onRetire: (q: RcltpPartBQuestion) => Promise<void> | void;
  onSaveEdit: (
    q: RcltpPartBQuestion,
    patch: UpdateRcltpPartBQuestionDto
  ) => Promise<void>;
  reviewPending: boolean;
  updatePending: boolean;
}) {
  const meta = parseAiMeta(q.ai_meta);
  const aiDraft = meta?.ai_draft ?? null;

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [qType, setQType] = useState<'mcq' | 'short_answer'>('short_answer');
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [correctText, setCorrectText] = useState('');
  const [saving, setSaving] = useState(false);

  const busy = saving || updatePending || reviewPending;

  // Seed the form from the current row every time the Senior Learner opens it.
  function startEditing() {
    const rawOpts =
      Array.isArray(q.options) && q.options.length > 0
        ? (q.options as unknown[]).map((o) => String(o))
        : ['', '', '', ''];
    const ci = rawOpts.findIndex((o) => o === q.correct_answer);
    setText(q.question_text ?? '');
    setQType(q.question_type === 'mcq' ? 'mcq' : 'short_answer');
    setOptions(rawOpts);
    setCorrectIndex(ci >= 0 ? ci : 0);
    setCorrectText(q.correct_answer ?? '');
    setEditing(true);
  }

  // Build the row-column patch. ai_meta is deliberately absent (decision #8).
  function buildPatch(): UpdateRcltpPartBQuestionDto | null {
    const t = text.trim();
    if (!t) {
      toast.error('Question text cannot be empty.');
      return null;
    }
    if (qType === 'mcq') {
      const opts = options.map((o) => o.trim()).filter((o) => o.length > 0);
      if (opts.length < 2) {
        toast.error('A multiple-choice question needs at least 2 options.');
        return null;
      }
      const correct = options[correctIndex]?.trim() ?? '';
      if (!correct) {
        toast.error('Mark which option is the correct answer.');
        return null;
      }
      return {
        question_text: t,
        question_type: 'mcq',
        options: opts,
        correct_answer: correct,
      };
    }
    const model = correctText.trim();
    if (!model) {
      toast.error('Enter the model answer for a short-answer question.');
      return null;
    }
    return {
      question_text: t,
      question_type: 'short_answer',
      options: null,
      correct_answer: model,
    };
  }

  async function saveDraft() {
    const patch = buildPatch();
    if (!patch) return;
    setSaving(true);
    try {
      await onSaveEdit(q, patch);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function saveAndApprove() {
    const patch = buildPatch();
    if (!patch) return;
    setSaving(true);
    try {
      await onSaveEdit(q, patch); // persist the human's final into row columns
      await onApprove(q); // then promote status='approved' via reviewQuestion
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className='rounded-md border bg-card p-3'>
        <div className='space-y-3'>
          <div className='space-y-1'>
            <Label className='text-xs font-medium'>Question</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              className='text-sm'
            />
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <Label className='text-xs font-medium'>Type</Label>
            <Select
              value={qType}
              onValueChange={(v) => setQType(v as 'mcq' | 'short_answer')}
            >
              <SelectTrigger className='h-8 w-44 text-sm'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='mcq'>Multiple choice</SelectItem>
                <SelectItem value='short_answer'>Short answer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {qType === 'mcq' ? (
            <div className='space-y-1.5'>
              <Label className='text-xs font-medium'>
                Options — select the correct answer
              </Label>
              {options.map((opt, i) => (
                <div key={i} className='flex items-center gap-2'>
                  <input
                    type='radio'
                    name={`correct-${q.id}`}
                    checked={correctIndex === i}
                    onChange={() => setCorrectIndex(i)}
                    aria-label={`Mark option ${i + 1} as correct`}
                    className='h-4 w-4 shrink-0'
                  />
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const next = [...options];
                      next[i] = e.target.value;
                      setOptions(next);
                    }}
                    placeholder={`Option ${i + 1}`}
                    className='h-8 text-sm'
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className='space-y-1'>
              <Label className='text-xs font-medium'>
                Model answer (the key idea a learner must state)
              </Label>
              <Textarea
                value={correctText}
                onChange={(e) => setCorrectText(e.target.value)}
                rows={2}
                className='text-sm'
              />
            </div>
          )}

          {aiDraft && (
            <div className='rounded-md border border-dashed bg-muted/30 p-2'>
              <p className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
                AI’s original
              </p>
              <p className='mt-0.5 text-xs text-muted-foreground'>
                {aiDraft.question_text}
              </p>
              {aiDraft.correct_answer && (
                <p className='mt-0.5 text-xs text-muted-foreground'>
                  Answer: {aiDraft.correct_answer}
                </p>
              )}
            </div>
          )}

          <div className='flex flex-wrap justify-end gap-2'>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              <X className='mr-1 h-3.5 w-3.5' /> Cancel
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={saveDraft}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className='mr-1 h-3.5 w-3.5 animate-spin' />
              ) : (
                <Save className='mr-1 h-3.5 w-3.5' />
              )}
              Save draft
            </Button>
            <Button size='sm' onClick={saveAndApprove} disabled={busy}>
              <Check className='mr-1 h-3.5 w-3.5' /> Save &amp; approve
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className='rounded-md border bg-card p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-sm'>{q.question_text}</p>
          <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
            <Badge className='bg-amber-100 text-amber-900 hover:bg-amber-100'>
              Draft
            </Badge>
            {q.source === 'ai_generated' && (
              <span className='text-xs text-amber-700'>AI-drafted</span>
            )}
            <QuestionChips meta={meta} />
          </div>
          {meta?.rationale && (
            <p className='mt-1 text-xs text-muted-foreground'>
              Checks: {meta.rationale}
            </p>
          )}
        </div>
        <div className='flex shrink-0 gap-1'>
          <Button
            size='sm'
            variant='outline'
            onClick={() => onApprove(q)}
            disabled={busy}
          >
            <Check className='mr-1 h-3.5 w-3.5' /> Approve
          </Button>
          <Button
            size='sm'
            variant='ghost'
            onClick={startEditing}
            disabled={busy}
            aria-label='Edit question'
          >
            <Pencil className='h-3.5 w-3.5' />
          </Button>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => onRetire(q)}
            disabled={busy}
            aria-label='Retire question'
          >
            <Archive className='h-3.5 w-3.5' />
          </Button>
        </div>
      </div>
    </li>
  );
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
  const updateQuestion = useUpdateRcltpQuestion();
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

  // Persist a Senior Learner's edit into the row columns (question_text, type,
  // options, correct_answer). The patch carries NO ai_meta, so the frozen
  // ai_meta.ai_draft survives the partial UPDATE (locked decision #8).
  async function saveEdit(
    q: RcltpPartBQuestion,
    patch: UpdateRcltpPartBQuestionDto
  ) {
    await updateQuestion.mutateAsync({ id: q.id, input: patch });
  }

  async function generateWithAI() {
    setGenerating(true);
    try {
      await RcltpPassagesService.generatePartBQuestions(passage.id);
      // If the route ever succeeds, generated questions land as drafts; the
      // query invalidation in the service/hook layer surfaces them for review.
      toast.success('Draft questions generated — review them below.');
    } catch (e) {
      // MyJKKN-gated path: the route returns an honest "awaiting MyJKKN" error.
      toast.error('AI question generation is awaiting MyJKKN content.');
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
            <QuestionReviewRow
              key={q.id}
              q={q}
              onApprove={approve}
              onRetire={retire}
              onSaveEdit={saveEdit}
              reviewPending={reviewQuestion.isPending}
              updatePending={updateQuestion.isPending}
            />
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
