'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, Loader2, Save, Send, CheckCircle2, Lock, FileDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePaperDetail, useSavePaper } from '@/hooks/question-papers/use-question-papers';
import { IaPaperService } from '@/lib/services/question-papers/ia-paper-service';
import {
  K_LEVELS, PAPER_STATUS_META, CO_FALLBACK,
} from '@/types/ia-question-paper';
import type {
  IaPaperQuestion, IaTemplatePart, QuestionEditDto,
} from '@/types/ia-question-paper';

interface Props {
  paperId: string;
  onBack: () => void;
  canEnter: boolean;
  canApprove: boolean;
  canExport: boolean;
}

type Editable = Pick<
  IaPaperQuestion,
  'id' | 'question_text' | 'marks' | 'options' | 'correct_option' | 'co_code' | 'k_level'
>;

const AUTOSAVE_MS = 1500;

/** Map local edit state → the wire DTO (empty strings collapse to null). */
function toDto(e: Editable): QuestionEditDto {
  return {
    id: e.id,
    question_text: e.question_text ?? null,
    marks: e.marks ?? null,
    options: e.options ?? null,
    correct_option: e.correct_option || null,
    co_code: e.co_code || null,
    k_level: e.k_level || null,
  };
}

/**
 * Question-paper authoring grid. Renders template parts (PART A/B/C…) with their
 * pre-scaffolded question slots and lets the setter fill text, options (MCQ), CO
 * and K-level. Autosaves dirty rows; status machine draft → submitted → approved
 * → locked. Editing is only permitted while the paper is draft/submitted (COE
 * enforces this too).
 */
export function PaperAuthoring({ paperId, onBack, canEnter, canApprove, canExport }: Props) {
  const { data: paper, isLoading } = usePaperDetail(paperId);
  const saveMutation = useSavePaper(paperId);

  // Local editable copy keyed by question id, plus the set of dirty ids.
  const [edits, setEdits] = useState<Record<string, Editable>>({});
  // Always-current mirror of `edits` so debounced/blur saves never read a stale
  // closure (setState is async; a timer fired later must see the latest values).
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const dirtyRef = useRef<Set<string>>(new Set());
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest server updated_at — sent as the optimistic-save guard (base_updated_at).
  const baseUpdatedAtRef = useRef<string | undefined>(undefined);
  baseUpdatedAtRef.current = paper?.updated_at;

  // Seed local state whenever the server paper (re)loads.
  useEffect(() => {
    if (!paper?.questions) return;
    const seed: Record<string, Editable> = {};
    for (const q of paper.questions) {
      seed[q.id] = {
        id: q.id,
        question_text: q.question_text ?? '',
        marks: q.marks,
        options: q.options ?? null,
        correct_option: q.correct_option ?? '',
        co_code: q.co_code ?? '',
        k_level: q.k_level ?? '',
      };
    }
    setEdits(seed);
    dirtyRef.current = new Set();
  }, [paper?.id, paper?.questions]);

  // Questions in the JSONB column carry part_label (not part_id), so match the
  // template part by label.
  const partByLabel = useMemo(() => {
    const map = new Map<string, IaTemplatePart>();
    for (const p of paper?.template_parts ?? []) map.set(p.part_label, p);
    return map;
  }, [paper?.template_parts]);

  // Group questions into ordered parts.
  const grouped = useMemo(() => {
    const groups: { part?: IaTemplatePart; label: string; questions: IaPaperQuestion[] }[] = [];
    const byLabel = new Map<string, number>();
    for (const q of paper?.questions ?? []) {
      const label = q.part_label ?? '—';
      if (!byLabel.has(label)) {
        byLabel.set(label, groups.length);
        groups.push({ part: partByLabel.get(label), label, questions: [] });
      }
      groups[byLabel.get(label)!].questions.push(q);
    }
    return groups;
  }, [paper?.questions, partByLabel]);

  const isEditable = (paper?.status === 'draft' || paper?.status === 'submitted') && canEnter;

  const enteredMarks = useMemo(() => {
    let total = 0;
    for (const q of paper?.questions ?? []) {
      if (q.is_choice_alternative) continue; // don't double-count "(OR)" branches
      total += Number(edits[q.id]?.marks ?? q.marks ?? 0);
    }
    return total;
  }, [paper?.questions, edits]);

  const flushSave = useCallback(() => {
    if (dirtyRef.current.size === 0) return;
    // Serialize: never overlap saves, or a second save would 409 against the first's
    // not-yet-committed updated_at. Retry shortly instead.
    if (saveMutation.isPending) {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => flushSaveRef.current(), 400);
      return;
    }
    const ids = [...dirtyRef.current];
    dirtyRef.current = new Set();
    const questions = ids.map((id) => editsRef.current[id]).filter(Boolean).map(toDto);
    if (questions.length > 0) {
      saveMutation.mutate({ questions, base_updated_at: baseUpdatedAtRef.current });
    }
  }, [saveMutation]);
  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(flushSave, AUTOSAVE_MS);
  }, [flushSave]);

  // Flush pending edits on unmount.
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); }, []);

  const patch = useCallback(
    (id: string, field: keyof Editable, value: unknown) => {
      setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } as Editable }));
      dirtyRef.current.add(id);
      scheduleAutosave();
    },
    [scheduleAutosave]
  );

  const patchOption = useCallback(
    (id: string, key: string, text: string) => {
      setEdits((prev) => {
        const cur = prev[id];
        const options = (cur?.options ?? []).map((o) => (o.key === key ? { ...o, text } : o));
        return { ...prev, [id]: { ...cur, options } as Editable };
      });
      dirtyRef.current.add(id);
      scheduleAutosave();
    },
    [scheduleAutosave]
  );

  const transition = useCallback(
    (status: 'submitted' | 'approved' | 'locked' | 'draft') => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      const ids = [...dirtyRef.current];
      dirtyRef.current = new Set();
      const questions = ids.map((id) => editsRef.current[id]).filter(Boolean).map(toDto);
      saveMutation.mutate({
        status,
        base_updated_at: baseUpdatedAtRef.current,
        ...(questions.length > 0 ? { questions } : {}),
      });
    },
    [saveMutation]
  );

  if (isLoading) {
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
              <ArrowLeft className='h-4 w-4 mr-1' /> Back to list
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusMeta = PAPER_STATUS_META[paper.status];
  const cos = paper.course_outcomes ?? [];
  // Prefer the seeded CO master; fall back to CO1..CO6 so the picker always works.
  const coOptions =
    cos.length > 0
      ? cos.map((c) => ({ value: c.co_code, label: c.co_code }))
      : CO_FALLBACK.map((c) => ({ value: c, label: c }));
  const marksMismatch = paper.max_marks != null && enteredMarks !== paper.max_marks;

  return (
    <div className='space-y-4'>
      {/* Header / actions */}
      <Card>
        <CardContent className='py-4 flex flex-wrap items-center gap-3'>
          <Button variant='ghost' size='sm' onClick={onBack} className='shrink-0'>
            <ArrowLeft className='h-4 w-4 mr-1' /> Back
          </Button>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <span className='font-mono text-sm font-semibold'>{paper.course_code}</span>
              {paper.set_label && <Badge variant='outline'>Set {paper.set_label}</Badge>}
              <Badge variant='outline' className={cn('border', statusMeta.className)}>
                {statusMeta.label}
              </Badge>
            </div>
            <p className='text-sm text-muted-foreground truncate'>{paper.subject_title}</p>
          </div>
          <div className='flex items-center gap-2 text-sm shrink-0'>
            <span className={cn('font-medium', marksMismatch ? 'text-amber-600' : 'text-emerald-600')}>
              {enteredMarks}
            </span>
            <span className='text-muted-foreground'>/ {paper.max_marks ?? '—'} marks</span>
          </div>
        </CardContent>
      </Card>

      {marksMismatch && isEditable && (
        <p className='text-xs text-amber-600 px-1'>
          Entered marks ({enteredMarks}) do not match the template total ({paper.max_marks}).
        </p>
      )}

      {/* Parts */}
      {grouped.map((group) => {
        const part = group.part;
        return (
          <Card key={group.label}>
            <CardContent className='py-4 space-y-4'>
              <div className='border-b pb-2'>
                <div className='flex items-center justify-between'>
                  <h3 className='font-semibold'>{part?.part_title ?? `PART ${group.label}`}</h3>
                  {part && (
                    <span className='text-xs text-muted-foreground'>
                      {part.num_questions} × {part.marks_per_question} = {part.part_max_marks} marks
                    </span>
                  )}
                </div>
                {part?.instruction && (
                  <p className='text-xs text-muted-foreground mt-1'>{part.instruction}</p>
                )}
              </div>

              {group.questions.map((q) => {
                const e = edits[q.id];
                const showCo = part?.capture_co ?? true;
                const showK = part?.capture_klevel ?? true;
                return (
                  <div
                    key={q.id}
                    className={cn(
                      'rounded-md border p-3 space-y-2',
                      q.is_choice_alternative && 'ml-6 border-dashed'
                    )}
                  >
                    <div className='flex items-center gap-2 text-sm'>
                      <span className='font-medium'>
                        {q.is_choice_alternative ? '(OR)' : `Q${q.question_number}`}
                        {q.sub_label && !q.is_choice_alternative ? ` (${q.sub_label})` : ''}
                      </span>
                      <div className='ml-auto flex items-center gap-1'>
                        <span className='text-xs text-muted-foreground'>Marks</span>
                        {/* Marks are set by the template — read-only for the author. */}
                        <Input
                          type='number'
                          value={e?.marks ?? ''}
                          readOnly
                          tabIndex={-1}
                          aria-label='Marks (set by template)'
                          className='h-7 w-16 text-sm bg-muted/50 text-muted-foreground cursor-default'
                        />
                      </div>
                    </div>

                    <Textarea
                      value={e?.question_text ?? ''}
                      disabled={!isEditable}
                      placeholder='Enter the question…'
                      onChange={(ev) => patch(q.id, 'question_text', ev.target.value)}
                      onBlur={flushSave}
                      className='text-sm min-h-[60px]'
                    />

                    {/* MCQ options */}
                    {e?.options && e.options.length > 0 && (
                      <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                        {e.options.map((opt) => (
                          <div key={opt.key} className='flex items-center gap-2'>
                            <span className='text-xs font-mono w-4 shrink-0'>{opt.key})</span>
                            <Input
                              value={opt.text}
                              disabled={!isEditable}
                              placeholder={`Option ${opt.key}`}
                              onChange={(ev) => patchOption(q.id, opt.key, ev.target.value)}
                              onBlur={flushSave}
                              className='h-7 text-sm'
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className='flex flex-wrap items-center gap-3'>
                      {e?.options && e.options.length > 0 && (
                        <LabeledSelect
                          label='Answer'
                          value={e?.correct_option ?? ''}
                          disabled={!isEditable}
                          onChange={(v) => patch(q.id, 'correct_option', v)}
                          options={e.options.map((o) => ({ value: o.key, label: o.key.toUpperCase() }))}
                          placeholder='—'
                        />
                      )}
                      {showCo && (
                        <LabeledSelect
                          label='CO'
                          value={e?.co_code ?? ''}
                          disabled={!isEditable}
                          onChange={(v) => patch(q.id, 'co_code', v)}
                          options={coOptions}
                          placeholder='CO'
                        />
                      )}
                      {showK && (
                        <LabeledSelect
                          label='K-level'
                          value={e?.k_level ?? ''}
                          disabled={!isEditable}
                          onChange={(v) => patch(q.id, 'k_level', v)}
                          options={K_LEVELS.map((k) => ({ value: k.code, label: k.code }))}
                          placeholder='K'
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {/* Sticky footer actions */}
      <div className='sticky bottom-0 bg-background border-t py-3 flex flex-wrap items-center gap-2'>
        {saveMutation.isPending && (
          <span className='text-xs text-muted-foreground flex items-center gap-1'>
            <Loader2 className='h-3 w-3 animate-spin' /> Saving…
          </span>
        )}
        <div className='ml-auto flex flex-wrap items-center gap-2'>
          {canExport && (
            <Button variant='outline' size='sm' onClick={() => IaPaperService.openPaperPdf(paper.id)}>
              <FileDown className='h-4 w-4 mr-1' /> PDF
            </Button>
          )}
          {isEditable && (
            <Button variant='outline' size='sm' onClick={flushSave} disabled={saveMutation.isPending}>
              <Save className='h-4 w-4 mr-1' /> Save
            </Button>
          )}
          {paper.status === 'draft' && canEnter && (
            <Button size='sm' onClick={() => transition('submitted')} disabled={saveMutation.isPending}>
              <Send className='h-4 w-4 mr-1' /> Submit
            </Button>
          )}
          {paper.status === 'submitted' && canApprove && (
            <Button size='sm' onClick={() => transition('approved')} disabled={saveMutation.isPending}>
              <CheckCircle2 className='h-4 w-4 mr-1' /> Approve
            </Button>
          )}
          {paper.status === 'approved' && canApprove && (
            <Button size='sm' onClick={() => transition('locked')} disabled={saveMutation.isPending}>
              <Lock className='h-4 w-4 mr-1' /> Lock
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function LabeledSelect({
  label, value, disabled, onChange, options, placeholder,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className='flex items-center gap-1.5'>
      <span className='text-xs text-muted-foreground'>{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled || options.length === 0}>
        <SelectTrigger className='h-7 w-[90px] text-sm'>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
