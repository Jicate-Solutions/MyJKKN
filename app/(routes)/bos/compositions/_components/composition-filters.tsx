'use client';

import { useEffect, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { CompositionSearchParams } from './data-table-schema';

interface Board { id: string; board_code: string; board_name: string; }
interface BosInstitutionOption { id: string; name: string; institution_code: string; myjkkn_institution_ids: string[]; }

interface CompositionFiltersProps {
  searchParams: CompositionSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function CompositionFilters({
  searchParams,
  onFilterChange,
  onClearFilters,
}: CompositionFiltersProps) {
  // Self-contained permission check — not reliant on prop from parent.
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  // Own institution context for non-admin users.
  const { data: ownCtx, isLoading: ownCtxLoading } = useInstitutionContext();

  // All institutions — fetched from COE API (canonical names, CAS Aided+SF deduped).
  const { data: allInstitutions = [], isLoading: institutionsLoading } = useQuery<BosInstitutionOption[]>({
    queryKey: ['bos', 'institutions'],
    queryFn: async () => {
      const r = await fetch('/api/bos/institutions');
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!isSuperAdmin,
    staleTime: 5 * 60 * 1000,
  });

  // Board fetch: pass MyJKKN institution UUID directly.  The server handles
  // CAS sibling resolution (Aided+SF) via counselling_code lookup internally.
  const boardInstitutionId = isSuperAdmin
    ? (searchParams.institutionsId ?? null)
    : (ownCtx?.myjkkn_id ?? null);

  const prevIdRef = useRef(boardInstitutionId);

  const { data: boardsRaw = [], isLoading: loadingBoards } = useQuery<Board[]>({
    queryKey: ['bos', 'boards', boardInstitutionId],
    enabled: !!boardInstitutionId,
    queryFn: async () => {
      const res = await fetch(`/api/bos/boards?institutionsId=${boardInstitutionId}`);
      if (!res.ok) return [];
      const json = await res.json();
      return (Array.isArray(json) ? json : (json?.data ?? [])) as Board[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Clear board filter when institution changes.
  useEffect(() => {
    if (prevIdRef.current !== boardInstitutionId) {
      prevIdRef.current = boardInstitutionId;
      onFilterChange('board_id', undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardInstitutionId]);

  // While permissions or own context are resolving, show placeholders to avoid flicker.
  if (permissionsLoading || (!isSuperAdmin && ownCtxLoading)) {
    return (
      <div className='flex gap-3 flex-wrap'>
        <Skeleton className='h-9 w-[220px]' />
        <Skeleton className='h-9 w-[220px]' />
        <Skeleton className='h-9 w-[140px]' />
      </div>
    );
  }

  const hasActiveFilters = !!(
    searchParams.board_id ||
    searchParams.academic_year ||
    searchParams.is_active ||
    searchParams.institutionsId
  );

  return (
    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-wrap'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap'>

        {/* Institution dropdown — super-admin ONLY */}
        {isSuperAdmin && (
          <div className='min-w-[220px]'>
            <SearchableSelect
              value={searchParams.institutionsId || 'all'}
              onValueChange={(val) =>
                onFilterChange('institutionsId', val === 'all' ? undefined : val)
              }
              options={[
                { value: 'all', label: 'All Institutions' },
                ...allInstitutions.map((i) => ({ value: i.id, label: i.name })),
              ]}
              loading={institutionsLoading}
              className='w-full'
              searchPlaceholder='Search institution…'
            />
          </div>
        )}

        {/* Board filter — scoped to user's institution automatically */}
        <div className='min-w-[220px]'>
          <SearchableSelect
            value={searchParams.board_id ?? 'all'}
            onValueChange={(v) => onFilterChange('board_id', v === 'all' ? undefined : v)}
            options={[
              { value: 'all', label: 'All Boards' },
              ...boardsRaw.map((b) => ({ value: b.id, label: b.board_name })),
            ]}
            loading={loadingBoards}
            disabled={!boardInstitutionId}
            className='w-full'
            searchPlaceholder='Search board…'
          />
        </div>

        {/* Status filter */}
        <div className='min-w-[140px]'>
          <Select
            value={searchParams.is_active ?? 'all'}
            onValueChange={(v) => onFilterChange('is_active', v === 'all' ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder='All Status' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Status</SelectItem>
              <SelectItem value='true'>Active</SelectItem>
              <SelectItem value='false'>Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasActiveFilters && (
        <Button variant='ghost' onClick={onClearFilters} className='h-8 px-2 lg:px-3'>
          Reset <RotateCcw className='ml-2 h-4 w-4' />
        </Button>
      )}
    </div>
  );
}
