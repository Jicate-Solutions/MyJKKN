'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, Loader2, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { BosBoardProgramme } from '@/types/bos';

interface AvailableProgramme {
  id: string;
  program_code: string;
  program_name: string;
}

interface BoardProgrammesCardProps {
  boardId: string;
  institutionsId: string;
  /** All sibling institution UUIDs (Aided + Self for CAS). Defaults to [institutionsId]. */
  allInstitutionIds?: string[];
  canEdit: boolean;
}

export function BoardProgrammesCard({
  boardId,
  institutionsId,
  allInstitutionIds,
  canEdit,
}: BoardProgrammesCardProps) {
  // Resolve all sibling IDs for CAS institutions (Aided + Self share same COE code).
  const effectiveIds = allInstitutionIds?.length ? allInstitutionIds : [institutionsId];
  const queryClient = useQueryClient();
  const [selectedCode, setSelectedCode] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingCode, setRemovingCode] = useState<string | null>(null);

  const boardProgrammesKey = ['bos', 'board-programmes', boardId];

  // Programmes already assigned to this board
  const assignedQuery = useQuery<{ data: BosBoardProgramme[] }>({
    queryKey: boardProgrammesKey,
    queryFn: async () => {
      const res = await fetch(`/api/bos/boards/${boardId}/programmes`);
      if (!res.ok) throw new Error('Failed to load board programmes');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // All programmes for this institution (COE-synced `programs` table).
  // Uses all sibling IDs so CAS Aided+Self institutions both contribute their programmes.
  const allProgrammesQuery = useQuery<{ data: AvailableProgramme[] }>({
    queryKey: ['bos', 'institution-programs', effectiveIds.join(',')],
    queryFn: async () => {
      const param = effectiveIds.length === 1
        ? `institutionId=${effectiveIds[0]}`
        : `institutionIds=${effectiveIds.join(',')}`;
      const res = await fetch(`/api/bos/programs?${param}`);
      if (!res.ok) return { data: [] };
      return res.json();
    },
    enabled: canEdit,
    staleTime: 10 * 60 * 1000,
  });

  const assigned = assignedQuery.data?.data ?? [];
  const assignedCodes = new Set(assigned.map((p) => p.programme_code));
  const available = (allProgrammesQuery.data?.data ?? []).filter(
    (p) => !assignedCodes.has(p.program_code)
  );

  const handleAdd = async () => {
    if (!selectedCode) return;
    const prog = allProgrammesQuery.data?.data.find((p) => p.program_code === selectedCode);
    setAdding(true);
    try {
      const res = await fetch(`/api/bos/boards/${boardId}/programmes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programme_code: selectedCode,
          programme_name: prog?.program_name ?? selectedCode,
          institutions_id: institutionsId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to add programme');
      }
      const inserted = (await res.json()) as BosBoardProgramme;
      // Optimistic write: push the inserted row into the cache so the list
      // re-renders this tick, instead of waiting for the background refetch.
      queryClient.setQueryData<{ data: BosBoardProgramme[] }>(
        boardProgrammesKey,
        (old) => {
          const existing = old?.data ?? [];
          if (existing.some((p) => p.programme_code === inserted.programme_code)) {
            return { data: existing };
          }
          return { data: [...existing, inserted] };
        },
      );
      toast.success(`${selectedCode} added to board`);
      setSelectedCode('');
      queryClient.invalidateQueries({ queryKey: boardProgrammesKey });
      // Also refresh the regulation-programmes view which aggregates from board_programmes
      queryClient.invalidateQueries({ queryKey: ['bos', 'regulation-programmes'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add programme');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (programmeCode: string) => {
    setRemovingCode(programmeCode);
    try {
      const res = await fetch(
        `/api/bos/boards/${boardId}/programmes?programmeCode=${programmeCode}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to remove programme');
      }
      // Optimistic write: drop the removed row from cache immediately so the
      // list re-renders this tick. The DELETE endpoint is a soft-delete
      // (is_active=false) and the GET filters on is_active=true, so removing
      // the row from cache matches what the eventual refetch will return.
      queryClient.setQueryData<{ data: BosBoardProgramme[] }>(
        boardProgrammesKey,
        (old) => ({
          data: (old?.data ?? []).filter((p) => p.programme_code !== programmeCode),
        }),
      );
      toast.success(`${programmeCode} removed from board`);
      queryClient.invalidateQueries({ queryKey: boardProgrammesKey });
      queryClient.invalidateQueries({ queryKey: ['bos', 'regulation-programmes'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove programme');
    } finally {
      setRemovingCode(null);
    }
  };

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-base flex items-center gap-2'>
            <GraduationCap className='h-4 w-4' />
            Programmes Governed by this Board
            {assigned.length > 0 && (
              <Badge variant='secondary' className='text-xs font-normal'>
                {assigned.length}
              </Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Assigned programmes list */}
        {assignedQuery.isLoading ? (
          <div className='space-y-2'>
            {[1, 2].map((i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        ) : assigned.length === 0 ? (
          <div className='flex items-center gap-2 py-4 text-sm text-muted-foreground border rounded-md px-4 border-dashed'>
            <GraduationCap className='h-4 w-4 shrink-0' />
            No programmes assigned to this board yet.
          </div>
        ) : (
          <div className='space-y-2'>
            {assigned.map((prog) => (
              <div
                key={prog.programme_code}
                className='flex items-center justify-between rounded-md border px-4 py-2.5'
              >
                <div className='flex items-center gap-3'>
                  <Badge variant='outline' className='font-mono text-xs shrink-0'>
                    {prog.programme_code}
                  </Badge>
                  <span className='text-sm'>
                    {prog.programme_name ?? prog.programme_code}
                  </span>
                </div>
                {canEdit && (
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-7 w-7 text-muted-foreground hover:text-destructive shrink-0'
                    disabled={removingCode === prog.programme_code}
                    onClick={() => handleRemove(prog.programme_code)}
                  >
                    {removingCode === prog.programme_code ? (
                      <Loader2 className='h-3.5 w-3.5 animate-spin' />
                    ) : (
                      <Trash2 className='h-3.5 w-3.5' />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add programme picker */}
        {canEdit && (
          <div className='flex items-center gap-2 pt-1'>
            <SearchableSelect
              value={selectedCode}
              onValueChange={setSelectedCode}
              options={available.map((p) => ({
                value: p.program_code,
                label: `${p.program_code} — ${p.program_name}`,
              }))}
              placeholder='Select programme to add…'
              searchPlaceholder='Search programmes…'
              emptyMessage={
                allProgrammesQuery.isLoading
                  ? 'Loading…'
                  : available.length === 0
                    ? 'All programmes assigned'
                    : 'No programmes found.'
              }
              loading={allProgrammesQuery.isLoading}
              className='flex-1'
            />
            <Button
              size='sm'
              disabled={!selectedCode || adding}
              onClick={handleAdd}
            >
              {adding ? (
                <Loader2 className='h-4 w-4 mr-1 animate-spin' />
              ) : (
                <Plus className='h-4 w-4 mr-1' />
              )}
              Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
