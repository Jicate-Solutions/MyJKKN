'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Row } from '@tanstack/react-table';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteBosSyllabus } from '@/hooks/bos/use-bos-syllabus';
import { useBosBoardScope, canEditSyllabus } from '@/hooks/bos/use-bos-board-scope';
import { useAuth } from '@/hooks/use-auth-provider';
import { ReviseDialog } from '@/components/bos/revise-dialog';
import { CloneDialog } from '@/components/bos/clone-dialog';
import type { BosCourseSyllabus, BosCourseObjectivesContent, BosCourseLearnOutcomesContent } from '@/types/bos';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { MoreHorizontal, Edit2, Copy, History, Trash2, FileDown, Loader2, FileSpreadsheet, FileText, FileCode2 } from 'lucide-react';
import { toast } from 'sonner';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import { generateCourseSyllabusPDF, extractPOKeys, type CourseSyllabusPDFData } from '@/lib/utils/bos/course-syllabus-pdf';
import { generateCourseSyllabusDOCX } from '@/lib/utils/bos/course-syllabus-docx';
import { modelUsesAhsContent } from '@/lib/services/bos/academic-model';
import { exportSyllabusToXlsx } from './syllabus-actions';

// ── AHS / Pharm.D (mgr_ahs / mgr_pharmd) PDF mapping ────────────────────────
// These models store content in ahs_content { subjects[] }, marks in exam_scheme,
// and rotations in internship_postings — NOT in the Anna course_content/CO-PO
// columns the PDF data-builder reads. Map them onto the generator's existing
// primitives (units + references + instruction) so the letterhead PDF renders.
const ahsTopicStr = (t: unknown): string =>
  typeof t === 'string'
    ? t
    : t && typeof t === 'object'
      ? [((t as Record<string, unknown>).title ?? '') as string,
         ((t as Record<string, unknown>).content ?? '') as string].filter(Boolean).join(': ')
      : String(t ?? '');

/** Normalise ahs_content to a subjects[] list, tolerating the pre-reshape shape
 *  where a single paper's fields sit at the root ({ paper_no, topics, ... }). */
function ahsSubjects(ahs: BosCourseSyllabus['ahs_content']): NonNullable<BosCourseSyllabus['ahs_content']>['subjects'] {
  if (ahs?.subjects?.length) return ahs.subjects;
  const root = ahs as Record<string, unknown> | undefined;
  if (root && (root.paper_no || root.topics || root.units)) {
    return [{
      subject_no: (root.paper_no as string) ?? undefined,
      title: (root.title as string) ?? '',
      mode: (root.mode as 'flat' | 'units') ?? 'flat',
      topics: (root.topics as string[]) ?? [],
      units: (root.units as { unit_no: string; topics: string[] }[]) ?? [],
      reference_books: (root.reference_books as string[]) ?? [],
    }];
  }
  return [];
}

/** Split one AHS topic string into a bold heading + its `;`-separated subtopics.
 *  Source topics are "HEADING: item; item; item" — the heading becomes the bold
 *  chapter title and each item a subtopic (rendered as normal detail below it),
 *  instead of the whole run-on string sitting in the (bold) title. Splits on the
 *  FIRST colon only, so colons inside an item are preserved. No colon → the whole
 *  string is the heading with no subtopics. */
function ahsTopicToChapter(raw: unknown, idx: number): NonNullable<CourseSyllabusPDFData['units']>[number]['chapters'][number] {
  const t = ahsTopicStr(raw).trim();
  const ci = t.indexOf(':');
  if (ci > 0 && ci < t.length - 1) {
    const heading = t.slice(0, ci).trim();
    const subs = t.slice(ci + 1)
      .split(/\s*;\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (subs.length > 0) {
      return {
        chapter_number: String(idx + 1),
        title: heading,
        sections: '',
        subtopics: subs.map((s, si) => ({ number: si + 1, title: s })),
      };
    }
  }
  return { chapter_number: String(idx + 1), title: t, sections: '' };
}

/** ahs_content.subjects → the generator's BosUnit[] (paper → topics/units). */
function ahsContentToUnits(
  ahs: BosCourseSyllabus['ahs_content'],
): NonNullable<CourseSyllabusPDFData['units']> {
  const subjects = ahsSubjects(ahs);
  const units: NonNullable<CourseSyllabusPDFData['units']> = [];
  subjects.forEach((s) => {
    if ((s.mode ?? 'flat') === 'units' && (s.units?.length ?? 0) > 0) {
      (s.units ?? []).forEach((u, ui) => {
        // Source blocks are "Block N: Name". Put the short "Block N" tag in the
        // narrow Unit column and the name (bold) in the content column — NOT the
        // full string in both, which wraps ugly and duplicates the heading.
        const raw = (u.unit_no || '').trim();
        const ci = raw.indexOf(':');
        const col1 = ci > 0 ? raw.slice(0, ci).trim() : (raw || String(ui + 1));
        const title = ci > 0 ? raw.slice(ci + 1).trim() : raw;
        units.push({
          unit_id: col1,
          unit_title: title,
          chapters: (u.topics ?? []).map((t, ci2) => ahsTopicToChapter(t, ci2)),
        });
      });
    } else {
      // flat: ONE table row PER topic heading — NOT one mega-row. autoTable
      // paginates between rows, so a single huge cell would overflow the page and
      // the exam/references/signature blocks after it would overlap the content.
      // The paper number sits on the first row; each heading is the bold unit
      // title with its sub-items as the detail line beneath.
      const topics = s.topics ?? [];
      if (topics.length === 0) {
        units.push({ unit_id: s.subject_no || '', unit_title: s.title || '', chapters: [] });
      }
      topics.forEach((t, ti) => {
        const ch = ahsTopicToChapter(t, 0);
        units.push({
          unit_id: ti === 0 ? (s.subject_no || '') : '',
          unit_title: ch.title,
          chapters:
            ch.subtopics && ch.subtopics.length > 0
              ? [{ chapter_number: '1', title: '', sections: '', subtopics: ch.subtopics }]
              : [],
        });
      });
    }
  });
  return units;
}

/** ahs_content reference_books → the generator's reference list. */
function ahsReferences(
  ahs: BosCourseSyllabus['ahs_content'],
): NonNullable<CourseSyllabusPDFData['references']> {
  const out: NonNullable<CourseSyllabusPDFData['references']> = [];
  ahsSubjects(ahs).forEach((s) =>
    (s.reference_books ?? []).forEach((r) => out.push({ title: ahsTopicStr(r), author: '' })),
  );
  return out;
}

/** exam_scheme + internship_postings → a plain-text block printed after content. */
function ahsExamInternshipText(
  exam: BosCourseSyllabus['exam_scheme'],
  intern: BosCourseSyllabus['internship_postings'],
): string {
  const parts: string[] = [];
  const comps = exam?.components ?? [];
  if (comps.length) {
    parts.push(
      'EXAMINATION SCHEME: ' +
        comps
          .map((c) => `${c.name} (Max ${c.max ?? '-'}${c.min != null ? `/Min ${c.min}` : ''})`)
          .join('; '),
    );
  }
  const qsecs = exam?.question_pattern?.sections ?? [];
  if (qsecs.length) {
    parts.push(
      'QUESTION PATTERN: ' +
        qsecs.map((s) => `${s.name}${s.marks != null ? ` (${s.marks})` : ''}`).join('; ') +
        (exam?.question_pattern?.total_marks != null
          ? ` = ${exam.question_pattern.total_marks}`
          : ''),
    );
  }
  const postings = intern?.postings ?? [];
  if (postings.length) {
    parts.push(
      `INTERNSHIP${intern?.total_duration ? ` (${intern.total_duration})` : ''}: ` +
        postings.map((p) => `${p.area}${p.duration ? ` — ${p.duration}` : ''}`).join('; '),
    );
  }
  return parts.join('\n\n');
}

// Resolve the course's CURRENT code / part / category / workload for the report,
// anchored on the stable COE course_id when present. A course_code search would
// miss a course COE has since renamed — the exact breakage course_id solves — so
// we fetch by id first and fall back to a course_code search for rows not yet
// backfilled with a course_id. Returns the stored snapshot if COE is unreachable.
//
// course_name is deliberately NOT taken from COE: COE course masters bake the
// category into the title ("SEC-II-Cosmetics and Personal Care Products"), which
// the `coursePartLabel` prefix below then duplicates ("SEC-SEC-II-…"). The
// syllabus author's own bos_course_syllabi.course_name is the title of record.
async function resolveCourseForReport(syllabus: BosCourseSyllabus): Promise<{
  course_code: string;
  /** Always bos_course_syllabi.course_name — never the COE master's name. */
  course_name: string;
  coursePartLabel?: string;
  /** Course master category (e.g. "Theory", "Practical", "Theory + Practical") —
   *  decides whether the PDF prints the theory units, the practical experiments,
   *  or both sections. */
  courseCategory?: string;
  /** Structured L-T-P-C from the course master (engineering CET header). */
  workload?: { theory?: number; tutorial?: number; practical?: number; credit?: number };
}> {
  let course_code = syllabus.course_code;
  const course_name = syllabus.course_name;
  let coursePartLabel: string | undefined;
  let courseCategory: string | undefined;
  let workload: { theory?: number; tutorial?: number; practical?: number; credit?: number } | undefined;
  try {
    let match: Record<string, unknown> | null = null;
    if (syllabus.course_id) {
      const r = await fetch(`/api/bos/courses-master/${syllabus.course_id}`);
      if (r.ok) {
        const j = await r.json();
        match = (j?.data ?? j) as Record<string, unknown>;
      }
    }
    if (!match) {
      const params = new URLSearchParams({
        institution_id: syllabus.institutions_id,
        search: syllabus.course_code,
        is_active: 'true',
        limit: '50',
      });
      const r = await fetch(`/api/bos/courses-master?${params}`);
      if (r.ok) {
        const j = await r.json();
        const rows = (Array.isArray(j) ? j : (j?.data ?? [])) as Array<Record<string, unknown>>;
        match = rows.find((c) => c.course_code === syllabus.course_code) ?? null;
      }
    }
    if (match) {
      if (typeof match.course_code === 'string' && match.course_code) course_code = match.course_code;
      const partOrType = (match.course_type ?? match.course_part_master ?? null) as string | null;
      const level = (match.course_level ?? null) as string | null;
      const composed = (match.course_type_code as string | undefined)
        ?? (partOrType && level ? `${partOrType}-${level}` : (partOrType ?? undefined));
      if (composed) coursePartLabel = composed;
      if (typeof match.course_category === 'string' && match.course_category) {
        courseCategory = match.course_category;
      }

      const num = (v: unknown) => (v == null || v === '' ? undefined : Number(v));
      workload = {
        theory: num(match.theory_hours),
        tutorial: num(match.tutorial_hours),
        practical: num(match.practical_hours),
        credit: num(match.credit ?? match.credits ?? match.course_credits),
      };
    }
  } catch {
    // non-fatal — fall back to the stored snapshot
  }
  return { course_code, course_name, coursePartLabel, courseCategory, workload };
}

// Resolve the SYLLABUS's OWN institution (name + code) for the PDF header. The
// caller-supplied institutionName is the scoped filter selection, not the row's
// institution — so a super-admin viewing an unfiltered list gets the wrong (or
// no) name, which falls back to the Arts & Science letterhead. Cached so a bulk
// export doesn't refetch the small list per syllabus.
type InstLite = { id: string; name?: string; institution_code?: string; myjkkn_institution_ids?: string[] };
let _instListCache: Promise<InstLite[]> | null = null;
function loadInstitutionsList(): Promise<InstLite[]> {
  if (!_instListCache) {
    _instListCache = fetch('/api/bos/institutions')
      .then((r) => (r.ok ? (r.json() as Promise<InstLite[]>) : []))
      .catch(() => [] as InstLite[]);
  }
  return _instListCache;
}
async function resolveSyllabusInstitution(institutionsId: string): Promise<{ name?: string; code?: string }> {
  try {
    const list = await loadInstitutionsList();
    const m = list.find(
      (i) => i.id === institutionsId || (i.myjkkn_institution_ids ?? []).includes(institutionsId),
    );
    return { name: m?.name, code: m?.institution_code };
  } catch {
    return {};
  }
}

/**
 * Decides which course-content sections the PDF should print, from the course
 * master category. A combined "Theory + Practical" course prints BOTH (theory
 * first). When the category is missing or names none of the three modes
 * (e.g. "Field Work"), we fall back to the syllabus's own is_practical view
 * flag — the same fallback the Content-tab editor uses — so nothing authored is
 * dropped.
 */
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

  // Safety net: the COE category must never silence the ONLY authored body.
  // Plenty of lab courses are typed on the Content tab as UNIT I / UNIT II
  // (units[]) rather than the numbered experiment list (topics[]) — a shape
  // mismatch the form permits. With a "Practical" category that combination
  // resolved to includeTheory:false + an empty topics[], so the export rendered
  // a syllabus with no course content at all. When the category-selected shapes
  // carry nothing but the other shape has data, print what was actually
  // authored; the author's own headings then decide how it reads.
  const hasUnits = (content?.units?.length ?? 0) > 0;
  const hasTopics = (content?.topics?.length ?? 0) > 0;
  const rendersNothing = !(includeTheory && hasUnits) && !(includePractical && hasTopics);
  if (rendersNothing && (hasUnits || hasTopics)) {
    return { includeTheory: hasUnits, includePractical: hasTopics };
  }

  return { includeTheory, includePractical };
}

/**
 * Shared, cacheable context for {@link buildSyllabusPdfData}.
 *
 * A single-row download supplies nothing but the branding flags. A BULK export
 * (see bulk-syllabi-download.tsx) additionally passes a taxonomy cache and a
 * course resolver so that N syllabi cost ~O(boards) network round-trips instead
 * of O(N) — without which an 800-course regulation would fire ~1600 requests.
 */
export interface SyllabusPdfContext {
  institutionName?: string;
  /** Arts-&-Science (CAS) institution → render unit content as a flowing paragraph. */
  isCas?: boolean;
  /** CET (Engineering) institution → always render the Engineering PDF format. */
  isCet?: boolean;
  /** Keyed `${regulation_id}|${institutions_id}|${board_id}` — one fetch per board. */
  taxonomyCache?: Map<
    string,
    {
      kValues?: Record<string, string>;
      poKeys?: string[];
      psoKeys?: string[];
      taxonomyType?: string | null;
    }
  >;
  /** Replaces the per-course COE round-trip with a caller-supplied lookup. */
  resolveCourse?: (
    syllabus: BosCourseSyllabus,
  ) => Promise<Awaited<ReturnType<typeof resolveCourseForReport>>>;
}

/**
 * Builds the complete {@link CourseSyllabusPDFData} for one syllabus.
 *
 * This is the SINGLE source of truth for what a syllabus PDF contains — the
 * per-row download button and the bulk board-wise ZIP both call it, so a course
 * exported in bulk is byte-for-byte the document you get by downloading it
 * individually. Any variant/branding/content rule belongs here, never in a
 * caller.
 */
export async function buildSyllabusPdfData(
  syllabus: BosCourseSyllabus,
  ctx: SyllabusPdfContext = {},
): Promise<CourseSyllabusPDFData> {
  const { institutionName, isCas = false, isCet = false, taxonomyCache, resolveCourse } = ctx;

  let kValues: Record<string, string> | undefined;
  let poKeys: string[] | undefined;
  let psoKeys: string[] | undefined;
  // 'finks' | 'blooms' | 'custom' | null — the framework configured for this
  // regulation (board-scoped row first, regulation-wide fallback). Drives the
  // v3.5 block gate below. null when no taxonomy row exists.
  let taxonomyType: string | null = null;

  if (syllabus.regulation_id) {
    const cacheKey = `${syllabus.regulation_id}|${syllabus.institutions_id}|${syllabus.board_id ?? ''}`;
    const cached = taxonomyCache?.get(cacheKey);
    if (cached) {
      ({ kValues, poKeys, psoKeys } = cached);
      taxonomyType = cached.taxonomyType ?? null;
    } else {
      try {
        // Pass the syllabus's own institution so the taxonomy resolves the
        // SAME row the form's CO panel sees. Without it, a super-admin call
        // falls back to the regulation row's institution_id, which can miss
        // the configured (Fink's) taxonomy and default to Bloom's K-values.
        const taxRes = await fetch(
          `/api/bos/taxonomy/${syllabus.regulation_id}?institutionsId=${encodeURIComponent(syllabus.institutions_id)}${syllabus.board_id ? `&boardId=${encodeURIComponent(syllabus.board_id)}` : ''}`,
        );
        if (taxRes.ok) {
          const taxonomy = await taxRes.json();
          kValues = taxonomy.k_values;
          poKeys = extractPOKeys(taxonomy.pos);
          psoKeys = taxonomy.psos ? extractPOKeys(taxonomy.psos) : [];
          taxonomyType = taxonomy.taxonomy_type ?? null;
        }
      } catch {
        // taxonomy fetch failure is non-fatal; PDF generates without k-value legend
      }
      taxonomyCache?.set(cacheKey, { kValues, poKeys, psoKeys, taxonomyType });
    }
  }

  // Engineering (Anna University / CET) courses use the CET syllabus wording
  // AND the Engineering college banner/logo — even though they are managed
  // under the A&S autonomous college's BoS. The hosting institution is NOT a
  // reliable signal, so detect from the syllabus itself:
  //   1. the syllabus is hosted under CET itself — every CET course uses this
  //      format, and the code/stream heuristics below miss autonomous CET
  //      codes such as "CP25C22" (letters inside the digit block), or
  //   2. an explicit `stream` of "Engineering", or
  //   3. an Anna University course code (2–3 letters + 4 digits, e.g.
  //      "EC3354") — a shape A&S codes like "24UUCSDSE01" never match, so it
  //      is a safe fallback when the Stream field was left blank.
  const isEngineeringStream = /engineering/i.test(syllabus.stream ?? '');
  const isAnnaUnivCode = /^[A-Z]{2,3}\d{4}$/.test((syllabus.course_code ?? '').trim());
  const variant: 'default' | 'engineering' =
    isCet || isEngineeringStream || isAnnaUnivCode ? 'engineering' : 'default';

  // Force the Engineering header for the CET variant; otherwise resolve branding
  // from the SYLLABUS's OWN institution (name + code), falling back to the scoped
  // institutionName. Passing the code lets AHS ('AHS') route to the Dr. MGR
  // Medical header instead of the "Science"-matched Arts & Science letterhead.
  const ownInst = await resolveSyllabusInstitution(syllabus.institutions_id);
  const header = getInstitutionHeader(
    variant === 'engineering' ? 'Engineering' : (ownInst.name ?? institutionName ?? null),
    ownInst.code,
  );
  const objectivesContent = syllabus.course_objectives as BosCourseObjectivesContent | undefined;
  const outcomesContent = syllabus.course_learning_outcomes as BosCourseLearnOutcomesContent | undefined;

  // Resolve live course code + part (Core-I / Allied-II) from COE, anchored on
  // the stable course_id. The NAME comes from bos_course_syllabi.course_name.
  const { course_code: liveCode, course_name: storedName, coursePartLabel, courseCategory, workload } =
    await (resolveCourse ? resolveCourse(syllabus) : resolveCourseForReport(syllabus));
  const contentModes = resolveContentModes(courseCategory, syllabus.course_content);

  // Print bos_course_syllabi.course_name verbatim for CAS (Arts & Science),
  // engineering/CET and pharmacy (COP); only the remaining models still get the
  // course_type_code prefix ("Major-I-Programming in Python").
  //
  // CAS was originally the reason the prefix existed, but ~210 of its 1,134
  // course names already open with their own category ("CORE X - PHP
  // PROGRAMMING", "CORE PRACTICAL-I-ORGANIC CHEMISTRY PRACTICAL"), so prefixing
  // restated it — "Core-CORE X - PHP PROGRAMMING". The author's stored
  // course_name is the title of record for CAS; nothing is prepended to it.
  const isPharmacyDoc =
    syllabus.academic_model === 'pci_pharm' || syllabus.academic_model === 'mgr_pharmd';
  const displayCourseName = variant === 'engineering' || isPharmacyDoc || isCas
    ? storedName
    : coursePartLabel
      ? `${coursePartLabel}-${storedName}`
      : storedName;

  // LTPC isn't a structured column — the docx importer records it in notes
  // as "LTPC: 3 1 0 4". Parse it for the engineering header (unused by A&S).
  // Prefer the structured L-T-P-C from the course master; fall back to the
  // "LTPC: 3 1 0 4" line the docx importer leaves in notes.
  const ltpcFromCourse =
    workload && (workload.theory != null || workload.credit != null)
      ? {
          l: workload.theory ?? '',
          t: workload.tutorial ?? 0,
          p: workload.practical ?? 0,
          c: workload.credit ?? (syllabus.course_credits ?? ''),
        }
      : undefined;
  const ltpcMatch = /LTPC[:\s]*([0-9]+)[\s/]+([0-9]+)[\s/]+([0-9]+)[\s/]+([0-9]+)/i.exec(syllabus.notes ?? '');
  const ltpcFromNotes = ltpcMatch
    ? { l: ltpcMatch[1], t: ltpcMatch[2], p: ltpcMatch[3], c: ltpcMatch[4] }
    : undefined;
  const ltpc = ltpcFromCourse ?? ltpcFromNotes;

  // Total course periods ("30+30") for the CET per-unit hour markers and the
  // TOTAL line, when the units don't carry their own "6+6". Parsed from notes
  // ("TOTAL: 30+30 PERIODS" or "Periods: 30+30"); optional.
  const totalHoursRaw = syllabus.course_content?.total_hours ?? '';
  const periodsMatch =
    /(\d+)\s*\+\s*(\d+)/.exec(totalHoursRaw) ??
    /(\d+)\s*\+\s*(\d+)\s*PERIODS/i.exec(syllabus.notes ?? '') ??
    /PERIODS?[:\s]*(\d+)\s*\+\s*(\d+)/i.exec(syllabus.notes ?? '');
  const total_periods = periodsMatch
    ? { theory: Number(periodsMatch[1]), tut: Number(periodsMatch[2]) }
    : undefined;

  // ── v3.5 block gate: CAS + Bloom's regulation → omit ────────────────────────
  // The six JSONB blocks below (assessment structure, concept applications,
  // assessment pattern, capstone project, capstone rubric, LLC conference) are
  // the Fink's/Capstone apparatus introduced with the v3.5 syllabus format. They
  // only make sense under a Fink's regulation; printing them on a Bloom's one
  // (CAS R-2024 / R-2023) puts capstone and Learners-Led-Conference sections on
  // a document whose outcomes are Bloom-coded.
  //
  // Scoped to CAS deliberately: CET R-2021/R-2025 are also Bloom's and carry a
  // handful of these blocks, but changing those documents was not requested.
  // Widen by dropping `isCas &&` if that turns out to be wanted too.
  //
  // Conservative on unknowns — a missing taxonomy row yields null, not 'blooms',
  // so nothing authored is dropped when the framework simply isn't configured.
  const skipV35Blocks = isCas && taxonomyType === 'blooms';

  // AHS / Pharm.D (year/paper) models: content lives in ahs_content, marks in
  // exam_scheme, rotations in internship_postings — map them onto the generator's
  // units / references / instruction so the letterhead PDF isn't empty.
  const isAhsDoc = modelUsesAhsContent(syllabus.academic_model);
  const ahsUnits = isAhsDoc ? ahsContentToUnits(syllabus.ahs_content) : undefined;
  const ahsRefs = isAhsDoc ? ahsReferences(syllabus.ahs_content) : undefined;
  const ahsInstr = isAhsDoc
    ? [ahsExamInternshipText(syllabus.exam_scheme, syllabus.internship_postings),
       syllabus.course_content?.instruction ?? '']
        .filter(Boolean).join('\n\n') || undefined
    : undefined;

  return {
    variant,
    // CAS (Arts & Science) prints unit content as one flowing paragraph per
    // unit; engineering/other keep the stacked heading + per-chapter lines.
    unitLayout: isCas && variant !== 'engineering' ? 'paragraph' : 'stacked',
    ltpc,
    total_periods,
    // The author's own "Total Hours" box, verbatim — printed as the CET
    // "TOTAL: … PERIODS" line. Kept separate from `total_periods` (which only
    // parses a "30+30" split) so a plain "45" still reaches the document.
    content_total_hours: totalHoursRaw.trim() || undefined,
    institution_name: header.institution_name,
    institution_address: header.institution_address,
    institution_accreditation: header.institution_accreditation,
    banner_lines: header.banner_lines,
    institution_website: header.website,
    logoImage: header.logoImage ?? '/logo.png',
    rightLogoImage: header.rightLogoImage,
    course_code: liveCode,
    course_name: displayCourseName,
    course_part: coursePartLabel,
    total_hours: syllabus.total_hours ?? undefined,
    contact_hours: syllabus.contact_hours ?? undefined,
    credits: syllabus.course_credits ?? undefined,
    // PCI/pharmacy Scope paragraph — printed above Course Objectives. AHS reuses
    // it for the ahs_content "intro" paragraph.
    scope: isAhsDoc ? (syllabus.ahs_content?.intro ?? syllabus.scope) : (syllabus.scope ?? undefined),
    // COP (pharmacy): hide the Course Designer / BoS Chairman sign-off (temp).
    hideSignature: isPharmacyDoc,
    objectives: objectivesContent?.objectives ?? [],
    clos: outcomesContent?.clos ?? [],
    k_values: kValues,
    // AHS: paper → topics/units mapped from ahs_content; Anna: course_content units.
    units: isAhsDoc
      ? ahsUnits
      : (contentModes.includeTheory ? (syllabus.course_content?.units ?? []) : []),
    practical_topics: isAhsDoc
      ? undefined
      : (contentModes.includePractical ? (syllabus.course_content?.topics ?? []) : undefined),
    number_practical_topics: syllabus.course_content?.number_practical_topics,
    // AHS: exam scheme + internship folded into the instruction block after content.
    instruction: isAhsDoc ? ahsInstr : syllabus.course_content?.instruction,
    textbooks: syllabus.textbooks?.primary ?? [],
    references: isAhsDoc ? ahsRefs : (syllabus.textbooks?.references ?? []),
    web_resources: syllabus.web_resources?.resources ?? [],
    pedagogy_methods: syllabus.pedagogy?.methods ?? [],
    po_mappings: syllabus.po_mappings?.mappings ?? [],
    po_keys: poKeys,
    pso_keys: psoKeys,
    assessment_structure: skipV35Blocks ? undefined : syllabus.assessment_structure,
    concept_applications: skipV35Blocks ? undefined : syllabus.concept_applications,
    assessment_pattern: skipV35Blocks ? undefined : syllabus.assessment_pattern,
    capstone_project: skipV35Blocks ? undefined : syllabus.capstone_project,
    capstone_rubric: skipV35Blocks ? undefined : syllabus.capstone_rubric,
    llc_conference: skipV35Blocks ? undefined : syllabus.llc_conference,
  };
}

// ── PDF Download Button ───────────────────────────────────────────────────────

export function SyllabusPdfDownloadButton({
  syllabus,
  institutionName,
  isCas = false,
  isCet = false,
}: {
  syllabus: BosCourseSyllabus;
  institutionName?: string;
  /** Arts-&-Science (CAS) institution → render unit content as a flowing paragraph. */
  isCas?: boolean;
  /** CET (Engineering) institution → always render the Engineering PDF format. */
  isCet?: boolean;
}) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [loading, setLoading] = useState(false);

  if (!isSuperAdmin && !canAccess('academic.bos-syllabus', 'view')) return null;

  const handleClick = async () => {
    setLoading(true);
    const tid = toast.loading(`Generating PDF for ${syllabus.course_code}…`);
    try {
      if (syllabus.academic_model === 'mgr_bds') {
        // Dental (BDS/DCI): content lives in bds_content/exam_scheme, not the
        // Anna units/CO-PO shape — use the dedicated dental renderer.
        const { downloadBdsSyllabusPDF } = await import('@/lib/utils/bos/course-syllabus-bds-pdf');
        await downloadBdsSyllabusPDF(syllabus as any, { institutionName });
      } else {
        // Everything about WHAT this PDF contains lives in buildSyllabusPdfData,
        // which the bulk board-wise ZIP export shares — keeping the two exports
        // from drifting apart.
        const data = await buildSyllabusPdfData(syllabus, { institutionName, isCas, isCet });
        generateCourseSyllabusPDF(data);
      }

      toast.success('PDF downloaded', { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50'
            onClick={handleClick}
            disabled={loading}
            aria-label={`Download syllabus PDF for ${syllabus.course_code}`}
          >
            {loading
              ? <Loader2 className='h-4 w-4 animate-spin' />
              : <FileDown className='h-4 w-4' />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>Download Syllabus PDF</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── v3.5 HTML Download Button ─────────────────────────────────────────────────
// Downloads the branded v3.5 HTML document (green JKKN template, capstone
// cards, LLC panel) from /api/bos/syllabus/[id]/export-pdf?format=v35 —
// print-ready via the browser's print-to-PDF.
export function SyllabusHtmlDownloadButton({ syllabus }: { syllabus: BosCourseSyllabus }) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [loading, setLoading] = useState(false);

  if (!isSuperAdmin && !canAccess('academic.bos-syllabus', 'view')) return null;

  const handleClick = async () => {
    setLoading(true);
    const tid = toast.loading(`Generating v3.5 HTML for ${syllabus.course_code}…`);
    try {
      const res = await fetch(`/api/bos/syllabus/${syllabus.id}/export-pdf?format=v35`);
      if (!res.ok) throw new Error('Failed to generate HTML');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${syllabus.course_code}-syllabus-v35.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('HTML downloaded', { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
            onClick={handleClick}
            disabled={loading}
            aria-label={`Download v3.5 HTML for ${syllabus.course_code}`}
          >
            {loading
              ? <Loader2 className='h-4 w-4 animate-spin' />
              : <FileCode2 className='h-4 w-4' />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>Download v3.5 HTML (print-ready)</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Word (.docx) Download Button ──────────────────────────────────────────────

export function SyllabusDocxDownloadButton({
  syllabus,
  institutionName,
  isCas = false,
}: {
  syllabus: BosCourseSyllabus;
  institutionName?: string;
  /** Arts-&-Science (CAS) institution → print course_name with no part prefix. */
  isCas?: boolean;
}) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [loading, setLoading] = useState(false);

  if (!isSuperAdmin && !canAccess('academic.bos-syllabus', 'view')) return null;

  const handleClick = async () => {
    setLoading(true);
    const tid = toast.loading(`Generating Word file for ${syllabus.course_code}…`);
    try {
      let kValues: Record<string, string> | undefined;
      let poKeys: string[] | undefined;
      let psoKeys: string[] | undefined;

      if (syllabus.regulation_id) {
        try {
          // Pass the syllabus's own institution so the taxonomy resolves the
          // SAME row the form's CO panel sees. Without it, a super-admin call
          // falls back to the regulation row's institution_id, which can miss
          // the configured (Fink's) taxonomy and default to Bloom's K-values.
          const taxRes = await fetch(
            `/api/bos/taxonomy/${syllabus.regulation_id}?institutionsId=${encodeURIComponent(syllabus.institutions_id)}${syllabus.board_id ? `&boardId=${encodeURIComponent(syllabus.board_id)}` : ''}`,
          );
          if (taxRes.ok) {
            const taxonomy = await taxRes.json();
            kValues = taxonomy.k_values;
            poKeys = extractPOKeys(taxonomy.pos);
            psoKeys = taxonomy.psos ? extractPOKeys(taxonomy.psos) : [];
          }
        } catch {
          // taxonomy fetch failure is non-fatal
        }
      }

      const ownInst = await resolveSyllabusInstitution(syllabus.institutions_id);
      const header = getInstitutionHeader(ownInst.name ?? institutionName ?? null, ownInst.code);
      const objectivesContent = syllabus.course_objectives as BosCourseObjectivesContent | undefined;
      const outcomesContent = syllabus.course_learning_outcomes as BosCourseLearnOutcomesContent | undefined;

      const { course_code: liveCode, course_name: storedName, coursePartLabel, courseCategory } =
        await resolveCourseForReport(syllabus);
      const contentModes = resolveContentModes(courseCategory, syllabus.course_content);

      // Mirror the PDF (buildSyllabusPdfData): CAS and pharmacy (COP) print the
      // stored course_name verbatim; the rest get the course_type_code prefix.
      const isPharmacyDoc =
        syllabus.academic_model === 'pci_pharm' || syllabus.academic_model === 'mgr_pharmd';
      const displayCourseName = !isPharmacyDoc && !isCas && coursePartLabel
        ? `${coursePartLabel}-${storedName}`
        : storedName;

      await generateCourseSyllabusDOCX({
        institution_name: header.institution_name,
        institution_address: header.institution_address,
        institution_accreditation: header.institution_accreditation,
        logoImage: '/logo.png',
        rightLogoImage: header.rightLogoImage,
        course_code: liveCode,
        course_name: displayCourseName,
        course_part: coursePartLabel,
        total_hours: syllabus.total_hours ?? undefined,
        contact_hours: syllabus.contact_hours ?? undefined,
        credits: syllabus.course_credits ?? undefined,
        // PCI/pharmacy Scope paragraph — printed above Course Objectives.
        scope: syllabus.scope ?? undefined,
        // COP (pharmacy): hide the Course Designer / BoS Chairman sign-off (temp).
        hideSignature: isPharmacyDoc,
        objectives: objectivesContent?.objectives ?? [],
        clos: outcomesContent?.clos ?? [],
        k_values: kValues,
        units: contentModes.includeTheory ? (syllabus.course_content?.units ?? []) : [],
        practical_topics: contentModes.includePractical
          ? (syllabus.course_content?.topics ?? [])
          : undefined,
        number_practical_topics: syllabus.course_content?.number_practical_topics,
        instruction: syllabus.course_content?.instruction,
        textbooks: syllabus.textbooks?.primary ?? [],
        references: syllabus.textbooks?.references ?? [],
        web_resources: syllabus.web_resources?.resources ?? [],
        pedagogy_methods: syllabus.pedagogy?.methods ?? [],
        po_mappings: syllabus.po_mappings?.mappings ?? [],
        po_keys: poKeys,
        pso_keys: psoKeys,
        assessment_structure: syllabus.assessment_structure,
        concept_applications: syllabus.concept_applications,
        assessment_pattern: syllabus.assessment_pattern,
        capstone_project: syllabus.capstone_project,
        capstone_rubric: syllabus.capstone_rubric,
        llc_conference: syllabus.llc_conference,
      });

      toast.success('Word file downloaded', { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50'
            onClick={handleClick}
            disabled={loading}
            aria-label={`Download syllabus Word file for ${syllabus.course_code}`}
          >
            {loading
              ? <Loader2 className='h-4 w-4 animate-spin' />
              : <FileText className='h-4 w-4' />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>Download Syllabus Word</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Clone Button ──────────────────────────────────────────────────────────────

/**
 * Clone the syllabus into a fresh draft. Navigates to the clone page, which
 * opens the full Course Information form pre-filled from this source and lets
 * the user pick a new course code (and target regulation/board) before saving
 * a new v1 row. Gated identically to the Edit/Revise actions — only the board
 * owner / creator / chairman (or super-admin) on the latest, non-archived row
 * may create a clone (the server re-enforces this on insert).
 */
export function SyllabusCloneButton({ syllabus }: { syllabus: BosCourseSyllabus }) {
  const router = useRouter();
  const { profile } = useAuth();
  const boardScope = useBosBoardScope();
  const [open, setOpen] = useState(false);

  const canClone =
    syllabus.is_latest &&
    !syllabus.is_archived &&
    canEditSyllabus(
      boardScope,
      { board_id: syllabus.board_id ?? null, created_by: syllabus.created_by ?? null },
      profile?.id ?? null,
    );

  if (!canClone) return null;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
              onClick={() => setOpen(true)}
              aria-label={`Clone syllabus ${syllabus.course_code}`}
            >
              <Copy className='h-4 w-4' />
            </Button>
          </TooltipTrigger>
          <TooltipContent side='top'>Clone Syllabus</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <CloneDialog
        open={open}
        syllabus={syllabus}
        onOpenChange={setOpen}
        onSuccess={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

// ── Row Actions Dropdown ──────────────────────────────────────────────────────

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  institutionName?: string;
}

export function DataTableRowActions<TData extends BosCourseSyllabus>({
  row,
}: DataTableRowActionsProps<TData>) {
  // institutionName is consumed by SyllabusPdfDownloadButton rendered alongside this component
  const router = useRouter();
  const { profile } = useAuth();
  const boardScope = useBosBoardScope();
  const syllabus = row.original as BosCourseSyllabus;
  const deleteBosSyllabus = useDeleteBosSyllabus();

  // Why: BoS write-action UI must be gated on board ownership (creator /
  // chairman / super-admin) only — NOT additionally on the flat
  // `academic.bos-syllabus.edit` role-permission key. Custom-role grants drift
  // out of sync with composition membership, which previously caused syllabus
  // creators to lose the Edit button. The server still enforces the same
  // creator/chairman rule via guardSyllabusEdit, so this is safe.
  const boardOwnership = canEditSyllabus(
    boardScope,
    { board_id: syllabus.board_id ?? null, created_by: syllabus.created_by ?? null },
    profile?.id ?? null,
  );
  // Edit / Create Revision: creator or board chairman (or super-admin).
  const canEdit = boardOwnership;
  // Delete: SUPER-ADMIN ONLY (policy 2026-07-16). Creator/chairman cannot delete.
  const canDelete = boardScope.isSuperAdmin;

  const [reviseDialogOpen, setReviseDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // View History is unconditional for users with view access, so we always
  // render the dropdown — Edit/Delete entries are individually gated below.

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteBosSyllabus.mutateAsync(syllabus.id);
      setDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='sm'>
            <MoreHorizontal className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {canEdit && syllabus.is_latest && !syllabus.is_archived && (
            <>
              <DropdownMenuItem onClick={() => router.push(`/bos/syllabus/${syllabus.id}/edit`)}>
                <Edit2 className='h-4 w-4 mr-2' />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setReviseDialogOpen(true)}>
                <Copy className='h-4 w-4 mr-2' />
                Create Revision
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onClick={() => router.push(`/bos/syllabus/${syllabus.id}/history`)}>
            <History className='h-4 w-4 mr-2' />
            View History
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => exportSyllabusToXlsx(syllabus.id, syllabus.course_code)}
          >
            <FileSpreadsheet className='h-4 w-4 mr-2' />
            Export to Excel
          </DropdownMenuItem>
          {canDelete && (
            <DropdownMenuItem
              onClick={() => setDeleteDialogOpen(true)}
              className='text-red-600'
            >
              <Trash2 className='h-4 w-4 mr-2' />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ReviseDialog
        open={reviseDialogOpen}
        syllabus={syllabus}
        onOpenChange={setReviseDialogOpen}
        onSuccess={() => {
          setReviseDialogOpen(false);
          router.refresh();
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Syllabus</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this syllabus? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='flex justify-end gap-3'>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className='bg-red-600 hover:bg-red-700'>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
