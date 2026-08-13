import type {
  MarkEntryPaperResponse,
  QuestionMarkSaveRequest,
  QuestionMarkSaveResponse,
} from '@/types/mark-entry';

export interface PaperLookupParams {
  institutionId?: string;
  examSessionId?: string;
  ciaRound?: number;
  courseCode?: string;
  programCode?: string;
  ciaSettingId?: string;
  /** Explicit set choice — omit to let the server auto-pick. */
  paperId?: string;
  /** CIA assessment period, so a lapsed staff plan still grants access. */
  sessionFrom?: string | null;
  sessionTo?: string | null;
}

/**
 * Client-side service for question-wise CIA mark entry.
 * Thin wrappers over /api/mark-entry/*, which proxy to COE /api/v1/*.
 */
export class MarkEntryService {
  static async fetchPaper(params: PaperLookupParams): Promise<MarkEntryPaperResponse> {
    const qs = new URLSearchParams();
    if (params.institutionId) qs.set('institutionId', params.institutionId);
    if (params.examSessionId) qs.set('examSessionId', params.examSessionId);
    if (params.ciaRound != null) qs.set('ciaRound', String(params.ciaRound));
    if (params.courseCode) qs.set('courseCode', params.courseCode);
    if (params.programCode) qs.set('programCode', params.programCode);
    if (params.ciaSettingId) qs.set('ciaSettingId', params.ciaSettingId);
    if (params.paperId) qs.set('paperId', params.paperId);
    if (params.sessionFrom) qs.set('sessionFrom', params.sessionFrom);
    if (params.sessionTo) qs.set('sessionTo', params.sessionTo);

    const res = await fetch(`/api/mark-entry/paper?${qs.toString()}`);
    if (!res.ok) throw new Error((await safeError(res)) ?? 'Failed to resolve question paper');
    return (await res.json()).data;
  }

  /**
   * Saves marks. A PARTIAL write comes back as 207 with a populated body — it is
   * not an exception, because the caller must keep the local draft and show which
   * learners failed rather than treating the whole batch as lost.
   */
  static async saveMarks(request: QuestionMarkSaveRequest): Promise<QuestionMarkSaveResponse> {
    const res = await fetch('/api/mark-entry/marks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const json = await res.json().catch(() => null);
    if (res.status === 207 && json) return json as QuestionMarkSaveResponse;
    if (!res.ok) {
      const detail = Array.isArray(json?.details) ? ` — ${json.details.slice(0, 3).join('; ')}` : '';
      throw new Error(`${json?.error ?? 'Failed to save marks'}${detail}`);
    }
    return json as QuestionMarkSaveResponse;
  }
}

async function safeError(res: Response): Promise<string | undefined> {
  try {
    return (await res.json())?.error;
  } catch {
    return undefined;
  }
}
