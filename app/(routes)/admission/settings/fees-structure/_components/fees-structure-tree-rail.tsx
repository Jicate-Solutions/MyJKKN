'use client';

// fees-structure-tree-rail.tsx
//
// Recursive 8-level expandable tree rail. Each level lazy-fetches its children
// when expanded — degrees and departments are scoped per-institution; quotas,
// communities, accommodation_types and admission_years are fetched once per
// institution branch and reused. Coverage badges are derived from a single
// FeeStructureService.list(institution, year) call cached per (institutionId,
// admissionYearId).
//
// Pattern reference: .worktrees/dynamic-page-tabs/.../tabs-tree.tsx (recursive
// renderRow + Map-keyed children). Adapted to 8 sequential dimensions instead
// of N-ary parent_tab_key.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { LookupService } from '@/lib/services/admission/lookup-service';
import { AdmissionYearService } from '@/lib/services/admission/admission-year-service';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import type {
  AdmissionFeeStructure,
  FeeStructureMatrixDimensions,
} from '@/types/admission';

interface Props {
  selectedDims: Partial<FeeStructureMatrixDimensions>;
  onSelect: (dims: FeeStructureMatrixDimensions) => void;
  coverageOnly: boolean;
  onToggleCoverage: () => void;
  refreshTick?: number;
}

interface InstitutionOption {
  id: string;
  name: string;
}
interface DegreeOption {
  id: string;
  degree_name: string;
}
interface DepartmentOption {
  id: string;
  department_name: string;
}
interface ProgramOption {
  id: string;
  program_name: string;
}
interface YearOption {
  id: string;
  admission_year_name: string;
}
interface NamedOption {
  id: string;
  name: string;
}

// ---- coverage map key helpers -----------------------------------------
function leafKey(d: FeeStructureMatrixDimensions): string {
  return [
    d.institution_id,
    d.degree_id,
    d.department_id,
    d.programme_id,
    d.quota_id,
    d.community_category_id,
    d.accommodation_type_id,
    d.admission_year_id,
  ].join('|');
}

function structureLeafKey(s: AdmissionFeeStructure): string {
  return [
    s.institution_id,
    s.degree_id,
    s.department_id,
    s.programme_id,
    s.quota_id,
    s.community_category_id,
    s.accommodation_type_id,
    s.admission_year_id,
  ].join('|');
}

// =====================================================================
// Top-level tree-rail component
// =====================================================================
export function FeesStructureTreeRail({
  selectedDims,
  onSelect,
  coverageOnly,
  onToggleCoverage,
  refreshTick = 0,
}: Props) {
  const { institutions, loading: instLoading } = useInstitutionsWithAccess();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <aside className="border rounded-md overflow-auto p-2 bg-card">
      <div className="flex items-center justify-between px-2 py-2 border-b mb-2 sticky top-0 bg-card z-10">
        <span className="text-sm font-medium">Tree</span>
        <Button
          size="sm"
          variant={coverageOnly ? 'default' : 'outline'}
          onClick={onToggleCoverage}
          title="Show only leaves missing a fee structure"
        >
          <Filter className="h-3.5 w-3.5 mr-1" />
          Gaps only
        </Button>
      </div>

      {instLoading ? (
        <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading institutions…
        </div>
      ) : institutions.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">
          No accessible institutions.
        </div>
      ) : (
        <ul className="text-sm">
          {institutions.map((inst) => (
            <InstitutionNode
              key={inst.id}
              institution={inst}
              expanded={expanded}
              toggle={toggle}
              selectedDims={selectedDims}
              onSelect={onSelect}
              coverageOnly={coverageOnly}
              refreshTick={refreshTick}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}

// =====================================================================
// Institution node — owns the (institutionId × yearId) coverage cache so
// every descendant leaf can show a badge derived from a single fetch per
// (institution, year) pair.
// =====================================================================
function InstitutionNode({
  institution,
  expanded,
  toggle,
  selectedDims,
  onSelect,
  coverageOnly,
  refreshTick,
}: {
  institution: InstitutionOption;
  expanded: Set<string>;
  toggle: (key: string) => void;
  selectedDims: Partial<FeeStructureMatrixDimensions>;
  onSelect: (dims: FeeStructureMatrixDimensions) => void;
  coverageOnly: boolean;
  refreshTick: number;
}) {
  const key = `inst:${institution.id}`;
  const isOpen = expanded.has(key);

  const [degrees, setDegrees] = useState<DegreeOption[] | null>(null);
  const [years, setYears] = useState<YearOption[] | null>(null);
  const [quotas, setQuotas] = useState<NamedOption[] | null>(null);
  const [communities, setCommunities] = useState<NamedOption[] | null>(null);
  const [accommodations, setAccommodations] = useState<NamedOption[] | null>(null);

  // Coverage map keyed by `${institutionId}|${admissionYearId}` → Map<leafKey, item_count>
  const [coverage, setCoverage] = useState<Map<string, Map<string, number>>>(new Map());
  const [loadingChildren, setLoadingChildren] = useState(false);

  // Lazy-load all "horizontal" lookups + degrees on first expand.
  useEffect(() => {
    if (!isOpen) return;
    if (degrees && quotas && communities && accommodations && years) return;
    let cancelled = false;
    setLoadingChildren(true);
    Promise.all([
      DegreeService.getDegreesByInstitution(institution.id),
      AdmissionYearService.getAdmissionYearsByInstitution(institution.id),
      LookupService.listQuotas(true),
      LookupService.listCommunityCategories(true),
      LookupService.listAccommodationTypes(institution.id, true),
    ])
      .then(([deg, yr, q, c, a]) => {
        if (cancelled) return;
        setDegrees(
          (deg ?? []).map((d: { id: string; degree_name: string }) => ({
            id: d.id,
            degree_name: d.degree_name,
          })),
        );
        setYears(
          (yr ?? []).map((y) => ({
            id: y.id,
            admission_year_name: y.admission_year_name,
          })),
        );
        setQuotas((q ?? []).map((row) => ({ id: row.id, name: row.name })));
        setCommunities((c ?? []).map((row) => ({ id: row.id, name: row.name })));
        setAccommodations(
          (a ?? []).map((row) => ({ id: row.id, name: row.name })),
        );
      })
      .catch((err) => {
        console.error('Failed loading institution children', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingChildren(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, institution.id, degrees, years, quotas, communities, accommodations]);

  // Fetch (per-institution, per-year) coverage on demand.
  const ensureCoverage = useCallback(
    async (admissionYearId: string) => {
      const cacheKey = `${institution.id}|${admissionYearId}`;
      if (coverage.has(cacheKey)) return;
      try {
        const list = await FeeStructureService.getCoverageReport(
          institution.id,
          admissionYearId,
        );
        const inner = new Map<string, number>();
        for (const row of list) {
          inner.set(
            structureLeafKey(row as unknown as AdmissionFeeStructure),
            row.item_count,
          );
        }
        setCoverage((prev) => {
          const next = new Map(prev);
          next.set(cacheKey, inner);
          return next;
        });
      } catch (err) {
        console.error('Failed loading coverage', err);
      }
    },
    [institution.id, coverage],
  );

  // Bust the cache when a refresh tick fires (after create/clone/update).
  useEffect(() => {
    if (refreshTick > 0) {
      setCoverage(new Map());
    }
  }, [refreshTick]);

  const isSelected = selectedDims.institution_id === institution.id;

  return (
    <li className="mb-1">
      <button
        type="button"
        className={cn(
          'flex items-center gap-1 w-full text-left px-2 py-1 rounded hover:bg-accent',
          isSelected && 'bg-accent/60 font-medium',
        )}
        onClick={() => toggle(key)}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{institution.name}</span>
      </button>

      {isOpen && (
        <ul className="ml-4 border-l pl-2 mt-1">
          {loadingChildren && !degrees ? (
            <li className="text-xs text-muted-foreground p-2 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </li>
          ) : !degrees || degrees.length === 0 ? (
            <li className="text-xs text-muted-foreground p-2">No degrees configured.</li>
          ) : (
            degrees.map((deg) => (
              <DegreeNode
                key={deg.id}
                institutionId={institution.id}
                degree={deg}
                quotas={quotas ?? []}
                communities={communities ?? []}
                accommodations={accommodations ?? []}
                years={years ?? []}
                expanded={expanded}
                toggle={toggle}
                selectedDims={selectedDims}
                onSelect={onSelect}
                coverageOnly={coverageOnly}
                coverage={coverage}
                ensureCoverage={ensureCoverage}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

// =====================================================================
// Degree node
// =====================================================================
function DegreeNode({
  institutionId,
  degree,
  quotas,
  communities,
  accommodations,
  years,
  expanded,
  toggle,
  selectedDims,
  onSelect,
  coverageOnly,
  coverage,
  ensureCoverage,
}: {
  institutionId: string;
  degree: DegreeOption;
  quotas: NamedOption[];
  communities: NamedOption[];
  accommodations: NamedOption[];
  years: YearOption[];
  expanded: Set<string>;
  toggle: (key: string) => void;
  selectedDims: Partial<FeeStructureMatrixDimensions>;
  onSelect: (dims: FeeStructureMatrixDimensions) => void;
  coverageOnly: boolean;
  coverage: Map<string, Map<string, number>>;
  ensureCoverage: (yearId: string) => Promise<void>;
}) {
  const key = `inst:${institutionId}|deg:${degree.id}`;
  const isOpen = expanded.has(key);
  const [departments, setDepartments] = useState<DepartmentOption[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || departments) return;
    let cancelled = false;
    setLoading(true);
    DepartmentService.getDepartmentsByInstitutionAndDegree(institutionId, degree.id)
      .then((rows) => {
        if (cancelled) return;
        setDepartments(
          (rows ?? []).map((d: { id: string; department_name: string }) => ({
            id: d.id,
            department_name: d.department_name,
          })),
        );
      })
      .catch((err) => console.error('Failed loading departments', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, institutionId, degree.id, departments]);

  return (
    <li>
      <button
        type="button"
        className="flex items-center gap-1 w-full text-left px-2 py-1 rounded hover:bg-accent"
        onClick={() => toggle(key)}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate text-xs uppercase tracking-wide text-muted-foreground">
          {degree.degree_name}
        </span>
      </button>
      {isOpen && (
        <ul className="ml-4 border-l pl-2">
          {loading && !departments ? (
            <li className="text-xs text-muted-foreground p-1">Loading…</li>
          ) : !departments || departments.length === 0 ? (
            <li className="text-xs text-muted-foreground p-1">No departments.</li>
          ) : (
            departments.map((dep) => (
              <DepartmentNode
                key={dep.id}
                institutionId={institutionId}
                degreeId={degree.id}
                department={dep}
                quotas={quotas}
                communities={communities}
                accommodations={accommodations}
                years={years}
                expanded={expanded}
                toggle={toggle}
                selectedDims={selectedDims}
                onSelect={onSelect}
                coverageOnly={coverageOnly}
                coverage={coverage}
                ensureCoverage={ensureCoverage}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

// =====================================================================
// Department node
// =====================================================================
function DepartmentNode({
  institutionId,
  degreeId,
  department,
  quotas,
  communities,
  accommodations,
  years,
  expanded,
  toggle,
  selectedDims,
  onSelect,
  coverageOnly,
  coverage,
  ensureCoverage,
}: {
  institutionId: string;
  degreeId: string;
  department: DepartmentOption;
  quotas: NamedOption[];
  communities: NamedOption[];
  accommodations: NamedOption[];
  years: YearOption[];
  expanded: Set<string>;
  toggle: (key: string) => void;
  selectedDims: Partial<FeeStructureMatrixDimensions>;
  onSelect: (dims: FeeStructureMatrixDimensions) => void;
  coverageOnly: boolean;
  coverage: Map<string, Map<string, number>>;
  ensureCoverage: (yearId: string) => Promise<void>;
}) {
  const key = `inst:${institutionId}|deg:${degreeId}|dep:${department.id}`;
  const isOpen = expanded.has(key);
  const [programs, setPrograms] = useState<ProgramOption[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || programs) return;
    let cancelled = false;
    setLoading(true);
    ProgramService.getProgramsByDepartment(department.id)
      .then((rows: Array<{ id: string; program_name: string }>) => {
        if (cancelled) return;
        setPrograms(
          (rows ?? []).map((p) => ({ id: p.id, program_name: p.program_name })),
        );
      })
      .catch((err: unknown) => console.error('Failed loading programs', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, department.id, programs]);

  return (
    <li>
      <button
        type="button"
        className="flex items-center gap-1 w-full text-left px-2 py-1 rounded hover:bg-accent"
        onClick={() => toggle(key)}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{department.department_name}</span>
      </button>
      {isOpen && (
        <ul className="ml-4 border-l pl-2">
          {loading && !programs ? (
            <li className="text-xs text-muted-foreground p-1">Loading…</li>
          ) : !programs || programs.length === 0 ? (
            <li className="text-xs text-muted-foreground p-1">No programs.</li>
          ) : (
            programs.map((prog) => (
              <ProgramNode
                key={prog.id}
                institutionId={institutionId}
                degreeId={degreeId}
                departmentId={department.id}
                program={prog}
                quotas={quotas}
                communities={communities}
                accommodations={accommodations}
                years={years}
                expanded={expanded}
                toggle={toggle}
                selectedDims={selectedDims}
                onSelect={onSelect}
                coverageOnly={coverageOnly}
                coverage={coverage}
                ensureCoverage={ensureCoverage}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

// =====================================================================
// Programme node — children are quotas (already loaded at institution level)
// =====================================================================
function ProgramNode({
  institutionId,
  degreeId,
  departmentId,
  program,
  quotas,
  communities,
  accommodations,
  years,
  expanded,
  toggle,
  selectedDims,
  onSelect,
  coverageOnly,
  coverage,
  ensureCoverage,
}: {
  institutionId: string;
  degreeId: string;
  departmentId: string;
  program: ProgramOption;
  quotas: NamedOption[];
  communities: NamedOption[];
  accommodations: NamedOption[];
  years: YearOption[];
  expanded: Set<string>;
  toggle: (key: string) => void;
  selectedDims: Partial<FeeStructureMatrixDimensions>;
  onSelect: (dims: FeeStructureMatrixDimensions) => void;
  coverageOnly: boolean;
  coverage: Map<string, Map<string, number>>;
  ensureCoverage: (yearId: string) => Promise<void>;
}) {
  const key = `inst:${institutionId}|deg:${degreeId}|dep:${departmentId}|prog:${program.id}`;
  const isOpen = expanded.has(key);

  return (
    <li>
      <button
        type="button"
        className="flex items-center gap-1 w-full text-left px-2 py-1 rounded hover:bg-accent"
        onClick={() => toggle(key)}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{program.program_name}</span>
      </button>
      {isOpen && (
        <ul className="ml-4 border-l pl-2">
          {quotas.length === 0 ? (
            <li className="text-xs text-muted-foreground p-1">No quotas configured.</li>
          ) : (
            quotas.map((q) => (
              <QuotaNode
                key={q.id}
                institutionId={institutionId}
                degreeId={degreeId}
                departmentId={departmentId}
                programmeId={program.id}
                quota={q}
                communities={communities}
                accommodations={accommodations}
                years={years}
                expanded={expanded}
                toggle={toggle}
                selectedDims={selectedDims}
                onSelect={onSelect}
                coverageOnly={coverageOnly}
                coverage={coverage}
                ensureCoverage={ensureCoverage}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

// =====================================================================
// Quota node
// =====================================================================
function QuotaNode({
  institutionId,
  degreeId,
  departmentId,
  programmeId,
  quota,
  communities,
  accommodations,
  years,
  expanded,
  toggle,
  selectedDims,
  onSelect,
  coverageOnly,
  coverage,
  ensureCoverage,
}: {
  institutionId: string;
  degreeId: string;
  departmentId: string;
  programmeId: string;
  quota: NamedOption;
  communities: NamedOption[];
  accommodations: NamedOption[];
  years: YearOption[];
  expanded: Set<string>;
  toggle: (key: string) => void;
  selectedDims: Partial<FeeStructureMatrixDimensions>;
  onSelect: (dims: FeeStructureMatrixDimensions) => void;
  coverageOnly: boolean;
  coverage: Map<string, Map<string, number>>;
  ensureCoverage: (yearId: string) => Promise<void>;
}) {
  const key = `inst:${institutionId}|deg:${degreeId}|dep:${departmentId}|prog:${programmeId}|q:${quota.id}`;
  const isOpen = expanded.has(key);

  return (
    <li>
      <button
        type="button"
        className="flex items-center gap-1 w-full text-left px-2 py-1 rounded hover:bg-accent"
        onClick={() => toggle(key)}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate text-xs">Quota: {quota.name}</span>
      </button>
      {isOpen && (
        <ul className="ml-4 border-l pl-2">
          {communities.length === 0 ? (
            <li className="text-xs text-muted-foreground p-1">No communities configured.</li>
          ) : (
            communities.map((c) => (
              <CommunityNode
                key={c.id}
                institutionId={institutionId}
                degreeId={degreeId}
                departmentId={departmentId}
                programmeId={programmeId}
                quotaId={quota.id}
                community={c}
                accommodations={accommodations}
                years={years}
                expanded={expanded}
                toggle={toggle}
                selectedDims={selectedDims}
                onSelect={onSelect}
                coverageOnly={coverageOnly}
                coverage={coverage}
                ensureCoverage={ensureCoverage}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

// =====================================================================
// Community node
// =====================================================================
function CommunityNode({
  institutionId,
  degreeId,
  departmentId,
  programmeId,
  quotaId,
  community,
  accommodations,
  years,
  expanded,
  toggle,
  selectedDims,
  onSelect,
  coverageOnly,
  coverage,
  ensureCoverage,
}: {
  institutionId: string;
  degreeId: string;
  departmentId: string;
  programmeId: string;
  quotaId: string;
  community: NamedOption;
  accommodations: NamedOption[];
  years: YearOption[];
  expanded: Set<string>;
  toggle: (key: string) => void;
  selectedDims: Partial<FeeStructureMatrixDimensions>;
  onSelect: (dims: FeeStructureMatrixDimensions) => void;
  coverageOnly: boolean;
  coverage: Map<string, Map<string, number>>;
  ensureCoverage: (yearId: string) => Promise<void>;
}) {
  const key = `inst:${institutionId}|deg:${degreeId}|dep:${departmentId}|prog:${programmeId}|q:${quotaId}|c:${community.id}`;
  const isOpen = expanded.has(key);

  return (
    <li>
      <button
        type="button"
        className="flex items-center gap-1 w-full text-left px-2 py-1 rounded hover:bg-accent"
        onClick={() => toggle(key)}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate text-xs">Community: {community.name}</span>
      </button>
      {isOpen && (
        <ul className="ml-4 border-l pl-2">
          {accommodations.length === 0 ? (
            <li className="text-xs text-muted-foreground p-1">
              No accommodation types for this institution.
            </li>
          ) : (
            accommodations.map((a) => (
              <AccommodationNode
                key={a.id}
                institutionId={institutionId}
                degreeId={degreeId}
                departmentId={departmentId}
                programmeId={programmeId}
                quotaId={quotaId}
                communityId={community.id}
                accommodation={a}
                years={years}
                expanded={expanded}
                toggle={toggle}
                selectedDims={selectedDims}
                onSelect={onSelect}
                coverageOnly={coverageOnly}
                coverage={coverage}
                ensureCoverage={ensureCoverage}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

// =====================================================================
// Accommodation node — children are years (leaves)
// =====================================================================
function AccommodationNode({
  institutionId,
  degreeId,
  departmentId,
  programmeId,
  quotaId,
  communityId,
  accommodation,
  years,
  expanded,
  toggle,
  selectedDims,
  onSelect,
  coverageOnly,
  coverage,
  ensureCoverage,
}: {
  institutionId: string;
  degreeId: string;
  departmentId: string;
  programmeId: string;
  quotaId: string;
  communityId: string;
  accommodation: NamedOption;
  years: YearOption[];
  expanded: Set<string>;
  toggle: (key: string) => void;
  selectedDims: Partial<FeeStructureMatrixDimensions>;
  onSelect: (dims: FeeStructureMatrixDimensions) => void;
  coverageOnly: boolean;
  coverage: Map<string, Map<string, number>>;
  ensureCoverage: (yearId: string) => Promise<void>;
}) {
  const key = `inst:${institutionId}|deg:${degreeId}|dep:${departmentId}|prog:${programmeId}|q:${quotaId}|c:${communityId}|a:${accommodation.id}`;
  const isOpen = expanded.has(key);

  // Pre-fetch coverage for each unique year on expand so leaf badges are
  // populated quickly. ensureCoverage is idempotent (skips cached keys).
  useEffect(() => {
    if (!isOpen) return;
    for (const y of years) void ensureCoverage(y.id);
  }, [isOpen, years, ensureCoverage]);

  return (
    <li>
      <button
        type="button"
        className="flex items-center gap-1 w-full text-left px-2 py-1 rounded hover:bg-accent"
        onClick={() => toggle(key)}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate text-xs">Accommodation: {accommodation.name}</span>
      </button>
      {isOpen && (
        <ul className="ml-4 border-l pl-2">
          {years.length === 0 ? (
            <li className="text-xs text-muted-foreground p-1">No admission years.</li>
          ) : (
            years.map((y) => (
              <YearLeaf
                key={y.id}
                institutionId={institutionId}
                degreeId={degreeId}
                departmentId={departmentId}
                programmeId={programmeId}
                quotaId={quotaId}
                communityId={communityId}
                accommodationId={accommodation.id}
                year={y}
                selectedDims={selectedDims}
                onSelect={onSelect}
                coverageOnly={coverageOnly}
                coverage={coverage}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

// =====================================================================
// Year leaf — clicking selects all 8 dims; renders a coverage badge
// =====================================================================
function YearLeaf({
  institutionId,
  degreeId,
  departmentId,
  programmeId,
  quotaId,
  communityId,
  accommodationId,
  year,
  selectedDims,
  onSelect,
  coverageOnly,
  coverage,
}: {
  institutionId: string;
  degreeId: string;
  departmentId: string;
  programmeId: string;
  quotaId: string;
  communityId: string;
  accommodationId: string;
  year: YearOption;
  selectedDims: Partial<FeeStructureMatrixDimensions>;
  onSelect: (dims: FeeStructureMatrixDimensions) => void;
  coverageOnly: boolean;
  coverage: Map<string, Map<string, number>>;
}) {
  const dims: FeeStructureMatrixDimensions = useMemo(
    () => ({
      institution_id: institutionId,
      degree_id: degreeId,
      department_id: departmentId,
      programme_id: programmeId,
      quota_id: quotaId,
      community_category_id: communityId,
      accommodation_type_id: accommodationId,
      admission_year_id: year.id,
    }),
    [
      institutionId,
      degreeId,
      departmentId,
      programmeId,
      quotaId,
      communityId,
      accommodationId,
      year.id,
    ],
  );

  const cacheKey = `${institutionId}|${year.id}`;
  const yearMap = coverage.get(cacheKey);
  const itemCount = yearMap?.get(leafKey(dims));
  const hasStructure = typeof itemCount === 'number';

  // Gaps-only mode hides leaves that already have a fee structure with items.
  if (coverageOnly && hasStructure && (itemCount ?? 0) > 0) return null;

  const isSelected =
    selectedDims.institution_id === dims.institution_id &&
    selectedDims.admission_year_id === dims.admission_year_id &&
    selectedDims.degree_id === dims.degree_id &&
    selectedDims.department_id === dims.department_id &&
    selectedDims.programme_id === dims.programme_id &&
    selectedDims.quota_id === dims.quota_id &&
    selectedDims.community_category_id === dims.community_category_id &&
    selectedDims.accommodation_type_id === dims.accommodation_type_id;

  return (
    <li>
      <button
        type="button"
        className={cn(
          'flex items-center justify-between w-full text-left px-2 py-1 rounded hover:bg-accent text-xs',
          isSelected && 'bg-primary/10 font-medium',
        )}
        onClick={() => onSelect(dims)}
        title={`Year: ${year.admission_year_name}`}
      >
        <span className="truncate">{year.admission_year_name}</span>
        {hasStructure ? (
          <Badge
            variant={itemCount && itemCount > 0 ? 'default' : 'destructive'}
            className="ml-2 h-5 px-1.5"
          >
            {itemCount}
          </Badge>
        ) : (
          <Badge variant="destructive" className="ml-2 h-5 px-1.5">
            —
          </Badge>
        )}
      </button>
    </li>
  );
}
