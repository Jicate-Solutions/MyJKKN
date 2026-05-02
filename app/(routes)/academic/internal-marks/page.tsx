'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, FileCheck } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useCiaSettings } from '@/hooks/internal-marks/use-cia-settings';
import { useCiaMarks, useSubmitCiaMarks, useRegistrations } from '@/hooks/internal-marks/use-cia-marks';
import { CiaMarksService } from '@/lib/services/internal-marks/cia-marks-service';
import { useQuery } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { useExamSessions } from '@/hooks/internal-marks/use-cia-settings';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  InternalMarksFiltersComponent,
  type InternalMarksFilterState,
} from './_components/internal-marks-filters';
import { MarkEntryGrid } from './_components/mark-entry-grid';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import type { CiaMarkSyncRecord } from '@/types/internal-marks';

export default function InternalMarksPage() {
  const { isSuperAdmin, canAccess, isLoading: isLoadingPermissions } = usePermissions();
  const { profile } = useAuth();
  const canView = isLoadingPermissions || isSuperAdmin || canAccess('academic.internal-marks', 'view');
  const canEdit = isSuperAdmin || canAccess('academic.internal-marks', 'edit');
  const canSubmit = isSuperAdmin || canAccess('academic.internal-marks', 'submit');

  const [filters, setFilters] = useState<Partial<InternalMarksFilterState>>({});

  // Institution ID resolution:
  // 1. Super admin: let them pick via filters.institution_id
  // 2. Regular user (HOD/Faculty): auto-use profile.institution_id
  const institutionId = isSuperAdmin
    ? filters.institution_id
    : profile?.institution_id ?? undefined;

  const { data: ciaSettings } = useCiaSettings(institutionId, filters.exam_session_id);

  const selectedSetting = useMemo(
    () => ciaSettings?.find((s) => s.id === filters.setting_id),
    [ciaSettings, filters.setting_id]
  );
  const selectedRound = useMemo(
    () => selectedSetting?.cia_rounds.find((r) => r.round === filters.cia_round),
    [selectedSetting, filters.cia_round]
  );

  // COE course info (for max marks)
  const { data: courseInfoMap } = useQuery({
    queryKey: ['coe-courses-map', institutionId],
    queryFn: () => CiaMarksService.fetchCoeCoursesMap(institutionId!),
    enabled: !!institutionId,
    ...QUERY_CONFIG.STABLE_DATA,
  });

  const courseMaxMark = filters.course_code && courseInfoMap
    ? courseInfoMap.get(filters.course_code)?.internal_max_mark ?? 0
    : 0;

  // Registrations from COE
  const { data: registrations, isLoading: isLoadingRegistrations } = useRegistrations({
    institutionId,
    examSessionId: filters.exam_session_id,
    programCode: filters.program_code,
  });

  const learners = useMemo(
    () =>
      registrations && filters.course_code
        ? CiaMarksService.getLearnersFromRegistrations(registrations, filters.course_code)
        : [],
    [registrations, filters.course_code]
  );

  const { data: existingMarksData, isLoading: isLoadingMarks } = useCiaMarks({
    institutionId,
    examSessionId: filters.exam_session_id,
    courseCode: filters.course_code,
    ciaRound: filters.cia_round,
    programCode: filters.program_code,
  });

  const submitMutation = useSubmitCiaMarks();

  // PDF context
  const { data: examSessions } = useExamSessions(institutionId);
  const { data: programsData } = usePrograms({
    institution_id: institutionId,
    isActive: true,
    limit: 200,
  });

  // Institutions list — used to resolve the current institution's name for
  // per-institution PDF header (COE spec §7.1). For non-super-admin users the
  // list contains only institutions they have access to (which always includes
  // their own), so the lookup works for both branches.
  const { institutions } = useInstitutionsWithAccess({ autoFetch: true });

  const institutionHeader = useMemo(() => {
    const inst = institutions.find((i) => i.id === institutionId);
    return getInstitutionHeader(inst?.name);
  }, [institutions, institutionId]);

  const pdfContext = useMemo(() => {
    const courseInfo = courseInfoMap?.get(filters.course_code ?? '');
    const program = programsData?.data?.find((p) => p.program_id === filters.program_code);
    const examSession = examSessions?.find((s) => s.id === filters.exam_session_id);
    return {
      programCode: filters.program_code ?? '',
      programName: program?.program_name ?? '',
      courseCode: filters.course_code ?? '',
      courseName: courseInfo?.course_name ?? '',
      internalMaxMark: courseMaxMark || 0,
      examSession: examSession?.session_name ?? '',
      assessmentName: selectedSetting?.setting_name ?? '',
      institutionName: institutionHeader.institution_name,
      institutionAddress: institutionHeader.institution_address,
      institutionAccreditation: institutionHeader.institution_accreditation,
      logoImage: '/logo.png',
      rightLogoImage: institutionHeader.rightLogoImage,
    };
  }, [filters, courseInfoMap, courseMaxMark, programsData, examSessions, selectedSetting, institutionHeader]);

  const handleFiltersChange = useCallback(
    (f: Partial<InternalMarksFilterState>) => setFilters(f), []
  );

  const handleSubmitMarks = useCallback(
    (records: CiaMarkSyncRecord[], onSuccess: () => void) => {
      submitMutation.mutate({ records }, { onSuccess });
    },
    [submitMutation]
  );

  if (!canView) {
    return (
      <ContentLayout title='Internal Marks'>
        <div className='flex items-center justify-center h-64'>
          <p className='text-muted-foreground'>You do not have permission to access Internal Marks.</p>
        </div>
      </ContentLayout>
    );
  }

  const isReady = filters.course_code && filters.cia_round != null && selectedRound;
  const isLoading = isLoadingRegistrations || isLoadingMarks;

  return (
    <ContentLayout title='Internal Marks (CIA)'>
      <Breadcrumb className='mb-4'>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href='/'>Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Internal Marks</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6'>
        <div>
          <h1 className='text-2xl font-bold py-1 flex items-center gap-2'>
            <FileCheck className='h-6 w-6' /> Internal Marks (CIA)
          </h1>
          <p className='text-sm text-muted-foreground'>
            Enter and manage Continuous Internal Assessment marks for learners
          </p>
        </div>

        <Card>
          <CardContent className='pt-6'>
            <InternalMarksFiltersComponent
              institutionId={institutionId}
              filters={filters}
              onFiltersChange={handleFiltersChange}
            />
          </CardContent>
        </Card>

        {isLoading && isReady && (
          <div className='flex items-center justify-center py-12'>
            <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
            <span className='ml-2 text-muted-foreground'>Loading mark entry data...</span>
          </div>
        )}

        {isReady && !isLoading && selectedRound && (
          <MarkEntryGrid
            round={selectedRound}
            learners={learners}
            existingMarks={existingMarksData?.learners}
            institutionId={institutionId ?? ''}
            examSessionId={filters.exam_session_id ?? ''}
            courseOfferingId={learners[0]?.course_offering_id ?? ''}
            useCourseMax={selectedSetting?.use_course_max ?? false}
            courseMaxMark={courseMaxMark}
            pdfContext={pdfContext}
            onSubmit={handleSubmitMarks}
            isSubmitting={submitMutation.isPending}
            canEdit={canEdit}
            canSubmit={canSubmit}
          />
        )}

        {!isReady && (
          <Card>
            <CardContent className='flex flex-col items-center justify-center py-12'>
              <FileCheck className='h-12 w-12 text-muted-foreground mb-4' />
              <p className='text-muted-foreground text-center'>
                Select Exam Session, Assessment, Program, and Course to start entering marks.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
