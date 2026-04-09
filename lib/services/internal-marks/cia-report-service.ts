import type { CiaReportResponse } from '@/types/internal-marks';

export class CiaReportService {
  private static baseUrl = '/api/internal-marks/report';

  static async getReport(params: {
    institutionId: string;
    examSessionId: string;
    courseCode: string;
    ciaRound: number;
    programCode?: string;
  }): Promise<CiaReportResponse> {
    const sp = new URLSearchParams({
      institutionId: params.institutionId,
      examSessionId: params.examSessionId,
      courseCode: params.courseCode,
      ciaRound: String(params.ciaRound),
    });
    if (params.programCode) sp.set('programCode', params.programCode);

    const res = await fetch(`${this.baseUrl}?${sp.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch report' }));
      throw new Error(err.error ?? 'Failed to fetch report');
    }
    return (await res.json()).data;
  }

  static async downloadPdf(params: {
    institutionId: string;
    examSessionId: string;
    courseCode: string;
    ciaRound: number;
    programCode?: string;
    roundName?: string;
  }): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/export-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to generate PDF' }));
      throw new Error(err.error ?? 'Failed to generate PDF');
    }
    return res.blob();
  }

  static triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
