import type { CiaReportLearner, CiaReportResponse } from '@/types/internal-marks';

/**
 * Flattens any `extra_marks` JSONB block returned by COE into the learner's
 * flat `marks` map, so consumers (PDF generator, entry grid) only handle one
 * shape keyed by component code.
 *
 * Background: the write contract (POST /api/v1/cia-marks/sync) splits component
 * marks across flat columns (test_1_mark, assignment_marks, ...) and a JSONB
 * `extra_marks` for end-user-defined codes. COE's read contract may mirror this
 * split. Without a merge here, custom-code marks load as 0 because the entry
 * grid only reads `learner.marks[code]`.
 *
 * Idempotent: if COE already flattens, this is a no-op. Existing keys in
 * `marks` win over `extra_marks` (in case of a duplicate code).
 */
export function flattenExtraMarks<T extends CiaReportLearner>(learner: T): T {
  if (!learner.extra_marks) return learner;
  const merged: Record<string, number | null> = { ...learner.extra_marks, ...learner.marks };
  return { ...learner, marks: merged };
}

/**
 * Maps `flattenExtraMarks` over a `CiaReportResponse.learners` array, returning
 * a new response with merged marks. Returns the original object reference when
 * `learners` is empty/missing so the proxy passes COE shape through untouched.
 */
export function flattenReportExtraMarks(report: CiaReportResponse): CiaReportResponse {
  if (!report?.learners?.length) return report;
  return { ...report, learners: report.learners.map(flattenExtraMarks) };
}
