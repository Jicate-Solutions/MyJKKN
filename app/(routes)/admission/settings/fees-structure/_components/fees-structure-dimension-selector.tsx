'use client';

// fees-structure-dimension-selector.tsx
//
// Form-format alternative to the recursive tree-rail. 8 cascading <Select>
// dropdowns lay out horizontally on wide screens (4 cols), stacking on mobile.
// Selecting a parent dim resets all descendants. When all 8 are picked, the
// parent page renders the form-mode editor below.
//
// Replaces the prior tree-rail (which is still in repo at
// fees-structure-tree-rail.tsx) — the new selector is more accessible for
// admins who already know the combo they want to edit and don't need to drill
// the entire tree.

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw, CheckCircle2 } from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { AdmissionYearService } from '@/lib/services/admission/admission-year-service';
import { LookupService } from '@/lib/services/admission/lookup-service';
import type { FeeStructureMatrixDimensions } from '@/types/admission';

interface Option {
  id: string;
  name: string;
}

interface Props {
  selectedDims: Partial<FeeStructureMatrixDimensions>;
  onChange: (dims: Partial<FeeStructureMatrixDimensions>) => void;
}

export function FeesStructureDimensionSelector({ selectedDims, onChange }: Props) {
  const { institutions } = useInstitutionsWithAccess();

  // Per-level option lists. Cascading: child resets when parent changes.
  const [degrees, setDegrees] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [programmes, setProgrammes] = useState<Option[]>([]);
  const [years, setYears] = useState<Option[]>([]);
  const [accommodations, setAccommodations] = useState<Option[]>([]);
  const [quotas, setQuotas] = useState<Option[]>([]);
  const [communities, setCommunities] = useState<Option[]>([]);

  // Global lookups load once
  useEffect(() => {
    LookupService.listQuotas(true).then((rows) =>
      setQuotas(rows.map((r) => ({ id: r.id, name: r.name }))),
    );
    LookupService.listCommunityCategories(true).then((rows) =>
      setCommunities(rows.map((r) => ({ id: r.id, name: r.name }))),
    );
  }, []);

  // Institution change → load degrees + accommodations
  useEffect(() => {
    if (!selectedDims.institution_id) {
      setDegrees([]);
      setAccommodations([]);
      return;
    }
    const instId = selectedDims.institution_id;
    DegreeService.getDegreesByInstitution(instId)
      .then((rows: { id: string; degree_name: string }[]) =>
        setDegrees(rows.map((d) => ({ id: d.id, name: d.degree_name }))),
      )
      .catch(() => setDegrees([]));
    LookupService.listAccommodationTypes(instId, true)
      .then((rows) => setAccommodations(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setAccommodations([]));
  }, [selectedDims.institution_id]);

  // Degree change → load departments
  useEffect(() => {
    if (!selectedDims.institution_id || !selectedDims.degree_id) {
      setDepartments([]);
      return;
    }
    DepartmentService.getDepartmentsByInstitutionAndDegree(
      selectedDims.institution_id,
      selectedDims.degree_id,
    )
      .then((rows: { id: string; department_name: string }[]) =>
        setDepartments(rows.map((d) => ({ id: d.id, name: d.department_name }))),
      )
      .catch(() => setDepartments([]));
  }, [selectedDims.institution_id, selectedDims.degree_id]);

  // Department change → load programmes
  useEffect(() => {
    if (!selectedDims.department_id) {
      setProgrammes([]);
      return;
    }
    ProgramService.getProgramsByDepartment(selectedDims.department_id)
      .then((rows: { id: string; program_name: string }[]) =>
        setProgrammes(rows.map((p) => ({ id: p.id, name: p.program_name }))),
      )
      .catch(() => setProgrammes([]));
  }, [selectedDims.department_id]);

  // Programme change → load admission years (filtered by program — fixed in commit 7b9774120)
  useEffect(() => {
    if (!selectedDims.programme_id) {
      setYears([]);
      return;
    }
    AdmissionYearService.getAdmissionYearsByProgram(selectedDims.programme_id)
      .then((rows) => setYears(rows.map((y) => ({ id: y.id, name: y.admission_year_name }))))
      .catch(() => setYears([]));
  }, [selectedDims.programme_id]);

  // Cascading change handlers — picking a parent resets the affected descendants
  const setInstitution = (id: string) =>
    onChange({
      institution_id: id,
      degree_id: undefined,
      department_id: undefined,
      programme_id: undefined,
      admission_year_id: undefined,
      accommodation_type_id: undefined,
      quota_id: selectedDims.quota_id,
      community_category_id: selectedDims.community_category_id,
    });

  const setDegree = (id: string) =>
    onChange({
      ...selectedDims,
      degree_id: id,
      department_id: undefined,
      programme_id: undefined,
      admission_year_id: undefined,
    });

  const setDepartment = (id: string) =>
    onChange({
      ...selectedDims,
      department_id: id,
      programme_id: undefined,
      admission_year_id: undefined,
    });

  const setProgramme = (id: string) =>
    onChange({
      ...selectedDims,
      programme_id: id,
      admission_year_id: undefined,
    });

  const setYear = (id: string) =>
    onChange({ ...selectedDims, admission_year_id: id });
  const setQuota = (id: string) =>
    onChange({ ...selectedDims, quota_id: id });
  const setCommunity = (id: string) =>
    onChange({ ...selectedDims, community_category_id: id });
  const setAccommodation = (id: string) =>
    onChange({ ...selectedDims, accommodation_type_id: id });

  const handleReset = () => onChange({});

  const allDimsSelected = !!(
    selectedDims.institution_id
    && selectedDims.degree_id
    && selectedDims.department_id
    && selectedDims.programme_id
    && selectedDims.admission_year_id
    && selectedDims.quota_id
    && selectedDims.community_category_id
    && selectedDims.accommodation_type_id
  );

  const missingDims = [
    !selectedDims.institution_id && 'Institution',
    !selectedDims.degree_id && 'Degree',
    !selectedDims.department_id && 'Department',
    !selectedDims.programme_id && 'Programme',
    !selectedDims.admission_year_id && 'Admission Year',
    !selectedDims.quota_id && 'Quota',
    !selectedDims.community_category_id && 'Community',
    !selectedDims.accommodation_type_id && 'Accommodation',
  ].filter(Boolean);

  return (
    <div className="rounded-md border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Select Fee Structure Dimensions</h2>
          <p className="text-xs text-muted-foreground">
            Pick all 8 dimensions to view, edit, or create the fee structure for that combination.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Institution */}
        <div className="space-y-1">
          <Label className="text-xs">1. Institution</Label>
          <Select value={selectedDims.institution_id ?? ''} onValueChange={setInstitution}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select institution" />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 2. Degree */}
        <div className="space-y-1">
          <Label className="text-xs">2. Degree</Label>
          <Select
            value={selectedDims.degree_id ?? ''}
            onValueChange={setDegree}
            disabled={!selectedDims.institution_id}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  !selectedDims.institution_id
                    ? 'Pick institution first'
                    : degrees.length === 0
                    ? 'No degrees configured'
                    : 'Select degree'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {degrees.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 3. Department */}
        <div className="space-y-1">
          <Label className="text-xs">3. Department</Label>
          <Select
            value={selectedDims.department_id ?? ''}
            onValueChange={setDepartment}
            disabled={!selectedDims.degree_id}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  !selectedDims.degree_id
                    ? 'Pick degree first'
                    : departments.length === 0
                    ? 'No departments configured'
                    : 'Select department'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 4. Programme */}
        <div className="space-y-1">
          <Label className="text-xs">4. Programme</Label>
          <Select
            value={selectedDims.programme_id ?? ''}
            onValueChange={setProgramme}
            disabled={!selectedDims.department_id}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  !selectedDims.department_id
                    ? 'Pick department first'
                    : programmes.length === 0
                    ? 'No programmes configured'
                    : 'Select programme'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {programmes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 5. Admission Year (filtered by programme) */}
        <div className="space-y-1">
          <Label className="text-xs">5. Admission Year</Label>
          <Select
            value={selectedDims.admission_year_id ?? ''}
            onValueChange={setYear}
            disabled={!selectedDims.programme_id}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  !selectedDims.programme_id
                    ? 'Pick programme first'
                    : years.length === 0
                    ? 'No admission years for this programme'
                    : 'Select admission year'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 6. Quota (global lookup) */}
        <div className="space-y-1">
          <Label className="text-xs">6. Quota</Label>
          <Select value={selectedDims.quota_id ?? ''} onValueChange={setQuota}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select quota" />
            </SelectTrigger>
            <SelectContent>
              {quotas.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 7. Community Category (global lookup) */}
        <div className="space-y-1">
          <Label className="text-xs">7. Community</Label>
          <Select value={selectedDims.community_category_id ?? ''} onValueChange={setCommunity}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select community" />
            </SelectTrigger>
            <SelectContent>
              {communities.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 8. Accommodation Type (institution-scoped) */}
        <div className="space-y-1">
          <Label className="text-xs">8. Accommodation</Label>
          <Select
            value={selectedDims.accommodation_type_id ?? ''}
            onValueChange={setAccommodation}
            disabled={!selectedDims.institution_id}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  !selectedDims.institution_id
                    ? 'Pick institution first'
                    : accommodations.length === 0
                    ? 'No accommodation types'
                    : 'Select accommodation'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {accommodations.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {allDimsSelected ? (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded p-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>All 8 dimensions selected — fee structure form loaded below.</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{missingDims.length}</span> remaining:{' '}
          {missingDims.join(', ')}
        </p>
      )}
    </div>
  );
}
