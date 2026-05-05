'use client';

// fees-structure-clone-dialog.tsx
//
// Clone dialog (Plan 2 / Task 15). Two modes:
//   1. "Clone for academic year" — keeps every dimension fixed except the
//      target admission year. Useful for rolling forward last year's
//      structure to a new cohort with one click.
//   2. "Clone with overrides" — pre-fills every dimension from the source
//      and lets the admin override any subset (degree/dept/programme/
//      quota/community/accommodation/year). Useful for branching to a new
//      programme variant.
//
// Source structure picker is filtered by the institution selected in the
// tree (passed in via sourceDims.institution_id). Submit calls
// FeeStructureService.cloneToAcademicYear which invokes create() under the
// hood and writes a `fee_structure.created` activity log entry.

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Loader2, Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import { LookupService } from '@/lib/services/admission/lookup-service';
import { AdmissionYearService } from '@/lib/services/admission/admission-year-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import type {
  AdmissionFeeStructure,
  FeeStructureMatrixDimensions,
} from '@/types/admission';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceDims: Partial<FeeStructureMatrixDimensions>;
  onCloned?: () => void;
}

interface NamedOption {
  id: string;
  name: string;
}
interface YearOption {
  id: string;
  admission_year_name: string;
}

type Mode = 'year' | 'overrides';

export function FeesStructureCloneDialog({
  open,
  onOpenChange,
  sourceDims,
  onCloned,
}: Props) {
  const institutionId = sourceDims.institution_id ?? '';
  const [mode, setMode] = useState<Mode>('year');

  // Source picker
  const [structures, setStructures] = useState<AdmissionFeeStructure[]>([]);
  const [loadingStructures, setLoadingStructures] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');

  // Year mode
  const [years, setYears] = useState<YearOption[]>([]);
  const [targetYearId, setTargetYearId] = useState<string>('');

  // Overrides mode
  const [degrees, setDegrees] = useState<NamedOption[]>([]);
  const [departments, setDepartments] = useState<NamedOption[]>([]);
  const [programs, setPrograms] = useState<NamedOption[]>([]);
  const [quotas, setQuotas] = useState<NamedOption[]>([]);
  const [communities, setCommunities] = useState<NamedOption[]>([]);
  const [accommodations, setAccommodations] = useState<NamedOption[]>([]);

  const [overrides, setOverrides] = useState<Partial<FeeStructureMatrixDimensions>>({});
  const [overrideName, setOverrideName] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // Reset internal state whenever the dialog reopens for a different source.
  useEffect(() => {
    if (!open) return;
    setMode('year');
    setSelectedSourceId('');
    setTargetYearId('');
    setOverrides({});
    setOverrideName('');
  }, [open, institutionId]);

  // Load structures for the source institution.
  useEffect(() => {
    if (!open || !institutionId) return;
    let cancelled = false;
    setLoadingStructures(true);
    FeeStructureService.list(institutionId)
      .then((rows) => {
        if (cancelled) return;
        setStructures(rows);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load structures');
      })
      .finally(() => {
        if (!cancelled) setLoadingStructures(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, institutionId]);

  // Load common lookups when dialog opens.
  useEffect(() => {
    if (!open || !institutionId) return;
    let cancelled = false;
    Promise.all([
      AdmissionYearService.getAdmissionYearsByInstitution(institutionId),
      LookupService.listQuotas(true),
      LookupService.listCommunityCategories(true),
      LookupService.listAccommodationTypes(institutionId, true),
      DegreeService.getDegreesByInstitution(institutionId),
    ])
      .then(([yr, q, c, a, deg]) => {
        if (cancelled) return;
        setYears(
          (yr ?? []).map((y) => ({ id: y.id, admission_year_name: y.admission_year_name })),
        );
        setQuotas((q ?? []).map((row) => ({ id: row.id, name: row.name })));
        setCommunities((c ?? []).map((row) => ({ id: row.id, name: row.name })));
        setAccommodations((a ?? []).map((row) => ({ id: row.id, name: row.name })));
        setDegrees(
          (deg ?? []).map((d: { id: string; degree_name: string }) => ({
            id: d.id,
            name: d.degree_name,
          })),
        );
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load lookups');
      });
    return () => {
      cancelled = true;
    };
  }, [open, institutionId]);

  const selectedSource = useMemo(
    () => structures.find((s) => s.id === selectedSourceId) ?? null,
    [structures, selectedSourceId],
  );

  // When a source is selected, prime overrides from it (so "with overrides"
  // tab shows the source's matrix dims by default — admin tweaks what they
  // want to change).
  useEffect(() => {
    if (!selectedSource) return;
    setOverrides({
      institution_id: selectedSource.institution_id,
      degree_id: selectedSource.degree_id,
      department_id: selectedSource.department_id,
      programme_id: selectedSource.programme_id,
      quota_id: selectedSource.quota_id,
      community_category_id: selectedSource.community_category_id,
      accommodation_type_id: selectedSource.accommodation_type_id,
      admission_year_id: selectedSource.admission_year_id,
    });
    setOverrideName(`${selectedSource.name} (cloned)`);
  }, [selectedSource]);

  // Lazy-load departments / programs as overrides change.
  useEffect(() => {
    if (!overrides.degree_id || !overrides.institution_id) {
      setDepartments([]);
      return;
    }
    let cancelled = false;
    DepartmentService.getDepartmentsByInstitutionAndDegree(
      overrides.institution_id,
      overrides.degree_id,
    )
      .then((rows) => {
        if (cancelled) return;
        setDepartments(
          (rows ?? []).map((d: { id: string; department_name: string }) => ({
            id: d.id,
            name: d.department_name,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [overrides.institution_id, overrides.degree_id]);

  useEffect(() => {
    if (!overrides.department_id) {
      setPrograms([]);
      return;
    }
    let cancelled = false;
    ProgramService.getProgramsByDepartment(overrides.department_id)
      .then((rows: Array<{ id: string; program_name: string }>) => {
        if (cancelled) return;
        setPrograms(
          (rows ?? []).map((p) => ({ id: p.id, name: p.program_name })),
        );
      })
      .catch(() => {
        if (!cancelled) setPrograms([]);
      });
    return () => {
      cancelled = true;
    };
  }, [overrides.department_id]);

  const handleSubmit = async () => {
    if (!selectedSource) {
      toast.error('Select a source structure');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'year') {
        if (!targetYearId) {
          toast.error('Pick a target academic year');
          setSubmitting(false);
          return;
        }
        if (targetYearId === selectedSource.admission_year_id) {
          toast.error('Target year is the same as source');
          setSubmitting(false);
          return;
        }
        await FeeStructureService.cloneToAcademicYear(selectedSource.id, targetYearId);
      } else {
        if (!overrides.admission_year_id) {
          toast.error('Pick a target academic year');
          setSubmitting(false);
          return;
        }
        await FeeStructureService.cloneToAcademicYear(
          selectedSource.id,
          overrides.admission_year_id,
          {
            ...overrides,
            name: overrideName || undefined,
          },
        );
      }
      toast.success('Fee structure cloned');
      onCloned?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clone');
    } finally {
      setSubmitting(false);
    }
  };

  if (!institutionId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Fee Structure</DialogTitle>
            <DialogDescription>
              Pick an institution in the tree first, then re-open this dialog.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            Clone Fee Structure
          </DialogTitle>
          <DialogDescription>
            Pick a source structure for this institution, choose a clone mode,
            and a new structure will be created in <em>draft</em> state.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source picker */}
          <div className="space-y-1">
            <Label htmlFor="source-structure">Source structure</Label>
            <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
              <SelectTrigger id="source-structure">
                <SelectValue
                  placeholder={
                    loadingStructures
                      ? 'Loading…'
                      : structures.length === 0
                        ? 'No structures for this institution'
                        : 'Pick a source structure'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {structures.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} <span className="text-xs text-muted-foreground">[{s.status}]</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mode tabs */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="year">For academic year</TabsTrigger>
              <TabsTrigger value="overrides">With overrides</TabsTrigger>
            </TabsList>

            <TabsContent value="year" className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                All matrix dimensions are inherited from the source; only the
                target academic year is changed.
              </p>
              <div className="space-y-1">
                <Label htmlFor="target-year">Target academic year</Label>
                <Select value={targetYearId} onValueChange={setTargetYearId}>
                  <SelectTrigger id="target-year">
                    <SelectValue placeholder="Pick a year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y.id} value={y.id}>
                        {y.admission_year_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="overrides" className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                Override any subset of the source dimensions. Unchanged fields
                are inherited.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <DimensionSelect
                  label="Degree"
                  value={overrides.degree_id ?? ''}
                  onChange={(v) =>
                    setOverrides((prev) => ({
                      ...prev,
                      degree_id: v,
                      // Clear downstream when changed
                      department_id: undefined,
                      programme_id: undefined,
                    }))
                  }
                  options={degrees}
                />
                <DimensionSelect
                  label="Department"
                  value={overrides.department_id ?? ''}
                  onChange={(v) =>
                    setOverrides((prev) => ({
                      ...prev,
                      department_id: v,
                      programme_id: undefined,
                    }))
                  }
                  options={departments}
                  disabled={!overrides.degree_id}
                />
                <DimensionSelect
                  label="Programme"
                  value={overrides.programme_id ?? ''}
                  onChange={(v) =>
                    setOverrides((prev) => ({ ...prev, programme_id: v }))
                  }
                  options={programs}
                  disabled={!overrides.department_id}
                />
                <DimensionSelect
                  label="Quota"
                  value={overrides.quota_id ?? ''}
                  onChange={(v) => setOverrides((prev) => ({ ...prev, quota_id: v }))}
                  options={quotas}
                />
                <DimensionSelect
                  label="Community"
                  value={overrides.community_category_id ?? ''}
                  onChange={(v) =>
                    setOverrides((prev) => ({ ...prev, community_category_id: v }))
                  }
                  options={communities}
                />
                <DimensionSelect
                  label="Accommodation"
                  value={overrides.accommodation_type_id ?? ''}
                  onChange={(v) =>
                    setOverrides((prev) => ({ ...prev, accommodation_type_id: v }))
                  }
                  options={accommodations}
                />
                <DimensionSelect
                  label="Academic year"
                  value={overrides.admission_year_id ?? ''}
                  onChange={(v) =>
                    setOverrides((prev) => ({ ...prev, admission_year_id: v }))
                  }
                  options={years.map((y) => ({ id: y.id, name: y.admission_year_name }))}
                />
                <div className="space-y-1">
                  <Label htmlFor="clone-name">Name</Label>
                  <Input
                    id="clone-name"
                    value={overrideName}
                    onChange={(e) => setOverrideName(e.target.value)}
                    placeholder="(defaults to source name + cloned)"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !selectedSourceId}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Cloning…
              </>
            ) : (
              'Clone'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helper: labelled dropdown for a dimension override.
// ---------------------------------------------------------------------------
function DimensionSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: NamedOption[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={disabled || options.length === 0}
      >
        <SelectTrigger>
          <SelectValue placeholder={disabled ? '—' : 'Pick…'} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
