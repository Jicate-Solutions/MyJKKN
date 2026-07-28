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
import { generateCourseSyllabusPDF, extractPOKeys } from '@/lib/utils/bos/course-syllabus-pdf';
import { generateCourseSyllabusDOCX } from '@/lib/utils/bos/course-syllabus-docx';
import { exportSyllabusToXlsx } from './syllabus-actions';

// Resolve the course's CURRENT code / name / part for the report, anchored on
// the stable COE course_id when present. A course_code search would miss a
// course COE has since renamed — the exact breakage course_id solves — so we
// fetch by id first and fall back to a course_code search for rows not yet
// backfilled with a course_id. Returns the stored snapshot if COE is unreachable.
async function resolveCourseForReport(syllabus: BosCourseSyllabus): Promise<{
  course_code: string;
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
  let course_name = syllabus.course_name;
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
      const liveName = (match.course_name ?? match.course_title) as string | undefined;
      if (liveName) course_name = liveName;
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
  if (cat && namesAMode) {
    return { includeTheory: cat.includes('theory'), includePractical: cat.includes('practical') };
  }
  const isPractical = !!content?.is_practical;
  return { includeTheory: !isPractical, includePractical: isPractical };
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
          // taxonomy fetch failure is non-fatal; PDF generates without k-value legend
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

      // Force the Engineering header (name/accreditation/right logo) for the CET
      // variant; otherwise resolve branding from the hosting institution's name.
      const header = getInstitutionHeader(
        variant === 'engineering' ? 'Engineering' : (institutionName ?? null),
      );
      const objectivesContent = syllabus.course_objectives as BosCourseObjectivesContent | undefined;
      const outcomesContent = syllabus.course_learning_outcomes as BosCourseLearnOutcomesContent | undefined;

      // Resolve live course code/name + part (Core-I / Allied-II) from COE,
      // anchored on the stable course_id so a COE rename is reflected.
      const { course_code: liveCode, course_name: liveName, coursePartLabel, courseCategory, workload } =
        await resolveCourseForReport(syllabus);
      const contentModes = resolveContentModes(courseCategory, syllabus.course_content);

      // A&S prefixes course_name with course_type_code ("Major-I-Programming in
      // Python"); the engineering/CET header shows the bare name to match the
      // Anna University layout.
      const displayCourseName = variant === 'engineering'
        ? liveName
        : coursePartLabel
          ? `${coursePartLabel}-${liveName}`
          : liveName;

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

      generateCourseSyllabusPDF({
        variant,
        // CAS (Arts & Science) prints unit content as one flowing paragraph per
        // unit; engineering/other keep the stacked heading + per-chapter lines.
        unitLayout: isCas && variant !== 'engineering' ? 'paragraph' : 'stacked',
        ltpc,
        total_periods,
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
}: {
  syllabus: BosCourseSyllabus;
  institutionName?: string;
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

      const header = getInstitutionHeader(institutionName ?? null);
      const objectivesContent = syllabus.course_objectives as BosCourseObjectivesContent | undefined;
      const outcomesContent = syllabus.course_learning_outcomes as BosCourseLearnOutcomesContent | undefined;

      const { course_code: liveCode, course_name: liveName, coursePartLabel, courseCategory } =
        await resolveCourseForReport(syllabus);
      const contentModes = resolveContentModes(courseCategory, syllabus.course_content);

      // Mirror the PDF: prefix course_name with course_type_code.
      const displayCourseName = coursePartLabel
        ? `${coursePartLabel}-${liveName}`
        : liveName;

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
