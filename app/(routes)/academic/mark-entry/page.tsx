'use client';

import { useCallback, useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardEdit, Loader2, ListChecks, PenLine } from 'lucide-react';
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
 * The active tab follows the ROUND's configured mode (COE cia_rounds[].
 * mark_entry_type). A question-wise round that has no authored paper is never a
 * dead end — the Question-wise tab explains the gap and Direct Entry stays
 * available, matching the COE entry screen exactly.
 */
export default function MarkEntryPage() {
  const { isSuperAdmin, canAccess, isLoading: isLoadingPermissions } = usePermissions();
  const { profile } = useAuth();

  const canView = isLoadingPermissions || isSuperAdmin || canAccess('academic.mark-entry', 'view');
  const canEnter = isSuperAdmin || canAccess('academic.mark-entry', 'enter');

  const [filters, setFilters] = useState<Partial<MarkEntryFilterState>>({});
  /** null = follow the round's configured mode; set = the user picked a tab. */
  const [tabOverride, setTabOverride] = useState<'question-wise' | 'direct' | null>(null);

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

  // The round decides the mode; the user is not asked to pick. Switching rounds
  // drops any manual override, so a direct round never lands on a question grid
  // it has no paper for. Manual switching afterwards is still allowed — the
  // no-paper fallback depends on it.
  //
  // Derived during render rather than in an effect: an effect would render the
  // wrong tab for one frame and then cascade a second render to correct it.
  // Resetting state during render is React's documented pattern for "adjust
  // state when a prop changes" (react.dev/learn/you-might-not-need-an-effect).
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

  const roundKey = `${filters.setting_id ?? ''}:${filters.cia_round ?? ''}`;
  const [lastRoundKey, setLastRoundKey] = useState(roundKey);
  if (roundKey !== lastRoundKey) {
    setLastRoundKey(roundKey);
    setTabOverride(null);
  }
  const tab = tabOverride ?? (entryMode === 'question_wise' ? 'question-wise' : 'direct');

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

  /**
   * Every registration for the chosen course, whatever its status.
   *
   * The course dropdown lists anything with `is_regular`, but
   * getLearnersFromRegistrations ALSO requires registration_status ===
   * 'Approved'. A course whose registrations are all Pending therefore appears
   * in the dropdown and then produces an empty grid. Keeping the unfiltered set
   * lets the empty state say WHICH of those two situations it is — "nobody is
   * registered" and "nobody's registration is approved yet" need different
   * people to do different things.
   */
  const courseRegistrations = useMemo(
    () =>
      filters.course_code
        ? (registrations ?? []).filter((r) => r.course_code === filters.course_code)
        : [],
    [registrations, filters.course_code]
  );

  const blockedStatuses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of courseRegistrations) {
      if (r.registration_status === 'Approved' && r.is_regular) continue;
      const label = !r.is_regular
        ? 'not regular (arrear/repeat)'
        : (r.registration_status ?? 'unknown status');
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count }));
  }, [courseRegistrations]);

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
        <div>
          <h1 className='flex items-center gap-2 py-1 text-2xl font-bold'>
            <ClipboardEdit className='h-6 w-6' /> Mark Entry
          </h1>
          <p className='text-sm text-muted-foreground'>
            Enter Continuous Internal Assessment marks question by question against the round&apos;s
            question paper, or as component totals. Subjects are shown only for staff-planned
            programs.
          </p>
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
              {courseRegistrations.length === 0 ? (
                <>
                  <p className='font-medium'>
                    No exam registrations found for {filters.course_code} in this session.
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    Learners are drawn from COE exam registrations for{' '}
                    {filters.program_code}. If registration is still open, marks cannot be
                    entered yet.
                  </p>
                </>
              ) : (
                <>
                  <p className='font-medium'>
                    {courseRegistrations.length} registration
                    {courseRegistrations.length === 1 ? '' : 's'} exist for{' '}
                    {filters.course_code}, but none is markable yet.
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    Mark entry needs registrations that are{' '}
                    <strong>Approved</strong> and <strong>regular</strong>. Currently:{' '}
                    {blockedStatuses.map((s) => `${s.count} ${s.label}`).join(', ')}.
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    Approve them in COE exam registrations, then reload this page.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {isReady && !isLoadingRegistrations && learners.length > 0 && selectedRound && (
          <Tabs value={tab} onValueChange={(v) => setTabOverride(v as typeof tab)}>
            <TabsList className='grid w-full max-w-md grid-cols-2'>
              <TabsTrigger value='question-wise' className='gap-1.5'>
                <ListChecks className='h-4 w-4' />
                Question-wise
                {entryMode === 'question_wise' && (
                  <Badge variant='secondary' className='ml-1 px-1 py-0 text-[9px]'>
                    set
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value='direct' className='gap-1.5'>
                <PenLine className='h-4 w-4' />
                Direct Entry
                {entryMode === 'direct' && (
                  <Badge variant='secondary' className='ml-1 px-1 py-0 text-[9px]'>
                    set
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value='question-wise' className='mt-4'>
              <QuestionWiseTab
                institutionId={institutionId!}
                examSessionId={filters.exam_session_id!}
                ciaSettingId={filters.setting_id!}
                round={selectedRound}
                courseCode={filters.course_code!}
                programCode={filters.program_code!}
                learners={learners}
                maxInternalMarks={maxInternalMarks}
                canEnter={canEnter}
                pdf={pdfContext}
              />
            </TabsContent>

            <TabsContent value='direct' className='mt-4'>
              <DirectEntryTab
                institutionId={institutionId!}
                examSessionId={filters.exam_session_id!}
                ciaSettingId={filters.setting_id!}
                round={selectedRound}
                learners={learners}
                maxInternalMarks={maxInternalMarks}
                canEnter={canEnter}
                fallbackNotice={
                  entryMode === 'question_wise'
                    ? 'This round is configured for question-wise entry. Use this tab only if the question paper is not authored yet — the component total you enter here will not carry a per-question breakdown.'
                    : undefined
                }
              />
            </TabsContent>
          </Tabs>
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
