'use client';

import { useMemo, useState } from 'react';
import { Eye, FileDown, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { useBosCourseScheme, useBosSemesters, type SchemeFilters } from '@/hooks/bos/use-bos-course-scheme';
import { useBosProgramOptions, useBosRegulationOptions } from '@/hooks/bos/use-bos-scheme-options';
import { InstitutionPicker, type InstitutionOption } from '../../_components/institution-picker';
import { SchemeFiltersBar } from './scheme-filters';
import { SemesterTable } from './semester-table';
import { AddCourseDialog } from './add-course-dialog';
import type { BosCourseMappingDetailed } from '@/types/bos-courses';
import { generateCourseSchemeReportPDF } from '@/lib/utils/internal-marks/internal-marks-pdf';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';

export function SchemePageClient() {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEdit = isSuperAdmin || canAccess('academic.bos-scheme', 'edit');

  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const [institutionCode, setInstitutionCode] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [myjkknInstitutionIds, setMyjkknInstitutionIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<SchemeFilters | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [addDialogSemester, setAddDialogSemester] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { data, isLoading } = useBosCourseScheme(filters);
  const { data: semestersData } = useBosSemesters(filters, myjkknInstitutionIds);
  // Mirror the dropdown's scoping so PDF program-name lookup uses the same set.
  const programScopeId = isSuperAdmin ? undefined : institutionId;
  const { data: programOptions } = useBosProgramOptions(myjkknInstitutionIds, programScopeId);
  const { data: regulationOptions } = useBosRegulationOptions(myjkknInstitutionIds);

  const programName = useMemo(
    () => programOptions?.data?.find((p) => p.program_code === filters?.program_code)?.program_name ?? '',
    [programOptions, filters?.program_code],
  );

  // Derives "2024 – 2025" from regulation_year for the PDF academic-year header line
  const academicYear = useMemo(() => {
    const reg = regulationOptions?.data?.find((r) => r.regulation_code === filters?.regulation_code);
    if (!reg?.regulation_year) return undefined;
    return `${reg.regulation_year} – ${reg.regulation_year + 1}`;
  }, [regulationOptions, filters?.regulation_code]);

  // semester_code → display label (e.g. "FIRST SEMESTER") for PDF headings
  const semesterNameMap = useMemo(() => {
    const map = new Map<string, string>();
    semestersData?.data?.forEach((s) => map.set(s.semester_code, s.semester_name));
    return map;
  }, [semestersData]);

  // Map semester_code → mappings for quick lookup.
  const mappingsBySemester = useMemo(() => {
    const map = new Map<string, BosCourseMappingDetailed[]>();
    (data?.data ?? []).forEach((m) => {
      const key = m.semester_code ?? 'Unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return map;
  }, [data]);

  // Full ordered semester list from MyJKKN semesters table.
  // Falls back to semesters derived from mapping data (for institutions with
  // no semester master data configured).
  const allSemesters = useMemo(() => {
    const fromMaster = semestersData?.data ?? [];
    if (fromMaster.length > 0) return fromMaster.map((s) => s.semester_code);

    // Fallback: derive from mapping data, sorted numerically.
    return Array.from(mappingsBySemester.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [semestersData, mappingsBySemester]);

  const handleInstitutionSelect = (opt: InstitutionOption) => {
    setInstitutionCode(opt.institution_code);
    setInstitutionName(opt.name);
    setMyjkknInstitutionIds(opt.myjkkn_institution_ids);
  };

  const handleDownloadReport = async () => {
    if (!filters || allSemesters.length === 0) return;

    const header = getInstitutionHeader(institutionName || institutionCode);

    const toBase64 = (url: string): Promise<string> =>
      fetch(url)
        .then((r) => r.blob())
        .then(
          (blob) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            }),
        );

    const [logoImage, rightLogoImage] = await Promise.all([
      toBase64('/logo.png').catch(() => undefined),
      toBase64(header.rightLogoImage).catch(() => undefined),
    ]);

    generateCourseSchemeReportPDF({
      institution_name: header.institution_name,
      institution_address: header.institution_address,
      institution_accreditation: header.institution_accreditation,
      logoImage,
      rightLogoImage,
      program_code: filters.program_code,
      program_name: programName,
      regulation_code: filters.regulation_code,
      academic_year: academicYear,
      semesters: allSemesters.map((semCode) => ({
        semester_code: semCode,
        semester_label: semesterNameMap.get(semCode)?.toUpperCase() ?? `SEMESTER ${semCode}`,
        courses: (mappingsBySemester.get(semCode) ?? []).map((m) => ({
          course_part_master: m.course.course_part_master,
          course_code: m.course.course_code,
          course_name: m.course.course_name,
          exam_duration: m.course.exam_duration,
          credit: m.course.credit ?? 0,
          theory_hours: m.course.theory_hours ?? 0,
          practical_hours: m.course.practical_hours ?? 0,
          internal_max_mark: m.course.internal_max_mark ?? 0,
          external_max_mark: m.course.external_max_mark ?? 0,
          total_max_mark: m.course.total_max_mark ?? 0,
        })),
      })),
    });
  };

  return (
    <div className='space-y-6'>
      <div className='flex items-end justify-between gap-3 flex-wrap'>
        <div className='flex gap-3 flex-wrap items-end'>
          <div className={isSuperAdmin ? '' : 'hidden'}>
            <InstitutionPicker
              value={institutionId}
              showAllOption={isSuperAdmin}
              onChange={(id) => {
                setInstitutionId(id);
                setFilters(null);
                if (!id) { setInstitutionCode(''); setMyjkknInstitutionIds([]); }
              }}
              onSelect={handleInstitutionSelect}
            />
          </div>
          {institutionId && (
            <SchemeFiltersBar
              institutionId={institutionId}
              myjkknInstitutionIds={myjkknInstitutionIds}
              value={filters}
              onChange={setFilters}
              isSuperAdmin={isSuperAdmin}
            />
          )}
        </div>
        <div className='flex gap-2'>
          {filters && !isLoading && allSemesters.length > 0 && (
            <Button variant='outline' size='sm' onClick={handleDownloadReport}>
              <FileDown className='mr-2 h-4 w-4' />
              Download Report
            </Button>
          )}
          {canEdit && filters && (
            <Button
              variant={editMode ? 'default' : 'outline'}
              size='sm'
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? <Pencil className='mr-2 h-4 w-4' /> : <Eye className='mr-2 h-4 w-4' />}
              {editMode ? 'Edit Mode' : 'View Mode'}
            </Button>
          )}
        </div>
      </div>

      {!institutionId && (
        <p className='text-sm text-muted-foreground'>Select an institution to begin.</p>
      )}

      {institutionId && !filters && (
        <p className='text-sm text-muted-foreground'>
          Select a program and regulation to load the scheme.
        </p>
      )}

      {filters && isLoading && <Skeleton className='h-96 w-full' />}

      {filters && !isLoading && allSemesters.length === 0 && (
        <p className='text-sm text-muted-foreground'>No semesters configured for this program.</p>
      )}

      {filters && !isLoading && allSemesters.map((semCode) => (
        <SemesterTable
          key={semCode}
          semester={semCode}
          mappings={mappingsBySemester.get(semCode) ?? []}
          editMode={editMode}
          onAddToSemester={(sem) => { setAddDialogSemester(sem); setAddDialogOpen(true); }}
        />
      ))}

      {filters && (
        <AddCourseDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          semester={addDialogSemester}
          filters={filters}
          institutionCode={institutionCode}
        />
      )}
    </div>
  );
}
