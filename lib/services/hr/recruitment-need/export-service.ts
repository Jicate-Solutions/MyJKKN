/**
 * HR Recruitment Need Signal — Export Service
 *
 * Assembles signal cache data for PDF/XLSX export.
 * Pattern: static class, SupabaseClient as first arg.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRRecruitmentSignalCache,
  OverallSignalStatus,
} from '@/types/hr-recruitment-need';

export interface ExportParams {
  financial_year?: string;
  institution_id?: string;
}

export interface ExportRow {
  institution_name: string;
  program_name: string | null;
  overall_status: OverallSignalStatus;
  composite_score: number | null;
  sanctioned_gap_status: string;
  sanctioned_gap_value: number | null;
  sfr_status: string;
  sfr_value: number | null;
  specialization_gap_status: string;
  specialization_gap_value: number | null;
  workload_status: string;
  workload_value: number | null;
  projected_intake_status: string;
  projected_intake_value: number | null;
  attrition_pipeline_status: string;
  attrition_pipeline_value: number | null;
  peer_benchmark_status: string;
  peer_benchmark_value: number | null;
  computed_at: string;
}

export class ExportService {
  /**
   * Fetch signal cache rows with institution names joined.
   */
  static async getExportData(
    supabase: SupabaseClient,
    params: ExportParams
  ): Promise<ExportRow[]> {
    let query = supabase
      .from('hr_recruitment_signal_cache')
      .select('*')
      .order('overall_status', { ascending: true })
      .order('composite_score', { ascending: true, nullsFirst: false });

    if (params.institution_id) {
      query = query.eq('institution_id', params.institution_id);
    }
    if (params.financial_year) {
      query = query.eq('financial_year', params.financial_year);
    }

    const { data: signals, error } = await query;
    if (error) throw error;
    if (!signals || signals.length === 0) return [];

    const institutionIds = [
      ...new Set(
        (signals as HRRecruitmentSignalCache[]).map((s) => s.institution_id)
      ),
    ];
    const { data: institutions } = await supabase
      .from('institutions')
      .select('id, name')
      .in('id', institutionIds);

    const instMap = new Map(
      (institutions ?? []).map((i: { id: string; name: string }) => [i.id, i.name])
    );

    return (signals as HRRecruitmentSignalCache[]).map((s) => ({
      institution_name: instMap.get(s.institution_id) ?? s.institution_id,
      program_name: null,
      overall_status: s.overall_status,
      composite_score: s.composite_score,
      sanctioned_gap_status: s.input_signals?.sanctioned_gap?.status ?? 'insufficient_data',
      sanctioned_gap_value: s.input_signals?.sanctioned_gap?.value ?? null,
      sfr_status: s.input_signals?.sfr?.status ?? 'insufficient_data',
      sfr_value: s.input_signals?.sfr?.value ?? null,
      specialization_gap_status: s.input_signals?.specialization_gap?.status ?? 'insufficient_data',
      specialization_gap_value: s.input_signals?.specialization_gap?.value ?? null,
      workload_status: s.input_signals?.workload?.status ?? 'insufficient_data',
      workload_value: s.input_signals?.workload?.value ?? null,
      projected_intake_status: s.input_signals?.projected_intake?.status ?? 'insufficient_data',
      projected_intake_value: s.input_signals?.projected_intake?.value ?? null,
      attrition_pipeline_status: s.input_signals?.attrition_pipeline?.status ?? 'insufficient_data',
      attrition_pipeline_value: s.input_signals?.attrition_pipeline?.value ?? null,
      peer_benchmark_status: s.input_signals?.peer_benchmark?.status ?? 'insufficient_data',
      peer_benchmark_value: s.input_signals?.peer_benchmark?.value ?? null,
      computed_at: s.computed_at,
    }));
  }

  /**
   * Generate XLSX buffer from export data using ExcelJS.
   */
  static async generateXlsx(rows: ExportRow[]): Promise<Buffer> {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MyJKKN HR Recruitment Need Signal';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Recruitment Signals');

    sheet.columns = [
      { header: 'Institution', key: 'institution_name', width: 30 },
      { header: 'Overall Status', key: 'overall_status', width: 18 },
      { header: 'Composite Score', key: 'composite_score', width: 16 },
      { header: 'Sanctioned Gap', key: 'sanctioned_gap_status', width: 18 },
      { header: 'Sanctioned Gap Value', key: 'sanctioned_gap_value', width: 20 },
      { header: 'SFR', key: 'sfr_status', width: 14 },
      { header: 'SFR Value', key: 'sfr_value', width: 14 },
      { header: 'Specialization Gap', key: 'specialization_gap_status', width: 20 },
      { header: 'Specialization Gap Value', key: 'specialization_gap_value', width: 22 },
      { header: 'Workload', key: 'workload_status', width: 14 },
      { header: 'Workload Value', key: 'workload_value', width: 16 },
      { header: 'Projected Intake', key: 'projected_intake_status', width: 18 },
      { header: 'Projected Intake Value', key: 'projected_intake_value', width: 20 },
      { header: 'Attrition Pipeline', key: 'attrition_pipeline_status', width: 20 },
      { header: 'Attrition Pipeline Value', key: 'attrition_pipeline_value', width: 22 },
      { header: 'Peer Benchmark', key: 'peer_benchmark_status', width: 18 },
      { header: 'Peer Benchmark Value', key: 'peer_benchmark_value', width: 20 },
      { header: 'Computed At', key: 'computed_at', width: 22 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const statusColors: Record<string, string> = {
      green: 'FF22C55E',
      amber: 'FFFBBF24',
      red: 'FFEF4444',
      blocked: 'FF6B7280',
      insufficient_data: 'FFD1D5DB',
    };

    for (const row of rows) {
      const dataRow = sheet.addRow(row);
      const statusCell = dataRow.getCell('overall_status');
      const color = statusColors[row.overall_status] ?? statusColors.insufficient_data;
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      };
      if (row.overall_status === 'green' || row.overall_status === 'red') {
        statusCell.font = { color: { argb: 'FFFFFFFF' } };
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generate printable HTML for PDF (browser print-to-PDF).
   */
  static generatePrintableHtml(rows: ExportRow[], title: string): string {
    const statusBadge = (status: string) => {
      const colors: Record<string, string> = {
        green: 'background:#22c55e;color:#fff',
        amber: 'background:#fbbf24;color:#000',
        red: 'background:#ef4444;color:#fff',
        blocked: 'background:#6b7280;color:#fff',
        insufficient_data: 'background:#d1d5db;color:#000',
      };
      const style = colors[status] ?? colors.insufficient_data;
      return `<span style="padding:2px 8px;border-radius:4px;font-size:12px;${style}">${status.replace('_', ' ')}</span>`;
    };

    const tableRows = rows
      .map(
        (r) => `<tr>
        <td>${r.institution_name}</td>
        <td>${statusBadge(r.overall_status)}</td>
        <td style="text-align:right">${r.composite_score?.toFixed(1) ?? '-'}</td>
        <td>${statusBadge(r.sanctioned_gap_status)}</td>
        <td>${statusBadge(r.sfr_status)}</td>
        <td>${statusBadge(r.specialization_gap_status)}</td>
        <td>${statusBadge(r.workload_status)}</td>
        <td>${statusBadge(r.projected_intake_status)}</td>
        <td>${statusBadge(r.attrition_pipeline_status)}</td>
        <td>${statusBadge(r.peer_benchmark_status)}</td>
        <td style="font-size:11px">${new Date(r.computed_at).toLocaleDateString()}</td>
      </tr>`
      )
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 20px; color: #1f2937; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .subtitle { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1f2937; color: #fff; padding: 8px 6px; text-align: left; font-weight: 600; }
    td { padding: 6px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) { background: #f9fafb; }
    @media print { body { margin: 0; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="subtitle">Generated on ${new Date().toLocaleDateString()} | ${rows.length} signal(s)</div>
  <table>
    <thead>
      <tr>
        <th>Institution</th><th>Overall</th><th>Score</th><th>Sanctioned</th><th>SFR</th>
        <th>Specialization</th><th>Workload</th><th>Intake</th><th>Attrition</th><th>Peer</th><th>Computed</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;
  }
}
