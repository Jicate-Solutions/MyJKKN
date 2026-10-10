'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle, Download, FileText, Loader2, RotateCcw, Save, Share2, X,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useMarkEntryPaper, useSaveQuestionMarks } from '@/hooks/mark-entry/use-mark-entry';
import { useCiaMarks } from '@/hooks/internal-marks/use-cia-marks';
import {
  computeAttainment,
  guessTargetComponent,
  sumMarks,
  validateLearnerMarks,
} from '@/lib/utils/mark-entry/entry-rules';
import {
  clearDraft, formatDraftTime, readDraft, writeDraft, type DraftKeyParts,
} from '@/lib/utils/mark-entry/draft-storage';
import { istToday, type CiaRound } from '@/types/internal-marks';
import type { LearnerForMarkEntry } from '@/types/internal-marks';
import type { LearnerEntry, OtherComponent, QuestionMarkSyncRecord } from '@/types/mark-entry';
import {
  downloadQuestionWiseTemplate,
  parseQuestionWiseUpload,
  type MarksImportIssue,
  type MarksImportResult,
  type TemplateLearner,
} from '@/lib/utils/mark-entry/marks-excel';
import { QuestionMarkMatrix } from './question-mark-matrix';
import { MarksExcelActions, MarksImportIssues } from './marks-excel-actions';
import { QuestionMarkCards } from './question-mark-cards';
import { CoAttainmentBar } from './co-attainment-bar';

/** Display names for the PDF letterhead. Ids alone cannot fill a mark sheet. */
export interface QuestionWisePdfContext {
  institutionName?: string;
  institutionAccreditation?: string;
  institutionAddress?: string;
  logoImage?: string;
  rightLogoImage?: string;
  programName?: string;
  examSession?: string;
  assessmentName?: string;
}

interface Props {
  institutionId: string;
  examSessionId: string;
  ciaSettingId: string;
  round: CiaRound;
  courseCode: string;
  programCode: string;
  /** Semester of the course — scopes the saved-marks read-back to these learners. */
  semester?: number;
  learners: LearnerForMarkEntry[];
  maxInternalMarks: number;
  canEnter: boolean;
  /** Omit and the sheet still prints — it just loses the letterhead lines. */
  pdf?: QuestionWisePdfContext;
}

const DRAFT_DEBOUNCE_MS = 600;

export function QuestionWiseTab({
  institutionId,
  examSessionId,
  ciaSettingId,
  round,
  courseCode,
  programCode,
  semester,
  learners,
  maxInternalMarks,
  canEnter,
  pdf,
}: Props) {
  const [paperId, setPaperId] = useState<string | undefined>(undefined);
  const [componentCode, setComponentCode] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<Record<string, Record<string, number>>>({});
  /** student_id set. Absent is its own fact — never inferred from empty inputs. */
  const [absent, setAbsent] = useState<Record<string, boolean>>({});
  /**
   * Edits to the round's OTHER components (student_id → code → mark). Holds only
   * what was touched this session: a missing key falls back to the saved value,
   * `null` means the user cleared it.
   */
  const [others, setOthers] = useState<Record<string, Record<string, number | null>>>({});
  const [isFullScreen, setIsFullScreen] = useState(false);
  /** Paper id whose draft the user has already restored or discarded. */
  const [draftHandledFor, setDraftHandledFor] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  /** Why the last Excel upload was refused. Empty = nothing to show. */
  const [importIssues, setImportIssues] = useState<MarksImportIssue[]>([]);
  /** Component the last successful save filed marks under — see the re-point note. */
  const [savedComponent, setSavedComponent] = useState<string | undefined>(undefined);

  const isDirty = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useMarkEntryPaper({
    institutionId,
    examSessionId,
    ciaRound: round.round,
    courseCode,
    programCode,
    ciaSettingId,
    paperId,
    sessionFrom: round.session_from ?? round.start_date,
    sessionTo: round.session_to ?? round.end_date,
  });

  const saveMutation = useSaveQuestionMarks();
  const paper = data?.paper ?? null;
  const options = data?.options ?? [];

  // Component totals already on file for this course + round. The per-question
  // breakdown cannot be read back through v1, but the component totals can — and
  // they are what lets Assignment show its saved mark and the round total stay
  // right when only one of the two is being keyed in.
  const { data: savedReport, refetch: refetchSaved } = useCiaMarks({
    institutionId,
    examSessionId,
    courseCode,
    ciaRound: round.round,
    programCode,
    semester,
  });
  const savedByRegister = useMemo(() => {
    const map = new Map<string, Record<string, number | null>>();
    for (const l of savedReport?.learners ?? []) map.set(l.register_number, l.marks ?? {});
    return map;
  }, [savedReport]);

  const draftParts: DraftKeyParts = useMemo(
    () => ({ examSessionId, settingId: ciaSettingId, ciaRound: round.round, courseCode }),
    [examSessionId, ciaSettingId, round.round, courseCode]
  );

  // Target component: guessed from the paper, always overridable.
  const targetComponent = useMemo(() => {
    if (componentCode) return round.components.find((c) => c.code === componentCode);
    return guessTargetComponent(round.components, paper?.max_marks ?? 0);
  }, [componentCode, round.components, paper?.max_marks]);
  const activeComponent = targetComponent?.code ?? '';
  const componentMax = Number(targetComponent?.max_marks ?? 0);

  // Everything else the round asks for — e.g. the 15-mark Assignment beside a
  // question-wise Test 1. Attendance is excluded: it is computed from periods.
  const otherComponents: OtherComponent[] = useMemo(
    () =>
      round.components
        .filter((c) => c.code !== 'attendance' && c.code !== activeComponent)
        .map((c) => ({ code: c.code, name: c.name, max_marks: Number(c.max_marks) || 0 })),
    [round.components, activeComponent]
  );

  // Offer a saved draft back — NEVER auto-apply it over what the server holds.
  //
  // Read during render rather than in an effect: an effect would flash the grid
  // without the banner and then cascade a re-render to add it. Safe for SSR
  // because `paper` is null until the client-side query resolves, so this branch
  // never runs during hydration.
  const pendingDraft = useMemo(() => {
    if (!paper || draftHandledFor === paper.id) return null;
    const draft = readDraft(draftParts);
    if (!draft || draft.paper_id !== paper.id || draft.count === 0) return null;
    return draft;
  }, [paper, draftParts, draftHandledFor]);

  // Mirror to localStorage, but only once the user has actually typed — otherwise
  // freshly loaded values masquerade as a draft and the banner cries wolf.
  useEffect(() => {
    if (!isDirty.current || !paper) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      const absentIds = Object.keys(absent).filter((id) => absent[id]);
      writeDraft(draftParts, {
        paper_id: paper.id,
        component_code: activeComponent,
        entries,
        // Absence must survive a crash too — restoring marks but silently
        // dropping "absent" would turn an AB back into a pending learner.
        absent: absentIds,
        others,
        count:
          new Set([
            ...Object.entries(entries)
              .filter(([, m]) => Object.keys(m).length > 0)
              .map(([id]) => id),
            ...Object.entries(others)
              .filter(([, m]) => Object.keys(m).length > 0)
              .map(([id]) => id),
            ...absentIds,
          ]).size,
      });
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [entries, absent, others, paper, draftParts, activeComponent]);

  // Warn on close while there are unsaved keystrokes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Esc leaves full screen.
  useEffect(() => {
    if (!isFullScreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsFullScreen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isFullScreen]);

  const handleChange = useCallback(
    (studentId: string, questionId: string, value: number | null) => {
      isDirty.current = true;
      setErrors([]);
      setEntries((prev) => {
        const row = { ...(prev[studentId] ?? {}) };
        // An absent key means NOT ATTEMPTED — never write a 0 for a cleared cell,
        // or the unanswered half of an OR pair reads as "attempted, scored none".
        if (value == null) delete row[questionId];
        else row[questionId] = value;
        return { ...prev, [studentId]: row };
      });
    },
    []
  );

  const handleChangeOther = useCallback(
    (studentId: string, code: string, value: number | null) => {
      isDirty.current = true;
      setErrors([]);
      // null is kept (not deleted): it records "cleared", which must override a
      // saved value rather than fall back to it.
      setOthers((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] ?? {}), [code]: value } }));
    },
    []
  );

  /** Marking a learner absent clears their QUESTION marks — the two cannot coexist. */
  const handleToggleAbsent = useCallback((studentId: string, isAbsent: boolean) => {
    isDirty.current = true;
    setErrors([]);
    setAbsent((prev) => ({ ...prev, [studentId]: isAbsent }));
    if (isAbsent) setEntries((prev) => ({ ...prev, [studentId]: {} }));
  }, []);

  const [isDownloading, setIsDownloading] = useState(false);

  const entryRows: LearnerEntry[] = useMemo(
    () =>
      learners.map((l) => ({
        student_id: l.id,
        exam_registration_id: l.exam_registration_id ?? '',
        register_number: l.register_number,
        student_name: l.name,
        course_offering_id: l.course_offering_id ?? '',
        marks: entries[l.id] ?? {},
        is_absent: !!absent[l.id],
        other_marks: (() => {
          const saved = savedByRegister.get(l.register_number);
          const out: Record<string, number> = {};
          for (const c of otherComponents) {
            const edit = others[l.id]?.[c.code];
            const value = edit !== undefined ? edit : (saved?.[c.code] ?? null);
            if (value != null) out[c.code] = Number(value);
          }
          return out;
        })(),
      })),
    [learners, entries, absent, others, otherComponents, savedByRegister]
  );

  /**
   * Landscape question-wise sheet. jsPDF is pulled in on demand so it stays out
   * of the page bundle for everyone who never downloads.
   */
  const handleDownloadPdf = useCallback(async () => {
    if (!paper) return;
    setIsDownloading(true);
    try {
      const { generateQuestionWiseMarksPDF } = await import(
        '@/lib/utils/internal-marks/question-wise-marks-pdf'
      );
      generateQuestionWiseMarksPDF({
        institution_name: pdf?.institutionName,
        institution_accreditation: pdf?.institutionAccreditation,
        institution_address: pdf?.institutionAddress,
        logoImage: pdf?.logoImage,
        rightLogoImage: pdf?.rightLogoImage,
        program_code: programCode,
        program_name: pdf?.programName,
        course_code: paper.course_code ?? courseCode,
        course_name: paper.subject_title,
        exam_session: pdf?.examSession,
        assessment_name: pdf?.assessmentName,
        cia_round_name: round.round_name,
        paper_set_label: paper.set_label ?? null,
        component_name: targetComponent?.name ?? activeComponent,
        component_max: componentMax,
        questions: paper.questions.map((q) => ({
          id: q.id,
          label: q.label,
          part_label: q.part_label,
          marks: q.marks,
          co_code: q.co_code,
          k_level: q.k_level,
          is_choice_alternative: q.is_choice_alternative,
        })),
        learners: entryRows.map((r, i) => ({
          serial_number: i + 1,
          register_number: r.register_number,
          student_name: r.student_name,
          question_marks: r.marks,
          is_absent: r.is_absent,
          component_total: sumMarks(r.marks),
        })),
      });
    } finally {
      setIsDownloading(false);
    }
  }, [
    paper, pdf, programCode, courseCode, round.round_name,
    targetComponent, activeComponent, componentMax, entryRows,
  ]);

  const attainment = useMemo(
    () => computeAttainment(entryRows, paper?.questions ?? []),
    [entryRows, paper?.questions]
  );

  // "Filled" includes absentees: recording that a learner did not sit is a real
  // entry, and excluding them would leave the class permanently incomplete.
  // A row also counts once one of its other components was TOUCHED this session
  // — merely showing a saved Assignment mark does not make the row dirty.
  const filledRows = entryRows.filter(
    (r) =>
      r.is_absent ||
      Object.keys(r.marks).length > 0 ||
      Object.keys(others[r.student_id] ?? {}).length > 0
  );
  const absentCount = entryRows.filter((r) => r.is_absent).length;

  const handleSave = useCallback(() => {
    if (!paper || !targetComponent) return;

    /** Total already on file for the paper's component — used when a row re-saves without question marks. */
    const savedPaperTotal = (row: LearnerEntry) =>
      Number(savedByRegister.get(row.register_number)?.[activeComponent] ?? 0) || 0;

    const found: string[] = [];
    for (const row of filledRows) {
      if (!row.is_absent) {
        const rowErrors = validateLearnerMarks(
          row.marks, paper.questions, paper.parts, componentMax
        );
        for (const e of rowErrors) found.push(`${row.register_number}: ${e}`);
      }
      let othersTotal = 0;
      for (const c of otherComponents) {
        const value = row.other_marks?.[c.code];
        if (value == null) continue;
        othersTotal += value;
        if (!Number.isInteger(value)) {
          found.push(`${row.register_number}: ${c.name} mark (${value}) must be a whole number`);
        } else if (value < 0) {
          found.push(`${row.register_number}: ${c.name} mark cannot be negative`);
        } else if (value > c.max_marks) {
          found.push(`${row.register_number}: ${c.name} mark (${value}) exceeds its max (${c.max_marks})`);
        }
      }
      const paperTotal = row.is_absent
        ? 0
        : Object.keys(row.marks).length > 0
          ? sumMarks(row.marks)
          : savedPaperTotal(row);
      if (maxInternalMarks > 0 && paperTotal + othersTotal > maxInternalMarks) {
        found.push(
          `${row.register_number}: round total (${paperTotal + othersTotal}) exceeds the round max (${maxInternalMarks})`
        );
      }
    }
    if (found.length) {
      setErrors(found);
      return;
    }
    setErrors([]);

    const records: QuestionMarkSyncRecord[] = filledRows.map((row) => {
      const hasQuestionMarks = !row.is_absent && Object.keys(row.marks).length > 0;
      const saved = savedByRegister.get(row.register_number);
      const otherPayload: Record<string, { mark: number; max: number }> = {};
      for (const c of otherComponents) {
        const edit = others[row.student_id]?.[c.code];
        const onFile = saved?.[c.code];
        // Cleared a mark that is already on file → write 0; there is no "unset"
        // in the sync contract, and leaving the old value would contradict the screen.
        const value = edit !== undefined ? (edit ?? (onFile != null ? 0 : null)) : (onFile ?? null);
        if (value != null) otherPayload[c.code] = { mark: Number(value), max: c.max_marks };
      }
      return {
      institutions_id: institutionId,
      examination_session_id: examSessionId,
      course_offering_id: row.course_offering_id,
      student_id: row.student_id,
      exam_registration_id: row.exam_registration_id,
      cia_round: round.round,
      cia_setting_id: ciaSettingId,
      submission_date: istToday(),
      marks_status: 'Submitted',
      component_code: activeComponent,
      component_max: componentMax,
      max_internal_marks: maxInternalMarks,
      // Re-pointing "Marks go to" must zero the old component, or it keeps a
      // stale total that every downstream report still reads.
      clear_component_code:
        savedComponent && savedComponent !== activeComponent ? savedComponent : undefined,
      is_absent: row.is_absent,
      // Absent learners carry NO breakdown — the route omits question_marks for
      // them, which is what makes COE clear any previously saved detail. A row
      // with only an other component (no question marks keyed this time) sends
      // none either, so the paper's saved marks are left exactly as they are.
      question_marks: hasQuestionMarks
        ? {
            [activeComponent]: {
              paper_id: paper.id,
              set_number: paper.set_number,
              set_label: paper.set_label,
              marks: row.marks,
            },
          }
        : {},
      other_components: Object.keys(otherPayload).length ? otherPayload : undefined,
      carried_component_total:
        !row.is_absent && !hasQuestionMarks ? savedPaperTotal(row) : undefined,
      };
    });

    saveMutation.mutate(
      {
        records,
        paper_id: paper.id,
        course_code: courseCode,
        program_code: programCode,
        session_from: round.session_from ?? round.start_date,
        session_to: round.session_to ?? round.end_date,
      },
      {
        onSuccess: (result) => {
          setSavedComponent(activeComponent);
          // Keep the draft on a partial write — those learners still need saving.
          if (result.success) {
            isDirty.current = false;
            clearDraft(draftParts);
            // Re-read the component totals now on file, so a later save that
            // touches only one component still states the right round total.
            void refetchSaved();
          }
        },
      }
    );
  }, [
    paper, targetComponent, filledRows, componentMax, institutionId, examSessionId,
    round, ciaSettingId, activeComponent, maxInternalMarks, savedComponent,
    saveMutation, draftParts, courseCode, programCode, otherComponents, others,
    savedByRegister, refetchSaved,
  ]);

  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-16'>
        <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
      </div>
    );
  }

  // Round is question-wise but no APPROVED paper exists for this course. Entry
  // stays closed — there is deliberately no direct-entry fallback here — and the
  // notice names the paper's status, because each one needs a different person
  // to act: nothing generated (create it), draft (setter submits it), submitted
  // (approver approves it).
  if (!paper) {
    const pending = data?.pending_papers ?? [];
    return (
      <Alert className='border-amber-300 bg-amber-50 dark:bg-amber-950/30'>
        <AlertTriangle className='h-4 w-4 text-amber-600' />
        <AlertDescription className='space-y-2'>
          {pending.length === 0 ? (
            <>
              <p className='text-sm'>
                Question paper status: <strong>Not available</strong> — no question paper exists
                for <span className='font-mono'>{courseCode}</span> in {round.round_name}.
              </p>
              <p className='text-xs text-muted-foreground'>
                Mark entry opens once the paper is authored and <strong>approved</strong>.
              </p>
            </>
          ) : (
            <>
              <p className='text-sm'>
                Question paper status for <span className='font-mono'>{courseCode}</span> (
                {round.round_name}):
              </p>
              <ul className='space-y-1 text-sm'>
                {pending.map((p) => (
                  <li key={p.id} className='flex flex-wrap items-center gap-2'>
                    <span>
                      Set {p.set_label}
                      {p.program_code && (
                        <span className='ml-1 font-mono text-xs text-muted-foreground'>
                          ({p.program_code})
                        </span>
                      )}
                    </span>
                    <Badge variant='outline' className='capitalize'>
                      {p.status}
                    </Badge>
                    <span className='text-xs text-muted-foreground'>
                      {p.status === 'submitted'
                        ? 'waiting for approval'
                        : 'the paper setter has not submitted it yet'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className='text-xs text-muted-foreground'>
                Mark entry opens only after the paper is <strong>approved</strong>.
              </p>
            </>
          )}
          <Button asChild variant='outline' size='sm'>
            <Link href='/academic/question-papers'>
              <FileText className='mr-1 h-4 w-4' /> Go to Question Papers
            </Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // The server is the authority on who may write — `canEnter` is the permission
  // grant, `access.can_enter` is the role tier (leadership is view-only). Both
  // must hold, and the save route re-checks the second one regardless.
  const readOnly = !canEnter || data?.access?.can_enter === false;

  // The template carries whatever is on screen, so a download → edit → upload
  // round-trip never loses marks that were already keyed in.
  const templateLearners: TemplateLearner[] = entryRows.map((r) => ({
    id: r.student_id,
    register_number: r.register_number,
    name: r.student_name,
    marks: r.marks,
    is_absent: r.is_absent,
    other_marks: r.other_marks,
  }));

  /** A clean upload only fills the grid — Save still runs the normal write path. */
  const applyImport = (result: MarksImportResult) => {
    isDirty.current = true;
    setErrors([]);
    // Other components: record an edit only where the file DIFFERS from what is
    // on screen, so re-uploading an untouched Assignment column does not mark
    // every learner as changed.
    const onScreen = new Map(entryRows.map((r) => [r.student_id, r.other_marks ?? {}]));
    setOthers((prev) => {
      const next = { ...prev };
      for (const row of result.rows) {
        if (!row.others) continue;
        const shown = onScreen.get(row.learnerId) ?? {};
        const edits = { ...(next[row.learnerId] ?? {}) };
        for (const [code, value] of Object.entries(row.others)) {
          if ((shown[code] ?? null) !== value) edits[code] = value;
        }
        if (Object.keys(edits).length) next[row.learnerId] = edits;
      }
      return next;
    });
    setEntries((prev) => {
      const next = { ...prev };
      for (const row of result.rows) next[row.learnerId] = row.marks;
      return next;
    });
    setAbsent((prev) => {
      const next = { ...prev };
      for (const row of result.rows) next[row.learnerId] = row.isAbsent;
      return next;
    });
  };
  const restrictions = paper.parts
    .filter((p) => p.num_to_answer != null)
    .map((p) => `Part ${p.part_label}: answer any ${p.num_to_answer} of ${p.group_count}`);
  const orPairs = paper.questions.filter((q) => q.is_choice_alternative).length;

  return (
    <div className='space-y-4'>
      {/* Draft restore — offered, never auto-applied. */}
      {pendingDraft && (
        <Alert className='border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30'>
          <RotateCcw className='h-4 w-4 text-indigo-600' />
          <AlertDescription className='flex flex-wrap items-center justify-between gap-2'>
            <span className='text-sm'>
              Unsaved marks found — <strong>{pendingDraft.count} learner(s)</strong> keyed in but
              never saved, from {formatDraftTime(pendingDraft.saved_at)}
            </span>
            <span className='flex gap-2'>
              <Button
                size='sm'
                onClick={() => {
                  setEntries(pendingDraft.entries);
                  setAbsent(
                    Object.fromEntries((pendingDraft.absent ?? []).map((id) => [id, true]))
                  );
                  setOthers(pendingDraft.others ?? {});
                  if (pendingDraft.component_code) setComponentCode(pendingDraft.component_code);
                  isDirty.current = true;
                  setDraftHandledFor(paper.id);
                }}
              >
                Restore
              </Button>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => {
                  clearDraft(draftParts);
                  setDraftHandledFor(paper.id);
                }}
              >
                <X className='mr-1 h-3 w-3' /> Discard
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {readOnly && data?.access?.can_enter === false && (
        <Alert>
          <AlertTriangle className='h-4 w-4' />
          <AlertDescription className='text-sm'>
            View-only access. Marks are entered by the assigned faculty or the HOD covering the
            program.
          </AlertDescription>
        </Alert>
      )}

      {/* Paper summary bar */}
      <Card className='border-indigo-200 dark:border-indigo-900'>
        <CardContent className='space-y-3 py-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <FileText className='h-4 w-4 text-indigo-600' />
            <span className='font-mono text-sm font-semibold'>{paper.course_code}</span>
            <span className='truncate text-sm text-muted-foreground'>{paper.subject_title}</span>
            {paper.status !== 'approved' && paper.status !== 'locked' && (
              <Badge variant='outline' className='border-amber-300 text-[10px] text-amber-700'>
                Paper is {paper.status}
              </Badge>
            )}
          </div>

          {paper.is_shared && (
            <div className='flex items-start gap-2 rounded-md bg-sky-50 p-2 text-xs dark:bg-sky-950/30'>
              <Share2 className='mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600' />
              <span>
                Using a <strong>shared paper</strong> authored under{' '}
                <span className='font-mono'>{paper.program_code}</span>. This course is common
                across programs, so its questions, CO and K-levels come from that paper.
              </span>
            </div>
          )}

          <div className='flex flex-wrap items-end gap-4'>
            <div className='text-xs text-muted-foreground'>
              <span className='font-medium text-foreground'>{paper.questions.length}</span> questions
              {' · '}paper max <span className='font-medium text-foreground'>{paper.max_marks}</span>
              {' · '}questions total{' '}
              <span className='font-medium text-foreground'>{paper.questions_total}</span>
            </div>

            {options.length > 1 && (
              <LabeledControl label='Set'>
                <Select value={paper.id} onValueChange={(v) => setPaperId(v)}>
                  <SelectTrigger className='h-8 w-[190px] text-xs'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        Set {o.set_label ?? o.set_number} ({o.status})
                        {o.is_shared && o.program_code ? ` · ${o.program_code}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </LabeledControl>
            )}

            <LabeledControl label='Marks go to'>
              <Select value={activeComponent} onValueChange={setComponentCode} disabled={readOnly}>
                <SelectTrigger className='h-8 w-[190px] text-xs'>
                  <SelectValue placeholder='Select component' />
                </SelectTrigger>
                <SelectContent>
                  {round.components
                    .filter((c) => c.code !== 'attendance')
                    .map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name} (max {c.max_marks})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </LabeledControl>

            <Button
              variant='outline'
              size='sm'
              className='h-8'
              onClick={handleDownloadPdf}
              disabled={isDownloading || entryRows.length === 0}
              title='Question-wise mark sheet (A4 landscape)'
            >
              {isDownloading ? (
                <Loader2 className='mr-1 h-4 w-4 animate-spin' />
              ) : (
                <Download className='mr-1 h-4 w-4' />
              )}
              PDF
            </Button>

            <MarksExcelActions
              canUpload={!readOnly}
              disabled={entryRows.length === 0 || !targetComponent}
              onDownload={() =>
                downloadQuestionWiseTemplate({
                  paper,
                  roundName: round.round_name,
                  componentCode: activeComponent,
                  componentName: targetComponent?.name ?? activeComponent,
                  componentMax,
                  learners: templateLearners,
                  otherComponents,
                  roundMax: maxInternalMarks,
                })
              }
              onParse={(file) =>
                parseQuestionWiseUpload(file, {
                  paper,
                  componentMax,
                  learners: templateLearners,
                  componentName: targetComponent?.name ?? activeComponent,
                  otherComponents,
                  roundMax: maxInternalMarks,
                })
              }
              onImported={applyImport}
              onIssues={setImportIssues}
            />
          </div>

          {(restrictions.length > 0 || orPairs > 0) && (
            <p className='text-xs text-muted-foreground'>
              {[
                ...restrictions,
                orPairs > 0 ? 'OR pairs: only one answer each' : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          {paper.questions_total > componentMax && componentMax > 0 && (
            <p className='text-[11px] text-muted-foreground'>
              The questions total ({paper.questions_total}) exceeds the component max (
              {componentMax}). That is expected with choice questions — a learner can only answer
              up to the limit.
            </p>
          )}
        </CardContent>
      </Card>

      <MarksImportIssues issues={importIssues} onDismiss={() => setImportIssues([])} />

      {errors.length > 0 && (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertDescription>
            <p className='mb-1 text-sm font-medium'>
              {errors.length} problem{errors.length === 1 ? '' : 's'} to fix before saving:
            </p>
            <ul className='max-h-40 list-inside list-disc overflow-auto text-xs'>
              {errors.slice(0, 20).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Adaptive: matrix on desktop, per-learner cards on phones. Both bind to
          the same state, so switching viewport never loses keystrokes. */}
      <div className='hidden lg:block'>
        <QuestionMarkMatrix
          questions={paper.questions}
          parts={paper.parts}
          learners={entryRows}
          componentLabel={targetComponent?.name ?? '—'}
          componentMax={componentMax}
          readOnly={readOnly}
          isFullScreen={isFullScreen}
          onToggleFullScreen={() => setIsFullScreen((v) => !v)}
          onChange={handleChange}
          onToggleAbsent={handleToggleAbsent}
          otherComponents={otherComponents}
          roundMax={maxInternalMarks}
          onChangeOther={handleChangeOther}
        />
      </div>
      <div className='lg:hidden'>
        <QuestionMarkCards
          questions={paper.questions}
          parts={paper.parts}
          learners={entryRows}
          componentLabel={targetComponent?.name ?? '—'}
          componentMax={componentMax}
          readOnly={readOnly}
          onChange={handleChange}
          onToggleAbsent={handleToggleAbsent}
          otherComponents={otherComponents}
          roundMax={maxInternalMarks}
          onChangeOther={handleChangeOther}
        />
      </div>

      <CoAttainmentBar summary={attainment} />

      {/* Partial saves are a feature: no "all learners must have marks" gate. */}
      {!readOnly && (
        <div className='sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background/95 py-3 backdrop-blur'>
          <p className='text-xs text-muted-foreground'>
            {filledRows.length} of {entryRows.length} learners entered
            {absentCount > 0 && ` (${absentCount} absent)`}
            {filledRows.length > 0 && filledRows.length < entryRows.length &&
              ' — save now and finish later; already-saved learners simply update'}
          </p>
          <Button
            className='ml-auto'
            size='sm'
            disabled={filledRows.length === 0 || saveMutation.isPending}
            onClick={handleSave}
          >
            {saveMutation.isPending ? (
              <Loader2 className='mr-1 h-4 w-4 animate-spin' />
            ) : (
              <Save className='mr-1 h-4 w-4' />
            )}
            Save {filledRows.length} of {entryRows.length}
          </Button>
        </div>
      )}
    </div>
  );
}

function LabeledControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-1')}>
      <span className='block text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>
        {label}
      </span>
      {children}
    </div>
  );
}
