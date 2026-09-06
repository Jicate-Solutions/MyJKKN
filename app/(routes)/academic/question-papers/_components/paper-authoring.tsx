'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, Loader2, Save, Send, CheckCircle2, Lock, FileDown, Copy,
  RefreshCw, AlertTriangle, CircleDot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePaperDetail, useSavePaper, useCourseOutcomes,
} from '@/hooks/question-papers/use-question-papers';
import { IaPaperService } from '@/lib/services/question-papers/ia-paper-service';
import { CourseOutcomesManager } from '@/components/question-papers/course-outcomes-manager';
import { validateSubMarks } from '@/lib/utils/question-papers/sub-questions';
import { validatePaperComplete } from '@/lib/utils/question-papers/validate-paper';
import {
  PAPER_STATUS_META, CO_FALLBACK, TAMIL_FONT_FAMILIES, PaperSaveError,
} from '@/types/ia-question-paper';
import type {
  IaPaperQuestion, IaTemplatePart, PaperStatus, SavePaperDto,
} from '@/types/ia-question-paper';
import { QuestionCard } from './question-card';
import {
  seedQuestions, mergeForValidation, toPayload, countAuthored,
  type EditableQuestion,
} from './authoring-model';

interface Props {
  paperId: string;
  onBack: () => void;
  canEnter: boolean;
  canApprove: boolean;
  canExport: boolean;
}

/** Radix Select cannot hold an empty-string value, so "no font" needs a sentinel. */
const FONT_DEFAULT = '__default__';

/**
 * Question-paper authoring screen.
 *
 * Renders the template's scaffolded slots (PART A/B/C…) and lets the setter fill
 * text, MCQ options, figures, sub-divisions, CO and K-level.
 *
 * Saving is EXPLICIT, not autosaved — matching COE, whose authors work the same
 * screen. The header chip is the whole feedback loop: amber while dirty, green
 * with a count after a save. Two validation tiers sit behind the buttons:
 * sub-division marks block Save (a paper whose parts don't add up is not worth
 * storing), while completeness blocks only Submit/Approve, so an author can stop
 * half-way and come back.
 */
export function PaperAuthoring({ paperId, onBack, canEnter, canApprove, canExport }: Props) {
  const { data: paper, isLoading } = usePaperDetail(paperId);
  const saveMutation = useSavePaper(paperId);
  const { data: courseOutcomes } = useCourseOutcomes(paper?.course_id);

  const [edits, setEdits] = useState<Record<string, EditableQuestion>>({});
  const [subjectTitle, setSubjectTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [defaultFont, setDefaultFont] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  /**
   * The completion checklist is shown only AFTER a Submit/Approve was actually
   * blocked. Listing every unfinished question the moment a blank paper opens
   * would be noise, not help.
   */
  const [completionErrors, setCompletionErrors] = useState<string[]>([]);

  // The optimistic-save guard: the updated_at this screen last loaded. Read straight
  // off the query result — every save runs from an event handler, so the current
  // render's value is always the right one (the old debounced autosave needed a ref
  // mirror because its timer fired outside render; explicit saving does not).
  const baseUpdatedAt = paper?.updated_at;
  /**
   * Which paper the local edit state was seeded from — the guard that makes this
   * screen seed ONCE per paper and never again.
   *
   * That "never again" is the important half. Every save writes the returned row
   * back into this same query cache entry, so a seed that re-ran on server updates
   * would overwrite anything typed during the round trip and reset every editor's
   * cursor — the autosave data-loss this module was bitten by before. While the
   * screen is open, `edits` is the source of truth; the server row is not.
   *
   * Done DURING RENDER rather than in an effect (React's "adjusting state when a
   * prop changes" pattern): React re-runs the component before committing, so the
   * author never sees a frame of empty fields, and switching papers needs no
   * separate reset effect — a different `paper.id` simply fails the guard.
   */
  const [seededPaperId, setSeededPaperId] = useState<string | null>(null);
  if (paper?.id && paper.questions && seededPaperId !== paper.id) {
    setSeededPaperId(paper.id);
    setEdits(seedQuestions(paper.questions));
    setSubjectTitle(paper.subject_title ?? '');
    setExamDate((paper.exam_date ?? '').slice(0, 10));
    setDefaultFont(paper.default_font ?? null);
    setDirty(false);
    setSavedCount(null);
    setCompletionErrors([]);
  }
  const isSeeded = !!paper?.id && seededPaperId === paper.id;

  // Warn on a browser-level navigation away from unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const slots: IaPaperQuestion[] = useMemo(() => paper?.questions ?? [], [paper?.questions]);

  // Questions in the JSONB column carry part_label (not part_id), so match the
  // template part by LABEL.
  const partByLabel = useMemo(() => {
    const map = new Map<string, IaTemplatePart>();
    for (const p of paper?.template_parts ?? []) map.set(p.part_label, p);
    return map;
  }, [paper?.template_parts]);

  const grouped = useMemo(() => {
    const groups: { part?: IaTemplatePart; label: string; questions: IaPaperQuestion[] }[] = [];
    const byLabel = new Map<string, number>();
    for (const q of slots) {
      const label = q.part_label ?? '—';
      if (!byLabel.has(label)) {
        byLabel.set(label, groups.length);
        groups.push({ part: partByLabel.get(label), label, questions: [] });
      }
      groups[byLabel.get(label)!].questions.push(q);
    }
    return groups;
  }, [slots, partByLabel]);

  // On a v1 API key there is NO CoE override: questions are editable only while
  // the paper is draft or submitted, full stop.
  const isEditable =
    (paper?.status === 'draft' || paper?.status === 'submitted') && canEnter;

  const validationInput = useMemo(
    () => mergeForValidation(slots, edits),
    [slots, edits]
  );
  const subMarkErrors = useMemo(() => validateSubMarks(validationInput), [validationInput]);

  // The CO master, or CO1–CO6 when a course has none — never block a selection on
  // missing master data.
  const coOptions = useMemo(() => {
    const cos = courseOutcomes ?? paper?.course_outcomes ?? [];
    return cos.length > 0
      ? cos.map((c) => ({ value: c.co_code, label: c.co_code }))
      : CO_FALLBACK.map((c) => ({ value: c, label: c }));
  }, [courseOutcomes, paper?.course_outcomes]);

  const patch = useCallback((id: string, patchValue: Partial<EditableQuestion>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patchValue } }));
    setDirty(true);
  }, []);

  const touchMeta = useCallback(<T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
  }, []);

  /**
   * Build the save payload.
   *
   * `questions` may ONLY ride along when the resulting status is still editable.
   * COE guards with `EDITABLE.includes(status || paper.status)` — so a payload
   * carrying both `questions` and `status: 'approved'` is rejected outright with
   * "Cannot edit questions while submitted". Meta fields have no such guard and
   * always patch, which is what lets Approve and Lock go through.
   */
  const buildDto = useCallback(
    (extra?: Partial<SavePaperDto>): SavePaperDto => {
      const target = extra?.status ?? paper?.status;
      const questionsAllowed =
        isEditable && (target === 'draft' || target === 'submitted');
      return {
        ...(questionsAllowed ? { questions: toPayload(slots, edits) } : {}),
        subject_title: subjectTitle,
        exam_date: examDate || null,
        default_font: defaultFont,
        base_updated_at: baseUpdatedAt,
        ...extra,
      };
    },
    [isEditable, paper?.status, slots, edits, subjectTitle, examDate, defaultFont, baseUpdatedAt]
  );

  const save = useCallback(() => {
    if (subMarkErrors.length > 0) return;
    saveMutation.mutate(buildDto(), {
      onSuccess: (updated) => {
        setDirty(false);
        // Prefer the server's count; fall back to a local tally if it is absent.
        const n = (updated as { saved_count?: number }).saved_count;
        setSavedCount(typeof n === 'number' ? n : countAuthored(edits));
        setCompletionErrors([]);
      },
    });
  }, [subMarkErrors.length, saveMutation, buildDto, edits]);

  /**
   * Status transitions run the SAME pure completion validator the server does, so
   * the author sees the checklist without a round trip. The server still rejects a
   * stale tab, which `useSavePaper` surfaces — the client check is a courtesy, not
   * the enforcement point.
   */
  const transition = useCallback(
    (status: PaperStatus) => {
      if (subMarkErrors.length > 0) return;
      if (status === 'submitted' || status === 'approved') {
        const errors = validatePaperComplete(validationInput, paper?.template_parts ?? []);
        if (errors.length > 0) {
          setCompletionErrors(errors);
          return;
        }
      }
      setCompletionErrors([]);

      // A status change closes the sheet; the list refetches and shows the new badge.
      const finish = () => {
        setDirty(false);
        onBack();
      };

      // Approve and Lock cannot carry questions (see buildDto), and COE validates
      // completeness against the STORED array — so unsaved edits must be committed
      // first or the author would be judged on the previous version of their paper.
      const needsPriorSave =
        dirty && isEditable && status !== 'draft' && status !== 'submitted';
      if (needsPriorSave) {
        saveMutation.mutate(buildDto(), {
          onSuccess: (updated) => {
            saveMutation.mutate(
              { status, base_updated_at: updated.updated_at },
              { onSuccess: finish }
            );
          },
        });
        return;
      }

      saveMutation.mutate(buildDto({ status }), { onSuccess: finish });
    },
    [
      subMarkErrors.length, validationInput, paper?.template_parts,
      saveMutation, buildDto, onBack, dirty, isEditable,
    ]
  );

  /**
   * Rebuild re-scaffolds the slots from the current template and merges authored
   * content back in. Draft only on v1 — COE's console has a CoE override, an API
   * key does not.
   */
  const rebuild = useCallback(() => {
    if (!window.confirm(
      'Rebuild this paper from its template? Answers, figures and sub-divisions already entered are kept.'
    )) return;
    saveMutation.mutate(
      { regenerate: true, base_updated_at: baseUpdatedAt },
      {
        onError: (e) => {
          // A stale tab can still hit AUTHORED even though the button is hidden
          // once anything is authored.
          if (
            e instanceof PaperSaveError &&
            e.code === 'AUTHORED' &&
            window.confirm(`${e.message}\n\nRebuild anyway and overwrite?`)
          ) {
            saveMutation.mutate({
              regenerate: true,
              force: true,
              base_updated_at: baseUpdatedAt,
            });
          }
        },
        onSuccess: () => {
          // The slots themselves changed, so release the guard and let the
          // render-phase seed rebuild the local copy from the new questions.
          setSeededPaperId(null);
          setDirty(false);
        },
      }
    );
  }, [saveMutation, baseUpdatedAt]);

  const handleBack = useCallback(() => {
    if (dirty && !window.confirm('You have unsaved changes. Close without saving?')) return;
    onBack();
  }, [dirty, onBack]);

  if (isLoading || !isSeeded) {
    return (
      <div className='flex items-center justify-center py-16'>
        <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
      </div>
    );
  }
  if (!paper) {
    return (
      <Card>
        <CardContent className='py-12 text-center text-muted-foreground'>
          Question paper not found.
          <div className='mt-4'>
            <Button variant='outline' size='sm' onClick={onBack}>
              <ArrowLeft className='mr-1 h-4 w-4' /> Back to list
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusMeta = PAPER_STATUS_META[paper.status];
  const anyAuthored = countAuthored(edits) > 0;
  const busy = saveMutation.isPending;

  return (
    <div className='space-y-4'>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className='space-y-3 py-4'>
          <div className='flex flex-wrap items-center gap-3'>
            <Button variant='ghost' size='sm' onClick={handleBack} className='shrink-0'>
              <ArrowLeft className='mr-1 h-4 w-4' /> Back
            </Button>
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='font-mono text-sm font-semibold'>{paper.course_code}</span>
                <span className='truncate text-sm text-muted-foreground'>
                  — {paper.subject_title}
                </span>
              </div>
              <div className='mt-1 flex flex-wrap items-center gap-2'>
                <Badge variant='outline' className={cn('border', statusMeta.className)}>
                  {statusMeta.label}
                </Badge>
                {paper.set_label && <Badge variant='outline'>Set {paper.set_label}</Badge>}
                <span className='text-xs text-muted-foreground'>
                  Max {paper.max_marks ?? '—'}
                </span>
                {!isEditable && canEnter && (
                  <span className='text-xs text-muted-foreground'>
                    (read-only — {paper.status})
                  </span>
                )}
              </div>
            </div>

            {/* The one piece of save feedback: amber while dirty, green after. */}
            {dirty ? (
              <Badge
                variant='outline'
                className='shrink-0 gap-1 border-amber-200 bg-amber-50 text-amber-700'
              >
                <CircleDot className='h-3 w-3' /> Unsaved
              </Badge>
            ) : savedCount !== null ? (
              <Badge
                variant='outline'
                className='shrink-0 gap-1 border-emerald-200 bg-emerald-50 text-emerald-700'
              >
                <CheckCircle2 className='h-3 w-3' /> Saved {savedCount} answer
                {savedCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>

          {/* Default language is a PAPER-level choice — there is no per-question picker. */}
          <div className='flex flex-wrap items-center gap-2'>
            <Label className='text-xs whitespace-nowrap'>Default Language</Label>
            <Select
              value={defaultFont ?? FONT_DEFAULT}
              disabled={!isEditable}
              onValueChange={(v) =>
                touchMeta(setDefaultFont)(v === FONT_DEFAULT ? null : v)
              }
            >
              <SelectTrigger className='h-7 w-[180px] text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FONT_DEFAULT} className='text-xs'>
                  Default (English)
                </SelectItem>
                {TAMIL_FONT_FAMILIES.map((f) => (
                  <SelectItem key={f.id} value={f.cssName} className='text-xs'>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className='text-xs text-muted-foreground'>
              Applies to every question &amp; option in this paper · Save to keep.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Meta ───────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className='grid gap-3 py-4 sm:grid-cols-2'>
          <div className='space-y-1'>
            <Label className='text-xs'>Course Name</Label>
            <Input
              value={subjectTitle}
              disabled={!isEditable}
              onChange={(e) => touchMeta(setSubjectTitle)(e.target.value)}
              className='h-8 text-sm'
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>Exam Date</Label>
            <Input
              type='date'
              value={examDate}
              disabled={!isEditable}
              onChange={(e) => touchMeta(setExamDate)(e.target.value)}
              className='h-8 text-sm'
            />
          </div>
        </CardContent>
      </Card>

      <CourseOutcomesManager
        courseId={paper.course_id}
        courseCode={paper.course_code}
        outcomes={courseOutcomes ?? paper.course_outcomes ?? []}
        editable={isEditable}
      />

      {isEditable && (
        <p className='px-1 text-xs text-muted-foreground'>
          Click <strong>Save</strong> to persist questions — the header shows ✓ Saved N answer(s).
          Once a paper has entered questions, <strong>Rebuild will not erase it</strong>.
        </p>
      )}

      {/* ── Parts ──────────────────────────────────────────────────────── */}
      {grouped.map((group) => {
        const part = group.part;
        // "Answer any N": only num_to_answer questions count toward the part
        // total, so a 10-question part that asks for 5 reads "5 × 2 = 10".
        const answerCount =
          part && Number(part.num_to_answer) > 0
            ? Number(part.num_to_answer)
            : part?.num_questions ?? 0;
        return (
          <Card key={group.label}>
            <CardContent className='space-y-4 py-4'>
              <div className='border-b pb-2'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <h3 className='font-semibold'>
                    {part?.part_title ?? `PART ${group.label}`}
                    {part && (
                      <span className='ml-2 text-xs font-normal text-muted-foreground'>
                        — ({answerCount} x {part.marks_per_question} ={' '}
                        {answerCount * part.marks_per_question})
                        {answerCount < part.num_questions
                          ? ` · answer ${answerCount} of ${part.num_questions}`
                          : ''}
                      </span>
                    )}
                  </h3>
                  {part && (
                    <Badge
                      variant='outline'
                      className={cn(
                        'text-[11px] font-normal',
                        part.has_choice
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'text-muted-foreground'
                      )}
                    >
                      Choice (OR): {part.has_choice ? 'On' : 'Off'}
                    </Badge>
                  )}
                </div>
                {part?.instruction && (
                  <p className='mt-1 text-xs text-muted-foreground'>{part.instruction}</p>
                )}
                {/* The fix for a missing (OR) is in the TEMPLATE, not here — say so,
                    or an author will hunt for a control that does not exist. */}
                {part && !part.has_choice && isEditable && (
                  <p className='mt-1 text-xs text-amber-600'>
                    No (OR) — enable &quot;Choice (OR)&quot; on this part in Question Paper
                    Templates, then Rebuild.
                  </p>
                )}
              </div>

              {group.questions.map((q) =>
                edits[q.id] ? (
                  <QuestionCard
                    key={q.id}
                    paperId={paper.id}
                    slot={q}
                    edit={edits[q.id]}
                    part={part}
                    editable={isEditable}
                    coOptions={coOptions}
                    defaultFontFamily={defaultFont}
                    onPatch={patch}
                  />
                ) : null
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* ── Error panels ───────────────────────────────────────────────── */}
      {subMarkErrors.length > 0 && (
        <div className='rounded-md border border-destructive/50 bg-destructive/5 p-3'>
          <p className='flex items-center gap-1.5 text-sm font-medium text-destructive'>
            <AlertTriangle className='h-4 w-4' />
            Sub-division marks must total the question&apos;s marks
          </p>
          <ul className='mt-1 list-inside list-disc text-xs text-destructive'>
            {subMarkErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {completionErrors.length > 0 && (
        <div className='rounded-md border border-destructive/50 bg-destructive/5 p-3'>
          <p className='flex items-center gap-1.5 text-sm font-medium text-destructive'>
            <AlertTriangle className='h-4 w-4' />
            {completionErrors.length} item(s) to complete before submitting
          </p>
          <ul className='mt-1 list-inside list-disc text-xs text-destructive'>
            {completionErrors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {completionErrors.length > 8 && (
              <li className='list-none pl-4 opacity-80'>
                …and {completionErrors.length - 8} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* ── Sticky action bar ──────────────────────────────────────────── */}
      <div className='sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background py-3'>
        {busy && (
          <span className='flex items-center gap-1 text-xs text-muted-foreground'>
            <Loader2 className='h-3 w-3 animate-spin' /> Saving…
          </span>
        )}
        <div className='ml-auto flex flex-wrap items-center gap-2'>
          {canExport && (
            <>
              <Button
                variant='outline'
                size='sm'
                onClick={() => IaPaperService.downloadPaperPdf(paper.id)}
              >
                <FileDown className='mr-1 h-4 w-4' /> PDF
              </Button>
              <Button
                variant='outline'
                size='sm'
                title='A4 landscape, two identical copies side by side (cut down the middle)'
                onClick={() => IaPaperService.downloadPaperPdf(paper.id, '2up')}
              >
                <Copy className='mr-1 h-4 w-4' /> PDF (2-up)
              </Button>
            </>
          )}
          {/* Hidden entirely once anything is authored — the safest rebuild is the
              one an author is never tempted to click. */}
          {isEditable && paper.status === 'draft' && !anyAuthored && (
            <Button variant='outline' size='sm' onClick={rebuild} disabled={busy}>
              <RefreshCw className='mr-1 h-4 w-4' /> Rebuild
            </Button>
          )}
          {isEditable && (
            <Button
              variant='outline'
              size='sm'
              onClick={save}
              disabled={busy || subMarkErrors.length > 0}
              title={
                subMarkErrors.length > 0
                  ? 'Fix the sub-division marks first'
                  : 'Save entered questions'
              }
            >
              <Save className='mr-1 h-4 w-4' /> Save
            </Button>
          )}
          {paper.status === 'draft' && canEnter && (
            <Button size='sm' onClick={() => transition('submitted')} disabled={busy}>
              <Send className='mr-1 h-4 w-4' /> Submit
            </Button>
          )}
          {paper.status === 'submitted' && canApprove && (
            <Button size='sm' onClick={() => transition('approved')} disabled={busy}>
              <CheckCircle2 className='mr-1 h-4 w-4' /> Approve
            </Button>
          )}
          {paper.status === 'approved' && canApprove && (
            <Button size='sm' onClick={() => transition('locked')} disabled={busy}>
              <Lock className='mr-1 h-4 w-4' /> Lock
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
