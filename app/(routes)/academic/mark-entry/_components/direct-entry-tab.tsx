'use client';

import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSubmitCiaMarks } from '@/hooks/internal-marks/use-cia-marks';
import {
  istToday,
  STANDARD_COMPONENT_CODES,
  type CiaRound,
  type CiaMarkSyncRecord,
  type LearnerForMarkEntry,
} from '@/types/internal-marks';
import { FROZEN_LEFT, FROZEN_W } from '@/types/mark-entry';

interface Props {
  institutionId: string;
  examSessionId: string;
  ciaSettingId: string;
  round: CiaRound;
  learners: LearnerForMarkEntry[];
  maxInternalMarks: number;
  canEnter: boolean;
  /** Shown when the round is question-wise but no paper exists. */
  fallbackNotice?: string;
}

/**
 * Component-wise (legacy) entry — one total per component.
 *
 * This is a fresh implementation rather than a reuse of
 * /academic/internal-marks/_components/mark-entry-grid.tsx, because that page is
 * explicitly out of scope for changes and sharing the component would couple the
 * two. The WRITE path is shared though: it posts through the existing
 * /api/internal-marks/marks proxy, so both screens hit the same COE sync with
 * the same entry-window rules.
 */
export function DirectEntryTab({
  institutionId,
  examSessionId,
  ciaSettingId,
  round,
  learners,
  maxInternalMarks,
  canEnter,
  fallbackNotice,
}: Props) {
  const [values, setValues] = useState<Record<string, Record<string, number>>>({});
  const submitMutation = useSubmitCiaMarks();

  // Memoised: it feeds handleSave's dependency list, and a fresh array literal
  // on every render would rebuild that callback each time.
  const components = useMemo(() => round.components ?? [], [round.components]);

  const handleChange = useCallback(
    (studentId: string, code: string, raw: string) => {
      setValues((prev) => {
        const row = { ...(prev[studentId] ?? {}) };
        if (raw === '') delete row[code];
        else {
          const n = parseInt(raw, 10);
          if (Number.isFinite(n)) row[code] = n;
        }
        return { ...prev, [studentId]: row };
      });
    },
    []
  );

  const rows = useMemo(
    () =>
      learners.map((l) => {
        const marks = values[l.id] ?? {};
        const total = Object.values(marks).reduce((s, v) => s + (Number(v) || 0), 0);
        return { learner: l, marks, total };
      }),
    [learners, values]
  );

  const filled = rows.filter((r) => Object.keys(r.marks).length > 0);
  const overMax = rows.filter((r) => maxInternalMarks > 0 && r.total > maxInternalMarks);

  const handleSave = useCallback(() => {
    const records: CiaMarkSyncRecord[] = filled.map(({ learner, marks, total }) => {
      const record: CiaMarkSyncRecord = {
        institutions_id: institutionId,
        examination_session_id: examSessionId,
        course_offering_id: learner.course_offering_id ?? '',
        student_id: learner.id,
        exam_registration_id: learner.exam_registration_id ?? '',
        submission_date: istToday(),
        cia_round: round.round,
        cia_setting_id: ciaSettingId,
        marks_status: 'Submitted',
        total_internal_marks: total,
        max_internal_marks: maxInternalMarks,
      };

      const extra: Record<string, number> = {};
      const extraMax: Record<string, number> = {};
      for (const c of components) {
        const value = marks[c.code];
        if (value == null) continue;
        if (STANDARD_COMPONENT_CODES.has(c.code)) {
          const testMatch = c.code.match(/^test_(\d)$/);
          // v1 allowlist names: `max_<code>_marks` / `max_test_<n>_mark`.
          if (testMatch) {
            record[`test_${testMatch[1]}_mark`] = value;
            record[`max_test_${testMatch[1]}_mark`] = c.max_marks;
          } else {
            record[`${c.code}_marks`] = value;
            record[`max_${c.code}_marks`] = c.max_marks;
          }
        } else {
          extra[c.code] = value;
          extraMax[c.code] = c.max_marks;
        }
      }
      if (Object.keys(extra).length) {
        record.extra_marks = extra;
        record.extra_marks_max = extraMax;
      }
      return record;
    });

    submitMutation.mutate({ records }, { onSuccess: () => setValues({}) });
  }, [
    filled, institutionId, examSessionId, round.round, ciaSettingId,
    maxInternalMarks, components, submitMutation,
  ]);

  if (components.length === 0) {
    return (
      <Card>
        <CardContent className='py-12 text-center text-sm text-muted-foreground'>
          This round has no components configured. Add them to the CIA setting in COE first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-4'>
      {fallbackNotice && (
        <Alert className='border-amber-300 bg-amber-50 dark:bg-amber-950/30'>
          <AlertTriangle className='h-4 w-4 text-amber-600' />
          <AlertDescription className='text-sm'>{fallbackNotice}</AlertDescription>
        </Alert>
      )}

      <div className='rounded-lg border bg-background'>
        <div className='isolate min-w-0 max-h-[70vh] overflow-auto'>
          <table className='border-separate border-spacing-0 text-sm' style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th
                  className='sticky top-0 z-40 border-b bg-slate-800 px-2 py-1.5 text-left text-xs font-medium text-slate-50'
                  style={{ left: FROZEN_LEFT.sno, width: FROZEN_W.sno, minWidth: FROZEN_W.sno, maxWidth: FROZEN_W.sno }}
                >
                  S.No
                </th>
                <th
                  className='sticky top-0 z-40 border-b bg-slate-800 px-2 py-1.5 text-left text-xs font-medium text-slate-50'
                  style={{ left: FROZEN_LEFT.register, width: FROZEN_W.register, minWidth: FROZEN_W.register, maxWidth: FROZEN_W.register }}
                >
                  Register Number
                </th>
                <th
                  className='sticky top-0 z-40 border-b bg-slate-800 px-2 py-1.5 text-left text-xs font-medium text-slate-50'
                  style={{ left: FROZEN_LEFT.name, width: FROZEN_W.name, minWidth: FROZEN_W.name, maxWidth: FROZEN_W.name }}
                >
                  Name of the Learner
                </th>
                {components.map((c) => (
                  <th
                    key={c.code}
                    className='sticky top-0 z-30 border-b bg-slate-700 px-2 py-1.5 text-center text-xs font-medium text-slate-50'
                    style={{ width: 110, minWidth: 110, maxWidth: 110 }}
                  >
                    <div>{c.name}</div>
                    <div className='text-[10px] opacity-80'>Max: {c.max_marks}</div>
                  </th>
                ))}
                <th
                  className='sticky top-0 z-30 border-b bg-indigo-800 px-2 py-1.5 text-center text-xs font-medium text-indigo-50'
                  style={{ width: 90, minWidth: 90, maxWidth: 90 }}
                >
                  <div>Total</div>
                  <div className='text-[10px] opacity-80'>Max: {maxInternalMarks}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ learner, marks, total }, i) => {
                const over = maxInternalMarks > 0 && total > maxInternalMarks;
                return (
                  <tr key={learner.id} className='even:bg-muted/30'>
                    <td
                      className='sticky z-20 border-b bg-background px-2 py-1 text-center text-xs text-muted-foreground'
                      style={{ left: FROZEN_LEFT.sno, width: FROZEN_W.sno, minWidth: FROZEN_W.sno, maxWidth: FROZEN_W.sno }}
                    >
                      {i + 1}
                    </td>
                    <td
                      className='sticky z-20 border-b bg-background px-2 py-1 font-mono text-xs'
                      style={{ left: FROZEN_LEFT.register, width: FROZEN_W.register, minWidth: FROZEN_W.register, maxWidth: FROZEN_W.register }}
                    >
                      {learner.register_number}
                    </td>
                    <td
                      className='sticky z-20 border-b bg-background px-2 py-1 text-xs'
                      style={{ left: FROZEN_LEFT.name, width: FROZEN_W.name, minWidth: FROZEN_W.name, maxWidth: FROZEN_W.name }}
                    >
                      {learner.name}
                    </td>
                    {components.map((c) => {
                      const value = marks[c.code];
                      const invalid = value != null && value > c.max_marks;
                      return (
                        <td
                          key={c.code}
                          className='border-b px-2 py-1 text-center'
                          style={{ width: 110, minWidth: 110, maxWidth: 110 }}
                        >
                          <input
                            type='number'
                            inputMode='numeric'
                            step={1}
                            min={0}
                            max={c.max_marks}
                            disabled={!canEnter}
                            value={value ?? ''}
                            aria-label={`${learner.register_number} ${c.name}`}
                            onChange={(e) => handleChange(learner.id, c.code, e.target.value)}
                            className={cn(
                              'h-8 w-20 rounded border bg-background text-center text-xs',
                              'focus:outline-none focus:ring-2 focus:ring-primary/40',
                              invalid && 'border-red-500 text-red-600 ring-1 ring-red-500'
                            )}
                          />
                        </td>
                      );
                    })}
                    <td
                      className='border-b bg-indigo-50/70 px-2 py-1 text-center dark:bg-indigo-950/40'
                      style={{ width: 90, minWidth: 90, maxWidth: 90 }}
                    >
                      <span
                        className={cn(
                          'font-mono text-sm font-semibold',
                          over ? 'text-red-600' : 'text-indigo-700 dark:text-indigo-300'
                        )}
                      >
                        {total}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {overMax.length > 0 && (
        <p className='text-xs text-red-600'>
          {overMax.length} learner(s) exceed the internal maximum of {maxInternalMarks}.
        </p>
      )}

      {canEnter && (
        <div className='sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background/95 py-3 backdrop-blur'>
          <p className='text-xs text-muted-foreground'>
            {filled.length} of {rows.length} learners have marks
          </p>
          <Button
            className='ml-auto'
            size='sm'
            disabled={filled.length === 0 || overMax.length > 0 || submitMutation.isPending}
            onClick={handleSave}
          >
            {submitMutation.isPending ? (
              <Loader2 className='mr-1 h-4 w-4 animate-spin' />
            ) : (
              <Save className='mr-1 h-4 w-4' />
            )}
            Save {filled.length} of {rows.length}
          </Button>
        </div>
      )}
    </div>
  );
}
