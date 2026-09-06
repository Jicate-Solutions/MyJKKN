'use client';

import { useMemo, useState } from 'react';
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
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useExamSessions, useCiaSettings } from '@/hooks/internal-marks/use-cia-settings';
import { usePlannedScopes } from '@/hooks/question-papers/use-question-papers';

export interface QuestionPaperFilterState {
  institution_id?: string;
  exam_session_id: string;
  academic_year_id?: string;
  setting_id: string;
  cia_round?: number;
  cia_round_name?: string;
  program_code: string;
  semester?: number;
}

interface Props {
  /** Resolved by the parent page (super-admin pick vs profile.institution_id). */
  institutionId: string | undefined;
  filters: Partial<QuestionPaperFilterState>;
  onFiltersChange: (filters: Partial<QuestionPaperFilterState>) => void;
}

/**
 * Filter flow: Exam Session → Assessment/Round → Program → Semester.
 * Program + Semester come ONLY from staff_plans (planned scopes) for the exam
 * session's academic year — subjects are "only visible per staff planning".
 */
export function QuestionPaperFilters({ institutionId, filters, onFiltersChange }: Props) {
  const { isSuperAdmin } = usePermissions();
  const { institutions, loading: isLoadingInstitutions } = useInstitutionsWithAccess({
    autoFetch: isSuperAdmin,
  });

  const { data: examSessions, isLoading: isLoadingExam } = useExamSessions(institutionId);
  const selectedSession = examSessions?.find((s) => s.id === filters.exam_session_id);
  const academicYearId = selectedSession?.academic_year_id;
  // The deployed COE API may omit academic_year_id — the exam start date lets the
  // server resolve the year by matching MyJKKN academic_years windows.
  const examStartDate = selectedSession?.exam_start_date ?? selectedSession?.start_date;

  const { data: ciaSettings, isLoading: isLoadingSettings } = useCiaSettings(
    institutionId, filters.exam_session_id
  );

  const { data: plannedScopes, isLoading: isLoadingScopes } = usePlannedScopes(
    institutionId, academicYearId, examStartDate
  );

  // Distinct programs from planned scopes.
  const programs = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of plannedScopes ?? []) if (!map.has(s.program_code)) map.set(s.program_code, s.program_name);
    return [...map.entries()].map(([code, name]) => ({ code, name }));
  }, [plannedScopes]);

  // Semesters planned for the chosen program.
  const semesters = useMemo(
    () =>
      (plannedScopes ?? [])
        .filter((s) => s.program_code === filters.program_code)
        .map((s) => ({ number: s.semester_number, name: s.semester_name }))
        .sort((a, b) => a.number - b.number),
    [plannedScopes, filters.program_code]
  );

  const [programOpen, setProgramOpen] = useState(false);
  const selectedProgram = programs.find((p) => p.code === filters.program_code);

  const handleSession = (id: string) => {
    const session = examSessions?.find((s) => s.id === id);
    onFiltersChange({
      institution_id: filters.institution_id,
      exam_session_id: id,
      academic_year_id: session?.academic_year_id,
      setting_id: '',
      cia_round: undefined,
      cia_round_name: undefined,
      program_code: '',
      semester: undefined,
    });
  };

  const handleRound = (value: string) => {
    const [settingId, roundStr] = value.split('__');
    const setting = ciaSettings?.find((s) => s.id === settingId);
    const round = setting?.cia_rounds.find((r) => r.round === Number(roundStr));
    // Round is chosen LAST — it must not reset the already-picked program/semester.
    onFiltersChange({
      ...filters,
      setting_id: settingId,
      cia_round: Number(roundStr),
      cia_round_name: round?.round_name,
    });
  };

  const handleClear = () => onFiltersChange({ institution_id: filters.institution_id });
  const activeCount = [
    filters.exam_session_id, filters.setting_id, filters.program_code,
    filters.semester != null ? '1' : '',
  ].filter(Boolean).length;

  // We can gate if we have EITHER an explicit academic year OR an exam date to
  // resolve it from. Only truly stuck when neither is available.
  const canResolveYear = !!academicYearId || !!examStartDate;
  const noYear = !!filters.exam_session_id && !canResolveYear;
  const noScopes =
    canResolveYear && !isLoadingScopes && (plannedScopes ?? []).length === 0;

  return (
    <div className='space-y-4'>
      <div
        className={cn(
          'grid grid-cols-1 md:grid-cols-2 gap-4',
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

        {/* Exam Session */}
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

        {/* Program (planned + scoped to the user's own program(s)) — searchable */}
        <div className='space-y-1.5'>
          <Label className='text-xs font-medium'>Program</Label>
          <Popover open={programOpen} onOpenChange={setProgramOpen}>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                role='combobox'
                aria-expanded={programOpen}
                disabled={!filters.exam_session_id || isLoadingScopes}
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
                          onFiltersChange({ ...filters, program_code: p.code, semester: undefined });
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

        {/* Semester (planned) */}
        <div className='space-y-1.5'>
          <Label className='text-xs font-medium'>Semester</Label>
          <Select
            value={filters.semester != null ? String(filters.semester) : ''}
            onValueChange={(v) => onFiltersChange({ ...filters, semester: Number(v) })}
            disabled={!filters.program_code}
          >
            <SelectTrigger>
              <SelectValue placeholder='Select Semester' />
            </SelectTrigger>
            <SelectContent>
              {semesters.map((s) => (
                <SelectItem key={s.number} value={String(s.number)}>
                  {s.name} (Sem {s.number})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Assessment + Round — chosen last */}
        <div className='space-y-1.5'>
          <Label className='text-xs font-medium'>Assessment / Round</Label>
          <Select
            value={filters.setting_id && filters.cia_round != null
              ? `${filters.setting_id}__${filters.cia_round}` : ''}
            onValueChange={handleRound}
            disabled={!filters.semester || isLoadingSettings}
          >
            <SelectTrigger>
              <SelectValue placeholder={isLoadingSettings ? 'Loading…' : 'Select Assessment'} />
            </SelectTrigger>
            <SelectContent className='max-w-[450px]'>
              {(ciaSettings ?? []).flatMap((s) =>
                s.cia_rounds.map((r) => (
                  <SelectItem key={`${s.id}__${r.round}`} value={`${s.id}__${r.round}`}>
                    {s.setting_name} — {r.round_name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {noYear && (
        <p className='text-xs text-amber-600'>
          This exam session has no academic year linked, so planned subjects can&apos;t be matched.
          Set an academic year on the COE exam session (and ensure the COE API exposes
          <code className='mx-1'>academic_year_id</code>).
        </p>
      )}
      {noScopes && (
        <p className='text-xs text-amber-600'>
          No staff-planned programs/semesters found for this session&apos;s academic year. Create a
          Staff Plan first — subjects are only shown once they are planned.
        </p>
      )}

      {activeCount > 0 && (
        <Button variant='ghost' size='sm' onClick={handleClear} className='text-muted-foreground'>
          <X className='h-4 w-4 mr-1' /> Clear filters ({activeCount})
        </Button>
      )}
    </div>
  );
}
