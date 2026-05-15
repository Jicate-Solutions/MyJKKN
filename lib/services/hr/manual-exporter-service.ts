// =====================================================================
// lib/services/hr/manual-exporter-service.ts
// =====================================================================
// Wave 3 M10 — HR Policy Manual auto-generator (PDF + HTML + JSON).
//
// Traverses every `hr.*` policy seeded into `platform_policies` for a given
// institution and renders the result in three formats. The output is meant
// to fully replace the legacy .docx HR Policy Manual: when Director / CAO
// edit a row in /admin/hr/policies/*, this generator reflects the change
// without code changes (driver lock 2026-05-15, Director R5-Q3).
//
// Architecture:
//   1. Discover policies — read every distinct `hr.*` key for scope_id=<inst>
//   2. Group into 25 manual sections per spec ordering
//   3. Render per format:
//      • HTML — table-of-contents + nested <section>/<details> blocks
//      • JSON — { institution, generated_at, sections: [...] }
//      • PDF  — jspdf-rendered (we ship jspdf already; no new dep)
//
// PDF strategy decision (documented in PR body):
//   We deliberately use jspdf (already installed) rather than introducing
//   puppeteer-core or html-pdf-node. Rationale:
//     • puppeteer-core adds ~10-20 MB to lambda bundle on Vercel; serverless
//       cold-start cost is unacceptable for an admin-only export endpoint.
//     • html-pdf-node depends on a Chromium binary not present on Vercel
//       hobby/pro builds.
//     • jspdf renders text policies acceptably for a config dump; long-form
//       prose policies (`hr.new.*`) render via wrapped paragraphs.
//   Manual visual fidelity to the .docx is NOT the goal — auto-currency is.
// =====================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ---------------------------------------------------------------------------
// Section ordering — per Wave 3 spec, the 25-section structure.
// Each section lists the `hr.*` policy_key prefixes it owns. We resolve all
// matching policy rows per institution at render time.
// ---------------------------------------------------------------------------

export interface ManualSectionDef {
  /** 1-based section number for the printed manual */
  number: number;
  /** Title rendered in TOC + heading */
  title: string;
  /** Short description shown under the heading */
  description: string;
  /** Policy keys (exact or prefix) included in this section */
  keys: string[];
}

export const MANUAL_SECTIONS: ReadonlyArray<ManualSectionDef> = [
  { number: 1, title: 'Institution metadata', description: 'Identity, vision, mission, contact and approval record.', keys: ['hr.institution_meta'] },
  { number: 2, title: 'Academic scope', description: 'Disciplines, research areas, accreditation bands.', keys: ['hr.academic_scope'] },
  { number: 3, title: 'Facilities', description: 'Campus facilities staff have access to and welfare amenities.', keys: ['hr.facilities'] },
  { number: 4, title: 'Roles & responsibilities', description: 'Job descriptions, reporting lines, RACI matrices per role.', keys: ['hr.roles_responsibilities'] },
  { number: 5, title: 'Cadres', description: 'Faculty + admin cadre lists.', keys: ['hr.cadres'] },
  { number: 6, title: 'Working schedule', description: 'Working hours per role-type, grace periods, break windows.', keys: ['hr.working_schedule', 'hr.shifts.'] },
  { number: 7, title: 'Leave policies', description: 'Casual, vacation, on-duty, half-pay, marriage, holidays and LOP.', keys: ['hr.leave.'] },
  { number: 8, title: 'Joining & appointment', description: 'Required documents, onboarding flow, probation rules.', keys: ['hr.joining_and_appointment', 'hr.onboarding.', 'hr.probation.'] },
  { number: 9, title: 'Pay scales', description: 'Salary bands per cadre + grade.', keys: ['hr.pay_scales', 'hr.payroll.'] },
  { number: 10, title: 'Allowances & increments', description: 'HRA, DA, conveyance, special allowances + increment rules.', keys: ['hr.allowances_and_increments'] },
  { number: 11, title: 'Motivation fund', description: 'Performance-linked motivation fund eligibility + amounts.', keys: ['hr.motivation_fund'] },
  { number: 12, title: 'Research & Development', description: 'Publication incentives, research leave, WFH, excursions, incentive authority.', keys: ['hr.rd.'] },
  { number: 13, title: 'Reimbursement workflow', description: 'Claim categories, approval chain, settlement timelines.', keys: ['hr.reimbursement_workflow'] },
  { number: 14, title: 'Performance review', description: 'Cycles, evaluators, scoring rubric, escalation.', keys: ['hr.performance_review', 'hr.feedback_evaluation'] },
  { number: 15, title: 'Promotion policy', description: 'Promotion paths + scoring criteria.', keys: ['hr.promotion_policy'] },
  { number: 16, title: 'Staff development', description: 'Training calendar, mandatory programs, sponsorship.', keys: ['hr.staff_development'] },
  { number: 17, title: 'Code of conduct', description: 'Professional conduct rules per cadre.', keys: ['hr.code_of_conduct'] },
  { number: 18, title: 'Disciplinary action', description: 'Memo triggers, penalty catalog, severity bands.', keys: ['hr.disciplinary_action', 'hr.memo_and_termination_triggers'] },
  { number: 19, title: 'Grievance cell', description: 'Filing, hearing, escalation, redressal.', keys: ['hr.grievance_cell'] },
  { number: 20, title: 'Resignation workflow', description: 'Notice period, clearance, exit formalities.', keys: ['hr.resignation_workflow'] },
  { number: 21, title: 'Excursion (general)', description: 'Non-R&D excursions — approvals + funding.', keys: ['hr.excursion_general'] },
  { number: 22, title: 'Welfare activities', description: 'Annual welfare calendar — celebrations, family days, retreats.', keys: ['hr.welfare_activities'] },
  { number: 23, title: 'Teaching artifacts', description: 'Required teaching deliverables — lesson plans, rubrics, OBE.', keys: ['hr.teaching_artifacts'] },
  { number: 24, title: 'New policies', description: 'Remote/hybrid work, GenAI usage, social media, data privacy.', keys: ['hr.new.'] },
  { number: 25, title: 'Forms', description: 'Approved HR forms catalog.', keys: ['hr.forms.'] },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedPolicyRow {
  policy_key: string;
  value: unknown;
  description: string | null;
  updated_at: string | null;
}

export interface ResolvedSection {
  number: number;
  title: string;
  description: string;
  policies: ResolvedPolicyRow[];
}

export interface InstitutionMeta {
  id: string;
  name: string;
}

export interface ManualBundle {
  institution: InstitutionMeta;
  generated_at: string;
  sections: ResolvedSection[];
}

// ---------------------------------------------------------------------------
// Resolver — fetch every hr.* row for the given institution and bucket
// it into the 25 sections per `MANUAL_SECTIONS`.
// ---------------------------------------------------------------------------

async function fetchInstitutionMeta(
  supabase: SupabaseClient,
  institutionId: string
): Promise<InstitutionMeta> {
  const { data, error } = await supabase
    .from('institutions')
    .select('id, name')
    .eq('id', institutionId)
    .maybeSingle();

  if (error) throw error;
  return {
    id: institutionId,
    name: (data as { name?: string } | null)?.name ?? 'Unknown institution',
  };
}

async function fetchAllHrPolicies(
  supabase: SupabaseClient,
  institutionId: string
): Promise<ResolvedPolicyRow[]> {
  // Read rows for this institution. Global hr.* rows are included too because
  // some policies (e.g. compliance.*) are intentionally global.
  const { data, error } = await supabase
    .from('platform_policies')
    .select('policy_key, value, description, updated_at, scope_type, scope_id')
    .like('policy_key', 'hr.%')
    .or(`scope_id.eq.${institutionId},scope_type.eq.global`);

  if (error) throw error;

  type Row = {
    policy_key: string;
    value: unknown;
    description: string | null;
    updated_at: string | null;
    scope_type: string;
    scope_id: string | null;
  };

  // De-duplicate: institution-scoped row wins over global for the same key.
  const byKey = new Map<string, Row>();
  for (const r of (data ?? []) as Row[]) {
    const existing = byKey.get(r.policy_key);
    if (!existing) {
      byKey.set(r.policy_key, r);
      continue;
    }
    // Prefer institution-scoped row.
    if (r.scope_type === 'institution' && existing.scope_type !== 'institution') {
      byKey.set(r.policy_key, r);
    }
  }

  return Array.from(byKey.values()).map((r) => ({
    policy_key: r.policy_key,
    value: r.value,
    description: r.description,
    updated_at: r.updated_at,
  }));
}

function bucketIntoSections(rows: ResolvedPolicyRow[]): ResolvedSection[] {
  const used = new Set<string>();
  const sections: ResolvedSection[] = MANUAL_SECTIONS.map((s) => ({
    number: s.number,
    title: s.title,
    description: s.description,
    policies: [],
  }));

  for (let i = 0; i < MANUAL_SECTIONS.length; i++) {
    const def = MANUAL_SECTIONS[i];
    for (const row of rows) {
      if (used.has(row.policy_key)) continue;
      const match = def.keys.some((k) =>
        k.endsWith('.') ? row.policy_key.startsWith(k) : row.policy_key === k
      );
      if (match) {
        sections[i].policies.push(row);
        used.add(row.policy_key);
      }
    }
    sections[i].policies.sort((a, b) => a.policy_key.localeCompare(b.policy_key));
  }

  // Anything not matched gets dumped into a synthetic "Other" tail section.
  const unmatched = rows.filter((r) => !used.has(r.policy_key));
  if (unmatched.length > 0) {
    sections.push({
      number: 99,
      title: 'Other / uncategorized policies',
      description: 'Policies seeded outside the canonical 25-section layout.',
      policies: unmatched.sort((a, b) => a.policy_key.localeCompare(b.policy_key)),
    });
  }

  return sections;
}

export async function buildManualBundle(
  supabase: SupabaseClient,
  institutionId: string
): Promise<ManualBundle> {
  const [institution, rows] = await Promise.all([
    fetchInstitutionMeta(supabase, institutionId),
    fetchAllHrPolicies(supabase, institutionId),
  ]);
  return {
    institution,
    generated_at: new Date().toISOString(),
    sections: bucketIntoSections(rows),
  };
}

// ---------------------------------------------------------------------------
// HTML renderer
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderValueHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '<em class="muted">(no value set)</em>';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `<code>${escapeHtml(String(value))}</code>`;
  }
  return `<pre class="json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

export function renderHtml(bundle: ManualBundle): string {
  const toc = bundle.sections
    .map(
      (s) =>
        `<li><a href="#section-${s.number}">${s.number}. ${escapeHtml(s.title)}</a> <span class="muted">— ${s.policies.length} polic${s.policies.length === 1 ? 'y' : 'ies'}</span></li>`
    )
    .join('\n');

  const body = bundle.sections
    .map((s) => {
      const policies = s.policies.length === 0
        ? `<p class="muted"><em>No policies seeded for this section yet.</em></p>`
        : s.policies
            .map((p) => {
              const updated = p.updated_at
                ? `<span class="muted">last updated ${escapeHtml(new Date(p.updated_at).toLocaleString('en-IN'))}</span>`
                : '';
              return `
                <article class="policy">
                  <header>
                    <h3><code>${escapeHtml(p.policy_key)}</code></h3>
                    ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ''}
                    ${updated}
                  </header>
                  <div class="value">${renderValueHtml(p.value)}</div>
                </article>
              `;
            })
            .join('\n');

      return `
        <section id="section-${s.number}">
          <h2>${s.number}. ${escapeHtml(s.title)}</h2>
          <p class="section-desc">${escapeHtml(s.description)}</p>
          ${policies}
        </section>
      `;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>HR Policy Manual — ${escapeHtml(bundle.institution.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; line-height: 1.55; color: #1a1a1a; margin: 0; padding: 0; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 32px 24px 96px; }
  header.cover { text-align: center; padding: 64px 24px 32px; border-bottom: 1px solid #e5e7eb; margin-bottom: 32px; }
  h1 { font-size: 30px; margin: 0 0 8px; }
  h2 { font-size: 22px; margin: 48px 0 8px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
  h3 { font-size: 14px; font-weight: 600; margin: 16px 0 4px; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  pre.json { background: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; max-height: 320px; }
  .muted { color: #6b7280; font-size: 12px; }
  .section-desc { color: #4b5563; margin-top: 0; }
  .policy { padding: 12px 16px; background: #fafafa; border: 1px solid #e5e7eb; border-radius: 8px; margin: 8px 0; }
  .policy header { margin-bottom: 8px; }
  ol.toc { columns: 2; column-gap: 32px; padding-left: 24px; }
  ol.toc li { break-inside: avoid; margin: 4px 0; }
  .meta-row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; color: #4b5563; }
  @media print { body { font-size: 11pt; } ol.toc { columns: 1; } }
</style>
</head>
<body>
<div class="wrap">
  <header class="cover">
    <h1>HR Policy Manual</h1>
    <p class="meta-row"><span><strong>${escapeHtml(bundle.institution.name)}</strong></span><span>Generated ${escapeHtml(new Date(bundle.generated_at).toLocaleString('en-IN'))}</span></p>
    <p class="muted">Auto-generated from <code>platform_policies</code>. Every section reflects the current published policy state. When a policy is edited in <code>/admin/hr/policies/*</code>, this document updates.</p>
  </header>

  <h2 style="border-top: none; padding-top: 0;">Contents</h2>
  <ol class="toc">${toc}</ol>

  ${body}

  <footer style="margin-top: 64px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
    <p class="muted">Source: <code>platform_policies</code> · Scope: <code>institution=${escapeHtml(bundle.institution.id)}</code> · Spec: Wave 3 — Policy-Driven HR Manual Replacement (2026-05-15).</p>
  </footer>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// JSON renderer
// ---------------------------------------------------------------------------

export function renderJson(bundle: ManualBundle): object {
  return {
    institution: bundle.institution,
    generated_at: bundle.generated_at,
    section_count: bundle.sections.length,
    policy_count: bundle.sections.reduce((n, s) => n + s.policies.length, 0),
    sections: bundle.sections,
  };
}

// ---------------------------------------------------------------------------
// PDF renderer (jspdf, no headless-chrome dep)
// ---------------------------------------------------------------------------

function flattenValueForPdf(value: unknown): string {
  if (value === null || value === undefined) return '(no value set)';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function renderPdf(bundle: ManualBundle): Uint8Array {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentW = pageW - margin * 2;
  let y = margin;

  function ensureSpace(needed: number) {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  // ── Cover ─────────────────────────────────────────────────────────────
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('HR Policy Manual', pageW / 2, y + 12, { align: 'center' });
  y += 22;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(bundle.institution.name, pageW / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(
    `Generated ${new Date(bundle.generated_at).toLocaleString('en-IN')}`,
    pageW / 2,
    y,
    { align: 'center' }
  );
  y += 12;
  doc.setTextColor(0);

  doc.setFontSize(9);
  const cover =
    'Auto-generated from platform_policies. Every section below reflects the current published policy state. When a policy is edited in /admin/hr/policies/*, this document updates without code changes.';
  const coverLines = doc.splitTextToSize(cover, contentW);
  doc.text(coverLines, margin, y);
  y += coverLines.length * 5 + 10;

  // ── Contents ──────────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  ensureSpace(10);
  doc.text('Contents', margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  for (const s of bundle.sections) {
    ensureSpace(6);
    const count = s.policies.length;
    doc.text(
      `${s.number}. ${s.title}  —  ${count} polic${count === 1 ? 'y' : 'ies'}`,
      margin,
      y
    );
    y += 5;
  }

  // ── Sections ──────────────────────────────────────────────────────────
  for (const s of bundle.sections) {
    doc.addPage();
    y = margin;

    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(`${s.number}. ${s.title}`, margin, y);
    y += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(80);
    const descLines = doc.splitTextToSize(s.description, contentW);
    doc.text(descLines, margin, y);
    y += descLines.length * 4 + 4;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');

    if (s.policies.length === 0) {
      doc.setFontSize(9);
      doc.setTextColor(140);
      doc.text('No policies seeded for this section yet.', margin, y);
      doc.setTextColor(0);
      y += 6;
      continue;
    }

    // Render each policy as a small key/description row + a value table.
    for (const p of s.policies) {
      ensureSpace(14);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(p.policy_key, margin, y);
      y += 5;

      if (p.description) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80);
        const dLines = doc.splitTextToSize(p.description, contentW);
        ensureSpace(dLines.length * 4 + 2);
        doc.text(dLines, margin, y);
        y += dLines.length * 4;
        doc.setTextColor(0);
      }

      if (p.updated_at) {
        doc.setFontSize(7);
        doc.setTextColor(140);
        doc.text(
          `last updated ${new Date(p.updated_at).toLocaleString('en-IN')}`,
          margin,
          y
        );
        doc.setTextColor(0);
        y += 4;
      }

      // Value rendering — for objects/arrays use autoTable; for scalars print
      // them inline.
      const v = p.value;
      if (
        v !== null &&
        v !== undefined &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        Object.keys(v as Record<string, unknown>).length > 0
      ) {
        const obj = v as Record<string, unknown>;
        const rows = Object.entries(obj).map(([k, vv]) => [
          k,
          flattenValueForPdf(vv).slice(0, 240),
        ]);
        autoTable(doc, {
          startY: y,
          head: [['Key', 'Value']],
          body: rows,
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
          headStyles: { fillColor: [243, 244, 246], textColor: 30 },
          columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: contentW - 50 } },
          margin: { left: margin, right: margin },
        });
        // autoTable mutates internal cursor — read it back.
        type LastAutoTableDoc = jsPDF & { lastAutoTable?: { finalY?: number } };
        const final = (doc as LastAutoTableDoc).lastAutoTable?.finalY;
        y = (typeof final === 'number' ? final : y) + 4;
      } else if (Array.isArray(v) && v.length > 0) {
        const rows = v.map((item, idx) => [
          String(idx + 1),
          flattenValueForPdf(item).slice(0, 240),
        ]);
        autoTable(doc, {
          startY: y,
          head: [['#', 'Item']],
          body: rows,
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
          headStyles: { fillColor: [243, 244, 246], textColor: 30 },
          columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: contentW - 12 } },
          margin: { left: margin, right: margin },
        });
        type LastAutoTableDoc = jsPDF & { lastAutoTable?: { finalY?: number } };
        const final = (doc as LastAutoTableDoc).lastAutoTable?.finalY;
        y = (typeof final === 'number' ? final : y) + 4;
      } else {
        doc.setFontSize(8);
        const valLines = doc.splitTextToSize(flattenValueForPdf(v), contentW);
        ensureSpace(valLines.length * 4 + 2);
        doc.text(valLines, margin, y);
        y += valLines.length * 4 + 4;
      }
    }
  }

  // ── Footer on last page ───────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(
      `Page ${i} of ${pageCount} · ${bundle.institution.name} · Generated ${new Date(bundle.generated_at).toLocaleDateString('en-IN')}`,
      pageW / 2,
      pageH - 6,
      { align: 'center' }
    );
    doc.setTextColor(0);
  }

  return doc.output('arraybuffer') as unknown as Uint8Array;
}

// ---------------------------------------------------------------------------
// Public service facade
// ---------------------------------------------------------------------------

export const ManualExporterService = {
  /** Build the resolved bundle (used by the page + the API route). */
  async build(supabase: SupabaseClient, institutionId: string): Promise<ManualBundle> {
    return buildManualBundle(supabase, institutionId);
  },

  /** Render the manual as HTML — returns a complete `<!doctype html>` document. */
  async exportAsHtml(supabase: SupabaseClient, institutionId: string): Promise<string> {
    const bundle = await buildManualBundle(supabase, institutionId);
    return renderHtml(bundle);
  },

  /** Render the manual as a structured JSON document. */
  async exportAsJson(supabase: SupabaseClient, institutionId: string): Promise<object> {
    const bundle = await buildManualBundle(supabase, institutionId);
    return renderJson(bundle);
  },

  /** Render the manual as a PDF (jspdf, no headless-chrome). */
  async exportAsPdf(supabase: SupabaseClient, institutionId: string): Promise<Uint8Array> {
    const bundle = await buildManualBundle(supabase, institutionId);
    return renderPdf(bundle);
  },
};
