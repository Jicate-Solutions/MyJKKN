'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useBosBoards } from '@/hooks/bos/use-bos-boards';
import { useBosTaxonomies } from '@/hooks/bos/use-bos-taxonomies';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';

const INHERIT = '__inherit__';

interface AssignmentRow { regulation_id: string; board_id: string | null; taxonomy_type: string; }

/**
 * Single inline-editable table: one framework dropdown per board.
 *   • Regulation default row (top) sets the framework every board inherits.
 *   • Each board row: "Inherit default" or a specific framework override.
 * Changing a dropdown saves immediately (POST to set, DELETE to revert to inherit);
 * k_values are derived server-side from the framework, so the client just sends a code.
 */
export function BoardTaxonomyTable({
  regulationId,
  institutionId,
}: {
  regulationId: string;
  institutionId?: string;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const boardsQuery = useBosBoards(institutionId);
  const boards = (boardsQuery.data ?? [])
    // Hide the COE placeholder "None" board — it isn't a real Board of Studies.
    .filter((b) => b.board_name?.trim().toLowerCase() !== 'none' && b.board_code?.trim().toLowerCase() !== 'none')
    .slice()
    .sort((a, b) => (a.board_order ?? 0) - (b.board_order ?? 0));

  const assignmentsQuery = useQuery<AssignmentRow[]>({
    queryKey: ['bos', 'taxonomy-assignments', 'by-reg', regulationId, institutionId],
    queryFn: async () => {
      const qs = institutionId ? `?institutionsId=${encodeURIComponent(institutionId)}` : '';
      const res = await fetch(`/api/bos/taxonomy${qs}`);
      if (!res.ok) throw new Error('Failed to load taxonomy assignments');
      const json = await res.json();
      return (json.data ?? []).filter((r: AssignmentRow) => r.regulation_id === regulationId);
    },
    enabled: !!regulationId,
  });
  const byGrain = new Map<string, string>();
  for (const r of assignmentsQuery.data ?? []) byGrain.set(r.board_id ?? '', r.taxonomy_type);
  const defaultType = byGrain.get('');

  const taxonomiesQuery = useBosTaxonomies();
  const frameworks = useMemo(() => {
    const seen = new Set<string>();
    return (taxonomiesQuery.data?.data ?? [])
      .filter((t) => (seen.has(t.code) ? false : (seen.add(t.code), true)))
      .map((t) => ({ code: t.code, label: t.name }));
  }, [taxonomiesQuery.data]);

  const q = search.trim().toLowerCase();
  const filteredBoards = q
    ? boards.filter((b) => `${b.board_name} ${b.board_code}`.toLowerCase().includes(q))
    : boards;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['bos', 'taxonomy-assignments'] });
    queryClient.invalidateQueries({ queryKey: ['bos', 'regulation-taxonomy-config', regulationId] });
    queryClient.invalidateQueries({ queryKey: ['bos', 'taxonomy'] });
  };

  // boardKey '' = the regulation-wide default row.
  const onChange = async (boardKey: string, value: string) => {
    setSavingKey(boardKey || '__default__');
    try {
      if (value === INHERIT) {
        const res = await fetch(`/api/bos/taxonomy/${regulationId}?boardId=${encodeURIComponent(boardKey)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to revert');
        toast.success('Reverted to regulation default');
      } else {
        const res = await fetch(`/api/bos/taxonomy/${regulationId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taxonomy_type: value, board_id: boardKey || null }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save');
        toast.success('Taxonomy updated');
      }
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingKey(null);
    }
  };

  const FrameworkSelect = ({ boardKey, current, allowInherit }: { boardKey: string; current?: string; allowInherit: boolean }) => {
    const saving = savingKey === (boardKey || '__default__');
    return (
      <div className='flex items-center gap-2'>
        <Select value={current ?? (allowInherit ? INHERIT : '')} onValueChange={(v) => onChange(boardKey, v)} disabled={saving}>
          <SelectTrigger className='h-8 w-56'>
            <SelectValue placeholder={allowInherit ? 'Inherit default' : 'Select framework'} />
          </SelectTrigger>
          <SelectContent>
            {allowInherit && (
              <SelectItem value={INHERIT}>
                Inherit default{defaultType ? ` · ${frameworks.find((f) => f.code === defaultType)?.label ?? defaultType}` : ''}
              </SelectItem>
            )}
            {frameworks.map((f) => (
              <SelectItem key={f.code} value={f.code}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {saving && <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />}
      </div>
    );
  };

  return (
    <div className='space-y-3'>
      {boards.length > 5 && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='Search board by name or code…'
          className='h-8 max-w-xs'
        />
      )}
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-14 text-center'>S.No</TableHead>
              <TableHead>Board</TableHead>
              <TableHead className='w-72'>Taxonomy framework</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Regulation-wide default */}
            <TableRow className='bg-muted/40'>
              <TableCell className='text-center text-muted-foreground'>—</TableCell>
              <TableCell className='font-medium'>
                Regulation default <span className='text-xs text-muted-foreground'>(all boards)</span>
              </TableCell>
              <TableCell>
                <FrameworkSelect boardKey='' current={defaultType} allowInherit={false} />
              </TableCell>
            </TableRow>

            {boardsQuery.isLoading || taxonomiesQuery.isLoading ? (
              <TableRow><TableCell colSpan={3}><Skeleton className='h-8 w-full' /></TableCell></TableRow>
            ) : boards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className='text-sm text-muted-foreground py-4'>
                  No boards found for this regulation’s institution.
                </TableCell>
              </TableRow>
            ) : (
              filteredBoards.map((b, i) => (
                <TableRow key={b.id}>
                  <TableCell className='text-center text-muted-foreground'>{i + 1}</TableCell>
                  <TableCell className='font-medium'>
                    {b.board_name} <span className='text-xs text-muted-foreground'>{b.board_code}</span>
                  </TableCell>
                  <TableCell>
                    <FrameworkSelect boardKey={b.id} current={byGrain.get(b.id)} allowInherit />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className='text-xs text-muted-foreground'>
        Set the regulation default once; leave boards on “Inherit default” unless they need a
        different framework. Syllabi resolve their board first, then fall back to the default.
      </p>
    </div>
  );
}
