'use client';

/**
 * DemonstrationForm — client-side form for creating a PDE demonstration.
 *
 * Fields:
 *   - Category (required) — one of the 7 PDE durable-value categories
 *   - Rubric  (optional)  — fetched on-demand for embodied / social_leadership
 *                           / cultural_civic; hidden for the other 4
 *   - Skill name (required)
 *   - Evidence type (optional) — video / document / artifact_link / osce_score
 *                                / simulator_pass / other
 *   - Evidence URL (optional)
 *   - Notes / free-form text (optional)
 *
 * Submit actions (create mode):
 *   - "Save as draft"      → POST { status='draft' }, then redirect to inbox
 *   - "Submit for review"  → POST { submit: true }, server flips to 'submitted'
 *
 * Edit mode (#9b): when the URL carries ?edit=<id> the form prefills from the
 * existing DRAFT row (fetched via the getMyDemonstrationForEdit server action)
 * and SAVES via the editDemonstration server action (update, not create). This
 * is the resubmit path for a demonstration a validator returned with
 * "Request changes" (which set the row back to 'draft'). Same route, no new
 * page — just a query param.
 *
 * No react-hook-form — this codebase uses both RHF and plain useState forms
 * (see admin/pde/rubrics pages for plain-useState pattern). Plain state is
 * the lower-overhead choice for 6 fields.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  editDemonstration,
  getMyDemonstrationForEdit,
} from '../../_actions/edit-demonstration';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, BookOpenCheck, FileText, Save, Send, Sparkles } from 'lucide-react';
import type {
  CreatePDEDemonstrationInput,
  PDECategoryKey,
  PDEDemonstration,
} from '@/lib/types/pde-demonstrations';
import type {
  BosSyllabusOption,
  SyllabusCLO,
  VacCourseOption,
} from '@/lib/types/pde-curriculum';

// ---------------------------------------------------------------------------
// Static dropdown content
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: Array<{ value: PDECategoryKey; label: string; hint: string }> = [
  { value: 'judgment', label: 'Judgment', hint: 'Decision-making under uncertainty' },
  { value: 'embodied', label: 'Embodied Practice', hint: 'Hands-on clinical / technical skill' },
  { value: 'problem_finding', label: 'Problem Finding', hint: 'Identifying problems worth solving' },
  { value: 'accountability', label: 'Accountability', hint: 'Owning outcomes end-to-end' },
  { value: 'social_leadership', label: 'Social & Leadership', hint: 'Working with and leading humans' },
  { value: 'cultural_civic', label: 'Cultural & Civic', hint: 'Local-language, tradition, civic engagement' },
  { value: 'credential', label: 'Credential', hint: 'External certifications / awards' },
];

const EVIDENCE_TYPE_OPTIONS = [
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document (PDF / write-up)' },
  { value: 'artifact_link', label: 'Artifact link (GitHub / Figma / deployed app)' },
  { value: 'osce_score', label: 'OSCE score sheet' },
  { value: 'simulator_pass', label: 'Simulator pass record' },
  { value: 'other', label: 'Other' },
];

interface RubricChoice {
  key: string;
  value: Record<string, unknown>;
}

/** Dual-lane curriculum link (spec §3): BoS for autonomous colleges, VAC for all. */
type CurriculumLane = '' | 'bos' | 'vac';

const LANE_OPTIONS: Array<{ value: CurriculumLane; label: string; hint: string }> = [
  { value: 'bos', label: 'BoS-approved syllabus', hint: 'Autonomous colleges — tag CLOs this evidence demonstrates' },
  { value: 'vac', label: 'Value-Added Course', hint: 'Any college — course-level link' },
];

interface FormState {
  category_key: PDECategoryKey | '';
  rubric_policy_key: string;
  skill_name: string;
  evidence_type: string;
  evidence_url: string;
  notes: string;
  curriculum_lane: CurriculumLane;
  bos_syllabus_id: string;
  vac_course_id: string;
  clo_refs: number[];
}

const INITIAL: FormState = {
  category_key: '',
  rubric_policy_key: '',
  skill_name: '',
  evidence_type: '',
  evidence_url: '',
  notes: '',
  curriculum_lane: '',
  bos_syllabus_id: '',
  vac_course_id: '',
  clo_refs: [],
};

/** Rubric criterion shape inside pde.rubrics.* policy rows (probed live):
 *  { rubric: [{ skill, evidence_required, passing_threshold, validator_role }] } */
interface RubricCriterion {
  skill?: string;
  evidence_required?: string;
  passing_threshold?: number;
  validator_role?: string;
}

function rubricCriteria(choice: RubricChoice | undefined): RubricCriterion[] {
  if (!choice) return [];
  const raw = (choice.value as Record<string, unknown>).rubric;
  return Array.isArray(raw)
    ? raw.filter((c): c is RubricCriterion => !!c && typeof c === 'object')
    : [];
}

// Helper: pull a sensible label out of a rubric JSONB object. The shape varies
// across the three namespaces, so we probe a few common fields before falling
// back to the policy key suffix.
function rubricLabel(choice: RubricChoice): string {
  const v = choice.value as Record<string, unknown>;
  if (typeof v.discipline === 'string') {
    return v.discipline.charAt(0).toUpperCase() + v.discipline.slice(1);
  }
  if (typeof v.title === 'string') return v.title;
  if (typeof v.name === 'string') return v.name;
  if (typeof v.role === 'string') return v.role;
  // Fall back to the part after the last dot in the policy key.
  const parts = choice.key.split('.');
  return parts[parts.length - 1].replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DemonstrationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const isEditMode = !!editId;

  const [form, setForm] = useState<FormState>(INITIAL);
  const [rubrics, setRubrics] = useState<RubricChoice[]>([]);
  const [loadingRubrics, setLoadingRubrics] = useState(false);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);

  // ---- Edit-mode prefill (#9b) ----
  // When ?edit=<id> is present, load the existing draft and seed the form. A
  // load error or non-draft row downgrades to a clear banner instead of a blank
  // create form silently masquerading as an edit.
  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  const [editError, setEditError] = useState<string | null>(null);
  const [returnedNote, setReturnedNote] = useState<string | null>(null);
  // Set true while a prefill is seeding the form so the category-change rubric
  // effect doesn't wipe the prefilled rubric_policy_key on the initial edit load.
  const prefillingRef = useRef(false);

  // ---- Curriculum link state (dual-lane picker) ----
  const [syllabi, setSyllabi] = useState<BosSyllabusOption[] | null>(null);
  const [vacCourses, setVacCourses] = useState<VacCourseOption[] | null>(null);
  const [clos, setClos] = useState<SyllabusCLO[]>([]);
  const [cloTagCap, setCloTagCap] = useState(2);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [loadingClos, setLoadingClos] = useState(false);

  // ---- Prefill from the existing draft when in edit mode ----
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    setLoadingExisting(true);
    setEditError(null);
    getMyDemonstrationForEdit(editId)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setEditError('We couldn’t find this demonstration, or it isn’t yours to edit.');
          return;
        }
        if (row.status !== 'draft') {
          setEditError(
            'This demonstration is no longer a draft, so it can’t be edited. You can start a new one instead.'
          );
          return;
        }
        const ev = (row.evidence ?? {}) as Record<string, unknown>;
        const lane: CurriculumLane = row.bos_syllabus_id
          ? 'bos'
          : row.vac_course_id
            ? 'vac'
            : '';
        // Guard the next category-change rubric effect run so it preserves the
        // prefilled rubric_policy_key instead of resetting it to ''.
        prefillingRef.current = true;
        setForm({
          category_key: row.category_key,
          rubric_policy_key: row.rubric_policy_key ?? '',
          skill_name: row.skill_name ?? '',
          evidence_type: row.evidence_type ?? '',
          evidence_url: typeof ev.url === 'string' ? ev.url : '',
          notes: typeof ev.notes === 'string' ? ev.notes : '',
          curriculum_lane: lane,
          bos_syllabus_id: row.bos_syllabus_id ?? '',
          vac_course_id: row.vac_course_id ?? '',
          clo_refs: Array.isArray(row.clo_refs) ? row.clo_refs : [],
        });
        // Surface the validator's "what to fix" note (the last one wins; the
        // map is { validatorId: note }).
        const noteValues = Object.values((row.validator_notes ?? {}) as Record<string, unknown>)
          .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
        setReturnedNote(noteValues.length > 0 ? noteValues[noteValues.length - 1] : null);
      })
      .catch((err) => {
        if (cancelled) return;
        setEditError(err instanceof Error ? err.message : 'Failed to load the demonstration.');
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);

  // ---- Lazy-fetch the lane's option list the first time it's opened ----
  useEffect(() => {
    if (form.curriculum_lane === 'bos' && syllabi === null) {
      setLoadingCurriculum(true);
      fetch('/api/pde/curriculum/syllabi')
        .then(async (res) => {
          if (!res.ok) throw new Error(`Failed to load syllabi (${res.status})`);
          const json = (await res.json()) as { data: BosSyllabusOption[]; clo_tag_cap: number };
          setSyllabi(json.data || []);
          if (Number.isInteger(json.clo_tag_cap) && json.clo_tag_cap >= 1) {
            setCloTagCap(json.clo_tag_cap);
          }
        })
        .catch((err) => {
          console.warn('[DemonstrationForm] syllabi fetch error', err);
          setSyllabi([]);
        })
        .finally(() => setLoadingCurriculum(false));
    }
    if (form.curriculum_lane === 'vac' && vacCourses === null) {
      setLoadingCurriculum(true);
      fetch('/api/pde/curriculum/vac-courses')
        .then(async (res) => {
          if (!res.ok) throw new Error(`Failed to load VAC courses (${res.status})`);
          const json = (await res.json()) as { data: VacCourseOption[] };
          setVacCourses(json.data || []);
        })
        .catch((err) => {
          console.warn('[DemonstrationForm] vac-courses fetch error', err);
          setVacCourses([]);
        })
        .finally(() => setLoadingCurriculum(false));
    }
  }, [form.curriculum_lane, syllabi, vacCourses]);

  // ---- Fetch CLOs whenever the selected syllabus changes ----
  useEffect(() => {
    if (!form.bos_syllabus_id) {
      setClos([]);
      return;
    }
    let cancelled = false;
    setLoadingClos(true);
    fetch(`/api/pde/curriculum/clos?syllabus_id=${form.bos_syllabus_id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load CLOs (${res.status})`);
        const json = (await res.json()) as {
          data: { clos: SyllabusCLO[] };
          clo_tag_cap: number;
        };
        if (cancelled) return;
        setClos(json.data?.clos || []);
        if (Number.isInteger(json.clo_tag_cap) && json.clo_tag_cap >= 1) {
          setCloTagCap(json.clo_tag_cap);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[DemonstrationForm] CLO fetch error', err);
        setClos([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingClos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.bos_syllabus_id]);

  const setLane = (lane: CurriculumLane) => {
    // Switching lanes clears the other lane's selection + CLO proposals.
    setForm((prev) => ({
      ...prev,
      curriculum_lane: lane,
      bos_syllabus_id: '',
      vac_course_id: '',
      clo_refs: [],
    }));
    setClos([]);
  };

  const toggleClo = (n: number) => {
    setForm((prev) => {
      if (prev.clo_refs.includes(n)) {
        return { ...prev, clo_refs: prev.clo_refs.filter((x) => x !== n) };
      }
      if (prev.clo_refs.length >= cloTagCap) {
        toast.error(`You can tag at most ${cloTagCap} CLO${cloTagCap === 1 ? '' : 's'}.`);
        return prev;
      }
      return { ...prev, clo_refs: [...prev.clo_refs, n].sort((a, b) => a - b) };
    });
  };

  // ---- Fetch rubrics whenever the category changes ----
  useEffect(() => {
    if (!form.category_key) {
      setRubrics([]);
      setForm((prev) => ({ ...prev, rubric_policy_key: '' }));
      return;
    }
    // On the initial edit prefill, keep the rubric the learner already chose.
    const preserveRubric = prefillingRef.current;
    prefillingRef.current = false;
    let cancelled = false;
    setLoadingRubrics(true);
    fetch(`/api/pde/demonstrations/rubrics?category=${form.category_key}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load rubrics (${res.status})`);
        const json = (await res.json()) as { data: RubricChoice[] };
        if (cancelled) return;
        setRubrics(json.data || []);
        if (!preserveRubric) {
          setForm((prev) => ({ ...prev, rubric_policy_key: '' }));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // Non-fatal: rubric dropdown just hides itself.
        console.warn('[DemonstrationForm] rubric fetch error', err);
        setRubrics([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRubrics(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.category_key]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const buildPayload = (submit: boolean): Partial<CreatePDEDemonstrationInput> & { submit?: boolean } => {
    const evidence: Record<string, unknown> = {};
    if (form.evidence_url.trim()) evidence.url = form.evidence_url.trim();
    if (form.notes.trim()) evidence.notes = form.notes.trim();
    if (form.evidence_type) evidence.type = form.evidence_type;

    return {
      category_key: (form.category_key || undefined) as PDECategoryKey | undefined,
      rubric_policy_key: form.rubric_policy_key || undefined,
      skill_name: form.skill_name.trim() || undefined,
      evidence_type: form.evidence_type || undefined,
      evidence,
      bos_syllabus_id: form.curriculum_lane === 'bos' && form.bos_syllabus_id ? form.bos_syllabus_id : undefined,
      vac_course_id: form.curriculum_lane === 'vac' && form.vac_course_id ? form.vac_course_id : undefined,
      clo_refs:
        form.curriculum_lane === 'bos' && form.bos_syllabus_id && form.clo_refs.length > 0
          ? form.clo_refs
          : undefined,
      submit,
    };
  };

  const handleSubmit = async (action: 'draft' | 'submit') => {
    if (!form.category_key) {
      toast.error('Please pick a PDE category.');
      return;
    }
    if (!form.skill_name.trim()) {
      toast.error('Please enter a skill name.');
      return;
    }
    setSaving(action);
    try {
      if (isEditMode && editId) {
        // Edit/resubmit path (#9b): update the existing draft via the server
        // action, optionally promoting it back to 'submitted'.
        const payload = buildPayload(action === 'submit');
        const result = await editDemonstration({
          id: editId,
          category_key: payload.category_key,
          rubric_policy_key: payload.rubric_policy_key ?? null,
          skill_name: payload.skill_name ?? null,
          evidence: payload.evidence,
          evidence_type: payload.evidence_type ?? null,
          bos_syllabus_id: payload.bos_syllabus_id ?? null,
          vac_course_id: payload.vac_course_id ?? null,
          clo_refs: payload.clo_refs ?? null,
          submit: action === 'submit',
        });
        if (!result.ok) throw new Error(result.error);
        toast.success(
          action === 'submit' ? 'Resubmitted for review.' : 'Changes saved.'
        );
        router.push('/pde/learn/demonstrations');
        router.refresh();
        return result.data;
      }

      // Create path (default).
      const res = await fetch('/api/pde/demonstrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildPayload(action === 'submit')),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const { data } = (await res.json()) as { data: PDEDemonstration };
      toast.success(
        action === 'submit'
          ? 'Submitted for review.'
          : 'Saved as draft.'
      );
      // Reset, then bounce back to the inbox so the new row is visible.
      setForm(INITIAL);
      router.push('/pde/learn/demonstrations');
      router.refresh();
      return data;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(null);
    }
  };

  const showRubricHint = form.category_key && rubrics.length === 0 && !loadingRubrics;

  // Edit mode: still loading the existing draft.
  if (isEditMode && loadingExisting) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading your demonstration…
        </CardContent>
      </Card>
    );
  }

  // Edit mode: the row couldn't be loaded / isn't editable.
  if (isEditMode && editError) {
    return (
      <Card className="border-rose-200 bg-rose-50/40">
        <CardContent className="py-6 flex items-start gap-3">
          <FileText className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p className="font-medium text-rose-800">Can’t edit this demonstration</p>
            <p className="text-sm text-rose-700">{editError}</p>
            <Link href="/pde/learn/demonstrations" className="inline-block">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to my demonstrations
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#0b6d41]" />
          <h2 className="text-lg font-semibold">
            {isEditMode ? 'Edit your demonstration' : 'Describe your demonstration'}
          </h2>
        </div>

        {/* Validator's "what to fix" note when this draft was returned (#9b). */}
        {isEditMode && returnedNote && (
          <div className="rounded-md border border-amber-300 bg-[#ffde59]/20 p-3 space-y-1">
            <p className="text-xs font-semibold text-amber-900">
              Your validator asked for changes:
            </p>
            <p className="text-sm text-amber-900/90 whitespace-pre-wrap">{returnedNote}</p>
            <p className="text-xs text-amber-800/80">
              Make the fixes below, then resubmit for review.
            </p>
          </div>
        )}

        {/* --- Category --- */}
        <div className="space-y-2">
          <Label htmlFor="category">
            PDE category <span className="text-rose-600">*</span>
          </Label>
          <Select
            value={form.category_key || undefined}
            onValueChange={(v) => update('category_key', v as PDECategoryKey)}
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="Pick the durable-value category this evidence belongs to" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex flex-col items-start">
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.hint}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* --- Rubric (conditional) --- */}
        {form.category_key && rubrics.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="rubric">Rubric (optional)</Label>
            <Select
              value={form.rubric_policy_key || undefined}
              onValueChange={(v) => update('rubric_policy_key', v)}
            >
              <SelectTrigger id="rubric">
                <SelectValue placeholder={loadingRubrics ? 'Loading…' : 'Pick a rubric to anchor this demonstration'} />
              </SelectTrigger>
              <SelectContent>
                {rubrics.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    <span className="flex flex-col items-start">
                      <span className="font-medium">{rubricLabel(r)}</span>
                      <span className="text-xs text-muted-foreground font-mono">{r.key}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Anchoring to a rubric lets the scoring engine apply the right thresholds at review time.
            </p>

            {/* Inline rubric criteria (CARE-Clarity): show the bar the learner
                is aiming at WHILE they describe the evidence, not after. */}
            {form.rubric_policy_key && (() => {
              const criteria = rubricCriteria(rubrics.find((r) => r.key === form.rubric_policy_key));
              if (criteria.length === 0) return null;
              return (
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-medium">What validators look for under this rubric:</p>
                  <ul className="space-y-1.5">
                    {criteria.map((c, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[#0b6d41] shrink-0" />
                        <span>
                          <span className="font-medium text-foreground">{c.skill || `Criterion ${i + 1}`}</span>
                          {c.evidence_required ? <> — {c.evidence_required}</> : null}
                          {typeof c.passing_threshold === 'number' ? (
                            <span className="ml-1 text-[#0b6d41] font-medium">(pass ≥ {c.passing_threshold})</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
        )}

        {/* --- Curriculum link (dual-lane, optional) --- */}
        <div className="space-y-2">
          <Label htmlFor="curriculum_lane" className="flex items-center gap-1.5">
            <BookOpenCheck className="h-4 w-4 text-[#0b6d41]" />
            Link to curriculum (optional)
          </Label>
          <Select
            value={form.curriculum_lane || undefined}
            onValueChange={(v) => setLane(v === 'none' ? '' : (v as CurriculumLane))}
          >
            <SelectTrigger id="curriculum_lane">
              <SelectValue placeholder="Tie this evidence to a course outcome (helps your college's attainment record)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">Not linked</span>
              </SelectItem>
              {LANE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex flex-col items-start">
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.hint}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* BoS lane: syllabus picker (own institution) */}
          {form.curriculum_lane === 'bos' && (
            <div className="space-y-2 pt-1">
              <Select
                value={form.bos_syllabus_id || undefined}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, bos_syllabus_id: v, clo_refs: [] }))
                }
              >
                <SelectTrigger id="bos_syllabus" disabled={loadingCurriculum}>
                  <SelectValue
                    placeholder={
                      loadingCurriculum
                        ? 'Loading courses…'
                        : 'Pick the BoS-approved course this evidence belongs to'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(syllabi ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex flex-col items-start">
                        <span className="font-medium">{s.course_name}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {s.course_code} · v{s.version_number}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {syllabi !== null && syllabi.length === 0 && !loadingCurriculum && (
                <p className="text-xs text-muted-foreground italic">
                  No BoS-approved syllabi found for your institution yet. If your college is
                  not autonomous, use the Value-Added Course lane instead.
                </p>
              )}

              {/* CLO checklist — learner PROPOSES (validator confirms at review) */}
              {form.bos_syllabus_id && (
                <div className="rounded-md border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">
                      Which course outcomes does this evidence demonstrate?
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {form.clo_refs.length}/{cloTagCap} tagged
                    </span>
                  </div>
                  {loadingClos ? (
                    <p className="text-xs text-muted-foreground">Loading outcomes…</p>
                  ) : clos.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      This syllabus has no structured CLOs yet — the course link still counts.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {clos.map((clo) => {
                        const checked = form.clo_refs.includes(clo.clo_number);
                        const capReached = !checked && form.clo_refs.length >= cloTagCap;
                        return (
                          <li key={clo.clo_number} className="flex items-start gap-2">
                            <Checkbox
                              id={`clo-${clo.clo_number}`}
                              checked={checked}
                              disabled={capReached}
                              onCheckedChange={() => toggleClo(clo.clo_number)}
                              className="mt-0.5"
                            />
                            <label
                              htmlFor={`clo-${clo.clo_number}`}
                              className={`text-xs leading-snug cursor-pointer ${
                                capReached ? 'text-muted-foreground/60' : 'text-muted-foreground'
                              }`}
                            >
                              <span className="font-medium text-foreground">CLO {clo.clo_number}.</span>{' '}
                              {clo.description}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">
                    You propose, your validator confirms — only validator-confirmed outcomes
                    count toward attainment.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* VAC lane: course picker (course-level link, all colleges) */}
          {form.curriculum_lane === 'vac' && (
            <div className="space-y-2 pt-1">
              <Select
                value={form.vac_course_id || undefined}
                onValueChange={(v) => setForm((prev) => ({ ...prev, vac_course_id: v }))}
              >
                <SelectTrigger id="vac_course" disabled={loadingCurriculum}>
                  <SelectValue
                    placeholder={
                      loadingCurriculum
                        ? 'Loading courses…'
                        : 'Pick the Value-Added Course this evidence belongs to'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(vacCourses ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex flex-col items-start">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {[c.code, c.track].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vacCourses !== null && vacCourses.length === 0 && !loadingCurriculum && (
                <p className="text-xs text-muted-foreground italic">
                  No active Value-Added Courses for your institution yet.
                </p>
              )}
            </div>
          )}
        </div>

        {showRubricHint && (
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 flex items-start gap-2 text-xs text-muted-foreground">
            <BookOpenCheck className="h-4 w-4 mt-0.5 shrink-0 text-[#0b6d41]" />
            <p>
              <span className="font-medium text-foreground">No rubric for this category.</span>{' '}
              That&apos;s expected — your validator scores this demonstration free-form. Just
              describe your evidence below.
            </p>
          </div>
        )}

        {/* --- Skill name --- */}
        <div className="space-y-2">
          <Label htmlFor="skill">
            Skill name <span className="text-rose-600">*</span>
          </Label>
          <Input
            id="skill"
            placeholder="e.g. Patient history-taking, Suturing simulation, Bharatanatyam recital"
            value={form.skill_name}
            onChange={(e) => update('skill_name', e.target.value)}
            maxLength={200}
          />
        </div>

        {/* --- Evidence type --- */}
        <div className="space-y-2">
          <Label htmlFor="evidence_type">Evidence type</Label>
          <Select
            value={form.evidence_type || undefined}
            onValueChange={(v) => update('evidence_type', v)}
          >
            <SelectTrigger id="evidence_type">
              <SelectValue placeholder="What kind of evidence are you submitting?" />
            </SelectTrigger>
            <SelectContent>
              {EVIDENCE_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* --- Evidence URL --- */}
        <div className="space-y-2">
          <Label htmlFor="evidence_url">Evidence URL (optional)</Label>
          <Input
            id="evidence_url"
            type="url"
            placeholder="https://… (drive link, GitHub repo, deployed URL, video)"
            value={form.evidence_url}
            onChange={(e) => update('evidence_url', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            File-upload picker ships in T1.3. For now, paste a shared link.
          </p>
        </div>

        {/* --- Notes --- */}
        <div className="space-y-2">
          <Label htmlFor="notes">Context / notes (optional)</Label>
          <Textarea
            id="notes"
            placeholder="Brief context: what you did, why it counts, who supervised, what the outcome was."
            rows={4}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            maxLength={2000}
          />
        </div>

        {/* --- Actions --- */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <Link href="/pde/learn/demonstrations">
            <Button variant="ghost" type="button">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to inbox
            </Button>
          </Link>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => handleSubmit('draft')}
              disabled={saving !== null}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving === 'draft'
                ? 'Saving…'
                : isEditMode
                  ? 'Save changes'
                  : 'Save as draft'}
            </Button>
            <Button
              type="button"
              className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
              onClick={() => handleSubmit('submit')}
              disabled={saving !== null}
            >
              <Send className="h-4 w-4 mr-2" />
              {saving === 'submit'
                ? isEditMode
                  ? 'Resubmitting…'
                  : 'Submitting…'
                : isEditMode
                  ? 'Resubmit for review'
                  : 'Submit for review'}
            </Button>
          </div>
        </div>

        <div className="rounded-md bg-muted/50 border border-border/60 p-3 flex items-start gap-2 text-xs text-muted-foreground">
          <FileText className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Drafts stay private. Once submitted, a faculty / peer / AI validator from your
            institution can review under the rubric you anchored to (or free-form if none).
            The scoring engine writes the final weighted score back onto this row.{' '}
            <span className="font-medium text-foreground">
              Every validated demonstration becomes part of your verified skill
              transcript — the record employers and accreditors see.
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
