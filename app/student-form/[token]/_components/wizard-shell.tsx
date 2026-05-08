'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { LanguageToggle, type Language } from './language-toggle';
import { StepBasicDetails } from './step-basic-details';
import { StepAcademicInformation } from './step-academic-information';
import { StepContactDetails } from './step-contact-details';
import { StepPreviewConfirm } from './step-preview-confirm';

type Step = 1 | 2 | 3 | 4;

interface Props {
  token: string;
  learner: Record<string, any>;
  sectionProgress: { basic_done: boolean; academic_done: boolean; contact_done: boolean };
  expiresAt: string;
}

export function WizardShell({ token, learner, sectionProgress, expiresAt }: Props) {
  const [lang, setLang] = useState<Language>('en');
  const [data, setData] = useState<Record<string, any>>(learner);
  const [step, setStep] = useState<Step>(
    !sectionProgress.basic_done ? 1
    : !sectionProgress.academic_done ? 2
    : !sectionProgress.contact_done ? 3
    : 4
  );
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

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

  async function saveSection(
    section: 'basic' | 'academic' | 'contact',
    fields: Record<string, any>,
    final = false,
  ) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/student-form/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, fields, final }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'save failed');
      }
      setData((prev) => ({ ...prev, ...fields }));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStepContinue(
    section: 'basic' | 'academic' | 'contact',
    fields: Record<string, any>,
  ) {
    try {
      await saveSection(section, fields, false);
      setStep((s) => (s + 1) as Step);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    }
  }

  async function handleFinalSubmit() {
    try {
      // PATCH with final=true; service marks token consumed + flips
      // is_profile_complete + writes audit rows.
      await saveSection('contact', {}, true);
      window.location.href = `/student-form/${encodeURIComponent(token)}/submitted`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed');
    }
  }

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between z-10">
        <div className="text-sm font-medium">
          Step {step} of 4
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">
            {mm}:{ss}
          </span>
          <LanguageToggle value={lang} onChange={setLang} />
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {step === 1 && (
          <StepBasicDetails
            lang={lang}
            data={data}
            token={token}
            onContinue={(fields) => handleStepContinue('basic', fields)}
            submitting={submitting}
          />
        )}
        {step === 2 && (
          <StepAcademicInformation
            lang={lang}
            data={data}
            onContinue={(fields) => handleStepContinue('academic', fields)}
            onBack={() => setStep(1)}
            submitting={submitting}
          />
        )}
        {step === 3 && (
          <StepContactDetails
            lang={lang}
            data={data}
            onContinue={(fields) => handleStepContinue('contact', fields)}
            onBack={() => setStep(2)}
            submitting={submitting}
          />
        )}
        {step === 4 && (
          <StepPreviewConfirm
            lang={lang}
            data={data}
            onSubmit={handleFinalSubmit}
            onEditBasic={() => setStep(1)}
            onEditAcademic={() => setStep(2)}
            onEditContact={() => setStep(3)}
            submitting={submitting}
          />
        )}
      </main>
    </div>
  );
}
