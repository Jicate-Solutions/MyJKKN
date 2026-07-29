'use client';

import { useState, useEffect, Fragment } from 'react';
import toast from 'react-hot-toast';
import { Check } from 'lucide-react';
import { LanguageToggle, type Language } from './language-toggle';
import { useQuery } from '@tanstack/react-query';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { StepBasicDetails } from './step-basic-details';
import { StepAcademicInformation } from './step-academic-information';
import { StepCourseSelection } from './step-course-selection';
import { StepAccommodation } from './step-accommodation';
import { StepContactDetails } from './step-contact-details';
import { StepPreviewConfirm } from './step-preview-confirm';

type Step = 1 | 2 | 3 | 4 | 5 | 6;
type Section = 'basic' | 'academic' | 'course' | 'accommodation' | 'contact';

interface Props {
  token: string;
  learner: Record<string, any>;
  sectionProgress: {
    basic_done?: boolean;
    academic_done?: boolean;
    course_done?: boolean;
    accommodation_done?: boolean;
    contact_done?: boolean;
  };
  expiresAt: string;
}

// Canonical step descriptors. Source of truth for stepper labels and the
// section→step mapping used by the final-submit auto-jump.
const STEPS: Array<{ id: Step; section: Section | null; name: string; tamil: string }> = [
  { id: 1, section: 'basic',         name: 'Basic',     tamil: 'அடிப்படை' },
  { id: 2, section: 'contact',       name: 'Contact',   tamil: 'தொடர்பு' },
  { id: 3, section: 'course',        name: 'Course',    tamil: 'பாடம்' },
  { id: 4, section: 'academic',      name: 'Academic',  tamil: 'கல்வி' },
  { id: 5, section: 'accommodation', name: 'Stay',      tamil: 'தங்குமிடம்' },
  { id: 6, section: null,            name: 'Review',    tamil: 'சரிபார்' },
];

const looksFilled = (v: unknown) =>
  v !== undefined && v !== null && String(v).trim().length > 0;

// Per-section required-field map. The auto-jump on final submit uses this to
// find the first step with anything missing.
// 2026-05-21: Added quota, community, and admission_year_id as required.
// These three are fee-structure-matrix dimensions (alongside institution/
// degree/department/programme/accommodation_type) — without them the
// matrix can't resolve a unique row at account-transition time, and the
// resolver either picks the wrong fallback or fails entirely. The
// AccountVerificationDialog still surfaces missing dims as a safety net,
// but blocking at the QR form keeps the data clean upstream.
//
// admission_year_id is auto-fetched in step-course-selection.tsx based on
// the current calendar year × (institution, programme); when admin hasn't
// seeded `admission_years` for that pair the field stays empty and this
// rule triggers a "Please fill: Admission Year" toast that nudges the
// student to contact admission.
//
// 2026-07-27: academic_year_id added on the same auto-fetch + read-only
// pattern (resolved from the institution's active row covering today).
// Section is deliberately NOT required here — section placement stays an
// admission-staff decision made during onboarding, so the QR form never
// asks the student for it.
const REQUIRED_BY_SECTION: Record<Section, Array<{ key: string; label: string }>> = {
  basic: [
    { key: 'first_name', label: 'First Name' },
    { key: 'community_category_id', label: 'Community' },
  ],
  academic: [
    // Marks are optional at the wizard level — students can submit blanks.
    // Validation here is permissive on purpose.
  ],
  course: [
    { key: 'institution_id',    label: 'Institution' },
    { key: 'degree_id',         label: 'Degree' },
    { key: 'program_id',        label: 'Program' },
    { key: 'entry_type',        label: 'Entry Type' },
    { key: 'semester_id',       label: 'Semester' },
    { key: 'quota_id',          label: 'Quota' },
    { key: 'admission_year_id', label: 'Admission Year' },
    { key: 'academic_year_id',  label: 'Academic Year' },
  ],
  accommodation: [
    { key: 'accommodation_type', label: 'Accommodation Type' },
  ],
  contact: [
    { key: 'student_mobile', label: 'Mobile' },
  ],
};

function validateAllSections(data: Record<string, any>): {
  step: Step;
  section: Section;
  missing: string[];
} | null {
  for (const { id, section } of STEPS) {
    if (!section) continue;
    const reqs = REQUIRED_BY_SECTION[section];
    const missing = reqs.filter((r) => !looksFilled(data[r.key])).map((r) => r.label);
    if (missing.length > 0) {
      return { step: id, section, missing };
    }
  }
  return null;
}

export function WizardShell({ token, learner, sectionProgress, expiresAt }: Props) {
  const [lang, setLang] = useState<Language>('en');
  const [data, setData] = useState<Record<string, any>>(learner);
  const [step, setStep] = useState<Step>(
    !sectionProgress.basic_done ? 1
    : !sectionProgress.contact_done ? 2
    : !sectionProgress.course_done ? 3
    : !sectionProgress.academic_done ? 4
    : !sectionProgress.accommodation_done ? 5
    : 6
  );
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // Track which steps the user has completed/visited for the stepper UI
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(() => {
    const done = new Set<Step>();
    if (sectionProgress.basic_done) done.add(1);
    if (sectionProgress.contact_done) done.add(2);
    if (sectionProgress.course_done) done.add(3);
    if (sectionProgress.academic_done) done.add(4);
    if (sectionProgress.accommodation_done) done.add(5);
    return done;
  });

  useEffect(() => {
    const expiry = new Date(expiresAt).getTime();
    const tick = setInterval(() => {
      const left = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(tick);
        toast.error('Your QR has expired. Please ask admission for a new one.');
        window.location.href = `/student-form/${encodeURIComponent(token)}/expired?reason=expired`;
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [expiresAt, token]);

  // Scroll to top whenever the active step changes. Covers Save & Continue,
  // Back, stepper-circle clicks, and Edit-from-preview navigation uniformly.
  // Triggered by step state changes only — anything that advances the step
  // also scrolls to top.
  //
  // `behavior: 'smooth'` is auto-disabled by modern browsers when the user
  // has prefers-reduced-motion set, so this is accessibility-safe.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

  async function saveSection(
    section: Section,
    fields: Record<string, any>,
    final = false,
  ) {
    setSubmitting(true);
    try {
      // 30s timeout — without it a dead mobile connection leaves the fetch
      // pending forever, `submitting` stays true and both buttons stay
      // disabled with no feedback (the "form is stuck" report, 2026-06-10).
      const res = await fetch(`/api/student-form/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, fields, final }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = body.error ?? 'save failed';
        // Token died mid-fill (expired / consumed / superseded) — no retry
        // can succeed, so route to the expired page instead of toasting.
        if (['expired', 'consumed', 'superseded', 'invalid_token'].includes(code)) {
          window.location.href = `/student-form/${encodeURIComponent(token)}/expired?reason=${code}`;
          return;
        }
        // server_error & friends — students shouldn't see raw codes.
        throw new Error(
          'Could not save — please check your connection and tap Save & Continue again.',
        );
      }
      setData((prev) => ({ ...prev, ...fields }));
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
        throw new Error('Network is slow — the save timed out. Please try again.');
      }
      if (e instanceof TypeError) {
        // fetch network failure (offline, DNS, connection reset)
        throw new Error('No connection — please check your internet and try again.');
      }
      throw e;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStepContinue(
    section: Section,
    fields: Record<string, any>,
  ) {
    // Validate this section's required fields BEFORE saving + advancing.
    // The "Save & Continue" button is the only entry point now; per-step
    // draft saves were retired 2026-05-21.
    const reqs = REQUIRED_BY_SECTION[section];
    const merged = { ...data, ...fields };
    const missing = reqs.filter((r) => !looksFilled(merged[r.key])).map((r) => r.label);
    if (missing.length > 0) {
      toast.error(`Please fill: ${missing.join(', ')}`, { duration: 4000 });
      return;
    }
    try {
      await saveSection(section, fields, false);
      setCompletedSteps((s) => new Set([...s, step]));
      setStep((s) => (s + 1) as Step);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    }
  }

  // Note (2026-05-21): the per-step "Save Draft" button was retired in favour
  // of a single "Save & Continue" CTA. Drafts still persist via the same
  // saveSection(section, fields, false) call inside handleStepContinue —
  // every advance is now a draft write + step bump in one action.

  async function handleFinalSubmit() {
    // Cross-section validation. If any required field is missing anywhere,
    // jump the user to the first offending step and tell them what's missing.
    const issue = validateAllSections(data);
    if (issue) {
      const sectionName = STEPS.find((s) => s.section === issue.section)?.name ?? issue.section;
      toast.error(
        `${sectionName} is incomplete — ${issue.missing.join(', ')}`,
        { duration: 5000 },
      );
      setStep(issue.step);
      return;
    }

    try {
      // PATCH with final=true. Service marks token consumed + flips
      // is_profile_complete + writes audit rows. The contact section is the
      // last write-step so we use it as the trigger; payload is empty (no
      // new fields), the 'final' flag does the work.
      await saveSection('contact', {}, true);
      window.location.href = `/student-form/${encodeURIComponent(token)}/submitted`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed');
    }
  }

  // Resolve degree_type for PG-conditional academic fields.
  const degreeId = data.degree_id;
  const { data: degreeInfo } = useQuery({
    queryKey: ['degree-for-student-form', degreeId],
    queryFn: () => DegreeService.getDegree(degreeId),
    enabled: !!degreeId,
  });
  const degreeType = degreeInfo?.degree_type;

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const currentStepMeta = STEPS.find((s) => s.id === step)!;

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="sticky top-0 bg-background border-b z-10">
        {/* Stepper row */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-1 sm:gap-2 max-w-3xl mx-auto">
            {STEPS.map((s, idx) => {
              const isActive = s.id === step;
              const isDone = completedSteps.has(s.id) && !isActive;
              const isPast = s.id < step;
              // Allow click on any step that's either past or already completed.
              const clickable = isPast || completedSteps.has(s.id);
              return (
                <Fragment key={s.id}>
                  <button
                    type="button"
                    onClick={() => clickable && setStep(s.id)}
                    disabled={!clickable}
                    title={`${s.name} / ${s.tamil}`}
                    className={[
                      'shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                        : isDone
                          ? 'bg-primary/15 text-primary hover:bg-primary/25'
                          : isPast
                            ? 'bg-muted text-foreground hover:bg-muted/70'
                            : 'bg-muted text-muted-foreground',
                      clickable && !isActive ? 'cursor-pointer' : '',
                      !clickable ? 'cursor-not-allowed opacity-60' : '',
                    ].join(' ')}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : s.id}
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={[
                        'flex-1 h-0.5 min-w-[6px]',
                        s.id < step ? 'bg-primary/40' : 'bg-border',
                      ].join(' ')}
                    />
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>

        {/* Current step name + countdown row */}
        <div className="px-4 pb-2 max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="font-semibold">Step {step} of 6</span>
            <span className="text-muted-foreground"> — {currentStepMeta.name} / {currentStepMeta.tamil}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span
              className={[
                'text-xs tabular-nums',
                secondsLeft < 60 ? 'text-destructive font-semibold' : 'text-muted-foreground',
              ].join(' ')}
              title="Time remaining before this QR token expires"
            >
              {mm}:{ss}
            </span>
            <LanguageToggle value={lang} onChange={setLang} />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {step === 1 && (
          <StepBasicDetails
            lang={lang}
            data={data}
            onContinue={(fields) => handleStepContinue('basic', fields)}
            submitting={submitting}
          />
        )}
        {step === 2 && (
          <StepContactDetails
            lang={lang}
            data={data}
            token={token}
            onContinue={(fields) => handleStepContinue('contact', fields)}
            onBack={() => setStep(1)}
            submitting={submitting}
          />
        )}
        {step === 3 && (
          <StepCourseSelection
            lang={lang}
            data={data}
            token={token}
            onContinue={(fields) => handleStepContinue('course', fields)}
            onBack={() => setStep(2)}
            submitting={submitting}
          />
        )}
        {step === 4 && (
          <StepAcademicInformation
            lang={lang}
            data={data}
            token={token}
            degreeType={degreeType}
            onContinue={(fields) => handleStepContinue('academic', fields)}
            onBack={() => setStep(3)}
            submitting={submitting}
          />
        )}
        {step === 5 && (
          <StepAccommodation
            lang={lang}
            data={data}
            token={token}
            onContinue={(fields) => handleStepContinue('accommodation', fields)}
            onBack={() => setStep(4)}
            submitting={submitting}
          />
        )}
        {step === 6 && (
          <StepPreviewConfirm
            lang={lang}
            data={data}
            token={token}
            degreeType={degreeType}
            onSubmit={handleFinalSubmit}
            onEditBasic={() => setStep(1)}
            onEditAcademic={() => setStep(4)}
            onEditCourse={() => setStep(3)}
            onEditAccommodation={() => setStep(5)}
            onEditContact={() => setStep(2)}
            submitting={submitting}
          />
        )}
      </main>
    </div>
  );
}
