'use client';

import { useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { BillCoverageService } from '@/lib/services/billing/coverage/bill-coverage-service';
import { downloadCoverageBillsPdf } from '@/lib/utils/billing/coverage-bills-pdf';
import { LookupService } from '@/lib/services/admission/lookup-service';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useGroupAdmissionYears } from '@/hooks/admission/use-group-admission-years';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useAcademicHierarchyFilters } from '@/hooks/organization/use-academic-hierarchy-filters';
import { useBillingCategories } from '@/hooks/billing/use-billing-categories';
import type { BillCoverageFilters } from '@/types/billing-coverage';
import { LEARNER_SCOPE_DEFAULT, GENDER_UNSET } from '@/types/billing-coverage';

interface CoverageFilterBarProps {
  filters: BillCoverageFilters;
  onChange: (next: Partial<BillCoverageFilters>) => void;
  /** billing.coverage.export — granted separately from .view. */
  canExport?: boolean;
  /**
   * Which tab is using the bar. Every dimension filter is shared; three
   * controls differ because the two tabs ask different questions:
   *
   *  - Academic Year is the single year Coverage MEASURES against. The audits
   *    span every year from admission to today, so that slot becomes "Earliest
   *    Academic Year" — a floor on the audited window, not a target.
   *  - Billing Category is dropped: the audits ARE the tuition-category check,
   *    so narrowing to one category would ask a question neither answers.
   *  - "Show" and the institution toggle carry audit-specific values.
   */
  variant?: 'coverage' | 'audit';
}

const ALL = '__all__';

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  reserved: 'Reserved',
  admitted: 'Admitted',
  account: 'Account'
};

export function CoverageFilterBar({
  filters,
  onChange,
  canExport = false,
  variant = 'coverage'
}: CoverageFilterBarProps) {
  const isAudit = variant === 'audit';
  const [exporting, setExporting] = useState(false);
  const { institutions, loading: institutionsLoading } =
    useUserInstitutionAccess();

  // Only one institution selected at a time. Academic years are per-institution
  // (the name '2026-2027' exists once per college, each with its own UUID), so
  // a specific academic_year_id is only meaningful within one institution.
  const selectedInstitutionId = filters.institution_ids?.[0];

  const { data: academicYears } = useAcademicYears(selectedInstitutionId);

  // Admission cohorts, deduped to one entry per YEAR across institutions — so
  // unlike Academic Year this stays usable in "All accessible institutions"
  // mode. Reads admission_years directly, which is gated on
  // admission.settings.years.view; every role holding billing.coverage.view
  // also holds that key today, so no separate RPC is warranted.
  const { data: admissionYears } = useGroupAdmissionYears(
    filters.institution_ids ?? null
  );

  const { categories } = useBillingCategories({ isActive: true, limit: 1000 });

  // Options for the audit's "Earliest Academic Year" floor. Read UNSCOPED (no
  // institution argument) and deduped to one entry per start year, so — like
  // Admission Year and unlike Academic Year — the control stays usable in "All
  // accessible institutions" mode. Years are the same integers everywhere.
  const { data: allAcademicYears } = useAcademicYears();
  const earliestYearOptions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const years = new Set<number>();
    for (const y of (allAcademicYears?.data ?? []) as any[]) {
      // Derived from start_date, never academic_year_name: the name is TEXT,
      // several rows carry trailing spaces, and institutions pre-create years
      // years ahead. A future year cannot be a floor on work already due.
      if (!y?.start_date || String(y.start_date) > today) continue;
      years.add(Number(String(y.start_date).slice(0, 4)));
    }
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((year) => ({ year, label: `${year}-${year + 1}` }));
  }, [allAcademicYears]);

  // accommodation_types is a small global lookup (4 active rows) — no
  // institution scoping, so it is safe to cache for the session.
  const { data: accommodationTypes } = useQuery({
    queryKey: ['accommodation-types', 'active'],
    queryFn: () => LookupService.listAccommodationTypes(true),
    staleTime: 30 * 60 * 1000
  });

  // Degree → Department → Programme → Semester → Section. Each level's options
  // are loaded from the level above, so only reachable combinations are offered.
  const hierarchy = useAcademicHierarchyFilters({
    institution_id: selectedInstitutionId,
    degree_id: filters.degree_id ?? undefined,
    department_id: filters.department_id ?? undefined,
    program_id: filters.program_id ?? undefined,
    semester_id: filters.semester_id ?? undefined
  });

  /**
   * Build the filter patch for a hierarchy change: the new value plus every
   * descendant cleared, as ONE object. It must be applied in a single onChange —
   * calling onChange per level would let each write clobber the previous one.
   *
   * Two translations from the shared hook's shape:
   *  - it clears with `undefined`, which a spread merge would drop and leave the
   *    stale child in place; BillCoverageFilters clears with `null`.
   *  - it emits `institution_id`, but coverage scopes by `institution_ids[]`.
   */
  const cascadePatch = (
    key: 'institution_id' | 'degree_id' | 'department_id' | 'program_id' | 'semester_id' | 'section_id',
    value?: string
  ): Partial<BillCoverageFilters> => {
    const raw = hierarchy.cascadeClear(key, value);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === 'institution_id') continue;
      patch[k] = v ?? null;
    }
    return patch as Partial<BillCoverageFilters>;
  };

  const selectedAccommodationId = filters.accommodation_type_ids?.[0];

  const statuses = filters.lifecycle_statuses ?? [...LEARNER_SCOPE_DEFAULT];

  const toggleStatus = (status: string) => {
    const next = statuses.includes(status)
      ? statuses.filter((s) => s !== status)
      : [...statuses, status];
    // Never let the scope go empty — an empty array would return no learners
    // and read as "no gaps", which is the opposite of the truth.
    if (next.length === 0) return;
    onChange({ lifecycle_statuses: next });
  };

  const nameOf = (list: { id: string; name: string }[], id?: string | null) =>
    id ? list.find((x) => x.id === id)?.name : undefined;

  /** Printed at the top of the PDF. Without it a reader cannot tell whether a
   *  document showing 40 learners was filtered or is the whole population. */
  const filterSummary = (): string[] => {
    const parts: string[] = [];
    const inst = institutions.find(
      (i) => i.institution_id === selectedInstitutionId
    )?.institution_name;
    if (inst) parts.push(inst);
    // Always stated, even unfiltered. "Not generated" is meaningless without
    // the year it was measured against, and a printed document has no filter
    // bar for the reader to check.
    const ay = (academicYears?.data ?? []).find(
      (y: any) => y.id === filters.academic_year_id
    )?.academic_year_name;
    parts.push(ay ? `AY ${ay}` : "AY: each institution's current year");
    const push = (label: string, v?: string) => v && parts.push(`${label}: ${v}`);
    // Stated by its own label so a reader cannot mistake the cohort for the AY
    // printed just above it — the two are different years on the same document.
    push(
      'Admission Year',
      filters.admission_year != null
        ? ((admissionYears ?? []).find(
            (y) => y.programStartYear === filters.admission_year
          )?.label ?? String(filters.admission_year))
        : undefined
    );
    push('Degree', nameOf(hierarchy.degrees, filters.degree_id));
    push('Department', nameOf(hierarchy.departments, filters.department_id));
    push('Programme', nameOf(hierarchy.programs, filters.program_id));
    push('Semester', nameOf(hierarchy.semesters, filters.semester_id));
    push('Section', nameOf(hierarchy.sections, filters.section_id));
    const cat = (categories ?? []).find(
      (c: any) => c.id === filters.billing_category_id
    )?.category_name;
    push('Category', cat);
    const acc = (accommodationTypes ?? []).find(
      (a: any) => a.id === selectedAccommodationId
    )?.name;
    push('Accommodation', acc);
    if (filters.transport && filters.transport !== 'any') {
      parts.push(filters.transport === 'bus' ? 'Uses bus' : 'No bus');
    }
    if (filters.gender) {
      parts.push(
        filters.gender === GENDER_UNSET ? 'Gender not recorded' : filters.gender
      );
    }
    parts.push(`Show: ${filters.coverage_state ?? 'not_generated'}`);
    parts.push(`Lifecycle: ${statuses.join(', ')}`);
    return parts;
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const { rows, learnerCount } =
        await BillCoverageService.getLearnerBills(filters);
      if (!rows.length) {
        toast.error('No learners match these filters — nothing to export');
        return;
      }
      downloadCoverageBillsPdf({
        rows,
        learnerCount,
        filterSummary: filterSummary()
      });
      // learnerCount is the true total BEFORE the server-side cap, so a
      // shortfall means the document is incomplete — say so rather than let
      // someone reconcile against a silently truncated report.
      const shown = new Set(rows.map((r) => r.learner_id)).size;
      if (shown < learnerCount) {
        toast(
          `Exported the first ${shown} of ${learnerCount} learners — narrow the filters for the rest`,
          { duration: 6000 }
        );
      } else {
        toast.success(`Exported ${shown} learner${shown === 1 ? '' : 's'}`);
      }
    } catch (err) {
      // Supabase errors are plain objects, not Error instances.
      const message =
        err instanceof Error ? err.message : (err as any)?.message;
      toast.error(message || 'Failed to export bill details');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className='space-y-4 rounded-lg border p-4'>
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {/* Institution */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Institution</Label>
          <Select
            value={selectedInstitutionId ?? ALL}
            onValueChange={(v) =>
              onChange({
                // Clears academic year AND the whole degree→section chain: the
                // previous year and programme belong to the previous institution.
                ...cascadePatch('institution_id', v === ALL ? undefined : v),
                institution_ids: v === ALL ? null : [v]
              })
            }
            disabled={institutionsLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder='All accessible institutions' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All accessible institutions</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.institution_id} value={i.institution_id}>
                  {i.institution_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Academic year (Coverage) / Earliest academic year (Audit).
            One slot, two opposite meanings — see the variant doc above. */}
        {isAudit ? (
          <div className='space-y-1.5'>
            <Label className='text-xs'>Earliest Academic Year</Label>
            <Select
              value={
                filters.earliest_academic_year != null
                  ? String(filters.earliest_academic_year)
                  : ALL
              }
              onValueChange={(v) =>
                onChange({
                  earliest_academic_year: v === ALL ? null : Number(v)
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='From admission year' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>From admission year</SelectItem>
                {earliestYearOptions.map((y) => (
                  <SelectItem key={y.year} value={String(y.year)}>
                    {y.label} onwards
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className='text-[11px] text-muted-foreground'>
              Floors the audited window. Default audits every year back to each
              learner&apos;s admission year, including years that pre-date the
              institution&apos;s use of the system.
            </p>
          </div>
        ) : (
          <div className='space-y-1.5'>
            <Label className='text-xs'>Academic Year</Label>
            <Select
              value={filters.academic_year_id ?? ALL}
              onValueChange={(v) =>
                onChange({ academic_year_id: v === ALL ? null : v })
              }
              disabled={!selectedInstitutionId}
            >
              <SelectTrigger>
                <SelectValue placeholder='Current academic year' />
              </SelectTrigger>
              <SelectContent>
                {/* Was "Each learner's own year" — which is exactly what made
                    the report wrong. The default now measures every learner
                    against their institution's current year, resolved by date
                    in SQL. */}
                <SelectItem value={ALL}>Current academic year</SelectItem>
                {(academicYears?.data ?? []).map((y: any) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.academic_year_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!selectedInstitutionId && (
              <p className='text-[11px] text-muted-foreground'>
                Pick an institution to choose a specific year
              </p>
            )}
          </div>
        )}

        {/* Admission year (cohort).
            Sits next to Academic Year because the two are easily confused and
            do opposite things: Academic Year is the year coverage is MEASURED
            against, this one narrows WHICH LEARNERS are counted. Deliberately
            not disabled without an institution — the options are cohort year
            numbers, which are shared across every college. */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Admission Year</Label>
          <Select
            value={
              filters.admission_year != null
                ? String(filters.admission_year)
                : ALL
            }
            onValueChange={(v) =>
              onChange({ admission_year: v === ALL ? null : Number(v) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Any admission year' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any admission year</SelectItem>
              {(admissionYears ?? []).map((y) => (
                <SelectItem
                  key={y.programStartYear}
                  value={String(y.programStartYear)}
                >
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Degree → Department → Programme → Semester → Section.
            Each is disabled until its parent is chosen, so the dropdown can
            only ever offer combinations that actually exist. */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Degree</Label>
          <Select
            value={filters.degree_id ?? ALL}
            onValueChange={(v) =>
              onChange(cascadePatch('degree_id', v === ALL ? undefined : v))
            }
            disabled={!selectedInstitutionId || hierarchy.loading.degrees}
          >
            <SelectTrigger>
              <SelectValue placeholder='Any degree' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any degree</SelectItem>
              {hierarchy.degrees.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selectedInstitutionId && (
            <p className='text-[11px] text-muted-foreground'>
              Pick an institution first
            </p>
          )}
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs'>Department</Label>
          <Select
            value={filters.department_id ?? ALL}
            onValueChange={(v) =>
              onChange(cascadePatch('department_id', v === ALL ? undefined : v))
            }
            disabled={!filters.degree_id || hierarchy.loading.departments}
          >
            <SelectTrigger>
              <SelectValue placeholder='Any department' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any department</SelectItem>
              {hierarchy.departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs'>Programme</Label>
          <Select
            value={filters.program_id ?? ALL}
            onValueChange={(v) =>
              onChange(cascadePatch('program_id', v === ALL ? undefined : v))
            }
            disabled={!filters.department_id || hierarchy.loading.programs}
          >
            <SelectTrigger>
              <SelectValue placeholder='Any programme' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any programme</SelectItem>
              {hierarchy.programs.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs'>Semester</Label>
          <Select
            value={filters.semester_id ?? ALL}
            onValueChange={(v) =>
              onChange(cascadePatch('semester_id', v === ALL ? undefined : v))
            }
            disabled={!filters.program_id || hierarchy.loading.semesters}
          >
            <SelectTrigger>
              <SelectValue placeholder='Any semester' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any semester</SelectItem>
              {hierarchy.semesters.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs'>Section</Label>
          <Select
            value={filters.section_id ?? ALL}
            onValueChange={(v) =>
              onChange(cascadePatch('section_id', v === ALL ? undefined : v))
            }
            disabled={!filters.semester_id || hierarchy.loading.sections}
          >
            <SelectTrigger>
              <SelectValue placeholder='Any section' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any section</SelectItem>
              {hierarchy.sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Billing category — Coverage only. Both audits are defined over the
            tuition categories as a set, so narrowing to one of them would ask
            "is the 3 Year fee missing from every year", which is not a question
            either check answers. */}
        {!isAudit && (
          <div className='space-y-1.5'>
            <Label className='text-xs'>Billing Category</Label>
            <Select
              value={filters.billing_category_id ?? ALL}
              onValueChange={(v) =>
                onChange({ billing_category_id: v === ALL ? null : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='Any category' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any category</SelectItem>
                {(categories ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.category_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Accommodation */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Accommodation</Label>
          <Select
            value={selectedAccommodationId ?? ALL}
            onValueChange={(v) =>
              onChange({ accommodation_type_ids: v === ALL ? null : [v] })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Any accommodation' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any accommodation</SelectItem>
              {(accommodationTypes ?? []).map((a: any) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Transport — a separate dimension, not an accommodation value.
            Day scholars and hostellers both appear under "Uses bus", so this
            composes with the accommodation filter rather than replacing it. */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Transport</Label>
          <Select
            value={filters.transport ?? 'any'}
            onValueChange={(v) =>
              onChange({ transport: v as BillCoverageFilters['transport'] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='any'>Any transport</SelectItem>
              <SelectItem value='bus'>Uses bus</SelectItem>
              <SelectItem value='no_bus'>No bus</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Gender */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Gender</Label>
          <Select
            value={filters.gender ?? ALL}
            onValueChange={(v) => onChange({ gender: v === ALL ? null : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder='Any gender' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any gender</SelectItem>
              <SelectItem value='MALE'>Male</SelectItem>
              <SelectItem value='FEMALE'>Female</SelectItem>
              {/* gender is TEXT NOT NULL holding '' for unrecorded learners,
                  so this needs its own sentinel rather than a null value. */}
              <SelectItem value={GENDER_UNSET}>Not recorded</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Verdict filter. The two tabs have disjoint value spaces, so they
            write to different fields — sending 'not_generated' to an RPC that
            only understands 'gap' would silently return nothing. Applies to the
            Missing Year Bills check; the duplicates list has no such states,
            since a row exists there only because it is a violation. */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Show</Label>
          {isAudit ? (
            <Select
              value={filters.audit_state ?? 'gap'}
              onValueChange={(v) =>
                onChange({
                  audit_state: v as BillCoverageFilters['audit_state']
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='gap'>Missing years</SelectItem>
                <SelectItem value='complete'>Complete</SelectItem>
                <SelectItem value='cannot_evaluate'>Cannot evaluate</SelectItem>
                <SelectItem value='all'>All learners</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Select
              value={filters.coverage_state ?? 'not_generated'}
              onValueChange={(v) =>
                onChange({
                  coverage_state: v as BillCoverageFilters['coverage_state']
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='not_generated'>Not generated</SelectItem>
                <SelectItem value='generated'>Generated</SelectItem>
                {/* Learners whose course had already finished by the measured
                    year — carved out of "Not generated", not out of
                    "Generated". */}
                <SelectItem value='not_applicable'>Programme ended</SelectItem>
                <SelectItem value='cannot_evaluate'>Cannot evaluate</SelectItem>
                <SelectItem value='all'>All learners</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Lifecycle statuses */}
      <div className='space-y-1.5'>
        <Label className='text-xs'>Lifecycle Status</Label>
        <div className='flex flex-wrap gap-2'>
          {LEARNER_SCOPE_DEFAULT.map((s) => (
            <Button
              key={s}
              type='button'
              size='sm'
              variant={statuses.includes(s) ? 'default' : 'outline'}
              onClick={() => toggleStatus(s)}
            >
              {STATUS_LABELS[s] ?? s}
            </Button>
          ))}
        </div>
      </div>

      {/* Search, sorting, paging and export live in the DataTable toolbar. */}
      <div className='flex items-center gap-2'>
        {/* Two different guards. Coverage asks "has this institution ever
            billed ANYTHING"; the audits ask "has it ever billed TUITION" —
            JKKN College of Arts and Science (Aided) passes the first on its
            transport bills alone and would contribute 490 phantom gaps. */}
        {isAudit ? (
          <>
            <Switch
              id='include-non-tuition'
              checked={filters.include_non_tuition_institutions ?? false}
              onCheckedChange={(checked) =>
                onChange({ include_non_tuition_institutions: checked })
              }
            />
            <Label htmlFor='include-non-tuition' className='text-xs'>
              Include institutions that have never billed tuition
            </Label>
          </>
        ) : (
          <>
            <Switch
              id='include-non-billing'
              checked={filters.include_non_billing_institutions ?? false}
              onCheckedChange={(checked) =>
                onChange({ include_non_billing_institutions: checked })
              }
            />
            <Label htmlFor='include-non-billing' className='text-xs'>
              Include institutions that have never billed
            </Label>
          </>
        )}

        {/* The PDF is built from get_billing_coverage_learner_bills, which
            reports ONE academic year. It cannot describe an audit that spans
            every year from admission to today, so the audit tab offers only the
            table's own XLS export. */}
        {canExport && !isAudit && (
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='ml-auto gap-2'
            onClick={handleExportPdf}
            disabled={exporting}
          >
            <FileDown className='h-4 w-4' />
            {exporting ? 'Preparing PDF…' : 'Export bill details (PDF)'}
          </Button>
        )}
      </div>
      {canExport && !isAudit && (
        <p className='text-[11px] text-muted-foreground'>
          The PDF lists every learner in the current filter with each of their
          bills — academic year, due date, total, paid and pending — plus a
          per-learner and grand total. The table&apos;s own Export button gives
          the flat one-row-per-learner sheet instead.
        </p>
      )}
      {isAudit && (
        <p className='text-[11px] text-muted-foreground'>
          Both checks cover the tuition categories only (1–6 Year Tuition Fee)
          and ignore cancelled and superseded bills. Academic years are matched
          by the year they start, so a bill stamped against an
          &ldquo;Additional&rdquo; copy of a year still counts for that year.
        </p>
      )}
    </div>
  );
}
