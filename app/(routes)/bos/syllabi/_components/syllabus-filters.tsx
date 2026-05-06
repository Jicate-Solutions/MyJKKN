'use client';

import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

const STREAMS = ['Engineering', 'Pharmacy', 'Nursing', 'Dental', 'Arts'];

interface SyllabusFiltersProps {
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
  isSuperAdmin?: boolean;
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
  currentValues = {},
}: SyllabusFiltersProps) {
  const [institutionOptions, setInstitutionOptions] = useState<{ id: string; name: string }[]>([]);
  const [boardOptions, setBoardOptions] = useState<{ id: string; name: string }[]>([]);
  const [regulationOptions, setRegulationOptions] = useState<{ id: string; name: string }[]>([]);
  const institutionsAbortControllerRef = useRef<AbortController | null>(null);
  const boardsAbortControllerRef = useRef<AbortController | null>(null);
  const regulationsAbortControllerRef = useRef<AbortController | null>(null);

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

  // Fetch boards
  useEffect(() => {
    if (boardsAbortControllerRef.current) {
      boardsAbortControllerRef.current.abort();
    }
    boardsAbortControllerRef.current = new AbortController();

    const fetchBoards = async () => {
      try {
        const res = await fetch('/api/bos/boards', {
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
  }, []);

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

  const gridCols = isSuperAdmin ? 'lg:grid-cols-6' : 'lg:grid-cols-5';

  return (
    <div className='space-y-4'>
      <div className={`grid grid-cols-1 md:grid-cols-2 ${gridCols} gap-4`}>
        {/* Institution Filter (Super Admin Only) */}
        {isSuperAdmin && (
          <div>
            <Label className='text-sm font-medium block mb-2'>Institution</Label>
            <Select
              value={currentValues.institutionsId || 'all'}
              onValueChange={(val) => onFilterChange('institutionsId', val === 'all' ? undefined : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder='All institutions' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All institutions</SelectItem>
                {institutionOptions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Search */}
        <div>
          <Label className='text-sm font-medium block mb-2'>Search</Label>
          <Input
            placeholder='Search by code or name...'
            value={currentValues.search || ''}
            onChange={(e) => onFilterChange('search', e.target.value || undefined)}
          />
        </div>

        {/* Board Filter */}
        <div>
          <Label className='text-sm font-medium block mb-2'>Board</Label>
          <Select
            value={currentValues.boardId || 'all'}
            onValueChange={(val) => onFilterChange('boardId', val === 'all' ? undefined : val)}
          >
            <SelectTrigger>
              <SelectValue placeholder='All boards' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All boards</SelectItem>
              {boardOptions.map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  {board.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Regulation Filter */}
        <div>
          <Label className='text-sm font-medium block mb-2'>Regulation</Label>
          <Select
            value={currentValues.regulationId || 'all'}
            onValueChange={(val) => onFilterChange('regulationId', val === 'all' ? undefined : val)}
          >
            <SelectTrigger>
              <SelectValue placeholder='All regulations' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All regulations</SelectItem>
              {regulationOptions.map((reg) => (
                <SelectItem key={reg.id} value={reg.id}>
                  {reg.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stream Filter */}
        <div>
          <Label className='text-sm font-medium block mb-2'>Stream</Label>
          <Select
            value={currentValues.stream || 'all'}
            onValueChange={(val) => onFilterChange('stream', val === 'all' ? undefined : val)}
          >
            <SelectTrigger>
              <SelectValue placeholder='All streams' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All streams</SelectItem>
              {STREAMS.map((stream) => (
                <SelectItem key={stream} value={stream}>
                  {stream}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
