'use client';

import { useMemo, useState } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { X, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useExamSessions, useCiaSettings } from '@/hooks/internal-marks/use-cia-settings';
import { useRegistrations } from '@/hooks/internal-marks/use-cia-marks';
import { usePlannedScopes } from '@/hooks/question-papers/use-question-papers';
import { getEntryWindowStatus, resolveMarkEntryType, resolveRoundDates } from '@/types/internal-marks';

export interface MarkEntryFilterState {
  institution_id?: string;
  exam_session_id: string;
  setting_id: string;
  cia_round?: number;
  program_code: string;
  course_code: string;
}

interface Props {
  institutionId: string | undefined;
  filters: Partial<MarkEntryFilterState>;
  onFiltersChange: (filters: Partial<MarkEntryFilterState>) => void;
}

/**
 * Filter flow: Exam Session → Assessment/Round → Program → Course.
 *
 * Program comes from staff_plans (planned scopes), exactly like Question Papers —
 * "mark entry only for what staff planning assigned". Course comes from the
 * session's REGISTRATIONS rather than the course-mapping curriculum, which has
 * two advantages: every listed course provably has learners to mark, and the list
 * needs no semester_code join (registrations already carry the semester).
 */
export function MarkEntryFilters({ institutionId, filters, onFiltersChange }: Props) {
  const { isSuperAdmin } = usePermissions();
  const { institutions, loading: isLoadingInstitutions } = useInstitutionsWithAccess({
    autoFetch: isSuperAdmin,
  });

  const { data: examSessions, isLoading: isLoadingExam } = useExamSessions(institutionId);
  const selectedSession = examSessions?.find((s) => s.id === filters.exam_session_id);
  const academicYearId = selectedSession?.academic_year_id;
  const examStartDate = selectedSession?.exam_start_date ?? selectedSession?.start_date;

  const { data: ciaSettings, isLoading: isLoadingSettings } = useCiaSettings(
    institutionId, filters.exam_session_id
  );
  const { data: plannedScopes, isLoading: isLoadingScopes } = usePlannedScopes(
    institutionId, academicYearId, examStartDate
  );
  const { data: registrations, isLoading: isLoadingReg } = useRegistrations({
    institutionId,
    examSessionId: filters.exam_session_id,
    programCode: filters.program_code,
  });

  const programs = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of plannedScopes ?? []) if (!map.has(s.program_code)) map.set(s.program_code, s.program_name);
    return [...map.entries()].map(([code, name]) => ({ code, name }));
  }, [plannedScopes]);

  /** Distinct courses with at least one regular registration, grouped by semester. */
  const courses = useMemo(() => {
    const map = new Map<string, { code: string; name: string; semester?: string }>();
    for (const r of registrations ?? []) {
      if (!r.is_regular || !r.course_code) continue;
      if (!map.has(r.course_code)) {
        map.set(r.course_code, {
          code: r.course_code,
          name: r.course_name ?? '',
          semester: r.semester_code,
        });
      }
    }
    return [...map.values()].sort(
      (a, b) => (a.semester ?? '').localeCompare(b.semester ?? '') || a.code.localeCompare(b.code)
    );
  }, [registrations]);

  const [programOpen, setProgramOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);
  const selectedProgram = programs.find((p) => p.code === filters.program_code);
  const selectedCourse = courses.find((c) => c.code === filters.course_code);

  const handleSession = (id: string) => {
    const session = examSessions?.find((s) => s.id === id);
    onFiltersChange({
      institution_id: filters.institution_id,
      exam_session_id: id,
      setting_id: '',
      cia_round: undefined,
      program_code: '',
      course_code: '',
    });
    void session;
  };

  const handleRound = (value: string) => {
    const [settingId, roundStr] = value.split('__');
    onFiltersChange({
      ...filters,
      setting_id: settingId,
      cia_round: Number(roundStr),
      program_code: '',
      course_code: '',
    });
  };

  const handleClear = () => onFiltersChange({ institution_id: filters.institution_id });
  const activeCount = [
    filters.exam_session_id, filters.setting_id, filters.program_code, filters.course_code,
  ].filter(Boolean).length;

  const noScopes =
    (!!academicYearId || !!examStartDate) && !isLoadingScopes && (plannedScopes ?? []).length === 0;

  return (
    <div className='space-y-4'>
      <div
        className={cn(
          'grid grid-cols-1 gap-4 md:grid-cols-2',
          isSuperAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
        )}
      >
        {isSuperAdmin && (
          <div className='space-y-1.5'>
            <Label className='text-xs font-medium'>Institution</Label>
            <Select
              value={filters.institution_id || ''}
              onValueChange={(v) => onFiltersChange({ institution_id: v })}
              disabled={isLoadingInstitutions}
            >
              <SelectTrigger>
                <SelectValue placeholder={isLoadingInstitutions ? 'Loading…' : 'Select Institution'} />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className='space-y-1.5'>
          <Label className='text-xs font-medium'>Exam Session</Label>
          <Select
            value={filters.exam_session_id || ''}
            onValueChange={handleSession}
            disabled={!institutionId || isLoadingExam}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !institutionId
                    ? isSuperAdmin ? 'Select institution first' : 'No institution assigned'
                    : isLoadingExam ? 'Loading…'
                    : (examSessions ?? []).length === 0 ? 'No exam sessions'
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

        {/* Assessment + Round. The entry mode is shown here so the user knows
            which tab they will land on BEFORE picking a course. */}
        <div className='space-y-1.5'>
          <Label className='text-xs font-medium'>Assessment / Round</Label>
          <Select
            value={filters.setting_id && filters.cia_round != null
              ? `${filters.setting_id}__${filters.cia_round}` : ''}
            onValueChange={handleRound}
            disabled={!filters.exam_session_id || isLoadingSettings}
          >
            <SelectTrigger>
              <SelectValue placeholder={isLoadingSettings ? 'Loading…' : 'Select Assessment'} />
            </SelectTrigger>
            <SelectContent className='max-w-[calc(100vw-2rem)] sm:max-w-[460px]'>
              {(ciaSettings ?? []).flatMap((s) =>
                s.cia_rounds.map((r) => {
                  const status = getEntryWindowStatus(r);
                  const isOpen = status === 'open' || status === 'no-dates';
                  const { entryFrom } = resolveRoundDates(r);
                  const mode = resolveMarkEntryType(r);
                  return (
                    <SelectItem
                      key={`${s.id}__${r.round}`}
                      value={`${s.id}__${r.round}`}
                      disabled={!isOpen}
                      className={cn(!isOpen && 'opacity-60')}
                    >
                      <div className='flex w-full items-center gap-2'>
                        <span
                          className={cn('h-2 w-2 shrink-0 rounded-full', {
                            'bg-emerald-500': status === 'open',
                            'bg-red-500': status === 'expired',
                            'bg-amber-500': status === 'upcoming',
                            'bg-gray-400': status === 'no-dates',
                          })}
                        />
                        <span className={cn('flex-1', status === 'expired' && 'line-through')}>
                          {s.setting_name} — {r.round_name}
                        </span>
                        <Badge variant='outline' className='shrink-0 text-[9px]'>
                          {mode === 'question_wise' ? 'Question-wise' : 'Direct'}
                        </Badge>
                        {status === 'expired' && <span className='text-[10px] text-red-500'>Closed</span>}
                        {status === 'upcoming' && entryFrom && (
                          <span className='text-[10px] text-amber-600'>Opens {entryFrom}</span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })
              )}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs font-medium'>Program</Label>
          <Popover open={programOpen} onOpenChange={setProgramOpen}>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                role='combobox'
                aria-expanded={programOpen}
                disabled={!filters.setting_id || isLoadingScopes}
                className='w-full justify-between font-normal'
              >
                <span className='truncate text-left'>
                  {selectedProgram
                    ? `${selectedProgram.name} (${selectedProgram.code})`
                    : isLoadingScopes ? 'Loading…' : 'Select Program'}
                </span>
                <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-[var(--radix-popover-trigger-width)] p-0' align='start'>
              <Command>
                <CommandInput placeholder='Search program…' />
                <CommandList>
                  <CommandEmpty>No program found.</CommandEmpty>
                  <CommandGroup>
                    {programs.map((p) => (
                      <CommandItem
                        key={p.code}
                        value={`${p.name} ${p.code}`}
                        onSelect={() => {
                          onFiltersChange({ ...filters, program_code: p.code, course_code: '' });
                          setProgramOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4 shrink-0',
                            filters.program_code === p.code ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <span className='truncate'>
                          {p.name} <span className='text-muted-foreground'>({p.code})</span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs font-medium'>Course</Label>
          <Popover open={courseOpen} onOpenChange={setCourseOpen}>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                role='combobox'
                aria-expanded={courseOpen}
                disabled={!filters.program_code || isLoadingReg}
                className='h-auto min-h-9 w-full justify-between py-2 font-normal'
              >
                <span className='truncate text-left'>
                  {selectedCourse
                    ? `${selectedCourse.code}${selectedCourse.name ? ` - ${selectedCourse.name}` : ''}`
                    : isLoadingReg ? 'Loading…'
                    : courses.length === 0 ? 'No registered courses'
                    : 'Search course…'}
                </span>
                <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className='w-[calc(100vw-2rem)] max-w-[460px] p-0 sm:w-[460px]'
              align='start'
            >
              <Command>
                <CommandInput placeholder='Search by code or name…' />
                <CommandList>
                  <CommandEmpty>No course found.</CommandEmpty>
                  <CommandGroup>
                    {courses.map((c) => (
                      <CommandItem
                        key={c.code}
                        value={`${c.code} ${c.name}`}
                        onSelect={() => {
                          onFiltersChange({ ...filters, course_code: c.code });
                          setCourseOpen(false);
                        }}
                        className='flex items-start gap-2'
                      >
                        <Check
                          className={cn(
                            'mt-0.5 h-4 w-4 shrink-0',
                            filters.course_code === c.code ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <div className='min-w-0'>
                          <span className='font-mono text-xs font-medium'>{c.code}</span>
                          {c.semester && (
                            <span className='ml-2 text-[10px] text-muted-foreground'>
                              {c.semester}
                            </span>
                          )}
                          {c.name && (
                            <span className='block whitespace-normal text-xs text-muted-foreground'>
                              {c.name}
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

      {noScopes && (
        <p className='text-xs text-amber-600'>
          No staff-planned programs found for this session&apos;s academic year. Create a Staff Plan
          first — subjects are only shown once they are planned.
        </p>
      )}

      {activeCount > 0 && (
        <Button variant='ghost' size='sm' onClick={handleClear} className='text-muted-foreground'>
          <X className='mr-1 h-4 w-4' /> Clear filters ({activeCount})
        </Button>
      )}
    </div>
  );
}
