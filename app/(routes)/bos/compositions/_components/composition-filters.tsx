'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { CompositionSearchParams } from './data-table-schema';
import { usePermissions } from '@/hooks/use-permissions';
import { logger } from '@/lib/utils/enhanced-logger';

interface Board {
  id: string;
  board_code: string;
  board_name: string;
}

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
  const { userProfile } = usePermissions();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);

  useEffect(() => {
    if (!userProfile?.institution_id) return;

    async function fetchBoards() {
      setLoadingBoards(true);
      try {
        const res = await fetch(
          `/api/bos/boards?institutionsId=${userProfile!.institution_id}`
        );
        if (res.ok) setBoards(await res.json());
      } catch (error) {
        logger.error('academic/bos', 'Failed to fetch boards for filter', error);
      } finally {
        setLoadingBoards(false);
      }
    }
    fetchBoards();
  }, [userProfile?.institution_id]);

  const hasActiveFilters = !!(
    searchParams.board_id ||
    searchParams.academic_year ||
    searchParams.is_active
  );

  return (
    <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
        {/* Board Filter */}
        <div className='min-w-[220px]'>
          <Select
            value={searchParams.board_id ?? 'all'}
            disabled={loadingBoards}
            onValueChange={(v) => onFilterChange('board_id', v === 'all' ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingBoards ? 'Loading...' : 'All Boards'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Boards</SelectItem>
              {boards.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.board_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
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
          Reset
          <RotateCcw className='ml-2 h-4 w-4' />
        </Button>
      )}
    </div>
  );
}
