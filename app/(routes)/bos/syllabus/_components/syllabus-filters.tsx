'use client';

import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STREAMS = ['Engineering', 'Pharmacy', 'Nursing', 'Dental', 'Arts'];

interface SyllabusFiltersProps {
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
  isSuperAdmin?: boolean;
  /**
   * Renders the Institution dropdown for non-super-admins too — pass for
   * read-all observers (holders of academic.bos-syllabus.view). Unlike
   * super-admins they get no "All institutions" entry: clearing the param
   * would just be re-seeded to their own institution by the auto-seed effect
   * in syllabus-filters-client.tsx, so a concrete pick is required.
   */
  canPickInstitution?: boolean;
  currentValues?: {
    search?: string;
    boardId?: string;
    regulationId?: string;
    stream?: string;
    institutionsId?: string;
  };
}

export function SyllabusFilters({
  onFilterChange,
  onClearFilters,
  isSuperAdmin = false,
  canPickInstitution = false,
  currentValues = {},
}: SyllabusFiltersProps) {
  const [institutionOptions, setInstitutionOptions] = useState<{ id: string; name: string }[]>([]);
  const [boardOptions, setBoardOptions] = useState<{ id: string; board_name?: string; display_name?: string }[]>([]);
  const [regulationOptions, setRegulationOptions] = useState<{ id: string; title?: string }[]>([]);
  const institutionsAbortControllerRef = useRef<AbortController | null>(null);
  const boardsAbortControllerRef = useRef<AbortController | null>(null);
  const regulationsAbortControllerRef = useRef<AbortController | null>(null);

  // Fetch institutions (super admins + read-all observers — the
  // /api/bos/institutions route authorizes observers server-side)
  const showInstitutionFilter = isSuperAdmin || canPickInstitution;
  useEffect(() => {
    if (!showInstitutionFilter) return;

    if (institutionsAbortControllerRef.current) {
      institutionsAbortControllerRef.current.abort();
    }
    institutionsAbortControllerRef.current = new AbortController();

    const fetchInstitutions = async () => {
      try {
        const res = await fetch('/api/bos/institutions', {
          signal: institutionsAbortControllerRef.current?.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setInstitutionOptions(data || []);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Failed to fetch institutions:', err);
        }
      }
    };

    fetchInstitutions();

    return () => {
      institutionsAbortControllerRef.current?.abort();
    };
  }, [showInstitutionFilter]);

  // Fetch boards, scoped to the selected institution.
  // The COE-backed /api/bos/boards route needs an institution to resolve a board
  // list; for super-admins it returns [] until one is passed, so we forward the
  // currently-selected institutionsId and refetch whenever it changes.
  useEffect(() => {
    if (boardsAbortControllerRef.current) {
      boardsAbortControllerRef.current.abort();
    }
    boardsAbortControllerRef.current = new AbortController();

    const fetchBoards = async () => {
      try {
        const url = new URL('/api/bos/boards', window.location.origin);
        if (currentValues.institutionsId) {
          url.searchParams.set('institutionsId', currentValues.institutionsId);
        }
        const res = await fetch(url.toString(), {
          signal: boardsAbortControllerRef.current?.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setBoardOptions(data.data || []);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Failed to fetch boards:', err);
        }
      }
    };

    fetchBoards();

    return () => {
      boardsAbortControllerRef.current?.abort();
    };
  }, [currentValues.institutionsId]);

  // Fetch regulations filtered by institution
  useEffect(() => {
    if (regulationsAbortControllerRef.current) {
      regulationsAbortControllerRef.current.abort();
    }
    regulationsAbortControllerRef.current = new AbortController();

    const fetchRegulations = async () => {
      try {
        const url = new URL('/api/bos/regulations', window.location.origin);
        if (currentValues.institutionsId) {
          url.searchParams.set('institutionId', currentValues.institutionsId);
        }
        const res = await fetch(url.toString(), {
          signal: regulationsAbortControllerRef.current?.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setRegulationOptions(data.data || []);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Failed to fetch regulations:', err);
        }
      }
    };

    fetchRegulations();

    return () => {
      regulationsAbortControllerRef.current?.abort();
    };
  }, [currentValues.institutionsId]);

  const gridCols = showInstitutionFilter ? 'lg:grid-cols-6' : 'lg:grid-cols-5';

  return (
    <div className='space-y-4'>
      <div className={`grid grid-cols-1 md:grid-cols-2 ${gridCols} gap-4`}>
        {/* Institution Filter (Super Admin + read-all observers) */}
        {showInstitutionFilter && (
          <div>
            <Label className='text-sm font-medium block mb-2'>Institution</Label>
            <SearchableSelect
              value={currentValues.institutionsId || 'all'}
              onValueChange={(val) => onFilterChange('institutionsId', val === 'all' ? undefined : val)}
              options={[
                // Observers get no "All institutions" — see canPickInstitution doc.
                ...(isSuperAdmin ? [{ value: 'all', label: 'All institutions' }] : []),
                ...institutionOptions.map(inst => ({ value: inst.id, label: inst.name })),
              ]}
              className='w-full'
              searchPlaceholder='Search institution…'
            />
          </div>
        )}

        {/* Board Filter */}
        <div>
          <Label className='text-sm font-medium block mb-2'>Board</Label>
          <SearchableSelect
            value={currentValues.boardId || 'all'}
            onValueChange={(val) => onFilterChange('boardId', val === 'all' ? undefined : val)}
            options={[{ value: 'all', label: 'All boards' }, ...boardOptions.map(b => ({ value: b.id, label: b.display_name ?? b.board_name ?? '—' }))]}
            className='w-full'
            searchPlaceholder='Search board…'
          />
        </div>

        {/* Regulation Filter */}
        <div>
          <Label className='text-sm font-medium block mb-2'>Regulation</Label>
          <SearchableSelect
            value={currentValues.regulationId || 'all'}
            onValueChange={(val) => onFilterChange('regulationId', val === 'all' ? undefined : val)}
            options={[{ value: 'all', label: 'All regulations' }, ...regulationOptions.map(reg => ({ value: reg.id, label: reg.title ?? '—' }))]}
            className='w-full'
            searchPlaceholder='Search regulation…'
          />
        </div>

        {/* Stream Filter */}
        <div>
          <Label className='text-sm font-medium block mb-2'>Stream</Label>
          <SearchableSelect
            value={currentValues.stream || 'all'}
            onValueChange={(val) => onFilterChange('stream', val === 'all' ? undefined : val)}
            options={[{ value: 'all', label: 'All streams' }, ...STREAMS.map(s => ({ value: s, label: s }))]}
            className='w-full'
            searchPlaceholder='Search stream…'
          />
        </div>

        {/* Search */}
        <div>
          <Label className='text-sm font-medium block mb-2'>Search</Label>
          <Input
            placeholder='Search by code or name...'
            value={currentValues.search || ''}
            onChange={(e) => onFilterChange('search', e.target.value || undefined)}
          />
        </div>

        {/* Clear Button */}
        <div className='flex items-end'>
          <Button
            variant='outline'
            onClick={onClearFilters}
            className='w-full'
          >
            Clear Filters
          </Button>
        </div>
      </div>
    </div>
  );
}
