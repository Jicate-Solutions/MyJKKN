'use client';

// Mark Entry Grid — Build v2 (mandatory validation + color-coded inputs + Enter navigation)
// Invalidation marker: 2026-04-08T11:30:00Z

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type {
  CiaRound,
  CiaComponent,
  LearnerForMarkEntry,
  CiaReportLearner,
  CiaMarkSyncRecord,
  EntryWindowStatus,
} from '@/types/internal-marks';
import {
  getEntryWindowStatus,
  COMPONENT_MARK_FIELDS,
} from '@/types/internal-marks';
import { MarkSummaryCard } from './mark-summary-card';
import { generateInternalMarksPDF, type InternalMarksPDFData } from '@/lib/utils/internal-marks/internal-marks-pdf';

export interface MarkEntryPDFContext {
  programCode: string;
  programName: string;
  courseCode: string;
  courseName: string;
  internalMaxMark: number;
  examSession: string;
  assessmentName: string;
  logoImage?: string;
  rightLogoImage?: string;
}

interface MarkEntryGridProps {
  round: CiaRound;
  learners: LearnerForMarkEntry[];
  existingMarks: CiaReportLearner[] | undefined;
  institutionId: string;
  examSessionId: string;
  courseOfferingId: string;
  useCourseMax: boolean;
  courseMaxMark: number;
  pdfContext: MarkEntryPDFContext;
  onSubmit: (records: CiaMarkSyncRecord[], onSuccess: () => void) => void;
  isSubmitting: boolean;
}

interface MarkRow {
  learnerId: string;
  registerNumber: string;
  learnerName: string;
  rollNumber?: string;
  examRegistrationId: string;
  courseOfferingId: string;
  marks: Record<string, number | null>;
}

// Number to words converter
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  if (num < 0) return 'Minus ' + numberToWords(-num);
  if (num < 20) return ONES[num];
  if (num < 100) return TENS[Math.floor(num / 10)] + (num % 10 ? ' ' + ONES[num % 10] : '');
  if (num < 1000) return ONES[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
  return String(num);
}

export function MarkEntryGrid({
  round,
  learners,
  existingMarks,
  institutionId,
  examSessionId,
  courseOfferingId,
  useCourseMax,
  courseMaxMark,
  pdfContext,
  onSubmit,
  isSubmitting,
}: MarkEntryGridProps) {
  const entryStatus: EntryWindowStatus = getEntryWindowStatus(round);

  // Detect if marks were already saved for this course+round (any learner has a non-null mark)
  // This makes the grid view-only — prevents accidental edits to previously submitted data
  const alreadySaved = useMemo(() => {
    if (!existingMarks || existingMarks.length === 0) return false;
    return existingMarks.some((l) =>
      Object.values(l.marks).some((v) => v !== null && v !== undefined)
    );
  }, [existingMarks]);

  // Read-only when: entry window closed OR marks already saved
  const isReadOnly = entryStatus !== 'open' || alreadySaved;

  // Override component max_marks with course's internal_max_mark when use_course_max is true
  const components = useMemo(
    () =>
      round.components.map((comp) => ({
        ...comp,
        max_marks: useCourseMax && courseMaxMark > 0 ? courseMaxMark : comp.max_marks,
      })),
    [round.components, useCourseMax, courseMaxMark]
  );

  // Build rows from learners + existing marks
  const buildRows = useCallback((): MarkRow[] =>
    learners.map((learner) => {
      const existing = existingMarks?.find(
        (m) => m.register_number === learner.register_number
      );

      const marks: Record<string, number | null> = {};
      for (const comp of components) {
        marks[comp.code] = existing?.marks[comp.code] ?? null;
      }

      return {
        learnerId: learner.id,
        registerNumber: learner.register_number,
        learnerName: learner.name,
        rollNumber: learner.roll_number,
        examRegistrationId: learner.exam_registration_id ?? '',
        courseOfferingId: learner.course_offering_id ?? '',
        marks,
      };
    }),
    [learners, existingMarks, components]
  );

  const [rows, setRows] = useState<MarkRow[]>(buildRows);

  // Re-merge when existing marks load or learners/components change
  React.useEffect(() => {
    setRows(buildRows());
  }, [buildRows]);

  // Update a single mark cell
  const handleMarkChange = useCallback(
    (rowIdx: number, componentCode: string, value: string) => {
      setRows((prev) => {
        const updated = [...prev];
        const numValue = value === '' ? null : Number(value);
        updated[rowIdx] = {
          ...updated[rowIdx],
          marks: { ...updated[rowIdx].marks, [componentCode]: numValue },
        };
        return updated;
      });
    },
    []
  );

  // Calculate row total
  const getRowTotal = useCallback((row: MarkRow): number => {
    return Object.values(row.marks).reduce(
      (sum, v) => sum + (v ?? 0),
      0
    );
  }, []);

  // Calculate max total for the round
  const maxTotal = useMemo(
    () => components.reduce((sum, c) => sum + c.max_marks, 0),
    [components]
  );

  // Validation errors
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    for (const row of rows) {
      for (const comp of components) {
        const mark = row.marks[comp.code];
        if (mark !== null && mark !== undefined) {
          if (mark < 0) {
            errors.push(
              `${row.registerNumber}: ${comp.name} cannot be negative`
            );
          }
          if (mark > comp.max_marks) {
            errors.push(
              `${row.registerNumber}: ${comp.name} (${mark}) exceeds max (${comp.max_marks})`
            );
          }
        }
      }
    }
    return errors;
  }, [rows, components]);

  // Summary stats
  // A row is "complete" only when EVERY component has a non-null mark (0 is valid)
  // Rows with partial marks (some filled, some empty) are counted as pending
  const summaryStats = useMemo(() => {
    const isRowComplete = (r: MarkRow) =>
      components.every((c) => {
        const v = r.marks[c.code];
        return v !== null && v !== undefined;
      });
    const entered = rows.filter(isRowComplete).length;
    return {
      total: rows.length,
      entered,
      pending: rows.length - entered,
      absent: 0,
    };
  }, [rows, components]);

  // Build sync records for submission
  const handleSubmit = useCallback(() => {
    // Guard 1: find any rows where a component mark is missing (null/undefined)
    // Every student must have marks entered for every component before saving
    const incomplete = rows.filter((row) =>
      components.some((c) => {
        const v = row.marks[c.code];
        return v === null || v === undefined;
      })
    );

    if (incomplete.length > 0) {
      const names = incomplete.slice(0, 3).map((r) => r.registerNumber).join(', ');
      const more = incomplete.length > 3 ? ` and ${incomplete.length - 3} more` : '';
      toast.error(
        `${incomplete.length} student(s) missing marks: ${names}${more}`
      );
      return;
    }

    // Guard 2: block if any validation errors exist (marks exceeding max)
    if (validationErrors.length > 0) {
      toast.error(`Fix ${validationErrors.length} validation error(s) before saving`);
      return;
    }

    const records: CiaMarkSyncRecord[] = rows.map((row) => {
      const record: CiaMarkSyncRecord = {
        institutions_id: institutionId,
        examination_session_id: examSessionId,
        course_offering_id: row.courseOfferingId,
        student_id: row.learnerId,
        exam_registration_id: row.examRegistrationId,
        submission_date: new Date().toISOString(),
        cia_round: round.round,
        marks_status: 'Submitted',
        total_internal_marks: getRowTotal(row),
        max_internal_marks: maxTotal,
      };

      // Add component-specific mark fields
      for (const comp of components) {
        const fieldMap = COMPONENT_MARK_FIELDS[comp.code];
        if (fieldMap) {
          record[fieldMap.markField] = row.marks[comp.code] ?? undefined;
          record[fieldMap.maxField] = comp.max_marks;
        }
      }

      return record;
    });

    const generatePDF = async () => {
      // Convert image URLs to base64 for jsPDF
      const toBase64 = async (url: string): Promise<string | undefined> => {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch { return undefined; }
      };

      const [logoBase64, rightLogoBase64] = await Promise.all([
        pdfContext.logoImage ? toBase64(pdfContext.logoImage) : Promise.resolve(undefined),
        pdfContext.rightLogoImage ? toBase64(pdfContext.rightLogoImage) : Promise.resolve(undefined),
      ]);

      const pdfData: InternalMarksPDFData = {
        institution_name: 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)',
        program_code: pdfContext.programCode,
        program_name: pdfContext.programName,
        semester: '',
        course_code: pdfContext.courseCode,
        course_name: pdfContext.courseName,
        internal_max_mark: pdfContext.internalMaxMark,
        exam_session: pdfContext.examSession,
        assessment_name: pdfContext.assessmentName,
        cia_round_name: round.round_name,
        logoImage: logoBase64,
        rightLogoImage: rightLogoBase64,
        components: components.map((c) => ({
          code: c.code,
          name: c.name,
          max_marks: c.max_marks,
        })),
        learners: rows.map((row, i) => ({
          serial_number: i + 1,
          register_number: row.registerNumber,
          student_name: row.learnerName,
          component_marks: Object.fromEntries(
            Object.entries(row.marks)
              .filter(([, v]) => v !== null)
              .map(([k, v]) => [k, v as number])
          ),
          total: getRowTotal(row),
        })),
      };
      generateInternalMarksPDF(pdfData);
    };

    onSubmit(records, generatePDF);
  }, [
    rows,
    validationErrors,
    institutionId,
    examSessionId,
    round.round,
    round.round_name,
    components,
    getRowTotal,
    maxTotal,
    pdfContext,
    onSubmit,
  ]);

  return (
    <div className='space-y-4'>
      {/* Entry window banner — different message depending on lock reason */}
      {alreadySaved && (
        <Alert className='border-blue-500 bg-blue-50 dark:bg-blue-950/30'>
          <AlertTriangle className='h-4 w-4 text-blue-600' />
          <AlertDescription className='text-blue-800 dark:text-blue-200'>
            <span className='font-semibold'>View-only mode.</span> Marks have already been
            saved for this course and round. Contact your administrator if corrections are
            needed.
          </AlertDescription>
        </Alert>
      )}
      {!alreadySaved && isReadOnly && (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertDescription>
            {entryStatus === 'upcoming'
              ? `Mark entry opens on ${new Date(round.entry_from).toLocaleDateString()}`
              : `Mark entry closed on ${new Date(round.entry_to).toLocaleDateString()}`}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      <MarkSummaryCard
        totalLearners={summaryStats.total}
        marksEntered={summaryStats.entered}
        pending={summaryStats.pending}
        absentCount={summaryStats.absent}
      />

      {/* Prominent blocking banner when any student is missing marks */}
      {!isReadOnly && summaryStats.pending > 0 && (
        <div className='rounded-lg border-2 border-red-500 bg-red-50 p-4 shadow-sm dark:bg-red-950/30'>
          <div className='flex items-start gap-3'>
            <AlertTriangle className='h-6 w-6 text-red-600 flex-shrink-0 mt-0.5' />
            <div className='flex-1'>
              <p className='font-bold text-red-800 dark:text-red-200 text-sm'>
                Cannot save: {summaryStats.pending} of {summaryStats.total} students have missing marks
              </p>
              <p className='text-xs text-red-700 dark:text-red-300 mt-1'>
                Every student must have marks entered for every component before saving is allowed.
                Enter 0 if the student scored zero, or leave absent students for a separate process.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mark Entry Table */}
      <Card>
        <CardHeader className='pb-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <CardTitle className='text-base'>
              {round.round_name} — {alreadySaved ? 'Saved Marks (View Only)' : 'Mark Entry'}
              {!isReadOnly && (
                <>
                  <span className='text-red-500 ml-1'>*</span>
                  <span className='text-xs font-normal text-muted-foreground ml-2'>
                    All fields mandatory
                  </span>
                </>
              )}
            </CardTitle>
            {!isReadOnly && (
              <div className='flex items-center gap-3 text-xs'>
                <span className='flex items-center gap-1.5'>
                  <span className='inline-block w-3 h-3 rounded border border-amber-400 bg-amber-50'></span>
                  Pending
                </span>
                <span className='flex items-center gap-1.5'>
                  <span className='inline-block w-3 h-3 rounded border border-emerald-500 bg-emerald-50'></span>
                  Entered
                </span>
                <span className='flex items-center gap-1.5'>
                  <span className='inline-block w-3 h-3 rounded border border-red-500 bg-red-50'></span>
                  Over Max
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b bg-muted/50'>
                  <th className='px-3 py-2 text-left font-medium w-12'>
                    S.No
                  </th>
                  <th className='px-3 py-2 text-left font-medium w-32'>
                    Reg. No
                  </th>
                  <th className='px-3 py-2 text-left font-medium min-w-[150px]'>
                    Student Name
                  </th>
                  {components.map((comp) => (
                    <th
                      key={comp.code}
                      className='px-3 py-2 text-center font-medium min-w-[100px]'
                    >
                      <div>
                        {comp.name}
                        {!isReadOnly && (
                          <span className='text-red-500 ml-0.5' aria-label='required'>*</span>
                        )}
                      </div>
                      <div className='text-xs text-muted-foreground font-normal'>
                        Max: {comp.max_marks}
                      </div>
                    </th>
                  ))}
                  <th className='px-3 py-2 text-center font-medium w-20'>
                    Total
                    <div className='text-xs text-muted-foreground font-normal'>
                      Max: {maxTotal}
                    </div>
                  </th>
                  <th className='px-3 py-2 text-left font-medium min-w-[120px]'>
                    In Words
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr
                    key={row.learnerId}
                    className='border-b hover:bg-muted/30'
                  >
                    <td className='px-3 py-1.5 text-muted-foreground'>
                      {rowIdx + 1}
                    </td>
                    <td className='px-3 py-1.5 font-mono text-xs'>
                      {row.registerNumber}
                    </td>
                    <td className='px-3 py-1.5'>{row.learnerName}</td>

                    {/* Mark inputs per component */}
                    {components.map((comp) => {
                      const mark = row.marks[comp.code];
                      const isOverMax =
                        mark !== null &&
                        mark !== undefined &&
                        mark > comp.max_marks;

                      const isFilled = mark !== null && mark !== undefined;
                      const cellStateClass = isOverMax
                        ? 'border-red-500 bg-red-50 text-red-700 focus-visible:ring-red-500 dark:bg-red-950/40 dark:text-red-300'
                        : isFilled
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold focus-visible:ring-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-600'
                        : isReadOnly
                        // Empty cell in view-only mode — neutral gray, no "pending" signal
                        ? 'border-border bg-muted/30 text-muted-foreground'
                        // Empty cell in edit mode — amber to signal "needs attention"
                        : 'border-amber-400 bg-amber-50 focus-visible:ring-amber-500 dark:bg-amber-950/30 dark:border-amber-600';
                      return (
                        <td key={comp.code} className='px-2 py-1.5'>
                          <Input
                            type='text'
                            inputMode='numeric'
                            pattern='[0-9]*'
                            required
                            aria-required='true'
                            aria-invalid={!isFilled || isOverMax}
                            maxLength={3}
                            data-mark-input='true'
                            value={
                              mark !== null && mark !== undefined ? mark : ''
                            }
                            onChange={(e) => {
                              // Strip any non-digit characters at input time
                              const digitsOnly = e.target.value.replace(/[^0-9]/g, '');
                              handleMarkChange(rowIdx, comp.code, digitsOnly);
                            }}
                            onKeyDown={(e) => {
                              // Enter = jump to next mark input (like Tab, but scoped to marks only)
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const inputs = Array.from(
                                  document.querySelectorAll<HTMLInputElement>(
                                    'input[data-mark-input="true"]:not([disabled])'
                                  )
                                );
                                const currentIdx = inputs.indexOf(e.currentTarget);
                                const next = inputs[currentIdx + 1];
                                if (next) {
                                  next.focus();
                                  next.select();
                                } else {
                                  // Last field — blur so user sees the "Save Marks" button in focus
                                  e.currentTarget.blur();
                                }
                              }
                            }}
                            disabled={isReadOnly}
                            className={cn(
                              'h-9 text-center w-20 mx-auto font-medium transition-colors',
                              cellStateClass
                            )}
                          />
                        </td>
                      );
                    })}

                    {/* Total */}
                    <td className='px-3 py-1.5 text-center font-medium'>
                      {getRowTotal(row)}/{maxTotal}
                    </td>

                    {/* In Words */}
                    <td className='px-3 py-1.5 text-xs text-muted-foreground'>
                      {getRowTotal(row) > 0 ? numberToWords(getRowTotal(row)) : ''}
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={components.length + 4}
                      className='px-3 py-8 text-center text-muted-foreground'
                    >
                      No learners found for the selected filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pending students warning */}
      {!isReadOnly && summaryStats.pending > 0 && summaryStats.entered > 0 && (
        <Alert>
          <AlertTriangle className='h-4 w-4' />
          <AlertDescription>
            <span className='font-medium'>{summaryStats.pending} student(s)</span> still have
            missing marks. All students must have marks entered before saving.
          </AlertDescription>
        </Alert>
      )}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertDescription>
            <p className='font-medium mb-1'>Validation errors:</p>
            <ul className='list-disc list-inside text-sm'>
              {validationErrors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {validationErrors.length > 5 && (
                <li>...and {validationErrors.length - 5} more</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Submit button */}
      {!isReadOnly && rows.length > 0 && (
        <div className='flex justify-end'>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={
                  isSubmitting ||
                  validationErrors.length > 0 ||
                  summaryStats.pending > 0 ||
                  summaryStats.entered === 0
                }
                onClick={(e) => {
                  // Belt-and-suspenders: even if disabled is bypassed, stop here
                  if (summaryStats.pending > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    toast.error(
                      `Cannot save — ${summaryStats.pending} of ${summaryStats.total} student(s) still have missing marks`
                    );
                    return;
                  }
                  if (validationErrors.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    toast.error(
                      `Fix ${validationErrors.length} validation error(s) before saving`
                    );
                    return;
                  }
                }}
                size='lg'
              >
                {isSubmitting ? (
                  <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                ) : (
                  <Save className='h-4 w-4 mr-2' />
                )}
                Save Marks ({summaryStats.entered}/{summaryStats.total} students)
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Save Marks</AlertDialogTitle>
                <AlertDialogDescription className='sr-only'>
                  Review the details below before saving the marks.
                </AlertDialogDescription>
              </AlertDialogHeader>

              {/* Summary grid — key/value rows */}
              <div className='grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm py-2'>
                <span className='text-muted-foreground'>Program</span>
                <span className='font-medium'>
                  {pdfContext.programCode}
                  {pdfContext.programName ? ` - ${pdfContext.programName}` : ''}
                </span>

                <span className='text-muted-foreground'>Course</span>
                <span className='font-medium'>
                  {pdfContext.courseCode}
                  {pdfContext.courseName ? ` - ${pdfContext.courseName}` : ''}
                </span>

                <span className='text-muted-foreground'>Assessment</span>
                <span className='font-medium'>
                  {pdfContext.assessmentName
                    ? `${pdfContext.assessmentName} - ${round.round_name}`
                    : round.round_name}
                </span>

                {pdfContext.examSession && (
                  <>
                    <span className='text-muted-foreground'>Exam Session</span>
                    <span className='font-medium'>{pdfContext.examSession}</span>
                  </>
                )}

                <span className='text-muted-foreground'>Learners with marks</span>
                <span className='font-semibold text-emerald-600 dark:text-emerald-400'>
                  {summaryStats.entered} of {summaryStats.total}
                </span>
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSubmit}>
                  <Save className='h-4 w-4 mr-2' />
                  Confirm Save
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
