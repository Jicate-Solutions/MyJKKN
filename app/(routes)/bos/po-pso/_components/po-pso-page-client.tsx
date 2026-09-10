'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Grid3X3, Lock, Target } from 'lucide-react';
import { useTabParam } from '@/hooks/use-tab-param';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { useBosInstitutionScope } from '@/hooks/bos/use-bos-institution-scope';
import {
  type PoPsoScopeKey,
  useBosPoPsoContext,
  useBosPoPsoOutcomes,
} from '@/hooks/bos/use-bos-po-pso';
import { OutcomeTable, type OutcomeTableRow } from './outcome-table';
import { CourseMappingMatrix } from './course-mapping-matrix';

interface BosInstitutionOption { id: string; name: string; institution_code: string; myjkkn_institution_ids: string[]; }
interface Regulation { id: string; title: string; regulation_year: string; regulation_code: string; }

const TABS = ['pos', 'psos', 'mapping'] as const;

// ── Programme workspace (POs / PSOs / Course mapping) ───────────────────────
// Keyed by the scope in the parent so a change of programme/regulation
// remounts it with fresh tab state and no stale edits.

function ProgrammeOutcomesWorkspace({ scopeKey }: { scopeKey: PoPsoScopeKey }) {
  const outcomes = useBosPoPsoOutcomes(scopeKey);
  const [activeTab, setActiveTab] = useTabParam('pos', TABS);
  const instScope = useBosInstitutionScope(scopeKey.institutionsId);

  const canEdit = outcomes.data?.can_edit ?? false;

  const poRows: OutcomeTableRow[] = useMemo(
    () => (outcomes.data?.pos ?? []).map((r) => ({
      id: r.id, code: r.po_code, description: r.description ?? '', is_active: r.is_active !== false, updated_at: r.updated_at,
    })),
    [outcomes.data?.pos]
  );
  const psoRows: OutcomeTableRow[] = useMemo(
    () => (outcomes.data?.psos ?? []).map((r) => ({
      id: r.id, code: r.pso_code, description: r.description ?? '', is_active: r.is_active !== false, updated_at: r.updated_at,
    })),
    [outcomes.data?.psos]
  );
  const activePoCodes = poRows.filter((r) => r.is_active).map((r) => r.code);
  const activePsoCodes = psoRows.filter((r) => r.is_active).map((r) => r.code);

  if (outcomes.isLoading) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  }
  if (outcomes.isError) {
    return (
      <p className='text-sm text-destructive py-4'>
        {outcomes.error instanceof Error ? outcomes.error.message : 'Failed to load PO/PSO'}
      </p>
    );
  }

  return (
    <div className='space-y-4'>
      {!canEdit && (
        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
          <Lock className='h-3.5 w-3.5' />
          View only — the HOD of this programme, the principal or its board members can edit.
        </div>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className='mb-4 flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0'>
          <TabsTrigger value='pos'>
            Programme Outcomes (POs)
            {activePoCodes.length > 0 && (
              <Badge variant='secondary' className='ml-2 text-xs'>{activePoCodes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value='psos'>
            Programme Specific Outcomes (PSOs)
            {activePsoCodes.length > 0 && (
              <Badge variant='secondary' className='ml-2 text-xs'>{activePsoCodes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value='mapping'>
            <Grid3X3 className='h-3.5 w-3.5 mr-1' />
            PO / PSO Mapping
          </TabsTrigger>
        </TabsList>

        <TabsContent value='pos' className='mt-0'>
          <OutcomeTable
            kind='po'
            rows={poRows}
            canEdit={canEdit}
            scopeKey={scopeKey}
            placeholder='e.g. Engineering knowledge: apply mathematics, science and engineering fundamentals to solve complex problems'
          />
        </TabsContent>

        <TabsContent value='psos' className='mt-0'>
          <OutcomeTable
            kind='pso'
            rows={psoRows}
            canEdit={canEdit}
            scopeKey={scopeKey}
            placeholder='e.g. Design and develop software systems for industry-specific domains'
          />
        </TabsContent>

        <TabsContent value='mapping' className='mt-0'>
          <CourseMappingMatrix
            scopeKey={scopeKey}
            poCodes={activePoCodes}
            psoCodes={activePsoCodes}
            isCAS={instScope.isCAS}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Page client ──────────────────────────────────────────────────────────────

export function PoPsoPageClient() {
  const boardScope = useBosBoardScope();
  const { data: ownCtx, isLoading: ownCtxLoading } = useInstitutionContext();

  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [selectedProgrammeCode, setSelectedProgrammeCode] = useState<string | null>(null);
  const [selectedRegulationId, setSelectedRegulationId] = useState<string | null>(null);

  // Institutions the caller may browse — super-admin / observers get every
  // institution, everyone else only their own (the route decides).
  const { data: institutions = [], isLoading: institutionsLoading } =
    useQuery<BosInstitutionOption[]>({
      queryKey: ['bos', 'institutions'],
      staleTime: 5 * 60 * 1000,
      queryFn: async () => {
        const r = await fetch('/api/bos/institutions');
        if (!r.ok) return [];
        return r.json();
      },
    });

  const canPickInstitution = boardScope.isSuperAdmin || institutions.length > 1;
  const institutionsId = canPickInstitution
    ? selectedInstitutionId
    : (ownCtx?.myjkkn_id ?? institutions[0]?.id ?? null);

  // Departments + programmes (HOD-locked server-side).
  const context = useBosPoPsoContext(institutionsId);
  const departments = useMemo(() => context.data?.departments ?? [], [context.data]);
  const programmes = useMemo(() => context.data?.programmes ?? [], [context.data]);
  const hodLocked = context.data?.hod.locked ?? false;

  // Guard against stale selections after the institution changes. An HOD
  // with exactly one department gets it pre-selected (picker locked).
  const departmentId =
    selectedDepartmentId && departments.some((d) => d.id === selectedDepartmentId)
      ? selectedDepartmentId
      : hodLocked && departments.length === 1
        ? departments[0].id
        : null;
  const programmeOptions = useMemo(
    () => (departmentId ? programmes.filter((p) => p.department_id === departmentId) : programmes),
    [programmes, departmentId]
  );
  const programmeCode =
    selectedProgrammeCode && programmeOptions.some((p) => p.program_code === selectedProgrammeCode)
      ? selectedProgrammeCode
      : null;

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
  const regulationId =
    selectedRegulationId && regulations.some((r) => r.id === selectedRegulationId)
      ? selectedRegulationId
      : null;

  const scopeKey: PoPsoScopeKey = { institutionsId, regulationId, programmeCode };
  const ready = !!institutionsId && !!programmeCode && !!regulationId;

  if (boardScope.isLoading || (!canPickInstitution && ownCtxLoading && institutionsLoading)) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-9 w-[280px]' />
        <Skeleton className='h-32 w-full' />
      </div>
    );
  }

  const selectedProgramme = programmeOptions.find((p) => p.program_code === programmeCode);
  const selectedDepartment = departments.find((d) => d.id === departmentId);

  const hint = !institutionsId
    ? 'Select an institution to manage its POs & PSOs.'
    : !programmeCode
      ? hodLocked
        ? 'Select a programme of your department.'
        : 'Select a department and programme — each programme carries its own PO & PSO sets.'
      : 'Select a regulation — each regulation carries its own PO & PSO sets.';

  return (
    <div className='space-y-6'>
      {/* Header + academic context */}
      <div className='flex flex-col gap-3'>
        <div className='flex items-start gap-2'>
          <Target className='h-5 w-5 text-muted-foreground mt-0.5' />
          <div>
            <h2 className='text-lg font-semibold'>POs &amp; PSOs</h2>
            <p className='text-sm text-muted-foreground'>
              Institution-wise Programme Outcomes and Programme Specific Outcomes, maintained by
              the HOD per programme and regulation. Compositions, learning pathway CO-PO matrices and
              reports read these same records.
            </p>
          </div>
        </div>

        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <div className='space-y-1'>
            <label className='text-xs font-medium text-muted-foreground'>Institution</label>
            {canPickInstitution ? (
              <SearchableSelect
                value={selectedInstitutionId ?? ''}
                onValueChange={(val) => {
                  setSelectedInstitutionId(val || null);
                  setSelectedDepartmentId(null);
                  setSelectedProgrammeCode(null);
                  setSelectedRegulationId(null);
                }}
                options={institutions.map((i) => ({ value: i.id, label: i.name }))}
                loading={institutionsLoading}
                className='w-full'
                placeholder='Select institution…'
                searchPlaceholder='Search institution…'
              />
            ) : (
              <div className='flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm'>
                <Building2 className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
                <span className='truncate'>{ownCtx?.name ?? institutions[0]?.name ?? '—'}</span>
              </div>
            )}
          </div>

          <div className='space-y-1'>
            <label className='text-xs font-medium text-muted-foreground'>
              Department
              {hodLocked && <span className='ml-1 text-[10px] uppercase tracking-wide'>(your scope)</span>}
            </label>
            <SearchableSelect
              value={departmentId ?? ''}
              onValueChange={(val) => {
                setSelectedDepartmentId(val || null);
                setSelectedProgrammeCode(null);
              }}
              options={departments.map((d) => ({
                value: d.id,
                label: d.department_code ? `${d.department_name} (${d.department_code})` : d.department_name,
              }))}
              loading={context.isLoading}
              disabled={!institutionsId || (hodLocked && departments.length === 1)}
              className='w-full'
              placeholder={hodLocked ? 'Your department…' : 'All departments'}
              searchPlaceholder='Search department…'
            />
          </div>

          <div className='space-y-1'>
            <label className='text-xs font-medium text-muted-foreground'>Programme</label>
            <SearchableSelect
              value={programmeCode ?? ''}
              onValueChange={(val) => setSelectedProgrammeCode(val || null)}
              options={programmeOptions.map((p) => ({
                value: p.program_code,
                label: `${p.program_code} — ${p.program_name}`,
              }))}
              loading={context.isLoading}
              disabled={!institutionsId}
              className='w-full'
              placeholder='Select programme…'
              searchPlaceholder='Search programme…'
            />
          </div>

          <div className='space-y-1'>
            <label className='text-xs font-medium text-muted-foreground'>Regulation</label>
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

      {!ready ? (
        <div className='text-center py-16 border rounded-md border-dashed'>
          <p className='text-sm text-muted-foreground'>{hint}</p>
        </div>
      ) : (
        <section className='space-y-4'>
          <div className='flex items-center gap-2 flex-wrap'>
            <h3 className='text-base font-semibold'>
              {selectedProgramme ? `${selectedProgramme.program_code} — ${selectedProgramme.program_name}` : programmeCode}
            </h3>
            {selectedDepartment && (
              <Badge variant='outline' className='text-xs'>{selectedDepartment.department_name}</Badge>
            )}
            <Badge variant='secondary' className='text-xs'>
              {regulations.find((r) => r.id === regulationId)?.regulation_code ?? 'Regulation'}
            </Badge>
          </div>
          <ProgrammeOutcomesWorkspace
            key={`${institutionsId}:${programmeCode}:${regulationId}`}
            scopeKey={scopeKey}
          />
        </section>
      )}
    </div>
  );
}
