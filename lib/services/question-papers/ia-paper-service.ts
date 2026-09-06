import { toast } from 'sonner';
import { paperPdfFilename } from '@/lib/utils/question-papers/paper-filename';
import {
  PaperSaveError,
  type IaCourseOutcome,
  type IaPaperTemplate,
  type IaQuestionPaper,
  type IaQuestionPaperDetail,
  type GeneratePapersDto,
  type GeneratePapersResult,
  type PlannedScope,
  type QuestionPaperListFilters,
  type SaveErrorCode,
  type SavePaperDto,
} from '@/types/ia-question-paper';

/** Layout variants COE's renderer offers for a paper PDF. */
export type PdfLayout = 'single' | '2up';

/**
 * Client-side service for IA Question Papers.
 *
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
    if (!res.ok) throw new Error((await safeError(res)).message ?? 'Failed to fetch question papers');
    return asArray<IaQuestionPaper>((await res.json()).data);
  }

  static async generatePapers(dto: GeneratePapersDto): Promise<GeneratePapersResult> {
    const res = await fetch('/api/question-papers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) throw new Error((await safeError(res)).message ?? 'Failed to generate question papers');
    return (await res.json()).data;
  }

  static async getPaper(id: string): Promise<IaQuestionPaperDetail> {
    const res = await fetch(`/api/question-papers/${id}`);
    if (!res.ok) throw new Error((await safeError(res)).message ?? 'Failed to fetch question paper');
    return (await res.json()).data;
  }

  /**
   * Save questions / meta / status.
   *
   * Rejections arrive with a machine-readable code (SUB_MARKS, INCOMPLETE,
   * WOULD_CLEAR, CONFLICT, AUTHORED) so callers can branch — WOULD_CLEAR into a
   * confirm-and-retry, CONFLICT into "reopen the paper", INCOMPLETE into the
   * checklist panel. Anything else surfaces as a plain Error.
   */
  static async savePaper(id: string, dto: SavePaperDto): Promise<IaQuestionPaperDetail> {
    const res = await fetch(`/api/question-papers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) {
      const { code, message } = await safeError(res);
      throw new PaperSaveError(message ?? 'Failed to save question paper', code, res.status);
    }
    return (await res.json()).data;
  }

  static async deletePaper(id: string): Promise<void> {
    const res = await fetch(`/api/question-papers/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await safeError(res)).message ?? 'Failed to delete question paper');
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
    if (!res.ok) throw new Error((await safeError(res)).message ?? 'Failed to fetch planned scopes');
    return asArray<PlannedScope>((await res.json()).data);
  }

  static async listTemplates(institutionId: string): Promise<IaPaperTemplate[]> {
    const qs = new URLSearchParams({ institutionId, exam_scope: 'cia', status: 'active' });
    const res = await fetch(`/api/question-papers/templates?${qs.toString()}`);
    if (!res.ok) throw new Error((await safeError(res)).message ?? 'Failed to fetch templates');
    return asArray<IaPaperTemplate>((await res.json()).data);
  }

  // ── Course outcomes master ───────────────────────────────────────────────

  static async listCourseOutcomes(courseId: string): Promise<IaCourseOutcome[]> {
    const res = await fetch(
      `/api/question-papers/course-outcomes?course_id=${encodeURIComponent(courseId)}`
    );
    if (!res.ok) throw new Error((await safeError(res)).message ?? 'Failed to fetch course outcomes');
    return asArray<IaCourseOutcome>((await res.json()).data);
  }

  /** Add one CO, or bulk-upsert several (`outcomes[]`) on `course_id,co_code`. */
  static async addCourseOutcomes(body: {
    course_id: string;
    course_code: string;
    co_code?: string;
    co_description?: string;
    display_order?: number;
    outcomes?: { co_code: string; co_description?: string; display_order?: number }[];
  }): Promise<void> {
    const res = await fetch('/api/question-papers/course-outcomes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await safeError(res)).message ?? 'Failed to save course outcome');
  }

  static async deleteCourseOutcome(id: string): Promise<void> {
    const res = await fetch(
      `/api/question-papers/course-outcomes?id=${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error((await safeError(res)).message ?? 'Failed to delete course outcome');
  }

  // ── PDF export ───────────────────────────────────────────────────────────

  /**
   * Fetch one paper's PDF as a blob.
   *
   * Fetching the bytes (rather than pointing an `<a download>` at the route) is
   * what lets us branch on the HTTP status: a plain link cannot see a failure and
   * would happily save the server's JSON error as a junk "pdf".
   */
  private static async fetchPaperPdf(
    id: string,
    layout: PdfLayout
  ): Promise<{ blob: Blob; filename: string }> {
    const qs = layout === '2up' ? '?layout=2up' : '';
    const res = await fetch(`/api/question-papers/${id}/pdf${qs}`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error((await safeError(res)).message ?? `PDF export failed (${res.status})`);
    }
    const blob = await res.blob();
    // Guard against an error page slipping through with a 200.
    if (blob.type && !blob.type.includes('pdf')) throw new Error('PDF export failed');
    const filename =
      res.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] ??
      `question-paper-${id}.pdf`;
    return { blob, filename };
  }

  /** Downloads the COE-rendered PDF directly (no new tab). */
  static async downloadPaperPdf(id: string, layout: PdfLayout = 'single'): Promise<void> {
    const toastId = toast.loading(layout === '2up' ? 'Preparing PDF (2-up)…' : 'Preparing PDF…');
    try {
      const { blob, filename } = await this.fetchPaperPdf(id, layout);
      saveBlob(blob, filename);
      toast.success('Question paper downloaded', { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to download PDF', { id: toastId });
    }
  }

  /**
   * Bulk download as a ZIP.
   *
   * Entry names are prefixed `NNN_` so the on-screen order survives — a plain
   * alphabetical archive would scramble a list the user just sorted. Renders run
   * SEQUENTIALLY on purpose: each PDF is a headless-Chromium render on COE, and a
   * parallel burst would trip the shared API key's rate limit.
   */
  static async downloadPapersZip(
    papers: IaQuestionPaper[],
    layout: PdfLayout = 'single',
    zipName?: string
  ): Promise<void> {
    if (papers.length === 0) return;
    const toastId = toast.loading(`Preparing ${papers.length} paper(s)…`);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      let ok = 0;
      const failed: string[] = [];

      for (let i = 0; i < papers.length; i++) {
        const paper = papers[i];
        toast.loading(`Rendering ${i + 1} of ${papers.length}…`, { id: toastId });
        try {
          const { blob } = await this.fetchPaperPdf(paper.id, layout);
          const name = paperPdfFilename(paper, { variant: layout });
          zip.file(`${String(i + 1).padStart(3, '0')}_${name}`, blob);
          ok++;
        } catch {
          // One bad paper must not lose the other 40 renders.
          failed.push(paper.course_code ?? paper.id);
        }
      }

      if (ok === 0) {
        toast.error('No papers could be rendered', { id: toastId });
        return;
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveBlob(content, zipName ?? 'question-papers.zip');
      toast.success(
        `Downloaded ${ok} paper${ok === 1 ? '' : 's'}` +
          (failed.length ? ` — ${failed.length} failed (${failed.slice(0, 3).join(', ')})` : ''),
        { id: toastId }
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to build the ZIP', { id: toastId });
    }
  }
}

/**
 * Archive name: question-papers-CIA<round>[-2up].zip — mirrors COE's, so a paper
 * downloaded from either app lands in a same-named archive.
 */
export function papersZipName(ciaRound: number | undefined, layout: PdfLayout): string {
  const round = ciaRound != null ? `-CIA${ciaRound}` : '';
  return `question-papers${round}${layout === '2up' ? '-2up' : ''}.zip`;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Defensive: never let an unexpected non-array payload crash a `.map()`. */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const SAVE_ERROR_CODES: SaveErrorCode[] = [
  'SUB_MARKS',
  'INCOMPLETE',
  'WOULD_CLEAR',
  'CONFLICT',
  'AUTHORED',
];

/**
 * Read an error response.
 *
 * COE's convention (spec §9.4): a coded rejection puts the CODE in `error` and the
 * readable sentence in `message` — so the text to show a human is `message ?? error`,
 * never `error` alone. Getting this backwards is why a sub-marks rejection used to
 * surface as a toast reading literally "SUB_MARKS".
 */
async function safeError(res: Response): Promise<{ code?: SaveErrorCode; message?: string }> {
  try {
    const json = await res.json();
    const raw = typeof json?.error === 'string' ? json.error : undefined;
    const code = raw && (SAVE_ERROR_CODES as string[]).includes(raw)
      ? (raw as SaveErrorCode)
      : undefined;
    const message = typeof json?.message === 'string' ? json.message : raw;
    return { code, message };
  } catch {
    return {};
  }
}
