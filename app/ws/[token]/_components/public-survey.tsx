"use client";

// app/ws/[token]/_components/public-survey.tsx
// Identity form + SurveyRunner for the public (no-login) survey page.

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SurveyRunner } from "@/components/health/survey-runner";
import type {
  SurveyAnswers,
  SurveyLanguage,
  SurveyQuestion,
} from "@/types/health-surveys";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MOBILE_RE = /^\+?[0-9]{10,15}$/;

interface PublicSurveyProps {
  token: string;
  questions: SurveyQuestion[];
  languages: SurveyLanguage[];
}

interface Done {
  constructive_count: number;
  total_questions: number;
  answers: SurveyAnswers;
}

function doneKey(token: string) {
  return `wellness-survey-done:${token}`;
}

export function PublicSurvey({
  token,
  questions,
  languages,
}: PublicSurveyProps) {
  const [language, setLanguage] = useState<SurveyLanguage>(
    languages[0] ?? "en",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  // Same-device convenience only — the real once-per-email rule is server-side.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(doneKey(token));
      if (raw) setDone(JSON.parse(raw) as Done);
    } catch {
      /* storage unavailable */
    }
  }, [token]);

  const identityOk =
    name.trim().length >= 2 &&
    EMAIL_RE.test(email.trim()) &&
    MOBILE_RE.test(mobile.replace(/[\s()-]/g, ""));

  const handleSubmit = async (answers: SurveyAnswers) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/health-surveys/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, mobile, answers, language }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not submit the survey");
        throw new Error(json.error);
      }
      const result: Done = {
        constructive_count: json.constructive_count,
        total_questions: json.total_questions,
        answers,
      };
      setDone(result);
      try {
        localStorage.setItem(doneKey(token), JSON.stringify(result));
      } catch {
        /* ignore */
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <SurveyRunner
        surveyId={token}
        questions={questions}
        languages={languages}
        language={language}
        onLanguageChange={setLanguage}
        submittedAnswers={done.answers}
      />
    );
  }

  const detailsForm = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="ps-name">Name *</Label>
        <Input
          id="ps-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ps-email">Email ID *</Label>
        <Input
          id="ps-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="ps-mobile">Mobile Number *</Label>
        <Input
          id="ps-mobile"
          type="tel"
          inputMode="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="10-digit mobile number"
        />
      </div>
      <p className="text-xs text-slate-400 sm:col-span-2">
        Each email can submit this survey once.
      </p>
    </div>
  );

  return (
    <SurveyRunner
      surveyId={token}
      questions={questions}
      languages={languages}
      language={language}
      onLanguageChange={setLanguage}
      onSubmit={handleSubmit}
      submitting={submitting}
      startSlot={detailsForm}
      canStart={identityOk}
      startHint="Enter your name, a valid email and mobile number to start."
      submitError={error}
    />
  );
}
