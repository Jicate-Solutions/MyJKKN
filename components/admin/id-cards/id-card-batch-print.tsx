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
// Photo policy (Director 2026-07-25): a card without a photo prints an
// initials box and wastes a ribbon panel, so learners with NO photo are
// excluded by default and reported as a copyable follow-up list. "Has a
// photo" mirrors the render engine's fallback chain (lib/id-cards/
// render-data.ts): learners_profiles.student_photo_url OR profiles.avatar_url
// non-empty. A checkbox restores the old include-everyone behavior.
// (student_photo_url is an existing DB identifier — terminology-exempt.)
//
// The actual confirm → sequential enqueue → results flow reuses the existing
// BulkPrintDialog (shipped in the Phase 2 bulk substrate) unchanged.
//
// Access: the page shell gates on id_cards.jobs.manage; POST /api/id-cards/jobs
// enforces writer roles server-side regardless.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, Printer, Users } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { resolveAccountsForLearners } from '@/lib/services/id-cards/print-jobs-client';
import type { LifecycleStatus } from '@/types/learner-profile';

type CohortMode = 'freshers' | 'class';

// Module-level so the array identity is stable across renders — an inline
// array recreates the hook's fetch callback every render, which re-fires its
// effect and loops the fetch forever ("Loading institutions…" never resolves).
const COHORT_ENTITY_TYPES: Array<'institution' | 'school'> = [
  'institution',
  'school'
];

// Plain-English lifecycle choices. Card-worthy statuses only — enquiries,
// rejected and exited learners are never offered. (Exported for unit tests.)
export const STATUS_CHOICES: ReadonlyArray<{
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

// Default 'active_admitted' — Director 2026-07-25: batch printing exists for
// admission week, so freshly admitted learners must be in by default.
export const DEFAULT_STATUS_CHOICE: StatusChoiceValue = 'active_admitted';

const ALL_SECTIONS = 'all';
const FETCH_PAGE_SIZE = 1000;

interface ProgramOption {
  id: string;
  program_name: string;
  /** The programme's short code (e.g. "CSE", "CSE-SH"). Never null. */
  program_id: string;
  /** LEFT-joined — programs.department_id is nullable, so this can be null. */
  department: { department_name: string | null } | null;
}

/**
 * Picker labels, keyed by programme id.
 *
 * A programme name is NOT unique within an institution. JKKN College of
 * Engineering carries five pairs whose program_name is byte-identical: the
 * degree programme (CSE, EEE, ECE, MECH, IT) and the first-year Science &
 * Humanities teaching row that shares its name (CSE-SH, …). Those -SH rows are
 * legitimate — they own the first-year common-class timetables and their own
 * attendance sessions, and the 2026-08-13 decision to merge them was reversed —
 * but the picker used to render program_name alone, so the twins were
 * indistinguishable and cards got printed against the row with no learners.
 *
 * A department suffix alone is not enough: "(B.Ed) - Pedagogy of Social
 * Science" also appears twice, as BED-1 and BED-10, in the SAME department. So
 * the qualifier carries the programme code as well as the department.
 *
 * Only ambiguous names are qualified — unique names (every school class:
 * PREKG, LKG, GRADE 1 …) stay clean. (Exported for unit tests.)
 */
export function buildProgramLabels(
  programs: readonly ProgramOption[]
): Map<string, string> {
  const timesNameUsed = new Map<string, number>();
  for (const p of programs) {
    timesNameUsed.set(p.program_name, (timesNameUsed.get(p.program_name) ?? 0) + 1);
  }

  const labels = new Map<string, string>();
  for (const p of programs) {
    if ((timesNameUsed.get(p.program_name) ?? 0) < 2) {
      labels.set(p.id, p.program_name);
      continue;
    }
    // Department is absent on some programmes (three live rows have a null
    // department_id) — fall back to the code alone rather than printing a gap.
    const qualifier = [p.program_id, p.department?.department_name]
      .map((part) => (part ?? '').trim())
      .filter((part) => part !== '')
      .join(' · ');
    labels.set(
      p.id,
      qualifier === '' ? p.program_name : `${p.program_name} — ${qualifier}`
    );
  }
  return labels;
}

interface SectionOption {
  id: string;
  section_name: string;
}

/** A matched learner left out of the batch because no photo is on record. */
interface NoPhotoLearner {
  name: string;
  rollNumber: string | null;
}

/**
 * Mirrors the render engine's photo shape check (lib/id-cards/render-data.ts):
 * only an inline data:image/ URI or an http(s) URL can actually render.
 * Anything else — a roll number, a bare filename — renders as NO photo.
 */
function isRenderablePhotoRef(value: string | null): boolean {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return false;
  return trimmed.startsWith('data:image/') || /^https?:\/\//i.test(trimmed);
}

/**
 * "Has a photo" = the card would print, per Guard 3 on POST /api/id-cards/jobs.
 *
 * REVERSED 2026-09-03 (Director): the account avatar NO LONGER counts. It used
 * to — this screen mirrored the render engine's fallback chain
 * (learners_profiles photo → profiles.avatar_url) and an avatar was enough. The
 * server rule now requires a photograph the institution took, with no override,
 * so a screen that still counted avatars would offer the office 30 learners the
 * endpoint refuses — the office chasing a different list than the printer.
 *
 * Junk values (e.g. a roll number stored in the photo column) count as no
 * photo, matching what the engine would actually draw. The account avatar is
 * not a parameter at all any more — it is not fetched, not weighed, not
 * rejected. (Exported for unit tests.)
 */
export function hasPrintablePhoto(learnerPhotoUrl: string | null): boolean {
  return isRenderablePhotoRef(learnerPhotoUrl);
}

export function IdCardBatchPrint() {
  const { institutions, loading: institutionsLoading } =
    useInstitutionsWithAccess({
      // Schools (Nattraja Vidhyalya CBSE, JKKN Matric HSS) are
      // entity_type='school' — the default 'institution' filter would hide
      // them and break the class-wise school use-case.
      entityType: COHORT_ENTITY_TYPES
    });

  const [institutionId, setInstitutionId] = useState('');
  const [mode, setMode] = useState<CohortMode>('freshers');
  const [admissionYearId, setAdmissionYearId] = useState('');
  const [programId, setProgramId] = useState('');
  const [sectionId, setSectionId] = useState<string>(ALL_SECTIONS);
  const [statusChoice, setStatusChoice] = useState<StatusChoiceValue>(
    DEFAULT_STATUS_CHOICE
  );

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
  // Photo policy: default OFF = skip learners without photos (ribbon saver).
  const [includeNoPhoto, setIncludeNoPhoto] = useState(false);
  const [skippedNoPhoto, setSkippedNoPhoto] = useState<NoPhotoLearner[]>([]);

  const statuses = useMemo<LifecycleStatus[]>(
    () =>
      STATUS_CHOICES.find((c) => c.value === statusChoice)?.statuses ??
      ['active'],
    [statusChoice]
  );

  const programLabels = useMemo(
    () => buildProgramLabels(programs ?? []),
    [programs]
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
      // LEFT join on departments (no `!inner`): programs.department_id is
      // nullable, and `!inner` silently drops those rows — live count 120 → 117.
      .select(
        'id, program_name, program_id, department:departments!programs_department_id_fkey(department_name)'
      )
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[id-cards] Failed to load programs:', error);
          setPrograms([]);
          return;
        }
        const rows = (data ?? []) as unknown as ProgramOption[];
        rows.sort(
          (a, b) =>
            a.program_name.localeCompare(b.program_name, undefined, {
              numeric: true
            }) ||
            // Same name = a twin pair; order them by code so the picker is
            // stable run to run (CSE before CSE-SH).
            a.program_id.localeCompare(b.program_id, undefined, {
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
    // Fresh reports every prepare — stale lists from a previous cohort would
    // mislead the office.
    setSkippedNoAccount(0);
    setSkippedNoPhoto([]);
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
        student_photo_url: string | null;
      }> = [];
      for (let from = 0; ; from += FETCH_PAGE_SIZE) {
        let query = supabase
          .from('learners_profiles')
          .select('id, first_name, last_name, roll_number, student_photo_url')
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
      const accountMap = await resolveAccountsForLearners(
        matched.map((l) => l.id)
      );

      // Two separate skip reasons, two separate reports:
      //   • no account  — a card is impossible until the account is activated.
      //   • no photo    — a card WOULD print, but as an initials box; skipped
      //     by default to save ribbon (checkbox overrides).
      const printable: BulkPrintLearner[] = [];
      const noPhoto: NoPhotoLearner[] = [];
      let noAccount = 0;
      for (const l of matched) {
        const name =
          [l.first_name, l.last_name].filter(Boolean).join(' ').trim() ||
          'Unnamed learner';
        const account = accountMap.get(l.id);
        if (!account) {
          noAccount += 1;
          continue;
        }
        if (
          !includeNoPhoto &&
          !hasPrintablePhoto(l.student_photo_url)
        ) {
          noPhoto.push({ name, rollNumber: l.roll_number });
          continue;
        }
        printable.push({
          learnerId: l.id,
          name,
          rollNumber: l.roll_number
        });
      }

      setDialogLearners(printable);
      setSkippedNoAccount(noAccount);
      setSkippedNoPhoto(noPhoto);

      if (printable.length === 0) {
        if (noPhoto.length > 0) {
          toast.error(
            `No cards to print: ${noPhoto.length} learner${noPhoto.length === 1 ? ' has' : 's have'} no photo yet${noAccount > 0 ? ` and ${noAccount} ${noAccount === 1 ? 'has' : 'have'} no account` : ''}. Collect photos (list below), or tick "Include learners without photos" to print initials-box cards anyway.`
          );
        } else {
          toast.error(
            `None of the ${matched.length} matching learners have an account yet — no cards can be printed.`
          );
        }
        return;
      }

      // The inline notes below sit behind the modal overlay, so surface
      // exclusions via toast too (react-hot-toast renders above it).
      if (noAccount > 0) {
        toast(
          `${noAccount} learner${noAccount === 1 ? '' : 's'} without an account excluded — ${printable.length} card${printable.length === 1 ? '' : 's'} ready to queue.`
        );
      }
      if (noPhoto.length > 0) {
        toast(
          `${noPhoto.length} learner${noPhoto.length === 1 ? '' : 's'} without a photo left out — see the list below the dialog to chase photos.`
        );
      }
      setDialogOpen(true);
    } catch (err) {
      console.error('[id-cards] Failed to prepare batch:', err);
      toast.error('Failed to load the cohort. Please try again.');
    } finally {
      setPreparing(false);
    }
  };

  const copyNoPhotoList = async () => {
    const text = skippedNoPhoto
      .map((l) => (l.rollNumber ? `${l.name}\t${l.rollNumber}` : l.name))
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('List copied — paste it into a chat or sheet.');
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access.');
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
                      {programLabels.get(p.id) ?? p.program_name}
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

        <div className="flex items-start gap-2">
          <Checkbox
            id="include-no-photo"
            checked={includeNoPhoto}
            onCheckedChange={(v) => setIncludeNoPhoto(v === true)}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="include-no-photo" className="cursor-pointer">
              Include learners without photos (prints an initials box)
            </Label>
            <p className="text-xs text-muted-foreground">
              Left unticked, learners with no photo on record are skipped and
              listed so photos can be collected first — each card uses one
              ribbon panel either way.
            </p>
          </div>
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

      {skippedNoAccount > 0 && (
        <p className="text-sm text-muted-foreground">
          {skippedNoAccount} matching learner
          {skippedNoAccount === 1 ? ' has' : 's have'} no account yet and{' '}
          {skippedNoAccount === 1 ? 'is' : 'are'} not included — ID cards
          become available once the learner account is activated.
        </p>
      )}

      {skippedNoPhoto.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-300/60 bg-amber-50/60 p-4 text-sm dark:border-amber-500/40 dark:bg-amber-950/20">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            {skippedNoPhoto.length} learner
            {skippedNoPhoto.length === 1 ? ' has' : 's have'} no photo yet and{' '}
            {skippedNoPhoto.length === 1 ? 'was' : 'were'} left out — collect
            photos, then print them as a follow-up batch.
          </p>
          <details>
            <summary className="cursor-pointer text-muted-foreground">
              Show the {skippedNoPhoto.length} name
              {skippedNoPhoto.length === 1 ? '' : 's'}
            </summary>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {skippedNoPhoto.map((l, i) => (
                <li
                  key={`${l.name}-${l.rollNumber ?? i}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">{l.name}</span>
                  {l.rollNumber && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {l.rollNumber}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyNoPhotoList}
          >
            <Copy className="mr-2 h-3.5 w-3.5" />
            Copy list
          </Button>
        </div>
      )}

      <BulkPrintDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        learners={dialogLearners}
      />
    </div>
  );
}
