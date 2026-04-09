'use client';

import { useState, useMemo, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  FileBarChart,
  Download,
  FileText,
  Layers,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useExamSessions, useCiaSettings } from '@/hooks/internal-marks/use-cia-settings';
import { useCourseMapping, useRegistrations } from '@/hooks/internal-marks/use-cia-marks';
import { useMultiCiaReport } from '@/hooks/internal-marks/use-cia-report';
import { usePrograms } from '@/hooks/organization/use-programs';
import { CiaMarksService } from '@/lib/services/internal-marks/cia-marks-service';
import {
  generateConsolidatedReportPDF,
} from '@/lib/utils/internal-marks/internal-marks-pdf';
import type { ConsolidatedReportData } from '@/types/internal-marks';
import { MultiSemesterPicker } from './_components/multi-semester-picker';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface ReportFilterState {
  exam_session_id: string;
  setting_id: string;
  cia_round: number | undefined;
  program_code: string;
  semester_codes: string[]; // multi-select
  course_codes: string[]; // multi-select (Course Wise tab only)
}

export default function InternalMarksReportPage() {
  const { isSuperAdmin, canAccess, isLoading: isLoadingPermissions } = usePermissions();
  const { profile } = useAuth();
  const canView = isLoadingPermissions || isSuperAdmin || canAccess('academic.internal-marks', 'view');

  const institutionId = profile?.institution_id ?? undefined;

  const [filters, setFilters] = useState<ReportFilterState>({
    exam_session_id: '',
    setting_id: '',
    cia_round: undefined,
    program_code: '',
    semester_codes: [],
    course_codes: [],
  });
  const [activeTab, setActiveTab] = useState<'course-wise' | 'consolidated'>('course-wise');
  const [isExporting, setIsExporting] = useState(false);

  // Upstream reference data
  const { data: examSessions } = useExamSessions(institutionId);
  const { data: ciaSettings } = useCiaSettings(institutionId, filters.exam_session_id);
  const selectedSetting = ciaSettings?.find((s) => s.id === filters.setting_id);
  const selectedRound = selectedSetting?.cia_rounds.find((r) => r.round === filters.cia_round);

  const { data: programsData } = usePrograms({
    institution_id: institutionId,
    isActive: true,
    limit: 200,
  });
  const selectedProgram = programsData?.data?.find((p) => p.program_id === filters.program_code);
  const filteredPrograms = (programsData?.data ?? []).filter((p) =>
    selectedSetting ? selectedSetting.program_codes.includes(p.program_id) : true
  );

  // Course-mapping + registrations = filteredMapping (only courses with regular students)
  const { data: courseMapping, isLoading: isLoadingMapping } = useCourseMapping({
    institutionId,
    programCode: filters.program_code,
  });
  const { data: registrations, isLoading: isLoadingReg } = useRegistrations({
    institutionId,
    examSessionId: filters.exam_session_id,
    programCode: filters.program_code,
  });
  const isLoadingFilters = isLoadingMapping || isLoadingReg;

  const registeredCourseCodes = useMemo(() => {
    const set = new Set<string>();
    if (registrations) {
      for (const r of registrations) {
        if (r.is_regular && r.course_code) set.add(r.course_code);
      }
    }
    return set;
  }, [registrations]);

  const filteredMapping = useMemo(
    () =>
      courseMapping
        ? courseMapping.filter(
            (m) => m.is_active && registeredCourseCodes.has(m.course_code)
          )
        : [],
    [courseMapping, registeredCourseCodes]
  );

  const semesterOptions = useMemo(
    () => CiaMarksService.getSemestersFromMapping(filteredMapping),
    [filteredMapping]
  );

  // COE course info map (for course names + max marks)
  const [courseInfoMap, setCourseInfoMap] = useState<
    Map<string, { course_name: string; internal_max_mark: number }>
  >(new Map());
  useMemo(() => {
    if (institutionId) {
      CiaMarksService.fetchCoeCoursesMap(institutionId)
        .then(setCourseInfoMap)
        .catch(() => setCourseInfoMap(new Map()));
    }
  }, [institutionId]);

  // Courses grouped by semester (for both tabs)
  const coursesBySemester = useMemo(() => {
    const groups: Record<
      string,
      Array<{ course_code: string; course_name: string; course_order: number }>
    > = {};
    for (const sem of filters.semester_codes) {
      const courses = CiaMarksService.getCoursesForSemester(filteredMapping, sem).map((c) => ({
        course_code: c.course_code,
        course_name: courseInfoMap.get(c.course_code)?.course_name ?? c.course_name ?? '',
        course_order: c.course_order,
      }));
      groups[sem] = courses;
    }
    return groups;
  }, [filteredMapping, filters.semester_codes, courseInfoMap]);

  // Total course count (sum across all selected semesters)
  const totalCourseCount = useMemo(
    () =>
      Object.values(coursesBySemester).reduce((sum, arr) => sum + arr.length, 0),
    [coursesBySemester]
  );

  // Courses to fetch reports for:
  //  - Course Wise tab → only the selected course_codes
  //  - Consolidated tab → all courses in the selected semesters
  const courseCodesForFetch = useMemo(() => {
    if (activeTab === 'course-wise') {
      return filters.course_codes;
    }
    return Object.values(coursesBySemester).flatMap((arr) =>
      arr.map((c) => c.course_code)
    );
  }, [activeTab, filters.course_codes, coursesBySemester]);

  // Batch-fetch reports for all courses needed
  const { data: multiReports, isFetching: isFetchingReports } = useMultiCiaReport({
    institutionId,
    examSessionId: filters.exam_session_id,
    courseCodes: courseCodesForFetch,
    ciaRound: filters.cia_round,
    programCode: filters.program_code,
  });

  // ── Filter change handlers ────────────────────────────────────────────────
  const updateFilter = <K extends keyof ReportFilterState>(
    key: K,
    value: ReportFilterState[K]
  ) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // Cascading resets
      if (key === 'exam_session_id') {
        next.setting_id = '';
        next.cia_round = undefined;
        next.program_code = '';
        next.semester_codes = [];
        next.course_codes = [];
      }
      if (key === 'setting_id') {
        next.program_code = '';
        next.semester_codes = [];
        next.course_codes = [];
      }
      if (key === 'program_code') {
        next.semester_codes = [];
        next.course_codes = [];
      }
      if (key === 'semester_codes') {
        next.course_codes = [];
      }
      return next;
    });
  };

  // ── Course selection toggles (Course Wise tab) ────────────────────────────
  const toggleCourse = (code: string) => {
    setFilters((prev) => ({
      ...prev,
      course_codes: prev.course_codes.includes(code)
        ? prev.course_codes.filter((c) => c !== code)
        : [...prev.course_codes, code],
    }));
  };
  const selectAllCourses = () => {
    const all = Object.values(coursesBySemester).flatMap((arr) =>
      arr.map((c) => c.course_code)
    );
    setFilters((prev) => ({ ...prev, course_codes: all }));
  };
  const selectSemesterCourses = (sem: string) => {
    const semCourses = coursesBySemester[sem]?.map((c) => c.course_code) ?? [];
    setFilters((prev) => {
      const without = prev.course_codes.filter((c) => !semCourses.includes(c));
      return { ...prev, course_codes: [...without, ...semCourses] };
    });
  };
  const clearCourses = () => setFilters((prev) => ({ ...prev, course_codes: [] }));

  // ── PDF generation helpers ────────────────────────────────────────────────
  const toBase64 = async (url: string): Promise<string | undefined> => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      return undefined;
    }
  };

  const loadLogos = useCallback(
    async () => {
      const [logoImage, rightLogoImage] = await Promise.all([
        toBase64('/logo.png'),
        toBase64('/jkkncas_logo.png'),
      ]);
      return { logoImage, rightLogoImage };
    },
    []
  );

  const semesterLabel = (code: string) => code.match(/(\d+)\s*$/)?.[1] ?? code;

  // ── Course Wise PDF (multi-course → single PDF, each course on its own page) ──
  const handleExportCourseWise = useCallback(async () => {
    if (!selectedRound || !multiReports || multiReports.length === 0) {
      toast.error('No data to export');
      return;
    }
    if (filters.course_codes.length === 0) {
      toast.error('Select at least one course');
      return;
    }
    if (isFetchingReports) {
      toast.error('Report data still loading — please wait');
      return;
    }

    setIsExporting(true);
    try {
      const { logoImage, rightLogoImage } = await loadLogos();
      const examSession = examSessions?.find((s) => s.id === filters.exam_session_id);

      // Build a lookup: course_code → semester label (for the per-course PDF header)
      const courseSemesterMap = new Map<string, string>();
      for (const [sem, courses] of Object.entries(coursesBySemester)) {
        for (const c of courses) {
          courseSemesterMap.set(c.course_code, semesterLabel(sem));
        }
      }

      // Generate one PDF per course, then append them into a single multi-page document
      // by generating separately — user downloads N PDFs? No, we want ONE PDF with N pages.
      // For simplicity, we'll generate individual entries but call the shared function
      // sequentially. The existing generateInternalMarksPDF() saves each call separately.
      // We need a version that takes multiple courses in one call.
      // → Workaround: use jsPDF multi-course via generateCourseWiseBatchPDF (created below).
      await generateCourseWiseBatchPDF({
        reports: multiReports.filter((r) =>
          filters.course_codes.includes(r.courseCode)
        ),
        program: {
          program_code: filters.program_code,
          program_name: selectedProgram?.program_name ?? '',
        },
        examSession: examSession?.session_name ?? '',
        assessmentName: selectedSetting?.setting_name ?? '',
        ciaRoundName: selectedRound.round_name,
        components: selectedRound.components,
        useCourseMax: selectedSetting?.use_course_max ?? false,
        courseInfoMap,
        courseSemesterMap,
        logoImage,
        rightLogoImage,
      });
      toast.success(`Exported ${filters.course_codes.length} course(s)`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  }, [
    selectedRound,
    multiReports,
    filters,
    isFetchingReports,
    examSessions,
    coursesBySemester,
    selectedProgram,
    selectedSetting,
    courseInfoMap,
    loadLogos,
  ]);

  // ── Consolidated PDF (wide-table, one semester per page) ──────────────────
  const handleExportConsolidated = useCallback(async () => {
    if (!selectedRound || filters.semester_codes.length === 0) {
      toast.error('Select at least one semester');
      return;
    }
    if (isFetchingReports || !multiReports) {
      toast.error('Report data still loading — please wait');
      return;
    }

    setIsExporting(true);
    try {
      const { logoImage, rightLogoImage } = await loadLogos();
      const examSession = examSessions?.find((s) => s.id === filters.exam_session_id);

      // Build a lookup from course_code → report data
      const reportByCourse = new Map(
        multiReports.map((r) => [r.courseCode, r.data])
      );

      // Group courses into semesters (preserve the course_order ASC)
      // Build ConsolidatedSemester[] from the currently-selected semesters
      const semesters = filters.semester_codes
        .sort((a, b) => {
          const na = parseInt(a.match(/(\d+)\s*$/)?.[1] ?? '0', 10);
          const nb = parseInt(b.match(/(\d+)\s*$/)?.[1] ?? '0', 10);
          return na - nb;
        })
        .map((semCode) => {
          const semCourses = coursesBySemester[semCode] ?? [];
          const courses = semCourses.map((c) => {
            const info = courseInfoMap.get(c.course_code);
            const report = reportByCourse.get(c.course_code);
            return {
              course_code: c.course_code,
              course_name: info?.course_name ?? c.course_name ?? '',
              internal_max_mark:
                info?.internal_max_mark ?? report?.course.internal_max_mark ?? 0,
            };
          });

          // Aggregate students across all courses in this semester
          // A student appears if they have a row in ANY of this semester's course reports
          const studentMap = new Map<
            string,
            { register_number: string; student_name: string; marks: Record<string, number | null> }
          >();

          for (const c of semCourses) {
            const report = reportByCourse.get(c.course_code);
            if (!report) continue;
            for (const learner of report.learners) {
              const key = learner.register_number;
              if (!studentMap.has(key)) {
                studentMap.set(key, {
                  register_number: learner.register_number,
                  student_name: learner.student_name,
                  marks: {},
                });
              }
              // Use the total mark for this course (sum of components)
              studentMap.get(key)!.marks[c.course_code] =
                learner.total && learner.total > 0 ? learner.total : null;
            }
          }

          return {
            semester_code: semCode,
            semester_label: semesterLabel(semCode),
            courses,
            students: Array.from(studentMap.values()).sort((a, b) =>
              a.register_number.localeCompare(b.register_number)
            ),
          };
        });

      const pdfData: ConsolidatedReportData = {
        institution_name: 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)',
        program_code: filters.program_code,
        program_name: selectedProgram?.program_name ?? '',
        exam_session: examSession?.session_name ?? '',
        assessment_name: selectedSetting?.setting_name ?? '',
        cia_round_name: selectedRound.round_name,
        semesters,
        logoImage,
        rightLogoImage,
      };

      generateConsolidatedReportPDF(pdfData);
      toast.success(`Consolidated PDF exported (${semesters.length} semester(s))`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  }, [
    selectedRound,
    multiReports,
    filters,
    isFetchingReports,
    examSessions,
    coursesBySemester,
    selectedProgram,
    selectedSetting,
    courseInfoMap,
    loadLogos,
  ]);

  if (!canView) {
    return (
      <ContentLayout title='Internal Mark Report'>
        <div className='flex items-center justify-center h-64'>
          <p className='text-muted-foreground'>
            You do not have permission to view reports.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const isReadyForFilters = !!filters.exam_session_id && !!filters.setting_id && !!filters.program_code;
  const hasSemesters = filters.semester_codes.length > 0;

  return (
    <ContentLayout title='Internal Mark Report'>
      <Breadcrumb className='mb-4'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/academic/internal-marks'>Internal Marks</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Report</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-4'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <FileBarChart className='h-6 w-6' /> Internal Mark Report
          </h1>
          <p className='text-sm text-muted-foreground'>
            Generate internal mark entry PDF report
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className='pt-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
              {/* Exam Session */}
              <div className='space-y-1.5'>
                <Label className='text-xs font-medium'>
                  Exam Session <span className='text-red-500'>*</span>
                </Label>
                <Select
                  value={filters.exam_session_id || ''}
                  onValueChange={(v) => updateFilter('exam_session_id', v)}
                  disabled={!institutionId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select Exam Session' />
                  </SelectTrigger>
                  <SelectContent>
                    {(examSessions ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.session_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Assessment + Round */}
              <div className='space-y-1.5'>
                <Label className='text-xs font-medium'>
                  Assessment <span className='text-red-500'>*</span>
                </Label>
                <Select
                  value={
                    filters.setting_id && filters.cia_round != null
                      ? `${filters.setting_id}__${filters.cia_round}`
                      : ''
                  }
                  onValueChange={(v) => {
                    const [settingId, roundStr] = v.split('__');
                    setFilters((prev) => ({
                      ...prev,
                      setting_id: settingId,
                      cia_round: Number(roundStr),
                      program_code: '',
                      semester_codes: [],
                      course_codes: [],
                    }));
                  }}
                  disabled={!filters.exam_session_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select Assessment' />
                  </SelectTrigger>
                  <SelectContent>
                    {(ciaSettings ?? []).flatMap((s) =>
                      s.cia_rounds.map((r) => (
                        <SelectItem
                          key={`${s.id}__${r.round}`}
                          value={`${s.id}__${r.round}`}
                        >
                          {s.setting_name} - {r.round_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Program */}
              <div className='space-y-1.5'>
                <Label className='text-xs font-medium'>
                  Program <span className='text-red-500'>*</span>
                </Label>
                <Select
                  value={filters.program_code || ''}
                  onValueChange={(v) => updateFilter('program_code', v)}
                  disabled={!filters.setting_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select Program' />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredPrograms.map((p) => (
                      <SelectItem key={p.id} value={p.program_id}>
                        {p.program_name} ({p.program_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Semester (multi) */}
              <div className='space-y-1.5'>
                <Label className='text-xs font-medium'>
                  Semester <span className='text-red-500'>*</span>{' '}
                  <span className='text-purple-500 text-[10px]'>(multi)</span>
                </Label>
                <MultiSemesterPicker
                  options={semesterOptions}
                  value={filters.semester_codes}
                  onChange={(next) => updateFilter('semester_codes', next)}
                  disabled={!filters.program_code}
                  isLoading={isLoadingFilters}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        {isReadyForFilters && hasSemesters && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'course-wise' | 'consolidated')}>
            <TabsList>
              <TabsTrigger value='course-wise'>
                <FileText className='h-4 w-4 mr-1.5' />
                Course Wise
              </TabsTrigger>
              <TabsTrigger value='consolidated'>
                <Layers className='h-4 w-4 mr-1.5' />
                Consolidated
              </TabsTrigger>
            </TabsList>

            {/* ── COURSE WISE ── */}
            <TabsContent value='course-wise' className='space-y-3'>
              <Card>
                <CardContent className='pt-5'>
                  <div className='flex items-center justify-between mb-3'>
                    <div>
                      <p className='font-semibold text-sm'>Select Courses</p>
                      <p className='text-xs text-muted-foreground'>
                        {filters.course_codes.length} of {totalCourseCount} selected
                      </p>
                    </div>
                    <div className='flex items-center gap-3 text-xs'>
                      <button
                        type='button'
                        className='text-emerald-600 hover:underline font-medium'
                        onClick={selectAllCourses}
                        disabled={isLoadingFilters}
                      >
                        Select All
                      </button>
                      <span className='text-muted-foreground'>|</span>
                      <button
                        type='button'
                        className='text-red-500 hover:underline font-medium'
                        onClick={clearCourses}
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {isLoadingFilters && (
                    <div className='flex items-center justify-center py-8'>
                      <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
                      <span className='ml-2 text-xs text-muted-foreground'>Loading courses...</span>
                    </div>
                  )}

                  {!isLoadingFilters &&
                    Object.keys(coursesBySemester).length > 0 &&
                    filters.semester_codes
                      .sort((a, b) => {
                        const na = parseInt(a.match(/(\d+)\s*$/)?.[1] ?? '0', 10);
                        const nb = parseInt(b.match(/(\d+)\s*$/)?.[1] ?? '0', 10);
                        return na - nb;
                      })
                      .map((semCode) => {
                        const semCourses = coursesBySemester[semCode] ?? [];
                        return (
                          <div key={semCode} className='mb-4'>
                            <div className='flex items-center justify-between mb-2'>
                              <div className='flex items-center gap-2'>
                                <Badge
                                  variant='outline'
                                  className='bg-amber-50 border-amber-400 text-amber-900 dark:bg-amber-950/30'
                                >
                                  Semester {semesterLabel(semCode)}
                                </Badge>
                                <span className='text-xs text-muted-foreground'>
                                  {semCourses.length} courses
                                </span>
                              </div>
                              <button
                                type='button'
                                className='text-xs text-emerald-600 hover:underline font-medium'
                                onClick={() => selectSemesterCourses(semCode)}
                              >
                                Select Sem {semesterLabel(semCode)}
                              </button>
                            </div>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
                              {semCourses.map((c) => {
                                const checked = filters.course_codes.includes(c.course_code);
                                return (
                                  <Label
                                    key={c.course_code}
                                    className={cn(
                                      'flex items-center gap-2 rounded border px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors',
                                      checked &&
                                        'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                                    )}
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={() => toggleCourse(c.course_code)}
                                    />
                                    <span className='font-mono text-xs font-medium'>
                                      {c.course_code}
                                    </span>
                                    <span className='text-xs text-muted-foreground truncate'>
                                      {c.course_name}
                                    </span>
                                  </Label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                  {!isLoadingFilters && totalCourseCount === 0 && (
                    <p className='text-sm text-muted-foreground text-center py-8'>
                      No courses available for the selected semester(s).
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className='flex justify-end'>
                <Button
                  onClick={handleExportCourseWise}
                  disabled={
                    isExporting ||
                    isFetchingReports ||
                    filters.course_codes.length === 0
                  }
                  size='lg'
                >
                  {isExporting || isFetchingReports ? (
                    <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                  ) : (
                    <Download className='h-4 w-4 mr-2' />
                  )}
                  Download PDF ({filters.course_codes.length} course
                  {filters.course_codes.length === 1 ? '' : 's'})
                </Button>
              </div>
            </TabsContent>

            {/* ── CONSOLIDATED ── */}
            <TabsContent value='consolidated' className='space-y-3'>
              <Card className='border-l-4 border-l-purple-500'>
                <CardContent className='pt-5'>
                  <div className='flex items-start justify-between gap-4'>
                    <div className='flex items-start gap-3 min-w-0'>
                      <FileText className='h-6 w-6 text-purple-500 flex-shrink-0 mt-0.5' />
                      <div className='min-w-0'>
                        <p className='font-semibold text-sm'>Consolidated Report</p>
                        <p className='text-xs text-muted-foreground mt-1'>
                          {filters.program_code} - {selectedProgram?.program_name} | Semesters:{' '}
                          <span className='font-medium text-foreground'>
                            {filters.semester_codes.map(semesterLabel).join(', ')}
                          </span>{' '}
                          | {selectedRound?.round_name} — each semester prints on a new page
                        </p>
                      </div>
                    </div>
                    <div className='flex items-center gap-2 flex-shrink-0'>
                      <Badge
                        variant='outline'
                        className='bg-purple-50 border-purple-400 text-purple-900'
                      >
                        {filters.semester_codes.length} sem
                        {filters.semester_codes.length === 1 ? '' : 's'}
                      </Badge>
                      <Button
                        onClick={handleExportConsolidated}
                        disabled={isExporting || isFetchingReports}
                      >
                        {isExporting || isFetchingReports ? (
                          <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                        ) : (
                          <Download className='h-4 w-4 mr-2' />
                        )}
                        Download PDF
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Empty state */}
        {!isReadyForFilters && (
          <Card>
            <CardContent className='flex flex-col items-center justify-center py-12'>
              <FileBarChart className='h-12 w-12 text-muted-foreground mb-4' />
              <p className='text-muted-foreground text-center'>
                Select Exam Session, Assessment, Program and Semester to generate reports.
              </p>
            </CardContent>
          </Card>
        )}

        {isReadyForFilters && !hasSemesters && !isLoadingFilters && (
          <Card>
            <CardContent className='flex flex-col items-center justify-center py-12'>
              <FileBarChart className='h-12 w-12 text-muted-foreground mb-4' />
              <p className='text-muted-foreground text-center'>
                Select at least one semester to see courses.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Multi-course batch PDF helper
// Generates one PDF with each course on its own page (same format as entry sheet)
// ────────────────────────────────────────────────────────────────────────────

async function generateCourseWiseBatchPDF(params: {
  reports: Array<{ courseCode: string; data: import('@/types/internal-marks').CiaReportResponse }>;
  program: { program_code: string; program_name: string };
  examSession: string;
  assessmentName: string;
  ciaRoundName: string;
  components: import('@/types/internal-marks').CiaComponent[];
  useCourseMax: boolean;
  courseInfoMap: Map<string, { course_name: string; internal_max_mark: number }>;
  courseSemesterMap: Map<string, string>;
  logoImage?: string;
  rightLogoImage?: string;
}) {
  // Generate each course as a separate PDF then merge? Simpler path:
  // The existing generateInternalMarksPDF saves one file per call. For N courses we'd
  // produce N files which is not what the user wants.
  // → We'll loop and build ONE jsPDF instance, calling our own inline render for
  //   each course. To keep the code DRY, we reuse the same layout logic by delegating
  //   to a shared function. For now, generate per-course then append pages.
  //
  // Simplest pragmatic approach: call generateInternalMarksPDF once per course,
  // which triggers N file downloads. This is awkward for users.
  //
  // Clean approach: we need a variant of generateInternalMarksPDF that accepts an
  // existing doc instance. To ship this quickly without refactoring the whole util,
  // we'll use an inline loop that shares the doc.
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const A4_W = 210;
  const A4_H = 297;
  const MARGIN = 10;

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const numberToWords = (n: number): string => {
    if (n === 0) return 'Zero';
    if (n < 0) return 'Minus ' + numberToWords(-n);
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + numberToWords(n % 100) : '');
    return String(n);
  };

  const doc = new jsPDF('portrait', 'mm', 'a4');

  params.reports.forEach((report, idx) => {
    if (idx > 0) doc.addPage();
    const info = params.courseInfoMap.get(report.courseCode);
    const maxMark = (params.useCourseMax && info?.internal_max_mark)
      ? info.internal_max_mark
      : report.data.course.internal_max_mark;

    const components = params.components.map((c) => ({
      ...c,
      max_marks: params.useCourseMax && maxMark > 0 ? maxMark : c.max_marks,
    }));

    let currentY = MARGIN;
    const tableWidth = A4_W - MARGIN * 2;

    // Logos
    if (params.rightLogoImage) {
      try { doc.addImage(params.rightLogoImage, 'PNG', MARGIN, currentY, 16, 16); } catch {}
    }
    if (params.logoImage) {
      try { doc.addImage(params.logoImage, 'PNG', A4_W - MARGIN - 16, currentY, 16, 16); } catch {}
    }

    // Header
    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', A4_W / 2, currentY + 4, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', A4_W / 2, currentY + 9, { align: 'center' });
    currentY += 13;
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', A4_W / 2, currentY, { align: 'center' });
    currentY += 5;
    doc.setFontSize(11);
    doc.text(`SEMESTER EXAMINATION - ${params.examSession}`, A4_W / 2, currentY, { align: 'center' });
    currentY += 5;
    doc.text('INTERNAL MARK ENTRY SHEET', A4_W / 2, currentY, { align: 'center' });
    currentY += 5;
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.text(`${params.assessmentName} \u2014 ${params.ciaRoundName}`, A4_W / 2, currentY, { align: 'center' });
    currentY += 6;

    // Program + Semester
    const semesterLabel = params.courseSemesterMap.get(report.courseCode) ?? '';
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    doc.text(`Program: ${params.program.program_code} - ${params.program.program_name}`, MARGIN, currentY);
    if (semesterLabel) {
      doc.text(`Semester: ${semesterLabel}`, A4_W - MARGIN, currentY, { align: 'right' });
    }
    currentY += 4.5;
    doc.setFont('times', 'normal');
    const courseText = `Course: ${report.courseCode} - ${info?.course_name ?? report.data.course.course_name}`;
    const courseLines = doc.splitTextToSize(courseText, tableWidth - 50);
    doc.text(courseLines, MARGIN, currentY);
    doc.text(`Max Internal Mark: ${maxMark}`, A4_W - MARGIN, currentY, { align: 'right' });
    currentY += courseLines.length > 1 ? courseLines.length * 4 : 4.5;
    currentY += 2;

    // Table
    const compCount = components.length;
    const snoW = 8, regW = 32, totalW = 12, wordsMinW = 22, nameMinW = 30;
    const fixedUsed = snoW + regW + totalW;
    const remaining = tableWidth - fixedUsed;
    const compTotalW = Math.min(compCount * 16, remaining * 0.35);
    const compW = compCount > 0 ? compTotalW / compCount : 0;
    const afterComp = remaining - compTotalW;
    const nameW = Math.max(nameMinW, afterComp * 0.6);
    const wordsW = Math.max(wordsMinW, afterComp * 0.4);

    const headRow = ['S.No', 'Reg No', 'Name of the Student'];
    components.forEach((c) => headRow.push(`${c.name}\n(${c.max_marks})`));
    headRow.push('Total', 'Marks in Words');

    const bodyRows = report.data.learners.map((learner, i) => {
      const row: (string | number)[] = [
        i + 1,
        learner.register_number,
        learner.student_name,
      ];
      components.forEach((c) => {
        const mark = learner.marks[c.code];
        row.push(mark != null ? mark : '-');
      });
      row.push(learner.total > 0 ? learner.total : '-');
      row.push(learner.total > 0 ? numberToWords(learner.total) : '-');
      return row;
    });

    const columnStyles: Record<number, object> = {
      0: { cellWidth: snoW, halign: 'center' },
      1: { cellWidth: regW, halign: 'center' },
      2: { cellWidth: nameW, halign: 'left' },
    };
    components.forEach((_, i) => { columnStyles[3 + i] = { cellWidth: compW, halign: 'center' }; });
    columnStyles[3 + compCount] = { cellWidth: totalW, halign: 'center', fontStyle: 'bold' };
    columnStyles[4 + compCount] = { cellWidth: wordsW, halign: 'left' };

    autoTable(doc, {
      head: [headRow],
      body: bodyRows,
      startY: currentY,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth,
      theme: 'grid',
      styles: { font: 'times', fontSize: 10, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.3, textColor: [0, 0, 0], valign: 'middle', minCellHeight: 8, overflow: 'linebreak' },
      headStyles: { font: 'times', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0], halign: 'center', fontSize: 10, minCellHeight: 10 },
      columnStyles,
      didDrawPage: (hookData) => {
        doc.setFont('times', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(128, 128, 128);
        doc.text(`${new Date().toLocaleString('en-IN')}`, MARGIN, A4_H - 6);
        doc.text(`Page ${hookData.pageNumber}`, A4_W - MARGIN, A4_H - 6, { align: 'right' });
        doc.setTextColor(0, 0, 0);
      },
    });

    // Summary
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      currentY + 50;
    let sigY = finalY + 20;
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    const learnersWithMarks = report.data.learners.filter((l) => l.total > 0).length;
    doc.text(`Total Learners: ${report.data.learners.length}    Marks Entered: ${learnersWithMarks}    Pending: ${report.data.learners.length - learnersWithMarks}`, MARGIN, finalY + 6);

    if (sigY + 10 > A4_H - 12) sigY = A4_H - 20;

    // Signature (Subject In-Charge for entry sheet)
    const sigWidth = tableWidth / 3;
    const sigLabels = [
      'Signature of the Subject In-Charge',
      'Signature of the HOD',
      'Signature of the Principal',
    ];
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    sigLabels.forEach((label, i) => {
      const centerX = MARGIN + i * sigWidth + sigWidth / 2;
      doc.setDrawColor(0, 0, 0);
      doc.line(MARGIN + i * sigWidth + 8, sigY, MARGIN + (i + 1) * sigWidth - 8, sigY);
      doc.text(label, centerX, sigY + 5, { align: 'center' });
    });
  });

  const fileName = `internal_marks_${params.program.program_code}_${params.ciaRoundName}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
