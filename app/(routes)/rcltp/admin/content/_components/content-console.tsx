'use client';

// =============================================================================
// RCLTP content-authoring console (Phase 4a)
// =============================================================================
// Passage bank + Part B questions CRUD with the AI-draft → human-approval gate.
// SAFETY: "Generate AI draft" stamps source='ai_generated', status='draft' + a
// provenance note — never approved. Approval is an explicit human action. Drafts
// never reach students (the serve route only serves status='approved'). Tamil
// content must be Samacheer-sourced/native-reviewed → AI generation is disabled
// for 'ta' (script-corruption risk, rule #24).
// =============================================================================

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Sparkles,
  Plus,
  Check,
  Archive,
  BookOpenCheck,
  ChevronRight,
  ChevronDown,
  Pencil,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useRcltpPassages,
  useRcltpQuestions,
  useCreateRcltpPassage,
  useUpdateRcltpPassage,
  useCreateRcltpQuestion,
  useReviewRcltpQuestion,
} from '@/hooks/rcltp/use-rcltp-passages';
import { ValidationBanner } from '../../../_components/validation-banner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  RcltpPassage,
  RcltpPartBQuestion,
  RcltpContentLevel,
  RcltpPassageStatus,
} from '@/types/rcltp';

const CONTENT_LEVELS: RcltpContentLevel[] = [
  'letters',
  'words',
  'sentences',
  'paragraphs',
  'analytical',
];

const GLOBAL = '__global__';
const ALL = '__all__';

const AI_PROVENANCE =
  'AI-drafted — NOT validated; requires educator/MyJKKN review before use with students';

function statusBadge(status: RcltpPassageStatus) {
  if (status === 'approved')
    return <Badge className='bg-emerald-100 text-emerald-800 hover:bg-emerald-100'>Approved</Badge>;
  if (status === 'retired')
    return <Badge variant='secondary'>Retired</Badge>;
  return <Badge className='bg-amber-100 text-amber-900 hover:bg-amber-100'>Draft</Badge>;
}

interface Institution {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Institutions (board) — fetched directly; columns id/name verified on prod.
// ---------------------------------------------------------------------------
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

// ===========================================================================
// Passage create/edit dialog
// ===========================================================================
function PassageDialog({
  open,
  onOpenChange,
  editing,
  institutions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: RcltpPassage | null;
  institutions: Institution[];
}) {
  const createPassage = useCreateRcltpPassage();
  const updatePassage = useUpdateRcltpPassage();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [grade, setGrade] = useState('');
  const [level, setLevel] = useState<RcltpContentLevel | ''>('');
  const [language, setLanguage] = useState('en');
  const [institutionId, setInstitutionId] = useState<string>(GLOBAL);
  const [aiDraft, setAiDraft] = useState(false);

  // Seed form when opening
  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? '');
      setBody(editing?.body ?? '');
      setGrade(editing?.grade_level != null ? String(editing.grade_level) : '');
      setLevel((editing?.content_level as RcltpContentLevel) ?? '');
      setLanguage(editing?.language ?? 'en');
      setInstitutionId(editing?.institution_id ?? GLOBAL);
      setAiDraft(editing?.source === 'ai_generated');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const isTamil = language === 'ta';

  function fillAiDraft() {
    setAiDraft(true);
    if (!title) setTitle('AI draft — untitled reading passage');
    if (!body)
      setBody(
        '[AI DRAFT PLACEHOLDER — replace this with a reviewed, age-appropriate passage. ' +
          'Do NOT approve until an educator has validated the text for readability, ' +
          'curriculum fit, and accuracy.]'
      );
    toast('AI draft started — edit, then it saves as DRAFT for review.', { icon: '✏️' });
  }

  async function handleSave() {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    const base = {
      title: title.trim(),
      body: body.trim(),
      grade_level: grade ? Number(grade) : null,
      content_level: level || null,
      language,
      institution_id: institutionId === GLOBAL ? null : institutionId,
    };
    const aiFields = aiDraft
      ? {
          source: 'ai_generated' as const,
          status: 'draft' as const,
          ai_meta: { provenance: AI_PROVENANCE, drafted_at: new Date().toISOString() },
        }
      : {};

    try {
      if (editing) {
        await updatePassage.mutateAsync({ id: editing.id, input: { ...base, ...aiFields } });
      } else {
        await createPassage.mutateAsync({ ...base, ...aiFields });
      }
      onOpenChange(false);
    } catch {
      /* hook surfaces the toast */
    }
  }

  const saving = createPassage.isPending || updatePassage.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit passage' : 'New passage'}</DialogTitle>
          <DialogDescription>
            New/AI passages start as <strong>draft</strong> and must be approved before students see
            them.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {aiDraft && <ValidationBanner draftCount={1} />}

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='sm:col-span-2'>
              <Label htmlFor='p-title'>Title</Label>
              <Input id='p-title' value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor='p-grade'>Grade level</Label>
              <Input
                id='p-grade'
                type='number'
                min={1}
                max={12}
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              />
            </div>
            <div>
              <Label>Content level</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as RcltpContentLevel)}>
                <SelectTrigger>
                  <SelectValue placeholder='Select level' />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Institution (board)</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger>
                  <SelectValue placeholder='Select school' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL}>Global (shared by all schools)</SelectItem>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='en'>English</SelectItem>
                  <SelectItem value='ta'>Tamil (Samacheer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor='p-body'>Passage text</Label>
            <Textarea
              id='p-body'
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {isTamil && (
            <Alert>
              <AlertDescription className='text-sm'>
                Tamil content must be sourced from <strong>Samacheer Kalvi</strong> or reviewed by a
                native educator. AI generation is disabled for Tamil (script-corruption risk).
              </AlertDescription>
            </Alert>
          )}

          <p className='text-xs text-muted-foreground'>
            Tip: scope to <strong>Nattraja Vidhyalaya</strong> (CBSE) or{' '}
            <strong>JKKN Matriculation</strong> (TN State Board) so the content matches that
            board&apos;s curriculum, or keep it Global if it suits both.
          </p>
        </div>

        <DialogFooter className='gap-2 sm:gap-0'>
          <Button
            type='button'
            variant='outline'
            onClick={fillAiDraft}
            disabled={isTamil || saving}
            title={isTamil ? 'AI generation is disabled for Tamil' : 'Start an AI draft'}
          >
            <Sparkles className='mr-2 h-4 w-4' /> Generate AI draft
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save' : aiDraft ? 'Save as draft' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Questions panel (for a selected passage)
// ===========================================================================
function QuestionsPanel({ passage }: { passage: RcltpPassage }) {
  const { data, isLoading } = useRcltpQuestions({ passage_id: passage.id });
  const createQuestion = useCreateRcltpQuestion();
  const reviewQuestion = useReviewRcltpQuestion();
  const questions = data?.data ?? [];
  const draftCount = questions.filter((q) => q.status === 'draft').length;

  const [adding, setAdding] = useState(false);
  const [qText, setQText] = useState('');
  const [correct, setCorrect] = useState('');
  const [aiDraft, setAiDraft] = useState(false);

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
    await reviewQuestion.mutateAsync({ id: q.id, input: { status: 'retired' } });
  }

  async function addQuestion() {
    if (!qText.trim()) {
      toast.error('Question text is required');
      return;
    }
    const aiFields = aiDraft
      ? {
          source: 'ai_generated' as const,
          status: 'draft' as const,
          ai_meta: { provenance: AI_PROVENANCE, drafted_at: new Date().toISOString() },
        }
      : {};
    try {
      await createQuestion.mutateAsync({
        passage_id: passage.id,
        institution_id: passage.institution_id,
        question_text: qText.trim(),
        question_type: 'mcq',
        correct_answer: correct.trim() || null,
        order_index: questions.length,
        ...aiFields,
      });
      setQText('');
      setCorrect('');
      setAiDraft(false);
      setAdding(false);
    } catch {
      /* toast via hook */
    }
  }

  return (
    <div className='rounded-lg border border-border bg-muted/20 p-4'>
      <div className='mb-3 flex items-center justify-between'>
        <h4 className='text-sm font-semibold'>Questions for “{passage.title}”</h4>
        <Button size='sm' variant='outline' onClick={() => setAdding((v) => !v)}>
          <Plus className='mr-1 h-3.5 w-3.5' /> Question
        </Button>
      </div>

      {draftCount > 0 && <ValidationBanner draftCount={draftCount} className='mb-3' />}

      {adding && (
        <div className='mb-4 space-y-2 rounded-md border bg-card p-3'>
          <Textarea
            placeholder='Question text'
            rows={2}
            value={qText}
            onChange={(e) => setQText(e.target.value)}
          />
          <div className='flex flex-wrap gap-2'>
            <Input
              className='max-w-xs'
              placeholder='Correct answer (optional)'
              value={correct}
              onChange={(e) => setCorrect(e.target.value)}
            />
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={passage.language === 'ta'}
              onClick={() => {
                setAiDraft(true);
                if (!qText) setQText('[AI draft question — review before approving]');
              }}
            >
              <Sparkles className='mr-1 h-3.5 w-3.5' /> AI draft
            </Button>
            <Button size='sm' onClick={addQuestion} disabled={createQuestion.isPending}>
              {aiDraft ? 'Save as draft' : 'Add'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton className='h-20 w-full' />
      ) : questions.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No questions yet.</p>
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
                  {statusBadge(q.status)}
                  {q.source === 'ai_generated' && (
                    <span className='text-xs text-amber-700'>AI-drafted</span>
                  )}
                </div>
              </div>
              {q.status === 'draft' && (
                <div className='flex shrink-0 gap-1'>
                  <Button size='sm' variant='outline' onClick={() => approve(q)}>
                    <Check className='mr-1 h-3.5 w-3.5' /> Approve
                  </Button>
                  <Button size='sm' variant='ghost' onClick={() => retire(q)}>
                    <Archive className='h-3.5 w-3.5' />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ===========================================================================
// Main console
// ===========================================================================
export function ContentConsole() {
  const { data: institutions = [] } = useInstitutions();
  const [instFilter, setInstFilter] = useState<string>(ALL);

  const passagesQuery = useRcltpPassages(
    instFilter === ALL || instFilter === GLOBAL
      ? {}
      : { institution_id: instFilter }
  );
  const updatePassage = useUpdateRcltpPassage();

  const passages = passagesQuery.data?.data ?? [];
  const draftPassages = passages.filter((p) => p.status === 'draft').length;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RcltpPassage | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const instName = useMemo(() => {
    const m = new Map(institutions.map((i) => [i.id, i.name]));
    return (id: string | null) => (id ? m.get(id) ?? 'Institution' : 'Global');
  }, [institutions]);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(p: RcltpPassage) {
    setEditing(p);
    setDialogOpen(true);
  }
  function approve(p: RcltpPassage) {
    updatePassage.mutate({ id: p.id, input: { status: 'approved' } });
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h2 className='text-lg font-semibold'>Reading content</h2>
          <p className='text-sm text-muted-foreground'>
            Author passages + comprehension questions per board. Drafts require approval before
            students see them.
          </p>
        </div>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <Select value={instFilter} onValueChange={setInstFilter}>
            <SelectTrigger className='w-full sm:w-56'>
              <SelectValue placeholder='Filter by school' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All schools + global</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openNew}>
            <Plus className='mr-2 h-4 w-4' /> New passage
          </Button>
        </div>
      </div>

      {draftPassages > 0 && <ValidationBanner draftCount={draftPassages} />}

      {passagesQuery.isLoading ? (
        <Skeleton className='h-64 w-full' />
      ) : passages.length === 0 ? (
        <div className='rounded-md border border-dashed p-10 text-center'>
          <BookOpenCheck className='mx-auto mb-2 h-8 w-8 text-muted-foreground' />
          <p className='text-sm text-muted-foreground'>
            No passages yet. Create one to start building the reading bank.
          </p>
        </div>
      ) : (
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-8' />
                <TableHead>Title</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Board</TableHead>
                <TableHead>Lang</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {passages.map((p) => (
                <Fragment key={p.id}>
                  <TableRow>
                    <TableCell>
                      <button
                        aria-label={expanded === p.id ? 'Collapse questions' : 'Expand questions'}
                        onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                        className='text-muted-foreground hover:text-foreground'
                      >
                        {expanded === p.id ? (
                          <ChevronDown className='h-4 w-4' />
                        ) : (
                          <ChevronRight className='h-4 w-4' />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className='font-medium'>{p.title}</TableCell>
                    <TableCell>{p.grade_level ?? '—'}</TableCell>
                    <TableCell>{p.content_level ?? '—'}</TableCell>
                    <TableCell className='text-sm'>{instName(p.institution_id)}</TableCell>
                    <TableCell className='uppercase'>{p.language}</TableCell>
                    <TableCell>{statusBadge(p.status)}</TableCell>
                    <TableCell className='text-right'>
                      <div className='flex justify-end gap-1'>
                        {p.status === 'draft' && (
                          <Button size='sm' variant='outline' onClick={() => approve(p)}>
                            <Check className='mr-1 h-3.5 w-3.5' /> Approve
                          </Button>
                        )}
                        <Button size='sm' variant='ghost' onClick={() => openEdit(p)}>
                          <Pencil className='h-3.5 w-3.5' />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded === p.id && (
                    <TableRow>
                      <TableCell colSpan={8} className='bg-muted/10 p-3'>
                        <QuestionsPanel passage={p} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PassageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        institutions={institutions}
      />
    </div>
  );
}
