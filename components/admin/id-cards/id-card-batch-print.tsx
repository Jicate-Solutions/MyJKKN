'use client';

// ============================================================================
// IdCardBatchPrint — cohort-driven batch ID-card printing.
// Created: 2026-07-24 — Phase 3 (admission-week scale batch printing).
//
// Two cohort modes, one flow:
//   • "Freshers batch"   — institution + admission year (whole intake cohort).
//   • "Class / section"  — institution + program (+ optional section). At the
//     school tier (Nattraja Vidhyalya CBSE etc.) classes like LKG or GRADE 3
//     ARE programs rows, so this same picker covers school class-wise printing.
//
// Select-all-MATCHING semantics: the cohort filter drives a live count query,
// then the full matching set is fetched (paged) and learner→account mapping
// (profiles.learner_id) is resolved BEFORE the confirm dialog so the ribbon
// estimate counts real printable cards, not raw matches. Learners without an
// account are reported and excluded up front.
//
// The actual confirm → sequential enqueue → results flow reuses the existing
// BulkPrintDialog (shipped in the Phase 2 bulk substrate) unchanged.
//
// Access: the page shell gates on id_cards.jobs.manage; POST /api/id-cards/jobs
// enforces writer roles server-side regardless.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Printer, Users } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { AdmissionYearService } from '@/lib/services/admission/admission-year-service';
import type { AdmissionYear } from '@/types/admission';
import {
  BulkPrintDialog,
  type BulkPrintLearner
} from '@/components/id-cards/bulk-print-dialog';
import { resolveProfileIdsForLearners } from '@/lib/services/id-cards/print-jobs-client';
import type { LifecycleStatus } from '@/types/learner-profile';

type CohortMode = 'freshers' | 'class';

// Plain-English lifecycle choices. Card-worthy statuses only — enquiries,
// rejected and exited learners are never offered.
const STATUS_CHOICES: ReadonlyArray<{
  value: string;
  label: string;
  statuses: LifecycleStatus[];
}> = [
  {
    value: 'active',
    label: 'Active learners only',
    statuses: ['active']
  },
  {
    value: 'active_admitted',
    label: 'Active + newly admitted (admission week)',
    statuses: ['active', 'admitted', 'account']
  },
  {
    value: 'with_reserved',
    label: 'Active + admitted + seat reserved',
    statuses: ['active', 'admitted', 'account', 'reserved']
  }
];

type StatusChoiceValue = (typeof STATUS_CHOICES)[number]['value'];

const ALL_SECTIONS = 'all';
const FETCH_PAGE_SIZE = 1000;

interface ProgramOption {
  id: string;
  program_name: string;
}

interface SectionOption {
  id: string;
  section_name: string;
}

export function IdCardBatchPrint() {
  const { institutions, loading: institutionsLoading } =
    useInstitutionsWithAccess({
      // Schools (Nattraja Vidhyalya CBSE, JKKN Matric HSS) are
      // entity_type='school' — the default 'institution' filter would hide
      // them and break the class-wise school use-case.
      entityType: ['institution', 'school']
    });

  const [institutionId, setInstitutionId] = useState('');
  const [mode, setMode] = useState<CohortMode>('freshers');
  const [admissionYearId, setAdmissionYearId] = useState('');
  const [programId, setProgramId] = useState('');
  const [sectionId, setSectionId] = useState<string>(ALL_SECTIONS);
  const [statusChoice, setStatusChoice] =
    useState<StatusChoiceValue>('active');

  const [admissionYears, setAdmissionYears] = useState<AdmissionYear[] | null>(
    null
  );
  const [programs, setPrograms] = useState<ProgramOption[] | null>(null);
  const [sections, setSections] = useState<SectionOption[] | null>(null);

  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogLearners, setDialogLearners] = useState<BulkPrintLearner[]>([]);
  const [skippedNoAccount, setSkippedNoAccount] = useState(0);

  const statuses = useMemo<LifecycleStatus[]>(
    () =>
      STATUS_CHOICES.find((c) => c.value === statusChoice)?.statuses ??
      ['active'],
    [statusChoice]
  );

  // ── Dependent dropdown data ────────────────────────────────────────────────

  // Admission years for the chosen institution (newest first, active only).
  useEffect(() => {
    if (!institutionId) {
      setAdmissionYears(null);
      setAdmissionYearId('');
      return;
    }
    let cancelled = false;
    setAdmissionYears(null);
    AdmissionYearService.getAdmissionYearsByInstitution(institutionId)
      .then((years) => {
        if (cancelled) return;
        setAdmissionYears(years);
        // Freshers = the newest admission year. Pre-select it.
        setAdmissionYearId(years[0]?.id ?? '');
      })
      .catch((err) => {
        console.error('[id-cards] Failed to load admission years:', err);
        if (!cancelled) setAdmissionYears([]);
      });
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  // Programs for the chosen institution. At the school tier these are the
  // classes themselves (PREKG, LKG, UKG, GRADE 1…), so numeric-aware sorting
  // keeps GRADE 2 ahead of GRADE 10.
  useEffect(() => {
    if (!institutionId) {
      setPrograms(null);
      setProgramId('');
      return;
    }
    let cancelled = false;
    setPrograms(null);
    const supabase = createClientSupabaseClient();
    supabase
      .from('programs')
      .select('id, program_name')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[id-cards] Failed to load programs:', error);
          setPrograms([]);
          return;
        }
        const rows = (data ?? []) as ProgramOption[];
        rows.sort((a, b) =>
          a.program_name.localeCompare(b.program_name, undefined, {
            numeric: true
          })
        );
        setPrograms(rows);
        setProgramId('');
      });
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  // Sections for the chosen program (optional narrowing; default all).
  useEffect(() => {
    if (!programId) {
      setSections(null);
      setSectionId(ALL_SECTIONS);
      return;
    }
    let cancelled = false;
    setSections(null);
    const supabase = createClientSupabaseClient();
    supabase
      .from('sections')
      .select('id, section_name')
      .eq('program_id', programId)
      .eq('is_active', true)
      .order('section_name')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[id-cards] Failed to load sections:', error);
          setSections([]);
          return;
        }
        setSections((data ?? []) as SectionOption[]);
        setSectionId(ALL_SECTIONS);
      });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  // ── Live cohort count ──────────────────────────────────────────────────────

  const cohortReady =
    Boolean(institutionId) &&
    (mode === 'freshers' ? Boolean(admissionYearId) : Boolean(programId));

  useEffect(() => {
    if (!cohortReady) {
      setMatchCount(null);
      return;
    }
    let cancelled = false;
    setCountLoading(true);
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('learners_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .in('lifecycle_status', statuses);
    if (mode === 'freshers') {
      query = query.eq('admission_year_id', admissionYearId);
    } else {
      query = query.eq('program_id', programId);
      if (sectionId !== ALL_SECTIONS) query = query.eq('section_id', sectionId);
    }
    query.then(({ count, error }) => {
      if (cancelled) return;
      setCountLoading(false);
      if (error) {
        console.error('[id-cards] Cohort count failed:', error);
        setMatchCount(null);
        return;
      }
      setMatchCount(count ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [cohortReady, institutionId, mode, admissionYearId, programId, sectionId, statuses]);

  // ── Review & print ─────────────────────────────────────────────────────────

  const prepareAndReview = async () => {
    if (!cohortReady) return;
    setPreparing(true);
    try {
      const supabase = createClientSupabaseClient();

      // Fetch ALL matching learners, paged. Ordered by program then roll
      // number so the physical print stack comes out grouped per class —
      // the bridge prints jobs in enqueue order.
      const matched: Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        roll_number: string | null;
      }> = [];
      for (let from = 0; ; from += FETCH_PAGE_SIZE) {
        let query = supabase
          .from('learners_profiles')
          .select('id, first_name, last_name, roll_number')
          .eq('institution_id', institutionId)
          .in('lifecycle_status', statuses)
          .order('program_id')
          .order('roll_number')
          .order('first_name')
          .range(from, from + FETCH_PAGE_SIZE - 1);
        if (mode === 'freshers') {
          query = query.eq('admission_year_id', admissionYearId);
        } else {
          query = query.eq('program_id', programId);
          if (sectionId !== ALL_SECTIONS)
            query = query.eq('section_id', sectionId);
        }
        const { data, error } = await query;
        if (error) throw error;
        matched.push(...(data ?? []));
        if (!data || data.length < FETCH_PAGE_SIZE) break;
      }

      if (matched.length === 0) {
        toast('No learners match this cohort.');
        return;
      }

      // Resolve accounts up front — only learners with an account
      // (profiles.learner_id) can get a card, and the ribbon estimate
      // must count real printable cards.
      const profileMap = await resolveProfileIdsForLearners(
        matched.map((l) => l.id)
      );

      const printable: BulkPrintLearner[] = [];
      let skipped = 0;
      for (const l of matched) {
        const name =
          [l.first_name, l.last_name].filter(Boolean).join(' ').trim() ||
          'Unnamed learner';
        if (profileMap.has(l.id)) {
          printable.push({
            learnerId: l.id,
            name,
            rollNumber: l.roll_number
          });
        } else {
          skipped += 1;
        }
      }

      if (printable.length === 0) {
        toast.error(
          `None of the ${matched.length} matching learners have an account yet — no cards can be printed.`
        );
        return;
      }

      if (skipped > 0) {
        // The inline note below sits behind the modal overlay, so surface
        // the exclusion via toast too (react-hot-toast renders above it).
        toast(
          `${skipped} learner${skipped === 1 ? '' : 's'} without an account excluded — ${printable.length} card${printable.length === 1 ? '' : 's'} ready to queue.`
        );
      }
      setDialogLearners(printable);
      setSkippedNoAccount(skipped);
      setDialogOpen(true);
    } catch (err) {
      console.error('[id-cards] Failed to prepare batch:', err);
      toast.error('Failed to load the cohort. Please try again.');
    } finally {
      setPreparing(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:max-w-xl">
        <div className="space-y-1.5">
          <Label>Institution</Label>
          <Select
            value={institutionId || undefined}
            onValueChange={setInstitutionId}
            disabled={institutionsLoading}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  institutionsLoading
                    ? 'Loading institutions…'
                    : 'Select institution'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as CohortMode)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="freshers">Freshers batch</TabsTrigger>
            <TabsTrigger value="class">Class / section</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === 'freshers' ? (
          <div className="space-y-1.5">
            <Label>Admission year</Label>
            <Select
              value={admissionYearId || undefined}
              onValueChange={setAdmissionYearId}
              disabled={!institutionId || admissionYears === null}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !institutionId
                      ? 'Select an institution first'
                      : admissionYears === null
                        ? 'Loading admission years…'
                        : 'Select admission year'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(admissionYears ?? []).map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.admission_year_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Freshers = the newest admission year (pre-selected).
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Class / program</Label>
              <Select
                value={programId || undefined}
                onValueChange={setProgramId}
                disabled={!institutionId || programs === null}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !institutionId
                        ? 'Select an institution first'
                        : programs === null
                          ? 'Loading…'
                          : 'Select class or program'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(programs ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.program_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Select
                value={sectionId}
                onValueChange={setSectionId}
                disabled={!programId || sections === null}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SECTIONS}>All sections</SelectItem>
                  {(sections ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Section {s.section_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Which learners?</Label>
          <Select
            value={statusChoice}
            onValueChange={(v) => setStatusChoice(v as StatusChoiceValue)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_CHOICES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          {!cohortReady ? (
            <span className="text-muted-foreground">
              Choose a cohort above to see how many learners match.
            </span>
          ) : countLoading ? (
            <span className="text-muted-foreground">Counting…</span>
          ) : matchCount === null ? (
            <span className="text-muted-foreground">Count unavailable.</span>
          ) : (
            <span>
              <strong>{matchCount}</strong> learner
              {matchCount === 1 ? '' : 's'} match this cohort.
            </span>
          )}
        </div>
        <Button
          onClick={prepareAndReview}
          disabled={!cohortReady || preparing || matchCount === 0}
        >
          {preparing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Printer className="mr-2 h-4 w-4" />
          )}
          Review &amp; print
        </Button>
      </div>

      {skippedNoAccount > 0 && dialogLearners.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {skippedNoAccount} matching learner
          {skippedNoAccount === 1 ? ' has' : 's have'} no account yet and{' '}
          {skippedNoAccount === 1 ? 'is' : 'are'} not included — ID cards
          become available once the learner account is activated.
        </p>
      )}

      <BulkPrintDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        learners={dialogLearners}
      />
    </div>
  );
}
