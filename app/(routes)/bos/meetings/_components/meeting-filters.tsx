'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { MeetingSearchParams } from './data-table-schema';
import { usePermissions } from '@/hooks/use-permissions';
import { logger } from '@/lib/utils/enhanced-logger';

interface Board {
  id: string;
  board_code: string;
  board_name: string;
}

interface InstitutionOption {
  id: string;
  name: string;
  institution_code: string;
}

interface MeetingFiltersProps {
  searchParams: MeetingSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
  isSuperAdmin?: boolean;
}

export function MeetingFilters({
  searchParams,
  onFilterChange,
  onClearFilters,
  isSuperAdmin = false,
}: MeetingFiltersProps) {
  const { userProfile } = usePermissions();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [institutionOptions, setInstitutionOptions] = useState<InstitutionOption[]>([]);
  const institutionsAbortControllerRef = useRef<AbortController | null>(null);

  // Fetch institutions (for super admins)
  useEffect(() => {
    if (!isSuperAdmin) return;

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
  }, [isSuperAdmin]);

  // Board sub-filter still keys on institution UUID. For super-admin who picked
  // an institution_code, look the UUID up from the loaded institutionOptions;
  // for everyone else fall back to their own institution_id.
  const institutionIdForBoards = searchParams.institutionCode
    ? institutionOptions.find((o) => o.institution_code === searchParams.institutionCode)?.id
    : userProfile?.institution_id;

  useEffect(() => {
    if (!institutionIdForBoards) return;

    async function fetchBoards() {
      setLoadingBoards(true);
      try {
        const res = await fetch(
          `/api/bos/boards?institutionsId=${institutionIdForBoards}`
        );
        if (res.ok) {
          const json = await res.json();
          setBoards(Array.isArray(json) ? json : (json?.data ?? []));
        }
      } catch (error) {
        logger.error('academic/bos', 'Failed to fetch boards for filter', error);
      } finally {
        setLoadingBoards(false);
      }
    }
    fetchBoards();
  }, [institutionIdForBoards]);

  const hasActiveFilters = !!(
    searchParams.board_id ||
    searchParams.academic_year ||
    searchParams.meeting_type ||
    searchParams.institutionCode
  );

  return (
    <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap'>
        {/* Institution Filter (Super Admin Only) — keyed on institution_code
            (= counselling_code) so CAS Aided+Self resolve as one unit. */}
        {isSuperAdmin && (
          <div className='min-w-[220px]'>
            <SearchableSelect
              value={searchParams.institutionCode || 'all'}
              onValueChange={(val) =>
                onFilterChange('institutionCode', val === 'all' ? undefined : val)
              }
              options={[
                { value: 'all', label: 'All institutions' },
                ...institutionOptions.map((inst) => ({
                  value: inst.institution_code,
                  label: inst.institution_code
                    ? `${inst.name} (${inst.institution_code})`
                    : inst.name,
                })),
              ]}
              className='w-full'
              searchPlaceholder='Search institution or code…'
            />
          </div>
        )}

        {/* Board Filter */}
        <div className='min-w-[220px]'>
          <SearchableSelect
            value={searchParams.board_id ?? 'all'}
            onValueChange={(v) => onFilterChange('board_id', v === 'all' ? undefined : v)}
            options={[
              { value: 'all', label: 'All Boards' },
              ...boards.map((b) => ({ value: b.id, label: b.board_name })),
            ]}
            loading={loadingBoards}
            className='w-full'
            searchPlaceholder='Search board…'
          />
        </div>

        {/* Meeting Type Filter */}
        <div className='min-w-[160px]'>
          <Select
            value={searchParams.meeting_type ?? 'all'}
            onValueChange={(v) => onFilterChange('meeting_type', v === 'all' ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder='All Types' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Types</SelectItem>
              <SelectItem value='regular'>Regular</SelectItem>
              <SelectItem value='special'>Special</SelectItem>
              <SelectItem value='emergency'>Emergency</SelectItem>
              <SelectItem value='online'>Online</SelectItem>
              <SelectItem value='hybrid'>Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </div>

      </div>

      {hasActiveFilters && (
        <Button variant='ghost' onClick={onClearFilters} className='h-8 px-2 lg:px-3'>
          Reset
          <RotateCcw className='ml-2 h-4 w-4' />
        </Button>
      )}
    </div>
  );
}
