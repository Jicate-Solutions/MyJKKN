import type { CiaSettings, ExamSession } from '@/types/internal-marks';

/**
 * Client-side service for CIA Settings and Exam Sessions.
 * Passes MyJKKN institution UUID to API routes — COE resolves via myjkkn_institution_ids.
 */
export class CiaSettingsService {
  static async getExamSessions(institutionId: string): Promise<ExamSession[]> {
    const res = await fetch(`/api/internal-marks/exam-sessions?institutionId=${institutionId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch exam sessions' }));
      throw new Error(err.error ?? 'Failed to fetch exam sessions');
    }
    const json = await res.json();
    return json.data;
  }

  static async getCiaSettings(params: {
    institutionId: string;
    examSessionId: string;
    programCode?: string;
  }): Promise<CiaSettings[]> {
    const searchParams = new URLSearchParams({
      institutionId: params.institutionId,
      examSessionId: params.examSessionId,
    });
    if (params.programCode) searchParams.set('programCode', params.programCode);

    const res = await fetch(`/api/internal-marks/settings?${searchParams.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch CIA settings' }));
      throw new Error(err.error ?? 'Failed to fetch CIA settings');
    }
    const json = await res.json();
    return json.data;
  }
}
