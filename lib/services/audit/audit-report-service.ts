// Audit Report Service — on-demand PDF/DOCX generation for a closed (or in-progress)
// audit cycle.
// Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md §T18 (on-demand cycle report)
//
// Template sections:
//   1. Cover (cycle name, frameworks, window, lead auditor, generated-at)
//   2. Cycle Summary (phase + rollup counts)
//   3. Per-Parameter Attestation Grid
//   4. Open Findings Summary (count by severity + status)
//   5. Evidence Index — rectification evidence fanned out to
//      quality_evidence_mappings, grouped by framework body + metric_code.
//      Source rows: source_table='service_requests' AND
//      metadata->>'audit_cycle_id' = <cycle_id>.
//
// PDF: jspdf + jspdf-autotable (already a project dependency).
// DOCX: docx npm package (added in package.json for this PR).
//
// Both `jspdf` and `docx` are lazy-loaded via `await import(...)` inside
// their respective render methods. Static top-level imports were pulling
// the full font atlas + PDF rendering engine + docx XML builder into the
// main build's module graph, which pushed the webpack memory footprint
// past Vercel's 48 GB heap ceiling and crashed `npm run build` with
// `FATAL ERROR: heap out of memory`. Dynamic imports let webpack
// code-split these heavy deps out of the main bundle — they're still
// bundled, just loaded on demand when `generateReport` is called.
// See: 2026-04-24 OOM incident (prod deploy `my-jkkn-swa3v92ih` failed
// with SIGABRT 3m 40s into build).

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

/**
 * One row of the Evidence Index — a single rectification event mapped to a
 * body+metric via the fan-out trigger (emit_audit_finding_evidence).
 */
export interface EvidenceIndexRow {
  body_code: string;             // 'NAAC' | 'NBA' | ...
  metric_code: string;           // e.g., '1.1.3'
  mapped_at: string;             // ISO
  finding_id: string;            // service_requests.id
  request_number: string | null; // 'SR-AUDI-ABC123'
  finding_status: string | null; // 'closed' etc.
  closed_at: string | null;      // ISO
  institution_id: string | null;
  institution_name: string | null;
}

/**
 * Grouped evidence: body → metric_code → rows.
 * Preserves deterministic ordering (bodies alpha, metrics alpha, rows by mapped_at desc).
 */
export interface EvidenceIndexGroup {
  body_code: string;
  total_rows: number;
  metrics: Array<{
    metric_code: string;
    rows: EvidenceIndexRow[];
  }>;
}

export interface AuditReportBundle {
  cycle: AuditCycle;
  attestations: AuditAttestation[];
  findings: AuditFindingView[];
  parameters: AuditParameterCatalogRow[];
  evidence_index: EvidenceIndexGroup[];
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

    const [attestations, findings, parameters, evidenceIndex] = await Promise.all([
      AuditAttestationService.list(cycleId),
      AuditFindingService.listByCycle(cycleId),
      primaryInstitutionId
        ? AuditParameterCatalogService.listForInstitution(primaryInstitutionId)
        : AuditParameterCatalogService.listSystem(),
      this.fetchEvidenceIndex(cycleId),
    ]);

    const rollup = this.computeRollup(attestations, findings);

    return {
      cycle,
      attestations,
      findings,
      parameters,
      evidence_index: evidenceIndex,
      rollup,
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Fetch the Evidence Index for this cycle from quality_evidence_mappings.
   *
   * Filter: source_table='service_requests' AND metadata->>'audit_cycle_id' = cycleId.
   * Then hydrate each row with service_requests (request_number, status, closed_at)
   * and institutions (name). Rows are grouped by body_code, then metric_code.
   *
   * Returns [] when no evidence has fanned out for this cycle yet (i.e. no
   * findings have been closed-as-rectified). Report renderers handle the
   * empty state with a friendly "no rectification evidence yet" message.
   *
   * RLS on quality_evidence_mappings + service_requests scopes results to the
   * caller's role — super_admin sees everything, others see their institution.
   */
  private static async fetchEvidenceIndex(
    cycleId: string
  ): Promise<EvidenceIndexGroup[]> {
    // 1. Fetch raw QEM rows for this cycle. Using the JSONB operator
    //    metadata->>'audit_cycle_id' matches the shape emitted by
    //    emit_audit_finding_evidence() (see 20260422_audit_workflow_seeds_and_triggers.sql).
    const { data: qemRows, error: qemErr } = await (this.supabase as any)
      .from('quality_evidence_mappings')
      .select('body_code, metric_code, mapped_at, source_id, institution_id, metadata')
      .eq('source_table', 'service_requests')
      .eq('metadata->>audit_cycle_id', cycleId)
      .order('body_code', { ascending: true })
      .order('metric_code', { ascending: true })
      .order('mapped_at', { ascending: false });

    if (qemErr) throw qemErr;
    const rawRows = (qemRows ?? []) as Array<{
      body_code: string;
      metric_code: string;
      mapped_at: string;
      source_id: string;
      institution_id: string | null;
      metadata: Record<string, unknown> | null;
    }>;

    if (rawRows.length === 0) return [];

    // 2. Batch-hydrate service_requests (findings) referenced by source_id.
    const findingIds = Array.from(new Set(rawRows.map((r) => r.source_id)));
    const institutionIds = Array.from(
      new Set(rawRows.map((r) => r.institution_id).filter((x): x is string => !!x))
    );

    const [findingsRes, institutionsRes] = await Promise.all([
      (this.supabase as any)
        .from('service_requests')
        .select('id, request_number, status, closed_at')
        .in('id', findingIds),
      institutionIds.length > 0
        ? (this.supabase as any)
            .from('institutions')
            .select('id, name')
            .in('id', institutionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (findingsRes.error) throw findingsRes.error;
    if (institutionsRes.error) throw institutionsRes.error;

    const findingById = new Map<
      string,
      { request_number: string | null; status: string | null; closed_at: string | null }
    >();
    for (const f of (findingsRes.data ?? []) as Array<{
      id: string;
      request_number: string | null;
      status: string | null;
      closed_at: string | null;
    }>) {
      findingById.set(f.id, {
        request_number: f.request_number ?? null,
        status: f.status ?? null,
        closed_at: f.closed_at ?? null,
      });
    }

    const institutionById = new Map<string, string>();
    for (const inst of (institutionsRes.data ?? []) as Array<{ id: string; name: string }>) {
      institutionById.set(inst.id, inst.name);
    }

    // 3. Assemble EvidenceIndexRow[]
    const hydrated: EvidenceIndexRow[] = rawRows.map((r) => {
      const f = findingById.get(r.source_id);
      return {
        body_code: (r.body_code ?? '').toUpperCase(),
        metric_code: r.metric_code ?? '—',
        mapped_at: r.mapped_at,
        finding_id: r.source_id,
        request_number: f?.request_number ?? null,
        finding_status: f?.status ?? null,
        closed_at: f?.closed_at ?? null,
        institution_id: r.institution_id,
        institution_name: r.institution_id ? institutionById.get(r.institution_id) ?? null : null,
      };
    });

    // 4. Group by body → metric_code
    const byBody = new Map<string, Map<string, EvidenceIndexRow[]>>();
    for (const row of hydrated) {
      let metricMap = byBody.get(row.body_code);
      if (!metricMap) {
        metricMap = new Map();
        byBody.set(row.body_code, metricMap);
      }
      const arr = metricMap.get(row.metric_code) ?? [];
      arr.push(row);
      metricMap.set(row.metric_code, arr);
    }

    const groups: EvidenceIndexGroup[] = [];
    for (const [bodyCode, metricMap] of Array.from(byBody.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      const metrics = Array.from(metricMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([metric_code, rows]) => ({ metric_code, rows }));
      const total_rows = metrics.reduce((sum, m) => sum + m.rows.length, 0);
      groups.push({ body_code: bodyCode, total_rows, metrics });
    }

    return groups;
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
      return await this.renderPdf(bundle);
    }
    return await this.renderDocx(bundle);
  }

  // ==========================================================================
  // PDF renderer — jspdf + jspdf-autotable (lazy-loaded to avoid build OOM)
  // ==========================================================================
  private static async renderPdf(bundle: AuditReportBundle): Promise<Buffer> {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

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
    const autoTableDoc = doc as typeof doc & { lastAutoTable?: { finalY: number } };
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

    // --- Evidence Index ---
    if (y > 240) {
      doc.addPage();
      y = 15;
    }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Evidence Index', 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90);
    doc.text(
      'Rectification evidence mapped to accreditation frameworks',
      14,
      y,
      { maxWidth: pageWidth - 28 }
    );
    y += 7;
    doc.setTextColor(0);

    if (bundle.evidence_index.length === 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120);
      doc.text('No rectification evidence yet for this cycle.', 14, y);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
    } else {
      for (const group of bundle.evidence_index) {
        // Body header — page-break if close to bottom
        if (y > 260) {
          doc.addPage();
          y = 15;
        }
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 60, 120);
        doc.text(`${group.body_code}  (${group.total_rows} row${group.total_rows === 1 ? '' : 's'})`, 14, y);
        doc.setTextColor(0);
        y += 5;

        // One table per body: metric | ref | institution | closed/mapped
        const rowsFlat: string[][] = [];
        for (const metric of group.metrics) {
          for (let i = 0; i < metric.rows.length; i++) {
            const row = metric.rows[i];
            const metricCell = i === 0 ? metric.metric_code : '';
            const refCell = row.request_number ?? row.finding_id.slice(0, 8);
            const instCell = row.institution_name ?? '—';
            const dateSource = row.closed_at ?? row.mapped_at;
            const dateCell = dateSource ? dateSource.slice(0, 10) : '—';
            const statusCell = row.finding_status ?? '—';
            rowsFlat.push([metricCell, refCell, instCell, statusCell, dateCell]);
          }
        }

        autoTable(doc, {
          startY: y,
          head: [['Metric', 'Ref', 'Institution', 'Status', 'Rectified']],
          body: rowsFlat,
          theme: 'striped',
          headStyles: { fillColor: [30, 60, 120] },
          styles: { fontSize: 8, cellPadding: 1.2 },
          columnStyles: {
            0: { cellWidth: 28 },
            1: { cellWidth: 36 },
            2: { cellWidth: 60 },
            3: { cellWidth: 22 },
            4: { cellWidth: 26 },
          },
          margin: { left: 14, right: 14 },
        });
        y = (autoTableDoc.lastAutoTable?.finalY ?? y) + 6;
      }
    }

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
  // DOCX renderer — docx npm package (lazy-loaded to avoid build OOM)
  // ==========================================================================
  private static async renderDocx(bundle: AuditReportBundle): Promise<Buffer> {
    const {
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
    } = await import('docx');

    // `docxTable` was a static method; moved in-scope so it can reference
    // the dynamically-imported classes above without re-importing per call.
    const docxTable = (headers: string[], rows: string[][]): InstanceType<typeof Table> => {
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
    };

    const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

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
      docxTable(
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
      docxTable(
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
      docxTable(
        ['Ref', 'Parameter', 'Severity', 'Status', 'Priority', 'Opened'],
        findingsRows.length
          ? findingsRows
          : [['—', 'No open findings', '—', '—', '—', '—']]
      ),
      new Paragraph({ children: [new TextRun('')] }),
    );

    // --- Evidence Index ---
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: '4. Evidence Index', bold: true })],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Rectification evidence mapped to accreditation frameworks',
            italics: true,
            color: '666666',
          }),
        ],
      }),
      new Paragraph({ children: [new TextRun('')] }),
    );

    if (bundle.evidence_index.length === 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'No rectification evidence yet for this cycle.',
              italics: true,
              color: '888888',
            }),
          ],
        })
      );
    } else {
      for (const group of bundle.evidence_index) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: `${group.body_code}  (${group.total_rows} row${group.total_rows === 1 ? '' : 's'})`,
                bold: true,
              }),
            ],
          })
        );

        const evidenceRows: string[][] = [];
        for (const metric of group.metrics) {
          for (let i = 0; i < metric.rows.length; i++) {
            const row = metric.rows[i];
            const metricCell = i === 0 ? metric.metric_code : '';
            const refCell = row.request_number ?? row.finding_id.slice(0, 8);
            const instCell = row.institution_name ?? '—';
            const dateSource = row.closed_at ?? row.mapped_at;
            const dateCell = dateSource ? dateSource.slice(0, 10) : '—';
            const statusCell = row.finding_status ?? '—';
            evidenceRows.push([metricCell, refCell, instCell, statusCell, dateCell]);
          }
        }

        children.push(
          docxTable(
            ['Metric', 'Ref', 'Institution', 'Status', 'Rectified'],
            evidenceRows
          ),
          new Paragraph({ children: [new TextRun('')] }),
        );
      }
    }

    const doc = new Document({ sections: [{ children }] });
    const buf = await Packer.toBuffer(doc);
    return Buffer.from(buf);
  }
}
