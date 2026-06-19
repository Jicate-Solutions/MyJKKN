'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Row } from '@tanstack/react-table';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteBosSyllabus } from '@/hooks/bos/use-bos-syllabus';
import { useBosBoardScope, canEditSyllabus } from '@/hooks/bos/use-bos-board-scope';
import { useAuth } from '@/hooks/use-auth-provider';
import { ReviseDialog } from '@/components/bos/revise-dialog';
import { DuplicateDialog } from '@/components/bos/duplicate-dialog';
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
import { MoreHorizontal, Edit2, Copy, History, Trash2, FileDown, Loader2, FileSpreadsheet, FileText } from 'lucide-react';
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
}> {
  let course_code = syllabus.course_code;
  let course_name = syllabus.course_name;
  let coursePartLabel: string | undefined;
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
    }
  } catch {
    // non-fatal — fall back to the stored snapshot
  }
  return { course_code, course_name, coursePartLabel };
}

// ── PDF Download Button ───────────────────────────────────────────────────────

export function SyllabusPdfDownloadButton({
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
    const tid = toast.loading(`Generating PDF for ${syllabus.course_code}…`);
    try {
      let kValues: Record<string, string> | undefined;
      let poKeys: string[] | undefined;
      let psoKeys: string[] | undefined;

      if (syllabus.regulation_id) {
        try {
          const taxRes = await fetch(`/api/bos/taxonomy/${syllabus.regulation_id}`);
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

      const header = getInstitutionHeader(institutionName ?? null);
      const objectivesContent = syllabus.course_objectives as BosCourseObjectivesContent | undefined;
      const outcomesContent = syllabus.course_learning_outcomes as BosCourseLearnOutcomesContent | undefined;

      // Resolve live course code/name + part (Core-I / Allied-II) from COE,
      // anchored on the stable course_id so a COE rename is reflected.
      const { course_code: liveCode, course_name: liveName, coursePartLabel } =
        await resolveCourseForReport(syllabus);

      // Prefix course_name with course_type_code so the PDF reads as
      // "Major-I-Programming in Python" (matches the course_mapping format).
      const displayCourseName = coursePartLabel
        ? `${coursePartLabel}-${liveName}`
        : liveName;

      generateCourseSyllabusPDF({
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
        units: syllabus.course_content?.units ?? [],
        practical_topics: syllabus.course_content?.is_practical
          ? (syllabus.course_content?.topics ?? [])
          : undefined,
        instruction: syllabus.course_content?.instruction,
        textbooks: syllabus.textbooks?.primary ?? [],
        references: syllabus.textbooks?.references ?? [],
        web_resources: syllabus.web_resources?.resources ?? [],
        pedagogy_methods: syllabus.pedagogy?.methods ?? [],
        po_mappings: syllabus.po_mappings?.mappings ?? [],
        po_keys: poKeys,
        pso_keys: psoKeys,
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
          const taxRes = await fetch(`/api/bos/taxonomy/${syllabus.regulation_id}`);
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

      const { course_code: liveCode, course_name: liveName, coursePartLabel } =
        await resolveCourseForReport(syllabus);

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
        units: syllabus.course_content?.units ?? [],
        practical_topics: syllabus.course_content?.is_practical
          ? (syllabus.course_content?.topics ?? [])
          : undefined,
        instruction: syllabus.course_content?.instruction,
        textbooks: syllabus.textbooks?.primary ?? [],
        references: syllabus.textbooks?.references ?? [],
        web_resources: syllabus.web_resources?.resources ?? [],
        pedagogy_methods: syllabus.pedagogy?.methods ?? [],
        po_mappings: syllabus.po_mappings?.mappings ?? [],
        po_keys: poKeys,
        pso_keys: psoKeys,
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
  const canEdit = boardOwnership;
  const canDelete = boardOwnership;

  const [reviseDialogOpen, setReviseDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
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
              <DropdownMenuItem onClick={() => setDuplicateDialogOpen(true)}>
                <Copy className='h-4 w-4 mr-2' />
                Duplicate to Regulation
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

      <DuplicateDialog
        open={duplicateDialogOpen}
        syllabus={syllabus}
        institutionsId={syllabus.institutions_id || ''}
        sourceRegulationId={syllabus.regulation_id || ''}
        onOpenChange={setDuplicateDialogOpen}
        onSuccess={() => {
          setDuplicateDialogOpen(false);
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
