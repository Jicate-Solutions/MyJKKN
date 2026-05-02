'use client';

import { useState, useMemo } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { X, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import { useExamSessions, useCiaSettings } from '@/hooks/internal-marks/use-cia-settings';
import { useCourseMapping, useRegistrations } from '@/hooks/internal-marks/use-cia-marks';
import { CiaMarksService } from '@/lib/services/internal-marks/cia-marks-service';
import { getEntryWindowStatus, resolveRoundDates } from '@/types/internal-marks';

export interface InternalMarksFilterState {
  institution_id: string;
  exam_session_id: string;
  setting_id: string;
  program_code: string;
  semester_code: string; // e.g., "PCM-1" — from COE course-mapping
  course_code: string;
  cia_round: number | undefined;
}

interface Props {
  /** User's institution ID — resolved by parent page from profile */
  institutionId: string | undefined;
  filters: Partial<InternalMarksFilterState>;
  onFiltersChange: (filters: Partial<InternalMarksFilterState>) => void;
}

/**
 * Filter flow:
 *   Exam Session → Assessment+Round → Program → Course
 *   institutionId is passed from parent (from profile.institution_id)
 */
export function InternalMarksFiltersComponent({ institutionId, filters, onFiltersChange }: Props) {
  // Super admin can switch institutions; others are locked to their own (resolved by parent)
  const { isSuperAdmin } = usePermissions();
  const { institutions, loading: isLoadingInstitutions } = useInstitutionsWithAccess({
    autoFetch: isSuperAdmin,
  });

  // Exam sessions from COE
  const { data: examSessions, isLoading: isLoadingExam } = useExamSessions(institutionId);

  // CIA settings from COE
  const { data: ciaSettings, isLoading: isLoadingSettings } = useCiaSettings(
    institutionId, filters.exam_session_id
  );
  const selectedSetting = ciaSettings?.find((s) => s.id === filters.setting_id);

  // Programs from MyJKKN
  const { data: programsData } = usePrograms({
    institution_id: institutionId,
    isActive: true,
    limit: 200,
  });
  const filteredPrograms = (programsData?.data ?? []).filter((p) =>
    selectedSetting ? selectedSetting.program_codes.includes(p.program_id) : true
  );

  // Course-mapping from COE — program-scoped curriculum (all semesters, all courses)
  const { data: courseMapping, isLoading: isLoadingMapping } = useCourseMapping({
    institutionId,
    programCode: filters.program_code,
  });

  // Regular registrations for this exam session + program
  // Used to filter course-mapping to only courses with is_regular=true registrations
  const { data: registrations, isLoading: isLoadingReg } = useRegistrations({
    institutionId,
    examSessionId: filters.exam_session_id,
    programCode: filters.program_code,
  });

  // Build a set of course codes that have at least one regular registration
  // Server already filters is_regular=true, but we guard here for safety
  const registeredCourseCodes = useMemo(() => {
    const set = new Set<string>();
    if (registrations) {
      for (const r of registrations) {
        if (r.is_regular && r.course_code) set.add(r.course_code);
      }
    }
    return set;
  }, [registrations]);

  // Filter course-mapping: only entries whose course_code has a regular registration
  const filteredMapping = useMemo(
    () =>
      courseMapping
        ? courseMapping.filter(
            (m) => m.is_active && registeredCourseCodes.has(m.course_code)
          )
        : [],
    [courseMapping, registeredCourseCodes]
  );

  // True while either data source is fetching — dropdowns wait for BOTH
  const isLoadingSemesterCourse = isLoadingMapping || isLoadingReg;

  // Distinct semester codes — only from the filtered mapping
  // This naturally excludes semesters with no regular students (e.g., odd semesters
  // during an even-semester exam session)
  const semesterOptions = useMemo(
    () => CiaMarksService.getSemestersFromMapping(filteredMapping),
    [filteredMapping]
  );

  // Courses for the selected semester, sorted by course_order ASC
  const baseCourses = useMemo(
    () =>
      filters.semester_code
        ? CiaMarksService.getCoursesForSemester(filteredMapping, filters.semester_code)
        : [],
    [filteredMapping, filters.semester_code]
  );

  // COE courses map for enrichment (course_name + internal_max_mark)
  const [courseInfoMap, setCourseInfoMap] = useState<Map<string, { course_name: string; internal_max_mark: number }>>(new Map());

  // Fetch course names from COE (only when institutionId changes)
  useMemo(() => {
    if (institutionId) {
      CiaMarksService.fetchCoeCoursesMap(institutionId)
        .then(setCourseInfoMap)
        .catch(() => setCourseInfoMap(new Map()));
    }
  }, [institutionId]);

  // Merge course names, but preserve the course_order sort from baseCourses
  const enrichedCourses = useMemo(
    () =>
      baseCourses.map((c) => ({
        course_code: c.course_code,
        course_name: courseInfoMap.get(c.course_code)?.course_name ?? c.course_name ?? '',
        course_offering_id: '', // Not used in new flow; reserved for type compat
      })),
    [baseCourses, courseInfoMap]
  );

  const [courseOpen, setCourseOpen] = useState(false);

  const handleChange = (key: keyof InternalMarksFilterState, value: string) => {
    const updated = { ...filters, [key]: value };

    if (key === 'institution_id') {
      updated.exam_session_id = '';
      updated.setting_id = '';
      updated.program_code = '';
      updated.semester_code = '';
      updated.course_code = '';
      updated.cia_round = undefined;
    }
    if (key === 'exam_session_id') {
      updated.setting_id = '';
      updated.program_code = '';
      updated.semester_code = '';
      updated.course_code = '';
      updated.cia_round = undefined;
    }
    if (key === 'setting_id') {
      updated.program_code = '';
      updated.semester_code = '';
      updated.course_code = '';
    }
    if (key === 'program_code') {
      updated.semester_code = '';
      updated.course_code = '';
    }
    if (key === 'semester_code') {
      updated.course_code = '';
    }

    onFiltersChange(updated);
  };

  const handleClear = () => onFiltersChange({});

  const activeCount = Object.values(filters).filter((v) => v !== undefined && v !== '').length;

  return (
    <div className='space-y-4'>
      <div
        className={cn(
          'grid grid-cols-1 md:grid-cols-2 gap-4',
          isSuperAdmin ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
        )}
      >
        {/* Institution — super admin only */}
        {isSuperAdmin && (
          <div className='space-y-1.5'>
            <Label className='text-xs font-medium'>Institution</Label>
            <Select
              value={filters.institution_id || ''}
              onValueChange={(v) => handleChange('institution_id', v)}
              disabled={isLoadingInstitutions}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={isLoadingInstitutions ? 'Loading...' : 'Select Institution'}
                />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Exam Session */}
        <div className='space-y-1.5'>
          <Label className='text-xs font-medium'>Exam Session</Label>
          <Select
            value={filters.exam_session_id || ''}
            onValueChange={(v) => handleChange('exam_session_id', v)}
            disabled={!institutionId || isLoadingExam}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !institutionId
                    ? isSuperAdmin
                      ? 'Select institution first'
                      : 'No institution assigned'
                    : isLoadingExam
                      ? 'Loading...'
                      : (examSessions ?? []).length === 0
                        ? 'No exam sessions'
                        : 'Select Exam Session'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(examSessions ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Assessment + Round (combined) — entry-window status per COE spec §6.4 */}
        <div className='space-y-1.5'>
          <Label className='text-xs font-medium'>Assessment</Label>
          <Select
            value={filters.setting_id && filters.cia_round != null
              ? `${filters.setting_id}__${filters.cia_round}`
              : ''}
            onValueChange={(v) => {
              const [settingId, roundStr] = v.split('__');
              const setting = ciaSettings?.find((s) => s.id === settingId);
              const round = setting?.cia_rounds.find((r) => r.round === Number(roundStr));
              // Defensive: refuse selection if the item became closed/upcoming
              // between render and click (e.g., date crossed midnight IST).
              if (round) {
                const status = getEntryWindowStatus(round);
                if (status !== 'open' && status !== 'no-dates') return;
              }
              onFiltersChange({
                ...filters,
                setting_id: settingId,
                cia_round: Number(roundStr),
                program_code: '',
                course_code: '',
              });
            }}
            disabled={!filters.exam_session_id || isLoadingSettings}
          >
            <SelectTrigger>
              <SelectValue placeholder={isLoadingSettings ? 'Loading...' : 'Select Assessment'} />
            </SelectTrigger>
            <SelectContent className='max-w-[450px]'>
              {(ciaSettings ?? []).flatMap((s) =>
                s.cia_rounds.map((r) => {
                  const status = getEntryWindowStatus(r);
                  const isOpen = status === 'open' || status === 'no-dates';
                  const { entryFrom } = resolveRoundDates(r);
                  return (
                    <SelectItem
                      key={`${s.id}__${r.round}`}
                      value={`${s.id}__${r.round}`}
                      disabled={!isOpen}
                      className={cn(!isOpen && 'opacity-60')}
                    >
                      <div className='flex items-center gap-2 w-full'>
                        <span
                          className={cn('h-2 w-2 rounded-full shrink-0', {
                            'bg-emerald-500': status === 'open',
                            'bg-red-500': status === 'expired',
                            'bg-amber-500': status === 'upcoming',
                            'bg-gray-400': status === 'no-dates',
                          })}
                        />
                        <span className={cn('flex-1', status === 'expired' && 'line-through')}>
                          {s.setting_name} - {r.round_name}
                        </span>
                        {status === 'open' && (
                          <span className='text-[10px] text-emerald-600 ml-2'>Open</span>
                        )}
                        {status === 'expired' && (
                          <span className='text-[10px] text-red-500 ml-2'>Closed</span>
                        )}
                        {status === 'upcoming' && entryFrom && (
                          <span className='text-[10px] text-amber-600 ml-2'>Opens {entryFrom}</span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Program */}
        <div className='space-y-1.5'>
          <Label className='text-xs font-medium'>Program</Label>
          <Select
            value={filters.program_code || ''}
            onValueChange={(v) => handleChange('program_code', v)}
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

        {/* Semester (from COE course-mapping) */}
        <div className='space-y-1.5'>
          <Label className='text-xs font-medium'>Semester</Label>
          <Select
            value={filters.semester_code || ''}
            onValueChange={(v) => handleChange('semester_code', v)}
            disabled={!filters.program_code || isLoadingSemesterCourse}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={isLoadingSemesterCourse ? 'Loading...' : 'Select Semester'}
              />
            </SelectTrigger>
            <SelectContent>
              {semesterOptions.map((code) => {
                const num = code.match(/(\d+)\s*$/)?.[1];
                return (
                  <SelectItem key={code} value={code}>
                    {num ? `Semester ${num}` : code} ({code})
                  </SelectItem>
                );
              })}
              {!isLoadingSemesterCourse &&
                semesterOptions.length === 0 &&
                filters.program_code && (
                  <SelectItem value='none' disabled>
                    No semesters found
                  </SelectItem>
                )}
            </SelectContent>
          </Select>
        </div>

        {/* Course (searchable) */}
        <div className='space-y-1.5'>
          <Label className='text-xs font-medium'>Course</Label>
          <Popover open={courseOpen} onOpenChange={setCourseOpen}>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                role='combobox'
                aria-expanded={courseOpen}
                disabled={!filters.semester_code || isLoadingSemesterCourse}
                className='w-full justify-between font-normal h-auto min-h-9 py-2'
              >
                <span className='truncate text-left'>
                  {filters.course_code
                    ? (() => {
                        const c = enrichedCourses.find((x) => x.course_code === filters.course_code);
                        return c?.course_name
                          ? `${c.course_code} - ${c.course_name}`
                          : filters.course_code;
                      })()
                    : isLoadingSemesterCourse ? 'Loading...' : 'Search course...'}
                </span>
                <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-[450px] p-0' align='start'>
              <Command>
                <CommandInput placeholder='Search by code or name...' />
                <CommandList>
                  <CommandEmpty>No course found.</CommandEmpty>
                  <CommandGroup>
                    {enrichedCourses.map((c) => (
                      <CommandItem
                        key={c.course_code}
                        value={`${c.course_code} ${c.course_name}`}
                        onSelect={() => {
                          handleChange('course_code', c.course_code);
                          setCourseOpen(false);
                        }}
                        className='flex items-start gap-2'
                      >
                        <Check
                          className={cn(
                            'mt-0.5 h-4 w-4 shrink-0',
                            filters.course_code === c.course_code ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <div className='min-w-0'>
                          <span className='font-mono text-xs font-medium'>{c.course_code}</span>
                          {c.course_name && (
                            <span className='block text-xs text-muted-foreground whitespace-normal'>
                              {c.course_name}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {activeCount > 0 && (
        <Button variant='ghost' size='sm' onClick={handleClear} className='text-muted-foreground'>
          <X className='h-4 w-4 mr-1' /> Clear filters ({activeCount})
        </Button>
      )}
    </div>
  );
}
