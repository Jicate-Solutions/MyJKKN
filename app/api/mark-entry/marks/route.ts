import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
  resolveCoeInstitutionId,
} from '@/lib/utils/internal-marks/internal-marks-access';
import {
  buildEntryPaper,
  isEntryEligible,
  sumMarks,
  validateLearnerMarks,
} from '@/lib/utils/mark-entry/entry-rules';
import { guardMarkEntryScope } from '@/lib/utils/mark-entry/mark-entry-access';
import { istToday, resolveRoundDates, STANDARD_COMPONENT_CODES } from '@/types/internal-marks';
import type { CiaSettings } from '@/types/internal-marks';
import type { IaQuestionPaperDetail } from '@/types/ia-question-paper';
import {
  ABSENT_GRADE,
  type QuestionMarkSaveRequest,
  type QuestionMarkSaveResponse,
} from '@/types/mark-entry';

/**
 * POST /api/mark-entry/marks — save question-wise CIA marks.
 *
 * COE accepts `question_marks` and treats the breakdown as authoritative: it
 * re-derives each component total from the sum and ignores whatever the caller
 * sent for that column. We still send a total (harmless, and it keeps the
 * payload self-describing in logs), but correctness does not depend on it.
 *
 * Absence is a distinct fact from a zero — an absent learner is written as
 * grade 'AAA' with a zeroed component and NO breakdown, which also triggers
 * COE's "a total written without a breakdown clears the stale one" rule.
 */

/**
 * Component code → the COE sync field names.
 *
 * NOTE the max-field naming: the v1 allowlist uses `max_<code>_marks` /
 * `max_test_<n>_mark`. (MyJKKN's COMPONENT_MARK_FIELDS in types/internal-marks.ts
 * uses `<code>_max`, which the allowlist strips — a pre-existing quirk of the
 * /api/internal-marks path, left alone here rather than changed underneath it.)
 */
function componentFields(code: string): { markField: string; maxField: string } | null {
  if (!STANDARD_COMPONENT_CODES.has(code)) return null;
  const testMatch = code.match(/^test_(\d)$/);
  if (testMatch) {
    return { markField: `test_${testMatch[1]}_mark`, maxField: `max_test_${testMatch[1]}_mark` };
  }
  return { markField: `${code}_marks`, maxField: `max_${code}_marks` };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const scope = await resolveInternalMarksAccess(user.id);

    const body = (await request.json()) as QuestionMarkSaveRequest;
    if (!body.records?.length) {
      return NextResponse.json({ error: 'No records provided' }, { status: 400 });
    }
    if (!body.paper_id) {
      return NextResponse.json({ error: 'paper_id is required' }, { status: 400 });
    }

    const first = body.records[0];
    const myjkknInstitutionId = resolveEffectiveInstitutionId(scope, first.institutions_id);
    if (!myjkknInstitutionId) {
      return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 });
    }
    const coeInstitutionId = await resolveCoeInstitutionId(myjkknInstitutionId);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    // Authorization: same tiers as the paper lookup, PLUS the leadership
    // read-only rule. A view-only role reaching this route means the UI was
    // bypassed, so it is a hard 403 rather than a silent no-op.
    const guard = await guardMarkEntryScope(supabase, user.id, scope.isSuperAdmin, scope.role, {
      courseCode: body.course_code,
      programCode: body.program_code,
      sessionFrom: body.session_from,
      sessionTo: body.session_to,
      write: true,
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status ?? 403 });
    }

    const client = CoeRestClient.create();

    // Re-read the paper server-side and re-validate every record against it. A
    // stale browser tab or a direct API call must not be able to bypass the grid,
    // and the component mark is DERIVED here rather than trusted from the client.
    const paperRes = await client.get<{ data: IaQuestionPaperDetail }>(
      `/api/v1/ia/question-papers/${body.paper_id}`
    );
    const paper = paperRes?.data;
    if (!paper) {
      return NextResponse.json({ error: 'Question paper not found' }, { status: 404 });
    }

    // Marks are entered against an APPROVED paper only. A draft can still be
    // regenerated from its template and mint new question ids, and a submitted
    // paper can still be edited — either would orphan marks keyed against it.
    if (!isEntryEligible(paper.status)) {
      return NextResponse.json(
        {
          error: `This question paper is still ${paper.status}. It must be approved before marks can be entered.`,
        },
        { status: 409 }
      );
    }

    const { questions, parts } = buildEntryPaper(
      paper.questions ?? [],
      paper.template_parts ?? []
    );

    const issues: string[] = [];
    for (const record of body.records) {
      // An absent learner carries no breakdown by definition — nothing to check.
      if (record.is_absent) continue;
      const block = record.question_marks?.[record.component_code];
      const marks = block?.marks ?? {};
      const errors = validateLearnerMarks(marks, questions, parts, record.component_max);
      for (const e of errors) issues.push(`${record.student_id}: ${e}`);
    }
    // The round's other components (e.g. Assignment) ride in the same row as
    // plain totals. They have no paper to validate against, so the checks are the
    // ones a component total can fail: whole number, within its max.
    for (const record of body.records) {
      for (const [code, entry] of Object.entries(record.other_components ?? {})) {
        const mark = Number(entry?.mark);
        const max = Number(entry?.max);
        if (code === record.component_code || code === 'attendance') {
          issues.push(`${record.student_id}: ${code} cannot be sent as an other component`);
        } else if (!Number.isInteger(mark) || mark < 0) {
          issues.push(`${record.student_id}: ${code} mark must be a whole number, 0 or more`);
        } else if (!(max > 0) || mark > max) {
          issues.push(`${record.student_id}: ${code} mark (${mark}) exceeds its max (${max})`);
        }
      }
    }
    if (issues.length) {
      return NextResponse.json({ error: 'Validation failed', details: issues }, { status: 400 });
    }

    // Entry-window gate, inclusive deadline — same rule as the internal-marks
    // path so the two entry screens never disagree about whether today is open.
    try {
      const settings = await client.get<CiaSettings[]>('/api/v1/cia-settings', {
        institutions_id: coeInstitutionId,
        examination_session_id: first.examination_session_id,
      });
      const round = (settings ?? [])
        .flatMap((s) => s.cia_rounds ?? [])
        .find((r) => r.round === first.cia_round);
      // Component limits come from the EXACT assessment the client named — two
      // settings can share a round number with different components, so the
      // round-number match below is good enough for the window but not for this.
      const exactRound = (settings ?? [])
        .find((s) => s.id === first.cia_setting_id)
        ?.cia_rounds?.find((r) => r.round === first.cia_round);
      if (exactRound) {
        // The client's max is only a hint — the round's own setting is the limit.
        const roundMax = new Map(
          (exactRound.components ?? []).map((c) => [c.code, Number(c.max_marks) || 0])
        );
        const overMax: string[] = [];
        for (const record of body.records) {
          for (const [code, entry] of Object.entries(record.other_components ?? {})) {
            const limit = roundMax.get(code);
            if (limit == null) {
              overMax.push(`${record.student_id}: ${code} is not a component of this round`);
            } else if (limit > 0 && Number(entry.mark) > limit) {
              overMax.push(`${record.student_id}: ${code} mark (${entry.mark}) exceeds its max (${limit})`);
            }
          }
        }
        if (overMax.length) {
          return NextResponse.json({ error: 'Validation failed', details: overMax }, { status: 400 });
        }
      }

      if (round) {
        const { entryFrom, entryTo } = resolveRoundDates(round);
        const today = istToday();
        if (entryFrom && today < entryFrom) {
          return NextResponse.json(
            { error: `Entry window not open yet — opens ${entryFrom} (IST)` },
            { status: 403 }
          );
        }
        if (entryTo && today > entryTo) {
          return NextResponse.json(
            { error: `Entry window closed after ${entryTo} (IST)` },
            { status: 403 }
          );
        }
      }
    } catch (windowErr) {
      // Never block a save because the settings fetch failed — COE enforces too.
      console.warn('[mark-entry/marks] entry-window precheck skipped:', windowErr);
    }

    // Build the COE sync payload. The component column carries the SUM; the
    // breakdown rides alongside in question_marks.
    const syncRecords = body.records.map((record) => {
      const block = record.question_marks?.[record.component_code];
      const hasQuestionMarks = !record.is_absent && Object.keys(block?.marks ?? {}).length > 0;
      // What this write puts in the paper's component:
      //   absent           → 0 (and the breakdown is cleared)
      //   question marks   → their sum (COE re-derives it from the breakdown anyway)
      //   neither          → null: this row only carries other components, so the
      //                      paper's component and its breakdown are NOT touched.
      const componentTotal = record.is_absent
        ? 0
        : hasQuestionMarks
          ? sumMarks(block?.marks ?? {})
          : null;
      const others = Object.entries(record.other_components ?? {});
      const othersTotal = others.reduce((sum, [, entry]) => sum + Number(entry.mark), 0);
      // Round total = the paper's component + every other component. When the
      // component is not being written, its saved total is carried in so the
      // stored total does not silently lose it.
      const total =
        (componentTotal ?? (Number(record.carried_component_total) || 0)) + othersTotal;
      const fields = componentFields(record.component_code);

      const base: Record<string, unknown> = {
        institutions_id: coeInstitutionId,
        examination_session_id: record.examination_session_id,
        course_offering_id: record.course_offering_id,
        student_id: record.student_id,
        exam_registration_id: record.exam_registration_id,
        cia_round: record.cia_round,
        submission_date: record.submission_date,
        marks_status: record.marks_status,
        total_internal_marks: total,
        max_internal_marks: record.max_internal_marks,
        created_by: user.id,
        updated_by: user.id,
        submitted_by: user.id,
      };

      if (record.is_absent) {
        // Absent: grade 'AAA', zeroed component, and NO question_marks key —
        // omitting it is what makes COE clear a previously saved breakdown.
        base.grade = ABSENT_GRADE;
      } else if (hasQuestionMarks) {
        base.question_marks = record.question_marks;
      }

      if (componentTotal !== null) {
        if (fields) {
          base[fields.markField] = componentTotal;
          base[fields.maxField] = record.component_max;
        } else {
          // A custom (end-user-defined) component lives in the extra_marks JSONB.
          base.extra_marks = { [record.component_code]: componentTotal };
          base.extra_marks_max = { [record.component_code]: record.component_max };
        }
      }

      for (const [code, entry] of others) {
        const otherFields = componentFields(code);
        if (otherFields) {
          base[otherFields.markField] = Number(entry.mark);
          base[otherFields.maxField] = Number(entry.max);
        } else {
          base.extra_marks = {
            ...(base.extra_marks as Record<string, number>),
            [code]: Number(entry.mark),
          };
          base.extra_marks_max = {
            ...(base.extra_marks_max as Record<string, number>),
            [code]: Number(entry.max),
          };
        }
      }

      // "Marks go to" was re-pointed after an earlier save: zero the component we
      // are moving away from. COE upserts field-by-field, so an untouched old
      // component would otherwise keep its previous total forever — a number no
      // screen would ever show as wrong, but every report would still add up.
      // Skipped when that component now arrives as an other component: the user
      // is stating its value outright, and zeroing it here would contradict both
      // the screen and the total computed above.
      const clearCode = record.clear_component_code;
      if (
        clearCode &&
        clearCode !== record.component_code &&
        !(clearCode in (record.other_components ?? {}))
      ) {
        const clearFields = componentFields(clearCode);
        if (clearFields) {
          base[clearFields.markField] = 0;
        } else {
          base.extra_marks = {
            ...(base.extra_marks as Record<string, number>),
            [clearCode]: 0,
          };
        }
      }
      return base;
    });

    let inserted = 0;
    let updated = 0;
    let failed = 0;
    const failedRegisters: string[] = [];

    for (let i = 0; i < syncRecords.length; i += 500) {
      const chunk = syncRecords.slice(i, i + 500);
      const result = await client.post<{
        inserted?: number;
        updated?: number;
        failed?: number;
        results?: { index: number; status: string; error?: string }[];
      }>('/api/v1/cia-marks/sync', { records: chunk });

      inserted += result.inserted ?? 0;
      updated += result.updated ?? 0;
      failed += result.failed ?? 0;

      // Map failed rows back to register numbers — a partial write must name the
      // learners that did not save, never report a green success.
      for (const r of result.results ?? []) {
        if (r.status === 'error') {
          const original = body.records[i + r.index];
          if (original) failedRegisters.push(original.exam_registration_id);
        }
      }
    }

    const total = body.records.length;
    const payload: QuestionMarkSaveResponse = {
      success: failed === 0,
      inserted,
      updated,
      failed,
      total,
      details: failedRegisters.length ? failedRegisters : undefined,
      message:
        failed === 0
          ? `Saved marks for ${inserted + updated} learner${inserted + updated === 1 ? '' : 's'}`
          : `Saved ${total - failed} of ${total} learners — ${failed} failed. Re-save to retry; learners already saved will simply update.`,
    };

    // Partial failure is NOT a 200 — the client must be able to branch on it and
    // keep the local draft rather than clearing it.
    return NextResponse.json(payload, { status: failed === 0 ? 200 : 207 });
  } catch (error) {
    if (error instanceof CoeApiError) {
      console.error('[mark-entry/marks] COE rejected:', error.status, error.message, error.details);
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error('[mark-entry/marks] POST error:', error);
    return NextResponse.json({ error: 'Failed to save marks' }, { status: 500 });
  }
}
