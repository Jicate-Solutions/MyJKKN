'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, FileDown, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteBosCourse } from '@/hooks/bos/use-bos-courses';
import { type BosCourseMaster, isLocked } from '@/types/bos-courses';
import type {
  BosCourseSyllabus,
  BosCourseObjectivesContent,
  BosCourseLearnOutcomesContent,
} from '@/types/bos';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import { generateCourseSyllabusPDF, extractPOKeys } from '@/lib/utils/bos/course-syllabus-pdf';

// ── Shared PDF fetch + generate logic ────────────────────────────────────────

async function downloadSyllabusPdf(course: BosCourseMaster, institutionName?: string) {
  const params = new URLSearchParams({
    courseCode: course.course_code,
    ...(course.institutions_id ? { institutionsId: course.institutions_id } : {}),
    isLatest: 'true',
    limit: '1',
  });
  const res = await fetch(`/api/bos/syllabus?${params}`);
  if (!res.ok) throw new Error('Failed to fetch syllabus');

  const json = await res.json();
  const syllabi: BosCourseSyllabus[] = json.data ?? (Array.isArray(json) ? json : []);
  const syllabus = syllabi[0] ?? null;

  if (!syllabus) throw new Error('No syllabus found for this course. Add one first.');

  let kValues: Record<string, string> | undefined;
  let poKeys: string[] | undefined;
  let psoKeys: string[] | undefined;

  if (syllabus.regulation_id) {
    try {
      // Board-aware + institution-scoped so the legend resolves the SAME framework
      // the syllabus CO panel uses (per-board override, falling back to the
      // regulation-wide default).
      const taxParams = new URLSearchParams();
      if (syllabus.institutions_id) taxParams.set('institutionsId', syllabus.institutions_id);
      if (syllabus.board_id) taxParams.set('boardId', syllabus.board_id);
      const taxRes = await fetch(`/api/bos/taxonomy/${syllabus.regulation_id}?${taxParams.toString()}`);
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

  const totalHours = (course.theory_hours ?? 0) + (course.practical_hours ?? 0) || undefined;
  // Prefer COE's composite course_type_code (e.g. "Core-I") so the PDF header
  // matches the courses table display. Fall back to composing it, then to plain
  // course_type for pre-trigger rows.
  const typeDisplay =
    course.course_type_code
    ?? (course.course_type && course.course_level ? `${course.course_type}-${course.course_level}` : null)
    ?? course.course_type;
  const partLabel = [typeDisplay, course.course_part_master].filter(Boolean).join(' – ') || undefined;

  generateCourseSyllabusPDF({
    institution_name: header.institution_name,
    institution_address: header.institution_address,
    institution_accreditation: header.institution_accreditation,
    logoImage: '/logo.png',
    rightLogoImage: header.rightLogoImage,
    course_code: course.course_code,
    // COE surfaces the title as course_name OR course_title depending on the
    // response shape (see BosCourseMaster). The table column already falls back;
    // do the same here so the PDF doesn't receive undefined.
    course_name: course.course_name ?? course.course_title ?? course.course_code,
    course_part: partLabel,
    total_hours: totalHours,
    contact_hours: course.theory_hours ?? undefined,
    credits: course.credit ?? undefined,
    objectives: objectivesContent?.objectives ?? [],
    clos: outcomesContent?.clos ?? [],
    k_values: kValues,
    units: syllabus.course_content?.units ?? [],
    practical_topics: syllabus.course_content?.is_practical
      ? (syllabus.course_content?.topics ?? [])
      : undefined,
    textbooks: syllabus.textbooks?.primary ?? [],
    references: syllabus.textbooks?.references ?? [],
    web_resources: syllabus.web_resources?.resources ?? [],
    pedagogy_methods: syllabus.pedagogy?.methods ?? [],
    po_mappings: syllabus.po_mappings?.mappings ?? [],
    po_keys: poKeys,
    pso_keys: psoKeys,
    // v3.5 Fink's Formative + Capstone blocks
    concept_applications: syllabus.concept_applications,
    assessment_pattern: syllabus.assessment_pattern,
    capstone_project: syllabus.capstone_project,
    capstone_rubric: syllabus.capstone_rubric,
    llc_conference: syllabus.llc_conference,
  });
}

// ── Visible download button (shown directly in the table row) ─────────────────

export function CoursesPdfDownloadButton({
  course,
  institutionName,
}: {
  course: BosCourseMaster;
  institutionName?: string;
}) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [loading, setLoading] = useState(false);

  if (!isSuperAdmin && !canAccess('academic.bos-courses', 'view')) return null;

  const handleClick = async () => {
    setLoading(true);
    const tid = toast.loading(`Generating syllabus PDF for ${course.course_code}…`);
    try {
      await downloadSyllabusPdf(course, institutionName);
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
            aria-label={`Download syllabus PDF for ${course.course_code}`}
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

// ── Dropdown for Edit / Delete ────────────────────────────────────────────────

export function CoursesRowActions({
  course,
  institutionName: _institutionName,
}: {
  course: BosCourseMaster;
  institutionName?: string;
}) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const del = useDeleteBosCourse();

  const locked = isLocked(course);
  const hasEditPerm = isSuperAdmin || canAccess('academic.bos-courses', 'edit');
  const hasDeletePerm = isSuperAdmin || canAccess('academic.bos-courses', 'delete');

  // Hide the menu entirely only when the user has no permissions at all.
  if (!hasEditPerm && !hasDeletePerm) return null;

  const LOCKED_MSG = 'Course is locked and cannot be modified';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='h-8 w-8'>
          <MoreHorizontal className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {hasEditPerm && (
          <DropdownMenuItem
            className={locked ? 'text-muted-foreground cursor-not-allowed' : ''}
            onClick={() => {
              if (locked) { toast.error(LOCKED_MSG); return; }
              // Pass course_status so the edit page can enforce the lock
              // even if COE's single-record GET omits the field.
              const qs = new URLSearchParams({ course_status: course.courses_status ?? course.course_status ?? '' });
              router.push(`/bos/courses/${course.id}/edit?${qs}`);
            }}
          >
            {locked && <Lock className='mr-2 h-3.5 w-3.5' />}
            Edit
          </DropdownMenuItem>
        )}
        {hasDeletePerm && (
          <DropdownMenuItem
            className={locked ? 'text-muted-foreground cursor-not-allowed' : 'text-red-600'}
            onClick={async () => {
              if (locked) { toast.error(LOCKED_MSG); return; }
              if (!confirm(`Delete ${course.course_code}?`)) return;
              try {
                await del.mutateAsync(course.id);
                toast.success('Course deleted');
              } catch (e) {
                const msg = (e as Error).message;
                // Translate generic server errors into user-friendly messages.
                if (msg.toLowerCase().includes('locked')) {
                  toast.error(LOCKED_MSG);
                } else if (msg === 'Forbidden') {
                  toast.error('You do not have permission to delete this course');
                } else {
                  toast.error(msg);
                }
              }
            }}
          >
            {locked && <Lock className='mr-2 h-3.5 w-3.5' />}
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
