import { toast } from 'sonner';
import type {
  IaPaperTemplate,
  IaQuestionPaper,
  IaQuestionPaperDetail,
  GeneratePapersDto,
  GeneratePapersResult,
  PlannedScope,
  QuestionPaperListFilters,
  SavePaperDto,
} from '@/types/ia-question-paper';

/**
 * Client-side service for IA Question Papers.
 * Thin wrappers over the MyJKKN proxy routes (/api/question-papers/*), which
 * forward to the COE /api/v1/ia/* API. Passes the MyJKKN institution UUID — the
 * proxy resolves it to the single COE institution_code (CAS-safe).
 */
export class IaPaperService {
  static async listPapers(filters: QuestionPaperListFilters): Promise<IaQuestionPaper[]> {
    const qs = new URLSearchParams();
    if (filters.institutionId) qs.set('institutionId', filters.institutionId);
    if (filters.examSessionId) qs.set('examination_session_id', filters.examSessionId);
    if (filters.ciaRound != null) qs.set('cia_round', String(filters.ciaRound));
    if (filters.programCode) qs.set('program_code', filters.programCode);
    if (filters.semester != null) qs.set('semester', String(filters.semester));
    if (filters.status) qs.set('status', filters.status);

    const res = await fetch(`/api/question-papers?${qs.toString()}`);
    if (!res.ok) throw new Error((await safeError(res)) ?? 'Failed to fetch question papers');
    return asArray<IaQuestionPaper>((await res.json()).data);
  }

  static async generatePapers(dto: GeneratePapersDto): Promise<GeneratePapersResult> {
    const res = await fetch('/api/question-papers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) throw new Error((await safeError(res)) ?? 'Failed to generate question papers');
    return (await res.json()).data;
  }

  static async getPaper(id: string): Promise<IaQuestionPaperDetail> {
    const res = await fetch(`/api/question-papers/${id}`);
    if (!res.ok) throw new Error((await safeError(res)) ?? 'Failed to fetch question paper');
    return (await res.json()).data;
  }

  static async savePaper(id: string, dto: SavePaperDto): Promise<IaQuestionPaperDetail> {
    const res = await fetch(`/api/question-papers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) throw new Error((await safeError(res)) ?? 'Failed to save question paper');
    return (await res.json()).data;
  }

  static async deletePaper(id: string): Promise<void> {
    const res = await fetch(`/api/question-papers/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await safeError(res)) ?? 'Failed to delete question paper');
  }

  /** Planned (program, semester) scopes from staff_plans for an academic year.
   *  Pass academicYearId when known; otherwise examStartDate lets the server
   *  resolve the year by matching the exam date to an academic_years window. */
  static async listPlannedScopes(
    institutionId: string,
    academicYearId?: string,
    examStartDate?: string
  ): Promise<PlannedScope[]> {
    const qs = new URLSearchParams({ institutionId });
    if (academicYearId) qs.set('academicYearId', academicYearId);
    if (examStartDate) qs.set('examStartDate', examStartDate);
    const res = await fetch(`/api/question-papers/planned-scopes?${qs.toString()}`);
    if (!res.ok) throw new Error((await safeError(res)) ?? 'Failed to fetch planned scopes');
    return asArray<PlannedScope>((await res.json()).data);
  }

  static async listTemplates(institutionId: string): Promise<IaPaperTemplate[]> {
    const qs = new URLSearchParams({ institutionId, exam_scope: 'cia', status: 'active' });
    const res = await fetch(`/api/question-papers/templates?${qs.toString()}`);
    if (!res.ok) throw new Error((await safeError(res)) ?? 'Failed to fetch templates');
    return asArray<IaPaperTemplate>((await res.json()).data);
  }

  /**
   * Downloads the COE-rendered PDF directly (no new tab).
   *
   * Fetches the bytes first so we can branch on the HTTP status: a plain
   * `<a download>` can't see failures and would save the server's JSON error as a
   * junk "pdf.json". Instead we verify the response is OK and actually a PDF, then
   * blob-download it; on error we toast and download nothing. A loading toast
   * covers the few seconds Chromium takes to render.
   */
  static async downloadPaperPdf(id: string): Promise<void> {
    const toastId = toast.loading('Preparing PDF…');
    try {
      const res = await fetch(`/api/question-papers/${id}/pdf`, { cache: 'no-store' });
      if (!res.ok) {
        toast.error((await safeError(res)) ?? `PDF export failed (${res.status})`, { id: toastId });
        return;
      }
      const blob = await res.blob();
      // Guard against an error page slipping through with a 200.
      if (blob.type && !blob.type.includes('pdf')) {
        toast.error('PDF export failed', { id: toastId });
        return;
      }
      const filename =
        res.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] ??
        `question-paper-${id}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Question paper downloaded', { id: toastId });
    } catch {
      toast.error('Failed to download PDF', { id: toastId });
    }
  }
}

/** Defensive: never let an unexpected non-array payload crash a `.map()`. */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function safeError(res: Response): Promise<string | undefined> {
  try {
    const json = await res.json();
    return json?.error;
  } catch {
    return undefined;
  }
}
