'use client';

import { useCallback, useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ClipboardEdit, Layers, Loader2, ListChecks, PenLine } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useCiaSettings, useExamSessions } from '@/hooks/internal-marks/use-cia-settings';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import { useRegistrations } from '@/hooks/internal-marks/use-cia-marks';
import { CiaMarksService } from '@/lib/services/internal-marks/cia-marks-service';
import { resolveMarkEntryType } from '@/types/internal-marks';
import {
  MarkEntryFilters, type MarkEntryFilterState,
} from './_components/mark-entry-filters';
import { QuestionWiseTab } from './_components/question-wise-tab';
import { DirectEntryTab } from './_components/direct-entry-tab';

/**
 * /academic/mark-entry — CIA mark entry, question-wise or direct.
 *
 * Separate from /academic/internal-marks by design: that page keeps its existing
 * marks/monitor/report/audit surface untouched. This one is the entry screen, and
 * it is the only place that understands `mark_entry_type`.
 *
 * The ROUND's configured mode (COE cia_rounds[].mark_entry_type) decides which
 * ONE entry screen renders — there is no tab to pick between them. A
 * question-wise round opens only against an APPROVED question paper for the
 * course; with no paper, or one still draft / submitted, the screen shows that
 * status and stays closed. It does not fall back to direct entry.
 */
export default function MarkEntryPage() {
  const { isSuperAdmin, canAccess, isLoading: isLoadingPermissions } = usePermissions();
  const { profile } = useAuth();

  const canView = isLoadingPermissions || isSuperAdmin || canAccess('academic.mark-entry', 'view');
  const canEnter = isSuperAdmin || canAccess('academic.mark-entry', 'enter');
  // Same gate as the report page itself, so the button never leads to a refusal.
  const canViewReport = isSuperAdmin || canAccess('academic.internal-marks', 'view');

  const [filters, setFilters] = useState<Partial<MarkEntryFilterState>>({});

  const institutionId = isSuperAdmin ? filters.institution_id : profile?.institution_id ?? undefined;

  const { data: ciaSettings } = useCiaSettings(institutionId, filters.exam_session_id);

  // Display names for the question-wise PDF letterhead. All three queries are
  // already cached by the filters, so this costs no extra network.
  const { data: examSessions } = useExamSessions(institutionId);
  const { institutions } = useInstitutionsWithAccess({ autoFetch: true });

  const selectedSetting = useMemo(
    () => ciaSettings?.find((s) => s.id === filters.setting_id),
    [ciaSettings, filters.setting_id]
  );
  const selectedRound = useMemo(
    () => selectedSetting?.cia_rounds.find((r) => r.round === filters.cia_round),
    [selectedSetting, filters.cia_round]
  );

  const entryMode = resolveMarkEntryType(selectedRound);

  const pdfContext = useMemo(() => {
    const inst = institutions.find((i) => i.id === institutionId);
    // counselling_code is what useInstitutionsWithAccess exposes, and it IS the
    // COE institution_code bridge — there is no `institution_code` field here.
    const header = getInstitutionHeader(inst?.name, inst?.counselling_code);
    return {
      institutionName: header.institution_name,
      institutionAccreditation: header.institution_accreditation,
      institutionAddress: header.institution_address,
      logoImage: '/logo.png',
      rightLogoImage: header.rightLogoImage,
      examSession: examSessions?.find((s) => s.id === filters.exam_session_id)?.session_name,
      assessmentName: selectedSetting?.setting_name,
    };
  }, [institutions, institutionId, examSessions, filters.exam_session_id, selectedSetting]);

  const { data: registrations, isLoading: isLoadingRegistrations } = useRegistrations({
    institutionId,
    examSessionId: filters.exam_session_id,
    programCode: filters.program_code,
  });

  const learners = useMemo(
    () =>
      registrations && filters.course_code && filters.semester != null
        ? CiaMarksService.getLearnersFromRegistrations(
            registrations,
            filters.course_code,
            filters.semester
          )
        : [],
    [registrations, filters.course_code, filters.semester]
  );

  /** Round total — the ceiling a learner's components may sum to. */
  const maxInternalMarks = useMemo(
    () =>
      (selectedRound?.components ?? []).reduce((sum, c) => sum + Number(c.max_marks || 0), 0),
    [selectedRound]
  );

  const handleFiltersChange = useCallback(
    (f: Partial<MarkEntryFilterState>) => setFilters(f),
    []
  );

  /**
   * The consolidated total-marks sheet (learners × every course of the program)
   * lives on the Internal Marks report page. Question-wise marks reach it as
   * each course's total, because a save always writes the component sum. The
   * link carries the filters already chosen here so the report opens on the
   * same session, round and program — only the semester is left to pick.
   */
  const consolidatedReportHref = useMemo(() => {
    const params = new URLSearchParams({ tab: 'consolidated' });
    if (isSuperAdmin && filters.institution_id) params.set('institution', filters.institution_id);
    if (filters.exam_session_id) params.set('session', filters.exam_session_id);
    if (filters.setting_id) params.set('setting', filters.setting_id);
    if (filters.cia_round != null) params.set('round', String(filters.cia_round));
    if (filters.program_code) params.set('program', filters.program_code);
    return `/academic/internal-marks/report?${params.toString()}`;
  }, [isSuperAdmin, filters]);

  if (!canView) {
    return (
      <ContentLayout title='Mark Entry'>
        <div className='flex h-64 items-center justify-center'>
          <p className='text-muted-foreground'>You do not have permission to access Mark Entry.</p>
        </div>
      </ContentLayout>
    );
  }

  const isReady =
    !!institutionId &&
    !!filters.exam_session_id &&
    !!filters.setting_id &&
    filters.cia_round != null &&
    !!filters.program_code &&
    !!filters.course_code &&
    filters.semester != null &&
    !!selectedRound;

  return (
    <ContentLayout title='Mark Entry'>
      <Breadcrumb className='mb-4'>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href='/'>Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Mark Entry</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* min-w-0 is load-bearing: without it the sidebar's flex content pane takes
          min-width:auto, the wide entry table stretches the page, and the frozen
          columns drift out over the sidebar. */}
      <div className='min-w-0 space-y-6 overflow-x-hidden'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h1 className='flex items-center gap-2 py-1 text-2xl font-bold'>
              <ClipboardEdit className='h-6 w-6' /> Mark Entry
            </h1>
            <p className='text-sm text-muted-foreground'>
              Enter Continuous Internal Assessment marks question by question against the
              round&apos;s question paper, or as component totals. Subjects are shown only for
              staff-planned programs.
            </p>
          </div>
          {canViewReport && (
            <Button asChild variant='outline' size='sm'>
              <Link href={consolidatedReportHref}>
                <Layers className='mr-1 h-4 w-4' /> Consolidated Report
              </Link>
            </Button>
          )}
        </div>

        <Card>
          <CardContent className='pt-6'>
            <MarkEntryFilters
              institutionId={institutionId}
              filters={filters}
              onFiltersChange={handleFiltersChange}
            />
          </CardContent>
        </Card>

        {isReady && isLoadingRegistrations && (
          <div className='flex items-center justify-center py-12'>
            <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
            <span className='ml-2 text-muted-foreground'>Loading learners…</span>
          </div>
        )}

        {isReady && !isLoadingRegistrations && learners.length === 0 && (
          <Card>
            <CardContent className='space-y-2 py-10 text-center text-sm'>
              <p className='font-medium'>
                No exam registrations found for {filters.course_code}, Semester {filters.semester},
                in this session.
              </p>
              <p className='text-xs text-muted-foreground'>
                Learners are drawn from COE exam registrations for {filters.program_code} — any
                regular registration counts, whatever its approval status. Register the learners
                in COE, then reload this page.
              </p>
            </CardContent>
          </Card>
        )}

        {isReady && !isLoadingRegistrations && learners.length > 0 && selectedRound && (
          <div className='space-y-4'>
            <div className='inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium'>
              {entryMode === 'question_wise' ? (
                <>
                  <ListChecks className='h-3.5 w-3.5' /> Question-wise entry
                </>
              ) : (
                <>
                  <PenLine className='h-3.5 w-3.5' /> Direct entry
                </>
              )}
              <span className='font-normal text-muted-foreground'>· set for {selectedRound.round_name}</span>
            </div>

            {entryMode === 'question_wise' ? (
              <QuestionWiseTab
                institutionId={institutionId!}
                examSessionId={filters.exam_session_id!}
                ciaSettingId={filters.setting_id!}
                round={selectedRound}
                courseCode={filters.course_code!}
                programCode={filters.program_code!}
                semester={filters.semester}
                learners={learners}
                maxInternalMarks={maxInternalMarks}
                canEnter={canEnter}
                pdf={pdfContext}
              />
            ) : (
              <DirectEntryTab
                institutionId={institutionId!}
                examSessionId={filters.exam_session_id!}
                ciaSettingId={filters.setting_id!}
                round={selectedRound}
                learners={learners}
                maxInternalMarks={maxInternalMarks}
                canEnter={canEnter}
                courseCode={filters.course_code}
              />
            )}
          </div>
        )}

        {!isReady && (
          <Card>
            <CardContent className='flex flex-col items-center justify-center py-12'>
              <ClipboardEdit className='mb-4 h-12 w-12 text-muted-foreground' />
              <p className='text-center text-muted-foreground'>
                Select Exam Session, Assessment, Program and Course to start entering marks.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
