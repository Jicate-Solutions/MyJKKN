// Audit Report Service — on-demand PDF/DOCX generation for a closed (or in-progress)
// audit cycle.
// Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md §T18 (on-demand cycle report)
//
// Template sections:
//   1. Cover (cycle name, frameworks, window, lead auditor, generated-at)
//   2. Cycle Summary (phase + rollup counts)
//   3. Per-Parameter Attestation Grid
//   4. Open Findings Summary (count by severity + status)
//   5. Evidence Index (placeholder — evidence auto-populates via PR-A5/A6 fan-out
//      into quality_evidence_mappings; full index deferred to Sprint 02)
//
// PDF: jspdf + jspdf-autotable (already a project dependency).
// DOCX: docx npm package (added in package.json for this PR).

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
} from 'docx';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { AuditCycleService } from './audit-cycle-service';
import { AuditAttestationService } from './audit-attestation-service';
import { AuditFindingService } from './audit-finding-service';
import { AuditParameterCatalogService } from './audit-parameter-catalog-service';
import type {
  AuditAttestation,
  AuditCycle,
  AuditFindingView,
  AuditParameterCatalogRow,
  FindingSeverity,
} from '@/lib/types/audit';

export type AuditReportFormat = 'pdf' | 'docx';

export interface AuditReportBundle {
  cycle: AuditCycle;
  attestations: AuditAttestation[];
  findings: AuditFindingView[];
  parameters: AuditParameterCatalogRow[];
  rollup: {
    total: number;
    compliant: number;
    partial: number;
    non_compliant: number;
    pending: number;
    findings_total: number;
    findings_open: number;
    findings_closed: number;
    findings_by_severity: Record<FindingSeverity, number>;
  };
  generated_at: string;
}

export class AuditReportService {
  private static supabase = createClientSupabaseClient();

  /**
   * Fetch all data needed for a cycle report, in parallel.
   */
  static async loadBundle(cycleId: string): Promise<AuditReportBundle> {
    const cycle = await AuditCycleService.get(cycleId);
    if (!cycle) throw new Error(`Audit cycle "${cycleId}" not found`);

    // Resolve the "primary" institution for parameter listing. If the cycle
    // scopes multiple institutions, we still need one to resolve overrides;
    // fall back to first in list, or fetch system defaults only.
    const primaryInstitutionId =
      (cycle.institution_ids && cycle.institution_ids[0]) ?? null;

    const [attestations, findings, parameters] = await Promise.all([
      AuditAttestationService.list(cycleId),
      AuditFindingService.listByCycle(cycleId),
      primaryInstitutionId
        ? AuditParameterCatalogService.listForInstitution(primaryInstitutionId)
        : AuditParameterCatalogService.listSystem(),
    ]);

    const rollup = this.computeRollup(attestations, findings);

    return {
      cycle,
      attestations,
      findings,
      parameters,
      rollup,
      generated_at: new Date().toISOString(),
    };
  }

  private static computeRollup(
    attestations: AuditAttestation[],
    findings: AuditFindingView[]
  ): AuditReportBundle['rollup'] {
    const rollup: AuditReportBundle['rollup'] = {
      total: attestations.length,
      compliant: 0,
      partial: 0,
      non_compliant: 0,
      pending: 0,
      findings_total: findings.length,
      findings_open: 0,
      findings_closed: 0,
      findings_by_severity: { red: 0, yellow: 0, green: 0 },
    };
    for (const a of attestations) {
      if (a.attestation === 'compliant') rollup.compliant++;
      else if (a.attestation === 'partial') rollup.partial++;
      else if (a.attestation === 'non-compliant') rollup.non_compliant++;
      else rollup.pending++;
    }
    for (const f of findings) {
      if (f.status === 'closed') rollup.findings_closed++;
      else rollup.findings_open++;
      if (f.severity && f.severity in rollup.findings_by_severity) {
        rollup.findings_by_severity[f.severity]++;
      }
    }
    return rollup;
  }

  /**
   * Generate a report as a Node Buffer. Caller decides Content-Type / filename.
   */
  static async generateReport(cycleId: string, format: AuditReportFormat): Promise<Buffer> {
    const bundle = await this.loadBundle(cycleId);
    if (format === 'pdf') {
      return this.renderPdf(bundle);
    }
    return this.renderDocx(bundle);
  }

  // ==========================================================================
  // PDF renderer — jspdf + jspdf-autotable
  // ==========================================================================
  private static renderPdf(bundle: AuditReportBundle): Buffer {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 15;

    // --- Cover ---
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('JKKN Institutional Audit Report', pageWidth / 2, y, { align: 'center' });
    y += 10;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(bundle.cycle.name, pageWidth / 2, y, { align: 'center' });
    y += 8;

    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(
      `${bundle.cycle.start_date} → ${bundle.cycle.end_date}  ·  Phase: ${bundle.cycle.phase}`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );
    y += 5;
    doc.text(
      `Frameworks: ${bundle.cycle.frameworks.join(', ')}  ·  Generated: ${bundle.generated_at}`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );
    y += 10;
    doc.setTextColor(0);

    // --- Cycle Summary ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Cycle Summary', 14, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Count']],
      body: [
        ['Total parameters attested', String(bundle.rollup.total)],
        ['Compliant', String(bundle.rollup.compliant)],
        ['Partial', String(bundle.rollup.partial)],
        ['Non-compliant', String(bundle.rollup.non_compliant)],
        ['Pending', String(bundle.rollup.pending)],
        ['Findings total', String(bundle.rollup.findings_total)],
        ['Findings open', String(bundle.rollup.findings_open)],
        ['Findings closed', String(bundle.rollup.findings_closed)],
        ['Findings red', String(bundle.rollup.findings_by_severity.red)],
        ['Findings yellow', String(bundle.rollup.findings_by_severity.yellow)],
        ['Findings green', String(bundle.rollup.findings_by_severity.green)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 60, 120] },
      styles: { fontSize: 10 },
      margin: { left: 14, right: 14 },
    });
    const autoTableDoc = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    y = (autoTableDoc.lastAutoTable?.finalY ?? y) + 10;

    // --- Per-Parameter Attestation Grid ---
    if (y > 240) {
      doc.addPage();
      y = 15;
    }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Per-Parameter Attestations', 14, y);
    y += 6;

    const attestationRows = bundle.attestations.map((a) => {
      const param = bundle.parameters.find((p) => p.code === a.parameter_code);
      return [
        a.parameter_code,
        param?.name ?? '—',
        a.attestation,
        a.evidence_count.toString(),
        a.open_findings_count.toString(),
        a.attested_at ? a.attested_at.slice(0, 10) : '—',
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['Code', 'Parameter', 'Attestation', 'Evidence', 'Open Findings', 'Attested At']],
      body: attestationRows.length
        ? attestationRows
        : [['—', 'No attestations recorded yet', '—', '—', '—', '—']],
      theme: 'striped',
      headStyles: { fillColor: [30, 60, 120] },
      styles: { fontSize: 9, cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 70 },
        2: { cellWidth: 25 },
        3: { cellWidth: 18 },
        4: { cellWidth: 22 },
        5: { cellWidth: 28 },
      },
      margin: { left: 14, right: 14 },
    });
    y = (autoTableDoc.lastAutoTable?.finalY ?? y) + 10;

    // --- Open Findings Summary ---
    if (y > 240) {
      doc.addPage();
      y = 15;
    }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Open Findings Summary', 14, y);
    y += 6;

    const openFindings = bundle.findings.filter((f) => f.status !== 'closed');
    const findingsRows = openFindings.map((f) => [
      f.request_number ?? f.finding_id.slice(0, 8),
      f.parameter_code,
      f.severity,
      f.status,
      f.priority ?? '—',
      f.submitted_at ? f.submitted_at.slice(0, 10) : '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Ref', 'Parameter', 'Severity', 'Status', 'Priority', 'Opened']],
      body: findingsRows.length
        ? findingsRows
        : [['—', 'No open findings', '—', '—', '—', '—']],
      theme: 'striped',
      headStyles: { fillColor: [180, 30, 30] },
      styles: { fontSize: 9, cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    });
    y = (autoTableDoc.lastAutoTable?.finalY ?? y) + 10;

    // --- Evidence Index (placeholder) ---
    if (y > 250) {
      doc.addPage();
      y = 15;
    }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Evidence Index', 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(
      'Evidence is auto-populated into quality_evidence_mappings via PR-A5/A6 fan-out triggers.\n' +
        'A detailed evidence ledger per parameter will be rendered in Sprint 02.',
      14,
      y,
      { maxWidth: pageWidth - 28 }
    );

    // --- Footer on all pages ---
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Page ${i} of ${pageCount}  ·  ${bundle.cycle.name}  ·  Generated ${bundle.generated_at}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      );
      doc.setTextColor(0);
    }

    const arr = doc.output('arraybuffer');
    return Buffer.from(arr);
  }

  // ==========================================================================
  // DOCX renderer — docx npm package
  // ==========================================================================
  private static async renderDocx(bundle: AuditReportBundle): Promise<Buffer> {
    const children: (Paragraph | Table)[] = [];

    // --- Cover ---
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'JKKN Institutional Audit Report', bold: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: bundle.cycle.name, size: 28, bold: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `${bundle.cycle.start_date} → ${bundle.cycle.end_date}  ·  Phase: ${bundle.cycle.phase}`,
            italics: true,
            size: 20,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Frameworks: ${bundle.cycle.frameworks.join(', ')}  ·  Generated: ${bundle.generated_at}`,
            size: 18,
            color: '666666',
          }),
        ],
      }),
      new Paragraph({ children: [new TextRun('')] }),
    );

    // --- Cycle Summary ---
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: '1. Cycle Summary', bold: true })],
      }),
      this.docxTable(
        ['Metric', 'Count'],
        [
          ['Total parameters attested', String(bundle.rollup.total)],
          ['Compliant', String(bundle.rollup.compliant)],
          ['Partial', String(bundle.rollup.partial)],
          ['Non-compliant', String(bundle.rollup.non_compliant)],
          ['Pending', String(bundle.rollup.pending)],
          ['Findings total', String(bundle.rollup.findings_total)],
          ['Findings open', String(bundle.rollup.findings_open)],
          ['Findings closed', String(bundle.rollup.findings_closed)],
          ['Findings red', String(bundle.rollup.findings_by_severity.red)],
          ['Findings yellow', String(bundle.rollup.findings_by_severity.yellow)],
          ['Findings green', String(bundle.rollup.findings_by_severity.green)],
        ]
      ),
      new Paragraph({ children: [new TextRun('')] }),
    );

    // --- Per-Parameter Attestations ---
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: '2. Per-Parameter Attestations', bold: true })],
      })
    );
    const attestationRows = bundle.attestations.map((a) => {
      const param = bundle.parameters.find((p) => p.code === a.parameter_code);
      return [
        a.parameter_code,
        param?.name ?? '—',
        a.attestation,
        String(a.evidence_count),
        String(a.open_findings_count),
        a.attested_at ? a.attested_at.slice(0, 10) : '—',
      ];
    });
    children.push(
      this.docxTable(
        ['Code', 'Parameter', 'Attestation', 'Evidence', 'Open Findings', 'Attested At'],
        attestationRows.length
          ? attestationRows
          : [['—', 'No attestations recorded yet', '—', '—', '—', '—']]
      ),
      new Paragraph({ children: [new TextRun('')] }),
    );

    // --- Open Findings Summary ---
    const openFindings = bundle.findings.filter((f) => f.status !== 'closed');
    const findingsRows = openFindings.map((f) => [
      f.request_number ?? f.finding_id.slice(0, 8),
      f.parameter_code,
      f.severity,
      f.status,
      f.priority ?? '—',
      f.submitted_at ? f.submitted_at.slice(0, 10) : '—',
    ]);
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: '3. Open Findings Summary', bold: true })],
      }),
      this.docxTable(
        ['Ref', 'Parameter', 'Severity', 'Status', 'Priority', 'Opened'],
        findingsRows.length
          ? findingsRows
          : [['—', 'No open findings', '—', '—', '—', '—']]
      ),
      new Paragraph({ children: [new TextRun('')] }),
    );

    // --- Evidence Index (placeholder) ---
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: '4. Evidence Index', bold: true })],
      }),
      new Paragraph({
        children: [
          new TextRun(
            'Evidence is auto-populated into quality_evidence_mappings via PR-A5/A6 fan-out triggers. A detailed evidence ledger per parameter will be rendered in Sprint 02.'
          ),
        ],
      })
    );

    const doc = new Document({ sections: [{ children }] });
    const buf = await Packer.toBuffer(doc);
    return Buffer.from(buf);
  }

  private static docxTable(headers: string[], rows: string[][]): Table {
    const headerRow = new TableRow({
      tableHeader: true,
      children: headers.map(
        (h) =>
          new TableCell({
            width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: h, bold: true })],
              }),
            ],
          })
      ),
    });
    const bodyRows = rows.map(
      (row) =>
        new TableRow({
          children: row.map(
            (cell) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun(cell)] })],
              })
          ),
        })
    );
    return new Table({
      rows: [headerRow, ...bodyRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  }
}
