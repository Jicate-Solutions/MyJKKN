'use client';

/**
 * Advanced filters for the Learners Profiles list.
 *
 * Replaces the previous `profiles-filters.tsx`. Two things changed:
 *
 * 1. OPTIONS COME FROM ONE CACHED TREE. The old panel ran a five-request
 *    waterfall through five services on every institution change, with no
 *    cache. `useAcademicCascade` loads the institution's whole hierarchy once
 *    (five PARALLEL queries, ~300 rows) and every subsequent dropdown change is
 *    an in-memory filter — no network at all.
 * 2. THE PENDING STATE IS REAL. The old "Searching…" spinner was a hardcoded
 *    `setTimeout(…, 1000)` unrelated to the actual navigation. `useTransition`
 *    stays pending until the server component has actually streamed back.
 *
 * Behaviours deliberately carried over — each fixed a real incident:
 *  - institution scope comes from accessible institutions, NOT `isSuperAdmin`
 *  - exactly ONE batched URL write per gesture
 *  - "Clear" does a hard navigation, not `router.push`
 *  - the URL→state sync depends on individual values, never the params object
 */

import { useState, useEffect, useMemo, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { RotateCcw, ChevronDown, ChevronUp, Search, X, SlidersHorizontal } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { LookupService } from '@/lib/services/admission/lookup-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAcademicCascade } from '@/hooks/organization/use-academic-tree';
import type { ProfilesSearchParams } from './data-table-schema';
import {
  LIFECYCLE_TABS,
  resolveLifecycleTab,
  type LifecycleTabValue,
} from './lifecycle-status';

/**
 * Every query-string key owned by this panel. Apply and Clear must agree on
 * this list exactly — when they drifted apart, a "cleared" filter could survive
 * in the URL and reappear on the next page load.
 *
 * `status` is deliberately NOT here even though this panel now edits it. These
 * keys are all "absent = unfiltered", so Apply can delete-then-rewrite them
 * blindly; `status` has no absent state (it falls back to the Active tab) and
 * its cleared value is the real tab value 'all'. It is handled explicitly in
 * handleApply/handleClear instead.
 */
const FILTER_PARAM_KEYS = [
  'institution_id',
  'degree_id',
  'department_id',
  'program_id',
  'semester_id',
  'section_id',
  'academic_year_id',
  // Integer calendar year, unlike every other key here. admission_years is
  // institution-scoped (eleven "2026" rows), so filtering by a row id would
  // silently narrow to one college — see lib/utils/admission-year-filter.ts.
  'admission_year',
  'gender',
  'is_profile_complete',
  'accommodation_type_id',
] as const;

type FilterKey = (typeof FILTER_PARAM_KEYS)[number];
type Draft = Partial<Record<FilterKey, string>>;

const ALL = 'all';

// learners_profiles.gender is Title Case (Male/Female/Other) since 20260820160000 —
// enforced by learners_profiles_gender_check and normalised on write by
// trg_normalize_gender_learners_profiles. The query still matches with .ilike(), so a
// bookmarked ?gender=MALE from the old uppercase panel keeps working.
const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
];

const PROFILE_STATUS_OPTIONS = [
  { value: 'true', label: 'Complete' },
  { value: 'false', label: 'Incomplete' },
];

interface LearnerFilterBarProps {
  searchParams: ProfilesSearchParams;
}

function draftFromParams(searchParams: ProfilesSearchParams): Draft {
  return {
    institution_id: searchParams.institution_id || undefined,
    degree_id: searchParams.degree_id || undefined,
    department_id: searchParams.department_id || undefined,
    program_id: searchParams.program_id || undefined,
    semester_id: searchParams.semester_id || undefined,
    section_id: searchParams.section_id || undefined,
    academic_year_id: searchParams.academic_year_id || undefined,
    // Draft values are all strings (they become query-string values); the
    // schema coerces this one to a number, so it is stringified back here.
    admission_year: searchParams.admission_year
      ? String(searchParams.admission_year)
      : undefined,
    gender: searchParams.gender || undefined,
    is_profile_complete: searchParams.is_profile_complete || undefined,
    accommodation_type_id: searchParams.accommodation_type_id || undefined,
  };
}

export function LearnerFilterBar({ searchParams }: LearnerFilterBarProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isClearing, setIsClearing] = useState(false);
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  const { isSuperAdmin } = usePermissions();
  const { profile } = useAuth();

  // Institution scope is driven by the user's ACCESSIBLE institutions (which
  // honors institution_scope='all' / multi-institution roles), NOT by
  // isSuperAdmin. Gating on isSuperAdmin silently locked scope='all' users to a
  // single (often empty) institution.
  const { institutions, loading: loadingInstitutions } = useInstitutionsWithAccess();
  const canSelectAcrossInstitutions = isSuperAdmin || institutions.length > 1;
  const singleInstitutionId =
    !isSuperAdmin && institutions.length === 1 ? institutions[0].id : undefined;

  const [draft, setDraft] = useState<Draft>(() => draftFromParams(searchParams));

  /**
   * Lifecycle status is the SAME `status` param the tab strip owns, so the two
   * controls can never disagree — picking "Reserved" here moves the tab, and
   * clicking the Reserved tab moves this select.
   *
   * Modelling it as an independent predicate was the alternative and it is a
   * trap: "Active" tab AND "Reserved" filter ANDs to zero rows, and this page's
   * failure mode is always a silent empty table rather than an error.
   */
  const [statusDraft, setStatusDraft] = useState<LifecycleTabValue>(() =>
    resolveLifecycleTab(searchParams.status)
  );

  useEffect(() => {
    setStatusDraft(resolveLifecycleTab(searchParams.status));
  }, [searchParams.status]);

  // Sync draft when the URL changes. Depend on the individual values, NOT the
  // searchParams object: the parent rebuilds that object on every render, so an
  // object dependency re-ran this on renders where nothing had actually changed
  // — wiping picks the user had made but not yet applied.
  useEffect(() => {
    setDraft(draftFromParams(searchParams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    searchParams.institution_id,
    searchParams.degree_id,
    searchParams.department_id,
    searchParams.program_id,
    searchParams.semester_id,
    searchParams.section_id,
    searchParams.academic_year_id,
    searchParams.admission_year,
    searchParams.gender,
    searchParams.is_profile_complete,
    searchParams.accommodation_type_id,
  ]);

  // Auto-select the institution ONLY when the user can reach exactly one.
  useEffect(() => {
    if (singleInstitutionId && !draft.institution_id) {
      setDraft((prev) => ({ ...prev, institution_id: singleInstitutionId }));
    }
  }, [singleInstitutionId, draft.institution_id]);

  const cascade = useAcademicCascade(draft.institution_id, {
    degree_id: draft.degree_id,
    department_id: draft.department_id,
    program_id: draft.program_id,
    semester_id: draft.semester_id,
  });

  // Auto-select department for HOD users, and lock the control.
  const hodLocked = profile?.role === 'hod' && !isSuperAdmin;
  useEffect(() => {
    if (hodLocked && profile?.department_id && !draft.department_id) {
      setDraft((prev) => ({
        ...prev,
        department_id: profile.department_id || undefined,
      }));
    }
  }, [hodLocked, profile?.department_id, draft.department_id]);

  const institutionOptions = useMemo(
    () => institutions.map((i) => ({ value: i.id, label: i.name })),
    [institutions]
  );

  /**
   * accommodation_types is a small GLOBAL lookup (4 active rows, no institution
   * scoping), so it is cached for the session and does not belong in the
   * academic cascade — it has no parent and no children, and picking one must
   * not clear anything. Same query and staleTime as the Billing Coverage filter
   * bar, so the two share one cache entry.
   */
  const { data: accommodationTypes, isLoading: loadingAccommodation } = useQuery({
    queryKey: ['accommodation-types', 'active'],
    queryFn: () => LookupService.listAccommodationTypes(true),
    staleTime: 30 * 60 * 1000,
  });

  const accommodationOptions = useMemo(
    () => (accommodationTypes ?? []).map((a) => ({ value: a.id, label: a.name })),
    [accommodationTypes]
  );

  /**
   * Admission years, as DISTINCT CALENDAR YEARS.
   *
   * Deliberately NOT part of `useAcademicCascade`. That hook is
   * `enabled: Boolean(institutionId)` and scopes every query with
   * `.eq('institution_id', …)`, so it returns nothing in "All Institutions"
   * mode — which is precisely where a cohort filter has to keep working, and is
   * the default for anyone who can reach more than one institution.
   * (/api/learners/analytics/incomplete-profiles/options reaches the same
   * conclusion for the same reason.)
   *
   * The rows are institution-scoped (eleven "2026" rows, 79 total) but the
   * FILTER is not: we dedupe to the year, and the server fans it back out to
   * every visible row id. RLS on admission_years still decides which rows the
   * user sees, so the year list is already tenant-correct.
   */
  const { data: admissionYears, isLoading: loadingAdmissionYears } = useQuery({
    queryKey: ['admission-years', 'distinct-years'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('admission_years')
        .select('year')
        .order('year', { ascending: false });

      // Supabase errors are plain objects — surface the code rather than
      // letting a failure look like "this institution has no admission years".
      if (error) {
        throw new Error(
          `Failed to load admission years: ${getErrorMessage(error)}`
        );
      }
      return Array.from(
        new Set((data ?? []).map((r: { year: number }) => r.year))
      ).sort((a, b) => b - a);
    },
    staleTime: 30 * 60 * 1000,
  });

  const admissionYearOptions = useMemo(
    () =>
      (admissionYears ?? []).map((y) => ({ value: String(y), label: String(y) })),
    [admissionYears]
  );

  /**
   * Set one level and clear everything below it, as a single state update.
   * Modelling "set + clear children" as one change is what keeps Apply writing
   * the URL exactly once.
   */
  const pick = (key: FilterKey, raw: string) => {
    const value = raw === ALL ? undefined : raw;
    setDraft((prev) => {
      const next: Draft = { ...prev, [key]: value };
      const clearBelow: Record<string, FilterKey[]> = {
        institution_id: [
          'degree_id',
          'department_id',
          'program_id',
          'semester_id',
          'section_id',
          'academic_year_id',
        ],
        degree_id: ['department_id', 'program_id', 'semester_id', 'section_id'],
        department_id: ['program_id', 'semester_id', 'section_id'],
        program_id: ['semester_id', 'section_id'],
        semester_id: ['section_id'],
      };
      for (const child of clearBelow[key] ?? []) next[child] = undefined;
      return next;
    });
  };

  const activeCount = FILTER_PARAM_KEYS.filter((k) => searchParams[k]).length;

  const handleApply = () => {
    // Start from the current URL so text-search state survives, then rewrite
    // this panel's keys. ONE write — looping router.replace per key would make
    // every call read the same stale useSearchParams snapshot and the last one
    // (a child clear) would win, silently dropping the user's selection.
    const params = new URLSearchParams(currentSearchParams.toString());
    for (const key of FILTER_PARAM_KEYS) params.delete(key);
    for (const [key, value] of Object.entries(draft)) {
      if (value) params.set(key, value);
    }
    // Always written, never deleted: 'all' is a real tab, so an absent `status`
    // would silently resolve back to Active instead of the user's pick.
    params.set('status', statusDraft);
    params.set('page', '1');

    startTransition(() => {
      router.push(`/learners/profiles?${params.toString()}`);
    });
  };

  const removeOne = (key: FilterKey) => {
    const params = new URLSearchParams(currentSearchParams.toString());
    params.delete(key);
    // Removing a level invalidates everything under it.
    const below: Record<string, FilterKey[]> = {
      institution_id: [
        'degree_id',
        'department_id',
        'program_id',
        'semester_id',
        'section_id',
        'academic_year_id',
      ],
      degree_id: ['department_id', 'program_id', 'semester_id', 'section_id'],
      department_id: ['program_id', 'semester_id', 'section_id'],
      program_id: ['semester_id', 'section_id'],
      semester_id: ['section_id'],
    };
    for (const child of below[key] ?? []) params.delete(child);
    params.set('page', '1');
    startTransition(() => {
      router.push(`/learners/profiles?${params.toString()}`);
    });
  };

  /**
   * Deliberately a FULL page navigation, not router.push().
   *
   * The data table keeps its own URL state and rebuilds the query string from a
   * snapshot of the params. After a soft clear it could re-write the address bar
   * from its pre-clear snapshot: the panel looked empty, but the filters were
   * still in the URL and every one came back on refresh. A hard navigation tears
   * that client down, so the cleared URL is the one that survives.
   */
  const handleClear = () => {
    setIsClearing(true);
    setDraft({});
    setStatusDraft('all');

    const params = new URLSearchParams(currentSearchParams.toString());
    for (const key of FILTER_PARAM_KEYS) params.delete(key);
    // Every other control clears to "All X", so status clears to "All Statuses"
    // — not to Active, which would be applying a filter rather than clearing one.
    params.set('status', 'all');
    params.set('page', '1');

    const query = params.toString();
    window.location.assign(`/learners/profiles${query ? `?${query}` : ''}`);
  };

  // Chips describe what is ACTUALLY applied (the URL), not the unsaved draft.
  const appliedChips = useMemo(() => {
    const labelFor = (
      options: { value: string; label: string }[],
      id?: string
    ) => options.find((o) => o.value === id)?.label;

    const chips: { key: FilterKey; label: string; value: string }[] = [];
    const push = (key: FilterKey, label: string, value?: string) => {
      if (searchParams[key] && value) chips.push({ key, label, value });
    };

    push('institution_id', 'Institution', labelFor(institutionOptions, searchParams.institution_id));
    push('degree_id', 'Degree', labelFor(cascade.degrees, searchParams.degree_id));
    push('department_id', 'Department', labelFor(cascade.departments, searchParams.department_id));
    push('program_id', 'Programme', labelFor(cascade.programs, searchParams.program_id));
    push('semester_id', 'Semester', labelFor(cascade.semesters, searchParams.semester_id));
    push('section_id', 'Section', labelFor(cascade.sections, searchParams.section_id));
    push(
      'academic_year_id',
      'Academic Year',
      labelFor(cascade.academicYears, searchParams.academic_year_id)
    );
    push(
      'admission_year',
      'Admission Year',
      searchParams.admission_year ? String(searchParams.admission_year) : undefined
    );
    push('gender', 'Gender', labelFor(GENDER_OPTIONS, searchParams.gender));
    push(
      'is_profile_complete',
      'Profile',
      labelFor(PROFILE_STATUS_OPTIONS, searchParams.is_profile_complete)
    );
    push(
      'accommodation_type_id',
      'Accommodation',
      labelFor(accommodationOptions, searchParams.accommodation_type_id)
    );
    return chips;
    // accommodationOptions is a real dependency: the chip's label is resolved
    // from it, so a chip rendered before the lookup resolves would silently be
    // dropped by `push` (which needs a value) and never come back.
  }, [searchParams, institutionOptions, cascade, accommodationOptions]);

  const treeLoading = cascade.isLoading;

  return (
    <div className='space-y-3'>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant='outline' className='w-full justify-between'>
            <span className='flex items-center gap-2'>
              <SlidersHorizontal className='h-4 w-4' />
              Advanced Filters
              {activeCount > 0 && (
                <Badge variant='secondary' className='ml-1'>
                  {activeCount}
                </Badge>
              )}
            </span>
            {open ? (
              <ChevronUp className='h-4 w-4' />
            ) : (
              <ChevronDown className='h-4 w-4' />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className='space-y-4 pt-4'>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            <SearchableSelect
              value={draft.institution_id ?? ''}
              onValueChange={(v) => pick('institution_id', v)}
              options={[{ value: ALL, label: 'All Institutions' }, ...institutionOptions]}
              placeholder={
                canSelectAcrossInstitutions
                  ? 'Select Institution'
                  : 'Your institution is auto-selected'
              }
              searchPlaceholder='Search institutions…'
              loading={loadingInstitutions}
              disabled={!canSelectAcrossInstitutions}
            />

            <SearchableSelect
              value={draft.degree_id ?? ''}
              onValueChange={(v) => pick('degree_id', v)}
              options={[{ value: ALL, label: 'All Degrees' }, ...cascade.degrees]}
              placeholder='Select Degree'
              searchPlaceholder='Search degrees…'
              loading={treeLoading}
              disabled={!draft.institution_id}
            />

            <SearchableSelect
              value={draft.department_id ?? ''}
              onValueChange={(v) => pick('department_id', v)}
              options={[{ value: ALL, label: 'All Departments' }, ...cascade.departments]}
              placeholder={
                hodLocked ? 'Your department is auto-selected' : 'Select Department'
              }
              searchPlaceholder='Search departments…'
              loading={treeLoading}
              disabled={!draft.institution_id || hodLocked}
            />

            <SearchableSelect
              value={draft.program_id ?? ''}
              onValueChange={(v) => pick('program_id', v)}
              options={[{ value: ALL, label: 'All Programmes' }, ...cascade.programs]}
              placeholder='Select Programme'
              searchPlaceholder='Search programmes…'
              loading={treeLoading}
              disabled={!draft.institution_id}
            />

            <SearchableSelect
              value={draft.semester_id ?? ''}
              onValueChange={(v) => pick('semester_id', v)}
              options={[{ value: ALL, label: 'All Semesters' }, ...cascade.semesters]}
              placeholder='Select Semester'
              searchPlaceholder='Search semesters…'
              loading={treeLoading}
              disabled={!draft.program_id}
            />

            <SearchableSelect
              value={draft.section_id ?? ''}
              onValueChange={(v) => pick('section_id', v)}
              options={[{ value: ALL, label: 'All Sections' }, ...cascade.sections]}
              placeholder='Select Section'
              searchPlaceholder='Search sections…'
              loading={treeLoading}
              disabled={!draft.semester_id}
            />

            <SearchableSelect
              value={draft.academic_year_id ?? ''}
              onValueChange={(v) => pick('academic_year_id', v)}
              options={[
                { value: ALL, label: 'All Academic Years' },
                ...cascade.academicYears,
              ]}
              placeholder='Select Academic Year'
              searchPlaceholder='Search academic years…'
              loading={treeLoading}
              disabled={!draft.institution_id}
            />

            {/* Admission year (the cohort the learner JOINED in), as distinct
                from Academic Year above (the term they are enrolled in now).
                A flat filter like Gender: `pick` clears nothing under it and it
                stays usable with no institution selected. */}
            <SearchableSelect
              value={draft.admission_year ?? ''}
              onValueChange={(v) => pick('admission_year', v)}
              options={[
                { value: ALL, label: 'All Admission Years' },
                ...admissionYearOptions,
              ]}
              placeholder='Select Admission Year'
              searchPlaceholder='Search admission years…'
              loading={loadingAdmissionYears}
            />

            {/* Lifecycle status. Options come straight from LIFECYCLE_TABS so
                the labels here and on the tab strip can never diverge, and so
                this list stays limited to the five statuses the page shows. */}
            <SearchableSelect
              value={statusDraft}
              onValueChange={(v) => setStatusDraft(v as LifecycleTabValue)}
              options={LIFECYCLE_TABS.map((t) => ({
                value: t.value,
                label: t.label,
              }))}
              placeholder='Lifecycle Status'
              searchPlaceholder='Search statuses…'
            />

            <SearchableSelect
              value={draft.gender ?? ''}
              onValueChange={(v) => pick('gender', v)}
              options={[{ value: ALL, label: 'All Genders' }, ...GENDER_OPTIONS]}
              placeholder='Select Gender'
              searchPlaceholder='Search…'
            />

            <SearchableSelect
              value={draft.is_profile_complete ?? ''}
              onValueChange={(v) => pick('is_profile_complete', v)}
              options={[{ value: ALL, label: 'All Profiles' }, ...PROFILE_STATUS_OPTIONS]}
              placeholder='Profile Status'
              searchPlaceholder='Search…'
            />

            {/* Where the learner lives. A flat filter like Gender — it sits
                outside the academic cascade, so `pick` clears nothing under it
                and it stays usable with no institution selected. */}
            <SearchableSelect
              value={draft.accommodation_type_id ?? ''}
              onValueChange={(v) => pick('accommodation_type_id', v)}
              options={[
                { value: ALL, label: 'All Accommodation' },
                ...accommodationOptions,
              ]}
              placeholder='Select Accommodation'
              searchPlaceholder='Search accommodation…'
              loading={loadingAccommodation}
            />
          </div>

          {cascade.error && (
            <p className='text-sm text-destructive'>
              Could not load the academic hierarchy: {cascade.error.message}
            </p>
          )}

          <div className='flex flex-wrap justify-between gap-2 pt-1'>
            <Button variant='outline' onClick={handleClear} disabled={isClearing}>
              {isClearing ? (
                <>
                  <span className='mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
                  Clearing…
                </>
              ) : (
                <>
                  <RotateCcw className='mr-2 h-4 w-4' />
                  Clear All Filters
                </>
              )}
            </Button>
            <Button onClick={handleApply} disabled={isPending || isClearing} className='ml-auto'>
              {isPending ? (
                <>
                  <span className='mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
                  Applying…
                </>
              ) : (
                <>
                  <Search className='mr-2 h-4 w-4' />
                  Apply Filters
                </>
              )}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {appliedChips.length > 0 && (
        <div className='flex flex-wrap items-center gap-2'>
          {appliedChips.map((chip) => (
            <Badge key={chip.key} variant='secondary' className='gap-1 py-1 pl-2 pr-1'>
              <span className='text-muted-foreground'>{chip.label}:</span>
              <span className='font-medium'>{chip.value}</span>
              <button
                type='button'
                aria-label={`Remove ${chip.label} filter`}
                className='ml-0.5 rounded-sm p-0.5 hover:bg-muted-foreground/20'
                onClick={() => removeOne(chip.key)}
              >
                <X className='h-3 w-3' />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
