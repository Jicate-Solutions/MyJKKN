'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useBosProgramOptions, useBosRegulationOptions } from '@/hooks/bos/use-bos-scheme-options';
import type { SchemeFilters } from '@/hooks/bos/use-bos-course-scheme';

export function SchemeFiltersBar({
  institutionId,
  myjkknInstitutionIds,
  value,
  onChange,
  isSuperAdmin = false,
}: {
  institutionId: string;
  /** All related MyJKKN UUIDs for the selected institution (>1 for CAS Aided+Self). */
  myjkknInstitutionIds?: string[];
  value: SchemeFilters | null;
  onChange: (v: SchemeFilters | null) => void;
  /** When true, bypass BoS board-member scoping on the Program dropdown. */
  isSuperAdmin?: boolean;
}) {
  const [program, setProgram] = useState(value?.program_code ?? '');
  const [regulation, setRegulation] = useState(value?.regulation_code ?? '');

  // Reset when institution changes.
  useEffect(() => {
    setProgram('');
    setRegulation('');
    onChange(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId]);

  // Use all related IDs for CAS Aided+Self; fall back to single institutionId.
  const lookupIds = myjkknInstitutionIds && myjkknInstitutionIds.length > 0
    ? myjkknInstitutionIds
    : institutionId;

  // Non-super-admin users see only programmes governed by a BoS board they
  // belong to (any member_type), unless they hold an institution-wide governor
  // role (principal/HOD/etc) — see CHAIRMAN_ROLES in /api/bos/programs.
  // The flag is presence-only on the server; the value itself is ignored.
  const programScopeId = isSuperAdmin ? undefined : institutionId;

  const { data: programsData, isLoading: programsLoading } = useBosProgramOptions(lookupIds, programScopeId);
  const { data: regulationsData, isLoading: regulationsLoading } = useBosRegulationOptions(lookupIds);

  const programs = programsData?.data ?? [];
  const regulations = regulationsData?.data ?? [];

  const apply = (p = program, r = regulation) => {
    if (!p || !r) return onChange(null);
    onChange({ institution_id: institutionId, program_code: p, regulation_code: r });
  };

  return (
    <div className='flex gap-3 flex-wrap items-end'>
      <div className='space-y-1'>
        <Label className='text-xs'>Program</Label>
        <SearchableSelect
          value={program}
          onValueChange={(val) => { setProgram(val); apply(val, regulation); }}
          options={programs.map((p) => ({ value: p.program_code, label: `${p.program_code} — ${p.program_name}` }))}
          loading={programsLoading}
          disabled={programs.length === 0 && !programsLoading}
          placeholder='Select program'
          searchPlaceholder='Search program…'
          className='w-[220px]'
        />
      </div>

      <div className='space-y-1'>
        <Label className='text-xs'>Regulation</Label>
        <SearchableSelect
          value={regulation}
          onValueChange={(val) => { setRegulation(val); apply(program, val); }}
          options={regulations.map((r) => ({ value: r.regulation_code, label: r.regulation_year ? `${r.regulation_code} (${r.regulation_year})` : r.regulation_code }))}
          loading={regulationsLoading}
          disabled={regulations.length === 0 && !regulationsLoading}
          placeholder='Select regulation'
          searchPlaceholder='Search regulation…'
          className='w-[160px]'
        />
      </div>
    </div>
  );
}
