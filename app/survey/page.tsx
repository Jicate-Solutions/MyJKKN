'use client';

// app/survey/page.tsx
//
// Standalone Wellness Survey for signed-in JKKN users — the "JKKN users" link
// and QR from the survey editor land here: /survey?program=<id>&survey=<id>.
// Sits OUTSIDE app/(routes) on purpose, so there is no sidebar / navbar — just
// the form, like a registration page. Sign-in is still required (the proxy
// redirects anonymous visitors to login and back); access to each survey is
// enforced by RLS + fn_health_survey_submit (learner / team-member audience).
// The in-app version with the shell is /health/surveys.

import { Suspense } from 'react';
import Image from 'next/image';
import { Toaster } from 'react-hot-toast';

import { WellnessSurveyTaker } from '@/components/health/wellness-survey-taker';

export default function StandaloneSurveyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fbfa] to-[#eef4f3] px-4 pb-8 pt-4 sm:px-6">
      <div className="mx-auto w-full max-w-[850px] space-y-6">
        <header className="flex items-center justify-center gap-2.5">
          <Image src="/jkkn_logo.png" alt="JKKN" width={36} height={36} priority />
          <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-teal-700">
            Health &amp; Wellness
          </span>
        </header>
        <Suspense fallback={null}>
          <WellnessSurveyTaker standalone />
        </Suspense>
        <footer className="pb-2 text-center text-xs text-slate-400">JKKN · Health &amp; Wellness</footer>
      </div>
      <Toaster position="top-center" />
    </main>
  );
}
