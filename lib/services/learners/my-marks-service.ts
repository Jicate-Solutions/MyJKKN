/**
 * Client-side service for the student "My Marks" portal.
 *
 * Thin wrappers around /api/learners/my-marks/* — the API routes carry all
 * the security (register_number scoping). This file just picks the URL and
 * narrows the response.
 *
 * Mirrors the static-method pattern used by CiaSettingsService.
 */

import type {
  MyMarksRegistrationsResponse,
  MyMarksReportRow,
  MyMarksCiaSetting,
  MyMarksInternalFinalResponse,
  MyMarksResultResponse,
  MyMarksGradeSystemResponse,
  StudentResultView,
  StudentCiaView,
} from '@/types/my-marks';
export type { MyMarksReportRow } from '@/types/my-marks';
import type { CiaReportCourse, CiaRound } from '@/types/internal-marks';

interface MarksResponseBody {
  row: MyMarksReportRow | null;
  course?: CiaReportCourse;
  round?: { round: number; round_name: string };
  exam_session?: { id: string; session_name: string };
}

export class MyMarksService {
  static async getRegistrations(): Promise<MyMarksRegistrationsResponse> {
    const res = await fetch('/api/learners/my-marks/registrations', {
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load registrations' }));
      throw new Error(err.error ?? 'Failed to load registrations');
    }
    const json = await res.json();
    return json.data;
  }

  static async getCiaSettings(params: {
    examSessionId: string;
    programCode: string;
  }): Promise<MyMarksCiaSetting[]> {
    const search = new URLSearchParams({
      examSessionId: params.examSessionId,
      programCode: params.programCode,
    });
    const res = await fetch(
      `/api/learners/my-marks/cia-settings?${search.toString()}`
    );
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: 'Failed to load CIA settings' }));
      throw new Error(err.error ?? 'Failed to load CIA settings');
    }
    const json = await res.json();
    return json.data ?? [];
  }

  static async getMarks(params: {
    examSessionId: string;
    courseCode: string;
    ciaRound: number;
    programCode: string;
  }): Promise<MarksResponseBody> {
    const search = new URLSearchParams({
      examSessionId: params.examSessionId,
      courseCode: params.courseCode,
      ciaRound: String(params.ciaRound),
      programCode: params.programCode,
    });
    const res = await fetch(
      `/api/learners/my-marks/marks?${search.toString()}`
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load marks' }));
      throw new Error(err.error ?? 'Failed to load marks');
    }
    const json = await res.json();
    return json.data;
  }

  /**
   * Batch variant — fetches marks for many courses in a single round.
   * Returns a map keyed by course_code with row + optional soft error.
   */
  static async getMarksBatch(params: {
    examSessionId: string;
    programCode: string;
    ciaRound: number;
    courseCodes: string[];
  }): Promise<Record<string, { row: MyMarksReportRow | null; error?: string }>> {
    if (params.courseCodes.length === 0) return {};
    const search = new URLSearchParams({
      examSessionId: params.examSessionId,
      programCode: params.programCode,
      ciaRound: String(params.ciaRound),
      courseCodes: params.courseCodes.join(','),
    });
    const res = await fetch(
      `/api/learners/my-marks/marks-batch?${search.toString()}`
    );
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: 'Failed to load marks' }));
      throw new Error(err.error ?? 'Failed to load marks');
    }
    const json = await res.json();
    return json.data?.rows ?? {};
  }

  static async getInternalFinal(): Promise<MyMarksInternalFinalResponse> {
    const res = await fetch('/api/learners/my-marks/internal-final');
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load final marks' }));
      throw new Error(err.error ?? 'Failed to load final marks');
    }
    const json = await res.json();
    return json.data;
  }

  /**
   * Published semester result for a single exam session. Returns the caller's
   * own result rows only (server-side filtered). Empty `results` means the
   * institution hasn't declared the result for that session yet.
   */
  static async getResult(params: {
    examSessionId: string;
  }): Promise<MyMarksResultResponse> {
    const search = new URLSearchParams({ examSessionId: params.examSessionId });
    const res = await fetch(
      `/api/learners/my-marks/result?${search.toString()}`
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load result' }));
      throw new Error(err.error ?? 'Failed to load result');
    }
    const json = await res.json();
    return json.data;
  }

  /**
   * Single aggregate result view (replaces registrations + result + grade-system
   * for the Result tab). One call returns all semesters, courses, grades, SGPA
   * and the grade-band legend.
   */
  static async getResultView(): Promise<StudentResultView> {
    const res = await fetch('/api/learners/my-marks/result-view');
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load result' }));
      throw new Error(err.error ?? 'Failed to load result');
    }
    const json = await res.json();
    return json.data;
  }

  /**
   * Single aggregate CIA view (replaces registrations + cia-settings +
   * cia-marks/report for the Internal tab). One call returns all sessions, the
   * CIA round/component config, and the learner's marks per course per round.
   */
  static async getCiaView(): Promise<StudentCiaView> {
    const res = await fetch('/api/learners/my-marks/cia-view');
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load internal marks' }));
      throw new Error(err.error ?? 'Failed to load internal marks');
    }
    const json = await res.json();
    return json.data;
  }

  /**
   * Institution grade bands (grade letter, point, mark range, description).
   * Reference data used to decorate result rows with a human grade label.
   */
  static async getGradeSystem(): Promise<MyMarksGradeSystemResponse> {
    const res = await fetch('/api/learners/my-marks/grade-system');
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load grade system' }));
      throw new Error(err.error ?? 'Failed to load grade system');
    }
    const json = await res.json();
    return {
      bands: json.data?.bands ?? [],
      grade_system_code: json.data?.grade_system_code ?? null,
    };
  }

  /**
   * Pure helper — picks the "current" CIA Setting from a list.
   * Rule: most-recently-updated active setting. The page can override.
   */
  static autoSelectSetting(
    settings: MyMarksCiaSetting[]
  ): MyMarksCiaSetting | null {
    const active = settings.filter((s) => s.is_active !== false);
    if (active.length === 0) return null;
    return [...active].sort((a, b) => {
      const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
      const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
      return tb - ta;
    })[0];
  }

  /** Pure helper — picks the lowest-numbered round from a setting. */
  static autoSelectRound(rounds: CiaRound[] | undefined): number | null {
    if (!rounds || rounds.length === 0) return null;
    return [...rounds].sort((a, b) => a.round - b.round)[0].round;
  }
}
