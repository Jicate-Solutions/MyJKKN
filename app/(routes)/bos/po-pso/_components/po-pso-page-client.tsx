'use client';

import { useMemo, useState } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Landmark, Layers, Loader2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import {
  OutcomeInput,
  useBosBoardPsos,
  useBosPoPsoMaster,
  useSaveMasterOutcomes,
} from '@/hooks/bos/use-bos-po-pso';
import type { BosBoardPso, BosMasterPso } from '@/types/bos';
import { OutcomeListEditor } from './outcome-list-editor';
import { BoardPsoCard } from './board-pso-card';

interface Board { id: string; board_code: string; board_name: string; }
interface BosInstitutionOption { id: string; name: string; institution_code: string; myjkkn_institution_ids: string[]; }
interface Regulation { id: string; title: string; regulation_year: string; regulation_code: string; }

// ── Master editor (POs + default PSOs) ──────────────────────────────────────
// Keyed by institutionsId in the parent so switching institution remounts it
// with fresh state (no stale-edit carryover).

const MASTER_OUTCOMES_TABS = ['pos', 'psos'] as const;

function MasterOutcomesEditor({
  institutionsId,
  regulationId,
}: {
  institutionsId: string;
  regulationId: string;
}) {
  const masterQuery = useBosPoPsoMaster(institutionsId, regulationId);
  const saveMutation = useSaveMasterOutcomes(institutionsId, regulationId);

  const [editPos, setEditPos] = useState<OutcomeInput[] | null>(null);
  const [editPsos, setEditPsos] = useState<OutcomeInput[] | null>(null);
  const [activeTab, setActiveTab] = useTabParam('pos', MASTER_OUTCOMES_TABS);

  const canEdit = masterQuery.data?.can_edit ?? false;

  // Server rows → editor rows, used until the user makes a local edit.
  const serverPos: OutcomeInput[] = useMemo(
    () => (masterQuery.data?.pos ?? []).map((r) => ({ code: r.po_code, description: r.description ?? '' })),
    [masterQuery.data?.pos]
  );
  const serverPsos: OutcomeInput[] = useMemo(
    () => (masterQuery.data?.psos ?? []).map((r) => ({ code: r.pso_code, description: r.description ?? '' })),
    [masterQuery.data?.psos]
  );

  const posRows = editPos ?? serverPos;
  const psosRows = editPsos ?? serverPsos;

  // Errors are toasted by the mutation's onError; catch here only to avoid
  // an unhandled rejection from the awaited mutateAsync.
  const savePos = async () => {
    try {
      await saveMutation.mutateAsync({ pos: posRows });
      toast.success('Master POs saved — visible to all boards of this institution');
      setEditPos(null);
    } catch {
      /* handled in onError */
    }
  };
  const savePsos = async () => {
    try {
      await saveMutation.mutateAsync({ psos: psosRows });
      toast.success('Master PSOs saved — boards without a custom set inherit these');
      setEditPsos(null);
    } catch {
      /* handled in onError */
    }
  };

  if (masterQuery.isLoading) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  }

  if (masterQuery.isError) {
    return (
      <p className='text-sm text-destructive py-4'>
        {masterQuery.error instanceof Error
          ? masterQuery.error.message
          : 'Failed to load master PO/PSO'}
      </p>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className='mb-4 flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0'>
        <TabsTrigger value='pos'>
          Programme Outcomes (POs)
          {serverPos.length > 0 && (
            <Badge variant='secondary' className='ml-2 text-xs'>{serverPos.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value='psos'>
          PSOs — Master Default
          {serverPsos.length > 0 && (
            <Badge variant='secondary' className='ml-2 text-xs'>{serverPsos.length}</Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value='pos' className='space-y-3 mt-0'>
        <div className='flex items-center justify-between gap-2 flex-wrap'>
          <p className='text-xs text-muted-foreground'>
            Common to EVERY board of this institution — boards cannot override POs.
          </p>
          {canEdit && (
            <Button size='sm' onClick={savePos} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className='h-3 w-3 mr-1 animate-spin' />
              ) : (
                <Save className='h-3 w-3 mr-1' />
              )}
              Save POs
            </Button>
          )}
        </div>
        <OutcomeListEditor
          rows={posRows}
          codePrefix='PO'
          canEdit={canEdit}
          onChange={setEditPos}
          placeholder='e.g. Apply engineering fundamentals to solve complex problems'
          emptyText={canEdit ? 'No POs yet. Add the first one below.' : 'No POs configured yet.'}
        />
      </TabsContent>

      <TabsContent value='psos' className='space-y-3 mt-0'>
        <div className='flex items-center justify-between gap-2 flex-wrap'>
          <p className='text-xs text-muted-foreground'>
            Default PSO set — every board inherits these unless it defines its own
            set in the Boards section below.
          </p>
          {canEdit && (
            <Button size='sm' onClick={savePsos} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className='h-3 w-3 mr-1 animate-spin' />
              ) : (
                <Save className='h-3 w-3 mr-1' />
              )}
              Save PSOs
            </Button>
          )}
        </div>
        <OutcomeListEditor
          rows={psosRows}
          codePrefix='PSO'
          canEdit={canEdit}
          onChange={setEditPsos}
          placeholder='e.g. Design specialised software systems for industry domains'
          emptyText={canEdit ? 'No PSOs yet. Add the first one below.' : 'No PSOs configured yet.'}
        />
      </TabsContent>
    </Tabs>
  );
}

// ── Boards section ───────────────────────────────────────────────────────────

function BoardsSection({
  institutionsId,
  regulationId,
  masterPsos,
}: {
  institutionsId: string;
  regulationId: string;
  masterPsos: BosMasterPso[];
}) {
  const boardScope = useBosBoardScope();
  const boardPsosQuery = useBosBoardPsos(institutionsId, regulationId);

  const { data: boards = [], isLoading: boardsLoading } = useQuery<Board[]>({
    queryKey: ['bos', 'boards', institutionsId],
    enabled: !!institutionsId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/bos/boards?institutionsId=${institutionsId}`);
      if (!res.ok) return [];
      const json = await res.json();
      return (Array.isArray(json) ? json : (json?.data ?? [])) as Board[];
    },
  });

  const overridesByBoard = useMemo(() => {
    const map = new Map<string, BosBoardPso[]>();
    for (const row of boardPsosQuery.data ?? []) {
      const list = map.get(row.board_id) ?? [];
      list.push(row);
      map.set(row.board_id, list);
    }
    return map;
  }, [boardPsosQuery.data]);

  if (boardsLoading || boardPsosQuery.isLoading) {
    return (
      <div className='space-y-3'>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className='h-14 w-full' />
        ))}
      </div>
    );
  }

  if (boards.length === 0) {
    return (
      <div className='text-center py-10 border rounded-md border-dashed'>
        <p className='text-sm text-muted-foreground'>
          No boards found for this institution.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {boards.map((board) => (
        <BoardPsoCard
          key={board.id}
          board={board}
          institutionsId={institutionsId}
          regulationId={regulationId}
          masterPsos={masterPsos}
          overrideRows={overridesByBoard.get(board.id) ?? []}
          canEdit={
            boardScope.isSuperAdmin ||
            boardScope.isPrincipal ||
            boardScope.boardsOf.has(board.id)
          }
        />
      ))}
    </div>
  );
}

// ── Page client ──────────────────────────────────────────────────────────────

export function PoPsoPageClient() {
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { data: ownCtx, isLoading: ownCtxLoading } = useInstitutionContext();

  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);
  const [selectedRegulationId, setSelectedRegulationId] = useState<string | null>(null);

  // All institutions — super-admin only (same source as the compositions filter).
  const { data: allInstitutions = [], isLoading: institutionsLoading } =
    useQuery<BosInstitutionOption[]>({
      queryKey: ['bos', 'institutions'],
      enabled: !!isSuperAdmin,
      staleTime: 5 * 60 * 1000,
      queryFn: async () => {
        const r = await fetch('/api/bos/institutions');
        if (!r.ok) return [];
        return r.json();
      },
    });

  const institutionsId = isSuperAdmin
    ? selectedInstitutionId
    : (ownCtx?.myjkkn_id ?? null);

  // Regulations of the selected institution (CAS-deduped server-side).
  const { data: regulations = [], isLoading: regulationsLoading } =
    useQuery<Regulation[]>({
      queryKey: ['bos', 'regulations', institutionsId],
      enabled: !!institutionsId,
      staleTime: 5 * 60 * 1000,
      queryFn: async () => {
        const res = await fetch(`/api/bos/regulations?institutionId=${institutionsId}`);
        if (!res.ok) return [];
        const json = await res.json();
        return (json.data ?? []) as Regulation[];
      },
    });

  // Each regulation carries its own PO/PSO sets, so a stale selection from the
  // previous institution must never leak into the next one's queries.
  const regulationId =
    selectedRegulationId && regulations.some((r) => r.id === selectedRegulationId)
      ? selectedRegulationId
      : null;

  const masterQuery = useBosPoPsoMaster(institutionsId, regulationId);

  if (permissionsLoading || (!isSuperAdmin && ownCtxLoading)) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-9 w-[280px]' />
        <Skeleton className='h-32 w-full' />
      </div>
    );
  }

  return (
    <div className='space-y-8'>
      {/* Header + institution scope */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-wrap'>
        <div>
          <h2 className='text-lg font-semibold'>POs &amp; PSOs</h2>
          <p className='text-sm text-muted-foreground'>
            Set the institution master once — POs apply to all boards; PSOs can be
            customized per board.
          </p>
        </div>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap'>
          {isSuperAdmin && (
            <div className='min-w-[260px]'>
              <SearchableSelect
                value={selectedInstitutionId ?? ''}
                onValueChange={(val) => {
                  setSelectedInstitutionId(val || null);
                  setSelectedRegulationId(null);
                }}
                options={allInstitutions.map((i) => ({ value: i.id, label: i.name }))}
                loading={institutionsLoading}
                className='w-full'
                placeholder='Select institution…'
                searchPlaceholder='Search institution…'
              />
            </div>
          )}
          <div className='min-w-[200px]'>
            <SearchableSelect
              value={regulationId ?? ''}
              onValueChange={(val) => setSelectedRegulationId(val || null)}
              options={regulations.map((r) => ({
                value: r.id,
                label: r.regulation_code || r.title,
              }))}
              loading={regulationsLoading}
              disabled={!institutionsId}
              className='w-full'
              placeholder='Select regulation…'
              searchPlaceholder='Search regulation…'
            />
          </div>
        </div>
      </div>

      {!institutionsId || !regulationId ? (
        <div className='text-center py-16 border rounded-md border-dashed'>
          <p className='text-sm text-muted-foreground'>
            {!institutionsId
              ? 'Select an institution to manage its POs & PSOs.'
              : 'Select a regulation — each regulation carries its own PO & PSO sets.'}
          </p>
        </div>
      ) : (
        <>
          {/* Master section */}
          <section className='space-y-4'>
            <div className='flex items-center gap-2'>
              <Landmark className='h-4 w-4 text-muted-foreground' />
              <h3 className='text-base font-semibold'>Institution Master</h3>
            </div>
            <MasterOutcomesEditor
              key={`${institutionsId}:${regulationId}`}
              institutionsId={institutionsId}
              regulationId={regulationId}
            />
          </section>

          {/* Boards section */}
          <section className='space-y-4'>
            <div className='flex items-center gap-2'>
              <Layers className='h-4 w-4 text-muted-foreground' />
              <h3 className='text-base font-semibold'>Boards — PSO Sets</h3>
            </div>
            <p className='text-sm text-muted-foreground'>
              Each board inherits the master PSOs. Customize a board to give it its
              own set; reset to return to the master defaults.
            </p>
            <BoardsSection
              institutionsId={institutionsId}
              regulationId={regulationId}
              masterPsos={masterQuery.data?.psos ?? []}
            />
          </section>
        </>
      )}
    </div>
  );
}
