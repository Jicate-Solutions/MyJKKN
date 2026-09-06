// Dedicated PDF renderer for BDS (DCI / Dr. MGR Medical University) syllabi.
//
// BDS syllabi store their body in bds_content + exam_scheme (not the Anna
// course_content/units + CO-PO that course-syllabus-pdf.ts renders), so they get
// their own self-contained jsPDF renderer: JKKN letterhead (logo + DCI subtitle),
// Goal, multi-facet
// Objectives, grouped Competencies, teaching hours/methodology, the MUST /
// DESIRABLE / NICE three-tier theory grid, Practicals, the exam-scheme matrix +
// question pattern + practical-exam breakdown, and grouped textbooks.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const A4_W = 210;
const A4_H = 297;
const MARGIN = 14;
const CONTENT_W = A4_W - MARGIN * 2;

type StrList = string[] | null | undefined;
interface GridRow { topic?: string; must_know?: StrList; desirable_to_know?: StrList; nice_to_know?: StrList }
interface CompGroup { group?: string; items?: StrList }

export interface BdsPdfSyllabus {
  course_code?: string;
  course_name?: string;
  academic_year?: number | null;
  bds_content?: any;
  exam_scheme?: any;
  textbooks?: any;
}

export interface BdsPdfContext {
  institutionName?: string | null;
  logoImage?: string | null; // data URL, optional
}

const OBJ_LABELS: Record<string, string> = {
  knowledge: 'Knowledge & Understanding',
  skills: 'Skills',
  attitude: 'Attitude',
  integration: 'Integration',
  infection_control: 'Infection Control',
  computer_proficiency: 'Computer Proficiency',
};
const YEAR_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

function has(l: StrList): l is string[] { return Array.isArray(l) && l.length > 0; }
function bullets(l: StrList): string { return has(l) ? l.map((t) => `• ${t}`).join('\n') : ''; }

/** Renders the BDS syllabus and returns the jsPDF doc. */
export function generateBdsSyllabusPDF(syllabus: BdsPdfSyllabus, ctx: BdsPdfContext = {}): jsPDF {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const c = syllabus.bds_content ?? {};
  const es = syllabus.exam_scheme ?? {};

  let y = MARGIN;
  const ensure = (need: number) => {
    if (y + need > A4_H - MARGIN) { doc.addPage(); y = MARGIN; }
  };
  const afterTable = () => { y = (doc as any).lastAutoTable?.finalY ?? y; };

  // ── Header (JKKN letterhead) ────────────────────────────────────────────────
  // College name is the primary line + logo; the university line is intentionally
  // omitted. The DCI/B.D.S. line stays as the regulatory subtitle.
  const headTop = y;
  if (ctx.logoImage) {
    try { doc.addImage(ctx.logoImage, 'PNG', MARGIN, y, 18, 18); } catch { /* logo optional */ }
  }
  const college = (ctx.institutionName && String(ctx.institutionName).trim()) || 'JKKN Dental College and Hospital';
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.text(college, A4_W / 2, y + 7, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text('B.D.S. Degree Course — Dental Council of India Regulations', A4_W / 2, y + 13, { align: 'center' });
  y = headTop + 20;
  doc.setDrawColor(120);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, A4_W - MARGIN, y);
  doc.setLineWidth(0.2);
  y += 6;

  // Course title bar
  const yr = syllabus.academic_year && YEAR_ROMAN[syllabus.academic_year] ? `${YEAR_ROMAN[syllabus.academic_year]} Year` : '';
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  const title = [syllabus.course_code, syllabus.course_name].filter(Boolean).join(' — ');
  doc.text(title || 'Syllabus', MARGIN, y);
  if (yr) {
    doc.setFontSize(10);
    doc.text(yr, A4_W - MARGIN, y, { align: 'right' });
  }
  y += 4;

  // Teaching hours line
  const th = c.teaching_hours ?? {};
  const hrs: string[] = [];
  if (th.lecture != null) hrs.push(`Lecture: ${th.lecture} hrs`);
  if (th.practical != null) hrs.push(`Practical/Clinical: ${th.practical} hrs`);
  if (th.total != null) hrs.push(`Total: ${th.total} hrs`);
  if (hrs.length) {
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.text(hrs.join('    '), MARGIN, y);
    y += 5;
  } else {
    y += 1;
  }

  // ── Free-text / bulleted section helper ─────────────────────────────────────
  const heading = (label: string) => {
    ensure(10);
    doc.setFont('times', 'bold');
    doc.setFontSize(10.5);
    doc.text(label, MARGIN, y);
    y += 1;
    doc.setDrawColor(180);
    doc.line(MARGIN, y, A4_W - MARGIN, y);
    y += 4;
  };
  const paragraph = (text: string, size = 9.5) => {
    doc.setFont('times', 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, CONTENT_W) as string[];
    lines.forEach((ln) => { ensure(5); doc.text(ln, MARGIN, y); y += 4.4; });
  };
  const subheading = (text: string) => {
    ensure(6);
    doc.setFont('times', 'bold');
    doc.setFontSize(9.5);
    doc.text(text, MARGIN, y);
    y += 4.4;
  };

  // ── Goal ────────────────────────────────────────────────────────────────
  if (c.goal) { heading('1. Goal'); paragraph(c.goal); y += 2; }

  // ── Objectives ────────────────────────────────────────────────────────────
  const obj = c.objectives ?? {};
  const objKeys = Object.keys(obj).filter((k) => has(obj[k]));
  if (objKeys.length) {
    heading('2. Objectives');
    objKeys.forEach((k) => {
      subheading(OBJ_LABELS[k] ?? k);
      paragraph(bullets(obj[k]));
      y += 1;
    });
    y += 1;
  }

  // ── Competencies ────────────────────────────────────────────────────────────
  const comps: CompGroup[] = Array.isArray(c.competencies) ? c.competencies : [];
  if (comps.some((g) => g.group)) {
    heading('3. Competencies');
    comps.forEach((g) => {
      subheading(g.group ?? '');
      if (has(g.items)) paragraph(bullets(g.items));
      y += 1;
    });
    y += 1;
  }

  // ── Teaching methodology ────────────────────────────────────────────────────
  if (has(c.teaching_methodology)) {
    heading('4. Teaching Methodology');
    paragraph(bullets(c.teaching_methodology));
    y += 2;
  }

  // ── Theory syllabus grid ────────────────────────────────────────────────────
  const grid: GridRow[] = Array.isArray(c.theory_syllabus) ? c.theory_syllabus : [];
  if (grid.length) {
    heading('5. Theory Syllabus');
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Topic', 'Must Know', 'Desirable to Know', 'Nice to Know']],
      body: grid.map((r) => [r.topic ?? '', bullets(r.must_know), bullets(r.desirable_to_know), bullets(r.nice_to_know)]),
      styles: { font: 'times', fontSize: 7.5, cellPadding: 1.5, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 34, fontStyle: 'bold' }, 1: { cellWidth: 52 }, 2: { cellWidth: 48 }, 3: { cellWidth: 48 } },
      theme: 'grid',
    });
    afterTable();
    y += 4;
  }

  // ── Practicals ────────────────────────────────────────────────────────────
  const practicals = Array.isArray(c.practicals) ? c.practicals : [];
  if (practicals.length) {
    heading('6. Practicals');
    paragraph(practicals.map((p: any) => `• ${p.title}${p.hours != null ? ` (${p.hours} hrs)` : ''}`).join('\n'));
    y += 2;
  }

  // ── Examination scheme ────────────────────────────────────────────────────
  const components = Array.isArray(es.components) ? es.components : [];
  if (components.length || es.question_pattern || es.practical_exam) {
    heading('7. Examination Scheme');
    if (es.no_theory_exam) { paragraph('No Theory Examination.'); y += 1; }
    if (components.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        head: [['Stream', 'Examination', 'Internal', 'Viva', 'Total']],
        body: [
          ...components.map((cp: any) => [cp.stream ?? '', num(cp.examination), num(cp.internal_assessment), num(cp.viva), num(cp.total)]),
          ...(es.grand_total != null ? [[{ content: 'Grand Total', colSpan: 4, styles: { fontStyle: 'bold' } }, String(es.grand_total)]] : []),
        ] as any,
        styles: { font: 'times', fontSize: 8.5, cellPadding: 1.5, halign: 'center' },
        headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
        theme: 'grid',
      });
      afterTable();
      y += 4;
    }
    const qp = es.question_pattern;
    if (qp && Array.isArray(qp.sections) && qp.sections.length) {
      subheading(`Theory Question Pattern${qp.duration_hours ? ` (${qp.duration_hours} hrs)` : qp.duration ? ` (${qp.duration})` : ''}`);
      paragraph(qp.sections.map((s: any) => `• ${s.name || s.type}: ${s.count ?? s.questions} × ${s.marks_each} = ${s.total} marks${s.note ? ` (${s.note})` : ''}`).join('\n'));
      if (qp.total_marks != null) paragraph(`Total: ${qp.total_marks} marks`);
      y += 1;
    }
    const pe = es.practical_exam;
    if (pe && Array.isArray(pe.items) && pe.items.length) {
      subheading(`Practical Examination${pe.type ? ` — ${pe.type}` : ''}`);
      paragraph(pe.items.map((it: any) => {
        const m = it.count != null && it.marks_each != null ? `${it.count} × ${it.marks_each} = ${it.total}` : it.marks != null ? `${it.marks} marks` : it.total != null ? `${it.total} marks` : '';
        return `• ${it.name}${m ? ` — ${m}` : ''}`;
      }).join('\n'));
      if (pe.viva?.max != null) paragraph(`Viva: ${pe.viva.max} marks${pe.viva.notes ? ` (${pe.viva.notes})` : ''}`);
      y += 1;
    }
    const ia = es.internal_assessment;
    if (ia?.frequency) { paragraph(`Internal Assessment: ${ia.frequency}`, 8.5); }
    y += 2;
  }

  // ── Textbooks ────────────────────────────────────────────────────────────
  const groups = [...(Array.isArray(syllabus.textbooks?.groups) ? syllabus.textbooks.groups : []),
                  ...(Array.isArray(syllabus.textbooks?.reference_groups) ? syllabus.textbooks.reference_groups : [])];
  if (groups.length) {
    heading('8. Books');
    groups.forEach((g: any) => {
      subheading(g.group ?? 'Books');
      if (has(g.books)) paragraph(g.books.map((b: string, i: number) => `${i + 1}. ${b}`).join('\n'));
      y += 1;
    });
  }

  // ── Page numbers ────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Page ${p} of ${pages}`, A4_W / 2, A4_H - 6, { align: 'center' });
    doc.setTextColor(0);
  }

  return doc;
}

function num(v: any): string { return v == null ? '—' : String(v); }

/** Fetch a /public image and convert it to a data: URL jsPDF can embed.
 *  jsPDF cannot resolve a bare path, so the logo must be inlined. Browser-only;
 *  returns null on the server or on any failure (logo is optional). */
async function loadImageDataUrl(path: string): Promise<string | null> {
  if (typeof window === 'undefined' || !path) return null;
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Convenience: load the JKKN logo, render, and trigger a download in the browser.
 *  Async because the letterhead logo is fetched + inlined before rendering. */
export async function downloadBdsSyllabusPDF(syllabus: BdsPdfSyllabus, ctx: BdsPdfContext = {}): Promise<void> {
  const logoImage = ctx.logoImage ?? (await loadImageDataUrl('/jkkn_logo.png'));
  const doc = generateBdsSyllabusPDF(syllabus, { ...ctx, logoImage });
  const safe = `${syllabus.course_code ?? 'BDS'}-${syllabus.course_name ?? 'syllabus'}`.replace(/[^a-z0-9]+/gi, '_');
  doc.save(`${safe}.pdf`);
}
