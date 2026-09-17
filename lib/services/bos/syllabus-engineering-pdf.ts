// Engineering (CET / Anna University) syllabus PDF for the API-key routes.
//
// The document the CET office recognises as "the syllabus" is the jsPDF one the
// BoS screens download (lib/utils/bos/course-syllabus-cet-pdf.ts, reached via
// renderCourseSyllabusPDF with variant 'engineering'): CET letterhead, L-T-P-C
// row, COURSE OBJECTIVES, UNIT I–V with periods, COURSE OUTCOMES, references,
// CO–PO/PSO matrix, Course Designer / BoS Chairman sign-off. The API-key PDF
// route rendered a different HTML layout, so the COE received a document that
// did not match what the college prints. This module builds the SAME data the
// screen builds (mirrors buildSyllabusPdfData in
// app/(routes)/bos/syllabus/_components/row-actions.tsx, with server-side data
// access in place of the browser fetches) and renders it with the same
// generator, so the API and the screen produce the same document.
//
// Server-side only: reads the taxonomy table with the caller's service-role
// client, the course master through CoeRestClient, and the logo from /public.

import fs from 'node:fs';
import path from 'node:path';
import jsPDF from 'jspdf';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BosCourseSyllabus, BosCourseObjectivesContent, BosCourseLearnOutcomesContent } from '@/types/bos';
import { renderCourseSyllabusPDF, extractPOKeys, type CourseSyllabusPDFData } from '@/lib/utils/bos/course-syllabus-pdf';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';

/**
 * Whether a syllabus is an engineering (CET) document. Same three signals the
 * BoS screen uses: hosted by the engineering college, an explicit Engineering
 * stream, or an Anna University course code ("EC3354"). Autonomous CET codes
 * such as "CS25C08" are caught by the institution test.
 */
export function isEngineeringSyllabus(doc: BosCourseSyllabus, institutionName?: string | null): boolean {
  const byInstitution = /\bcet\b|jkkncet|engineering|technology/i.test(institutionName ?? '');
  const byStream = /engineering/i.test(doc.stream ?? '');
  const byCode = /^[A-Z]{2,3}\d{4}$/.test((doc.course_code ?? '').trim());
  return byInstitution || byStream || byCode;
}

/** Mirrors resolveContentModes in row-actions.tsx — which content sections print. */
function resolveContentModes(
  courseCategory: string | undefined,
  content: BosCourseSyllabus['course_content'],
): { includeTheory: boolean; includePractical: boolean } {
  const cat = (courseCategory || '').toLowerCase();
  const namesAMode = cat.includes('theory') || cat.includes('practical') || cat.includes('project');
  let includeTheory: boolean;
  let includePractical: boolean;
  if (cat && namesAMode) {
    includeTheory = cat.includes('theory');
    includePractical = cat.includes('practical');
  } else {
    const isPractical = !!content?.is_practical;
    includeTheory = !isPractical;
    includePractical = isPractical;
  }
  const hasUnits = (content?.units?.length ?? 0) > 0;
  const hasTopics = (content?.topics?.length ?? 0) > 0;
  const rendersNothing = !(includeTheory && hasUnits) && !(includePractical && hasTopics);
  if (rendersNothing && (hasUnits || hasTopics)) return { includeTheory: hasUnits, includePractical: hasTopics };
  return { includeTheory, includePractical };
}

/** A /public image as a data URI, for jsPDF.addImage on the server (no browser to fetch it). */
function publicImageDataUri(publicPath: string | undefined): string | undefined {
  if (!publicPath) return undefined;
  try {
    const file = path.join(process.cwd(), 'public', publicPath.replace(/^\/+/, ''));
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    return undefined; // the renderer prints the banner text-only
  }
}

/** Taxonomy for the syllabus's regulation: board-scoped row first, regulation-wide fallback. */
async function loadTaxonomy(supabase: SupabaseClient, doc: BosCourseSyllabus) {
  if (!doc.regulation_id) return { kValues: undefined, poKeys: undefined, psoKeys: undefined };
  const { data: rows } = await supabase
    .from('bos_regulation_taxonomies')
    .select('*')
    .eq('regulation_id', doc.regulation_id)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false });
  const list = (rows ?? []) as Array<Record<string, unknown>>;
  const boardRow = doc.board_id ? list.find((r) => r.board_id === doc.board_id) : undefined;
  const row = boardRow ?? list.find((r) => r.board_id == null) ?? null;
  if (!row) return { kValues: undefined, poKeys: undefined, psoKeys: undefined };
  return {
    kValues: (row.k_values as Record<string, string> | undefined) ?? undefined,
    poKeys: extractPOKeys(row.pos as Record<string, string> | undefined),
    psoKeys: row.psos ? extractPOKeys(row.psos as Record<string, string>) : [],
  };
}

/** Course master (COE) for the part label, category and L-T-P-C. Best-effort. */
async function loadCourseMaster(doc: BosCourseSyllabus) {
  let coursePartLabel: string | undefined;
  let courseCategory: string | undefined;
  let workload: { theory?: number; tutorial?: number; practical?: number; credit?: number } | undefined;
  let course_code = doc.course_code;
  if (!doc.course_id) return { course_code, coursePartLabel, courseCategory, workload };
  try {
    const client = CoeRestClient.create();
    const j = await client.get<unknown>(`/api/v1/courses/${doc.course_id}`);
    const match = ((j as { data?: unknown })?.data ?? j) as Record<string, unknown> | null;
    if (match) {
      if (typeof match.course_code === 'string' && match.course_code) course_code = match.course_code;
      const partOrType = (match.course_type ?? match.course_part_master ?? null) as string | null;
      const level = (match.course_level ?? null) as string | null;
      const composed = (match.course_type_code as string | undefined)
        ?? (partOrType && level ? `${partOrType}-${level}` : (partOrType ?? undefined));
      if (composed) coursePartLabel = composed;
      if (typeof match.course_category === 'string' && match.course_category) courseCategory = match.course_category;
      const num = (v: unknown) => (v == null || v === '' ? undefined : Number(v));
      workload = {
        theory: num(match.theory_hours),
        tutorial: num(match.tutorial_hours),
        practical: num(match.practical_hours),
        credit: num(match.credit ?? match.credits ?? match.course_credits),
      };
    }
  } catch {
    // non-fatal — the stored snapshot stands
  }
  return { course_code, coursePartLabel, courseCategory, workload };
}

/**
 * Build the engineering syllabus PDF (bytes) for one syllabus row. `doc` should
 * already carry the live COE course code/name (see courseDisplayFor).
 */
export async function buildEngineeringSyllabusPdf(
  supabase: SupabaseClient,
  doc: BosCourseSyllabus,
): Promise<Buffer> {
  const [taxonomy, master] = await Promise.all([loadTaxonomy(supabase, doc), loadCourseMaster(doc)]);

  // The engineering variant always prints the CET letterhead.
  const header = getInstitutionHeader('Engineering', 'CET');
  const objectivesContent = doc.course_objectives as BosCourseObjectivesContent | undefined;
  const outcomesContent = doc.course_learning_outcomes as BosCourseLearnOutcomesContent | undefined;
  const contentModes = resolveContentModes(master.courseCategory, doc.course_content);

  // L-T-P-C: structured course master first, else the "LTPC: 3 1 0 4" the docx importer leaves in notes.
  const w = master.workload;
  const ltpcFromCourse =
    w && (w.theory != null || w.credit != null)
      ? { l: w.theory ?? '', t: w.tutorial ?? 0, p: w.practical ?? 0, c: w.credit ?? (doc.course_credits ?? '') }
      : undefined;
  const ltpcMatch = /LTPC[:\s]*([0-9]+)[\s/]+([0-9]+)[\s/]+([0-9]+)[\s/]+([0-9]+)/i.exec(doc.notes ?? '');
  const ltpc = ltpcFromCourse ?? (ltpcMatch ? { l: ltpcMatch[1], t: ltpcMatch[2], p: ltpcMatch[3], c: ltpcMatch[4] } : undefined);

  const totalHoursRaw = doc.course_content?.total_hours ?? '';
  const periodsMatch =
    /(\d+)\s*\+\s*(\d+)/.exec(totalHoursRaw) ??
    /(\d+)\s*\+\s*(\d+)\s*PERIODS/i.exec(doc.notes ?? '') ??
    /PERIODS?[:\s]*(\d+)\s*\+\s*(\d+)/i.exec(doc.notes ?? '');
  const total_periods = periodsMatch ? { theory: Number(periodsMatch[1]), tut: Number(periodsMatch[2]) } : undefined;

  const data: CourseSyllabusPDFData = {
    variant: 'engineering',
    unitLayout: 'stacked',
    ltpc,
    total_periods,
    content_total_hours: totalHoursRaw.trim() || undefined,
    institution_name: header.institution_name,
    institution_address: header.institution_address,
    institution_accreditation: header.institution_accreditation,
    banner_lines: header.banner_lines,
    institution_website: header.website,
    logoImage: publicImageDataUri(header.logoImage ?? '/logo.png'),
    rightLogoImage: publicImageDataUri(header.rightLogoImage),
    course_code: master.course_code || doc.course_code,
    course_name: doc.course_name,
    course_part: master.coursePartLabel,
    total_hours: doc.total_hours ?? undefined,
    contact_hours: doc.contact_hours ?? undefined,
    credits: doc.course_credits ?? undefined,
    scope: doc.scope ?? undefined,
    objectives: objectivesContent?.objectives ?? [],
    clos: outcomesContent?.clos ?? [],
    k_values: taxonomy.kValues,
    units: contentModes.includeTheory ? (doc.course_content?.units ?? []) : [],
    practical_topics: contentModes.includePractical ? (doc.course_content?.topics ?? []) : undefined,
    number_practical_topics: doc.course_content?.number_practical_topics,
    instruction: doc.course_content?.instruction,
    textbooks: doc.textbooks?.primary ?? [],
    references: doc.textbooks?.references ?? [],
    web_resources: doc.web_resources?.resources ?? [],
    pedagogy_methods: doc.pedagogy?.methods ?? [],
    po_mappings: doc.po_mappings?.mappings ?? [],
    po_keys: taxonomy.poKeys,
    pso_keys: taxonomy.psoKeys,
    assessment_structure: doc.assessment_structure,
    concept_applications: doc.concept_applications,
    assessment_pattern: doc.assessment_pattern,
    capstone_project: doc.capstone_project,
    capstone_rubric: doc.capstone_rubric,
    llc_conference: doc.llc_conference,
  };

  const pdf = new jsPDF('portrait', 'mm', 'a4');
  renderCourseSyllabusPDF(pdf, data);
  return Buffer.from(pdf.output('arraybuffer'));
}
