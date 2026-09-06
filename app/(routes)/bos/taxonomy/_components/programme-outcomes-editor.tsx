'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Loader2, Plus, Trash2, ChevronDown, ChevronRight, Save, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PoPsoMappingMatrix } from './po-pso-mapping-matrix';
import {
  BosProgrammeSummary,
  BosProgrammeOutcome,
  BosProgrammeSpecificOutcome,
} from '@/types/bos';

type PoRow = { po_code: string; description: string };
type PsoRow = { pso_code: string; description: string };

function renumberPos(rows: PoRow[]): PoRow[] {
  return rows.map((r, i) => ({ ...r, po_code: `PO${i + 1}` }));
}
function renumberPsos(rows: PsoRow[]): PsoRow[] {
  return rows.map((r, i) => ({ ...r, pso_code: `PSO${i + 1}` }));
}

// ── OutcomeTable ─────────────────────────────────────────────────────────────

interface OutcomeTableProps<T extends PoRow | PsoRow> {
  rows: T[];
  codeKey: keyof T;
  canEdit: boolean;
  onUpdate: (idx: number, description: string) => void;
  onRemove: (idx: number) => void;
  placeholder: string;
}

function OutcomeTable<T extends PoRow | PsoRow>({
  rows,
  codeKey,
  canEdit,
  onUpdate,
  onRemove,
  placeholder,
}: OutcomeTableProps<T>) {
  if (rows.length === 0) return null;
  return (
    <div className='space-y-3'>
      {rows.map((row, idx) => (
        <div key={idx} className='rounded-md border p-3 space-y-2'>
          <div className='flex items-center justify-between'>
            <Badge variant='outline' className='font-mono text-xs'>
              {String(row[codeKey])}
            </Badge>
            {canEdit && (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-7 w-7'
                onClick={() => onRemove(idx)}
              >
                <Trash2 className='h-3.5 w-3.5 text-destructive' />
              </Button>
            )}
          </div>
          <Textarea
            value={row.description}
            placeholder={placeholder}
            disabled={!canEdit}
            rows={3}
            className='resize-none text-sm'
            onChange={(e) => onUpdate(idx, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

// ── ProgrammeCard ─────────────────────────────────────────────────────────────

interface ProgrammeCardProps {
  regulationId: string;
  programme: BosProgrammeSummary;
  institutionsId: string;
}

function ProgrammeCard({ regulationId, programme, institutionsId }: ProgrammeCardProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);

  const posKey = ['bos', 'programme-pos', regulationId, programme.programme_code];
  const psosKey = ['bos', 'programme-psos', regulationId, programme.programme_code];
  const programmesKey = ['bos', 'regulation-programmes', regulationId];

  const posQuery = useQuery<{ data: BosProgrammeOutcome[] }>({
    queryKey: posKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/bos/taxonomy/${regulationId}/programmes/${programme.programme_code}/pos`
      );
      if (!res.ok) throw new Error('Failed to load POs');
      return res.json();
    },
    enabled: isExpanded,
    staleTime: 5 * 60 * 1000,
  });

  const psosQuery = useQuery<{ data: BosProgrammeSpecificOutcome[] }>({
    queryKey: psosKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/bos/taxonomy/${regulationId}/programmes/${programme.programme_code}/psos`
      );
      if (!res.ok) throw new Error('Failed to load PSOs');
      return res.json();
    },
    enabled: isExpanded,
    staleTime: 5 * 60 * 1000,
  });

  const [editPos, setEditPos] = useState<PoRow[]>([]);
  const [editPsos, setEditPsos] = useState<PsoRow[]>([]);
  const posInitialized = useRef(false);
  const psosInitialized = useRef(false);
  const [savingPos, setSavingPos] = useState(false);
  const [savingPsos, setSavingPsos] = useState(false);

  useEffect(() => {
    if (posQuery.data?.data && !posInitialized.current) {
      posInitialized.current = true;
      setEditPos(
        posQuery.data.data.map((po) => ({
          po_code: po.po_code,
          description: po.description ?? '',
        }))
      );
    }
  }, [posQuery.data]);

  useEffect(() => {
    if (psosQuery.data?.data && !psosInitialized.current) {
      psosInitialized.current = true;
      setEditPsos(
        psosQuery.data.data.map((pso) => ({
          pso_code: pso.pso_code,
          description: pso.description ?? '',
        }))
      );
    }
  }, [psosQuery.data]);

  const savePOs = async () => {
    setSavingPos(true);
    try {
      const res = await fetch(
        `/api/bos/taxonomy/${regulationId}/programmes/${programme.programme_code}/pos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pos: editPos }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to save POs');
      }
      toast.success(`POs saved for ${programme.programme_code}`);
      posInitialized.current = false;
      await queryClient.invalidateQueries({ queryKey: posKey });
      queryClient.invalidateQueries({ queryKey: programmesKey });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save POs');
    } finally {
      setSavingPos(false);
    }
  };

  const savePSOs = async () => {
    setSavingPsos(true);
    try {
      const res = await fetch(
        `/api/bos/taxonomy/${regulationId}/programmes/${programme.programme_code}/psos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ psos: editPsos }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to save PSOs');
      }
      toast.success(`PSOs saved for ${programme.programme_code}`);
      psosInitialized.current = false;
      await queryClient.invalidateQueries({ queryKey: psosKey });
      queryClient.invalidateQueries({ queryKey: programmesKey });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save PSOs');
    } finally {
      setSavingPsos(false);
    }
  };

  const addPO = () =>
    setEditPos((prev) => renumberPos([...prev, { po_code: '', description: '' }]));
  const removePO = (idx: number) =>
    setEditPos((prev) => renumberPos(prev.filter((_, i) => i !== idx)));
  const updatePO = (idx: number, description: string) =>
    setEditPos((prev) => prev.map((r, i) => (i === idx ? { ...r, description } : r)));

  const addPSO = () =>
    setEditPsos((prev) => renumberPsos([...prev, { pso_code: '', description: '' }]));
  const removePSO = (idx: number) =>
    setEditPsos((prev) => renumberPsos(prev.filter((_, i) => i !== idx)));
  const updatePSO = (idx: number, description: string) =>
    setEditPsos((prev) => prev.map((r, i) => (i === idx ? { ...r, description } : r)));

  const { po_count, pso_count, can_edit } = programme;

  return (
    <div className='border rounded-md overflow-hidden'>
      {/* Card header */}
      <div
        className='flex items-center justify-between px-4 py-3 bg-muted/40 cursor-pointer select-none'
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <div className='flex items-center gap-2 flex-wrap'>
          {isExpanded ? (
            <ChevronDown className='h-4 w-4 text-muted-foreground' />
          ) : (
            <ChevronRight className='h-4 w-4 text-muted-foreground' />
          )}
          <span className='font-medium text-sm'>{programme.programme_code}</span>
          <span className='text-sm text-muted-foreground'>— {programme.programme_name}</span>
          {can_edit && (
            <Badge variant='outline' className='text-xs text-green-700 border-green-300'>
              Can Edit
            </Badge>
          )}
          <Badge variant='secondary' className='text-xs'>
            {po_count} PO{po_count !== 1 ? 's' : ''}
          </Badge>
          {pso_count > 0 && (
            <Badge variant='secondary' className='text-xs'>
              {pso_count} PSO{pso_count !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* Expanded body — tabbed POs / PSOs */}
      {isExpanded && (
        <div className='p-4'>
          <Tabs defaultValue='pos'>
            <TabsList className='mb-4 flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0'>
              <TabsTrigger value='pos'>
                Programme Outcomes
                {po_count > 0 && (
                  <Badge variant='secondary' className='ml-2 text-xs'>{po_count}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value='psos'>
                Specific Outcomes (PSO)
                {pso_count > 0 && (
                  <Badge variant='secondary' className='ml-2 text-xs'>{pso_count}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value='mapping'>PO / PSO Mapping</TabsTrigger>
            </TabsList>

            {/* POs tab */}
            <TabsContent value='pos' className='space-y-3 mt-0'>
              <div className='flex items-center justify-between'>
                <p className='text-xs text-muted-foreground'>
                  Mapped to course COs via attainment calculations
                </p>
                {can_edit && (
                  <Button size='sm' onClick={savePOs} disabled={savingPos}>
                    {savingPos ? (
                      <Loader2 className='h-3 w-3 mr-1 animate-spin' />
                    ) : (
                      <Save className='h-3 w-3 mr-1' />
                    )}
                    Save POs
                  </Button>
                )}
              </div>

              {posQuery.isLoading && <Skeleton className='h-24 w-full' />}

              {!posQuery.isLoading && (
                <>
                  <OutcomeTable
                    rows={editPos}
                    codeKey='po_code'
                    canEdit={can_edit}
                    onUpdate={updatePO}
                    onRemove={removePO}
                    placeholder='e.g. Apply engineering fundamentals to solve problems'
                  />
                  {editPos.length === 0 && (
                    <p className='text-xs text-muted-foreground text-center py-4'>
                      {can_edit ? 'No POs yet. Add the first one below.' : 'No POs configured yet.'}
                    </p>
                  )}
                  {can_edit && (
                    <Button type='button' variant='outline' size='sm' onClick={addPO}>
                      <Plus className='h-4 w-4 mr-1' />
                      Add PO
                    </Button>
                  )}
                </>
              )}
            </TabsContent>

            {/* PSOs tab */}
            <TabsContent value='psos' className='space-y-3 mt-0'>
              <div className='flex items-center justify-between'>
                <p className='text-xs text-muted-foreground'>
                  Domain-specific skills beyond standard POs (optional)
                </p>
                {can_edit && (
                  <Button size='sm' onClick={savePSOs} disabled={savingPsos}>
                    {savingPsos ? (
                      <Loader2 className='h-3 w-3 mr-1 animate-spin' />
                    ) : (
                      <Save className='h-3 w-3 mr-1' />
                    )}
                    Save PSOs
                  </Button>
                )}
              </div>

              {psosQuery.isLoading && <Skeleton className='h-16 w-full' />}

              {!psosQuery.isLoading && (
                <>
                  <OutcomeTable
                    rows={editPsos}
                    codeKey='pso_code'
                    canEdit={can_edit}
                    onUpdate={updatePSO}
                    onRemove={removePSO}
                    placeholder='e.g. Design specialised software systems'
                  />
                  {editPsos.length === 0 && (
                    <p className='text-xs text-muted-foreground text-center py-4'>
                      {can_edit ? 'No PSOs yet. Add the first one below.' : 'No PSOs configured yet.'}
                    </p>
                  )}
                  {can_edit && (
                    <Button type='button' variant='outline' size='sm' onClick={addPSO}>
                      <Plus className='h-4 w-4 mr-1' />
                      Add PSO
                    </Button>
                  )}
                </>
              )}
            </TabsContent>

            {/* Mapping tab */}
            <TabsContent value='mapping' className='mt-0'>
              <PoPsoMappingMatrix
                regulationId={regulationId}
                programmeCode={programme.programme_code}
                institutionsId={institutionsId}
                canEdit={can_edit}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

// ── ProgrammeOutcomesEditor ───────────────────────────────────────────────────

interface ProgrammeOutcomesEditorProps {
  regulationId: string;
  /** When provided, only programmes belonging to this board are shown. */
  boardId?: string;
  institutionsId?: string;
}

export function ProgrammeOutcomesEditor({ regulationId, boardId, institutionsId = '' }: ProgrammeOutcomesEditorProps) {
  const { data, isLoading, error } = useQuery<{ data: BosProgrammeSummary[] }>({
    queryKey: ['bos', 'regulation-programmes', regulationId, institutionsId],
    queryFn: async () => {
      // Pass institutionsId so the API uses the board's institution, not the
      // caller's home institution (critical for cross-institution board members).
      const params = institutionsId ? `?institutionsId=${institutionsId}` : '';
      const res = await fetch(`/api/bos/taxonomy/${regulationId}/programmes${params}`);
      if (!res.ok) throw new Error('Failed to load programmes');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const allProgrammes = data?.data ?? [];
  // Apply optional board filter (used when embedded in composition page)
  const programmes = boardId
    ? allProgrammes.filter((p) => p.board_id === boardId)
    : allProgrammes;

  if (isLoading) {
    return (
      <div className='space-y-3'>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className='h-14 w-full' />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className='text-sm text-destructive text-center py-6'>
        Failed to load programmes. Ensure boards are configured with programmes first.
      </p>
    );
  }

  // User has no access to any programme in this board/regulation
  if (programmes.length === 0 && allProgrammes.length > 0 && boardId) {
    return (
      <div className='flex flex-col items-center gap-2 py-10 border rounded-md border-dashed text-center'>
        <Lock className='h-8 w-8 text-muted-foreground/40' />
        <p className='text-sm text-muted-foreground'>
          You are not a member of any board governing these programmes.
        </p>
      </div>
    );
  }

  if (programmes.length === 0) {
    return (
      <div className='text-center py-10 border rounded-md border-dashed space-y-2'>
        <p className='text-sm text-muted-foreground'>
          No programmes assigned to this board yet.
        </p>
        <p className='text-xs text-muted-foreground'>
          Add programmes to the board using the Programmes section above.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {programmes.map((programme) => (
        <ProgrammeCard
          key={`${programme.board_id}:${programme.programme_code}`}
          regulationId={regulationId}
          programme={programme}
          institutionsId={institutionsId}
        />
      ))}
    </div>
  );
}
