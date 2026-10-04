"use client";

// components/health/survey-runner.tsx
// Scenario-survey player shared by the logged-in pages (/survey, /health/surveys)
// and the public no-login page (/ws/[token]).
//
// Wizard flow (Director reference UI, 2026-09-28):
//   start screen → one question at a time (counter, % and progress bar) →
//   pick an option → its review shows immediately and the answer locks (the
//   review a person saw is the answer that gets saved) → Next → … → the last
//   step's button submits → completion screen.
// The server re-scores and enforces one submission per person. Already-submitted
// surveys open on the completion screen with a read-only review of every answer.
// Created: 2026-09-28

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Languages,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SURVEY_LANGUAGE_LABEL,
  lt,
  type SurveyAnswers,
  type SurveyLanguage,
  type SurveyQuestion,
} from "@/types/health-surveys";

const OPTION_PREFIX: Record<SurveyLanguage, string[]> = {
  en: ["A", "B", "C", "D", "E", "F", "G", "H"],
  ta: ["அ", "ஆ", "இ", "ஈ", "உ", "ஊ", "எ", "ஏ"],
};

const UI: Record<SurveyLanguage, Record<string, string>> = {
  en: {
    startTitle: "A short workplace reflection",
    startBody:
      "Choose the answer that best reflects how you would actually act. After each answer you will see a short review.",
    scenarios: "scenarios",
    minutes: "min",
    start: "Start survey →",
    question: "Question",
    prev: "← Previous",
    next: "Next →",
    submit: "Submit survey ✓",
    submitting: "Submitting…",
    selected: "Answer selected ✓",
    greatTitle: "🎉 Excellent!",
    greatBody: "You chose the constructive approach.",
    reviewLabel: "Review:",
    improveTitle: "Answer review",
    why: "Area for improvement:",
    path: "Suggested path:",
    doneTitle: "Survey completed",
    doneBody: "Thank you for sharing your workplace experience.",
    answered: "answers completed",
    complete: "complete",
    constructive: "constructive answers",
    showAnswers: "Review my answers",
    hideAnswers: "Hide my answers",
    editDetails: "Edit my details",
  },
  ta: {
    startTitle: "குறுகிய பணியிட அனுபவப் பதிவு",
    startBody:
      "நீங்கள் உண்மையில் எவ்வாறு செயல்படுவீர்கள் என்பதை சிறப்பாக பிரதிபலிக்கும் பதிலைத் தேர்ந்தெடுக்கவும். ஒவ்வொரு பதிலுக்கும் பிறகு ஒரு சிறு மதிப்பாய்வு காட்டப்படும்.",
    scenarios: "சூழ்நிலைகள்",
    minutes: "நிமிடங்கள்",
    start: "கணக்கெடுப்பைத் தொடங்குங்கள் →",
    question: "கேள்வி",
    prev: "← முந்தையது",
    next: "அடுத்து →",
    submit: "கணக்கெடுப்பை சமர்ப்பிக்கவும் ✓",
    submitting: "சமர்ப்பிக்கிறது…",
    selected: "பதில் தேர்ந்தெடுக்கப்பட்டது ✓",
    greatTitle: "🎉 மிகச் சிறப்பு!",
    greatBody: "நீங்கள் ஆக்கப்பூர்வமான அணுகுமுறையைத் தேர்ந்தெடுத்துள்ளீர்கள்.",
    reviewLabel: "பதில் மதிப்பாய்வு:",
    improveTitle: "பதில் மதிப்பாய்வு",
    why: "மேம்படுத்த வேண்டிய பகுதி:",
    path: "சிறந்த வழிமுறை:",
    doneTitle: "கணக்கெடுப்பு நிறைவு பெற்றது",
    doneBody: "உங்கள் பணியிட அனுபவத்தைப் பகிர்ந்ததற்கு நன்றி.",
    answered: "பதில்கள் நிறைவு",
    complete: "நிறைவு",
    constructive: "ஆக்கப்பூர்வமான பதில்கள்",
    showAnswers: "எனது பதில்களைப் பார்க்க",
    hideAnswers: "மறைக்க",
    editDetails: "எனது விவரங்களைத் திருத்த",
  },
};

interface SurveyRunnerProps {
  surveyId: string;
  questions: SurveyQuestion[];
  languages: SurveyLanguage[];
  language: SurveyLanguage;
  onLanguageChange: (lang: SurveyLanguage) => void;
  /** Already-submitted answers → completion screen + read-only review. */
  submittedAnswers?: SurveyAnswers | null;
  onSubmit?: (answers: SurveyAnswers) => void | Promise<unknown>;
  submitting?: boolean;
  /** Rendered on the start screen (e.g. the public name / email / mobile form). */
  startSlot?: ReactNode;
  /** Gate for the Start button (e.g. public details incomplete). */
  canStart?: boolean;
  startHint?: string;
  /** Error from the last submit attempt, shown on the final step. */
  submitError?: string | null;
  /** Kept for callers; the wizard is single-column at every width. */
  wide?: boolean;
}

function draftKey(surveyId: string) {
  return `wellness-survey-draft:${surveyId}`;
}

export function SurveyLanguageToggle({
  languages,
  language,
  onChange,
}: {
  languages: SurveyLanguage[];
  language: SurveyLanguage;
  onChange: (lang: SurveyLanguage) => void;
}) {
  if (languages.length < 2) return null;
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
      <Languages className="ml-1 h-4 w-4 text-slate-400" />
      {languages.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
            l === language
              ? "bg-teal-700 text-white"
              : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {SURVEY_LANGUAGE_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

const PANEL =
  "rounded-[22px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_14px_40px_rgba(16,40,35,0.09)] sm:p-8";

/** Review box for one answered question. */
function AnswerReview({
  question,
  picked,
  t,
  language,
}: {
  question: SurveyQuestion;
  picked: string;
  t: Record<string, string>;
  language: SurveyLanguage;
}) {
  const good = picked === question.constructive;
  const option = question.options.find((o) => o.id === picked);
  return (
    <div
      className={cn(
        "mt-4 animate-in fade-in slide-in-from-bottom-1 rounded-2xl border p-4 text-sm leading-relaxed sm:text-[15px]",
        good
          ? "border-green-200 bg-green-50 text-green-900"
          : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {good ? (
        <>
          <p className="mb-1 font-bold">{t.greatTitle}</p>
          <p>{t.greatBody}</p>
          {question.guidance && (
            <p className="mt-1.5">
              <strong>{t.reviewLabel}</strong> {lt(question.guidance, language)}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mb-1 font-bold">{t.improveTitle}</p>
          {option?.justification && (
            <p>
              <strong>{t.why}</strong> {lt(option.justification, language)}
            </p>
          )}
          {question.guidance && (
            <p className="mt-1.5">
              <strong>{t.path}</strong> {lt(question.guidance, language)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function SurveyRunner({
  surveyId,
  questions,
  languages,
  language,
  onLanguageChange,
  submittedAnswers,
  onSubmit,
  submitting,
  startSlot,
  canStart = true,
  startHint,
  submitError,
}: SurveyRunnerProps) {
  const done = !!submittedAnswers;
  const [draft, setDraft] = useState<SurveyAnswers>({});
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [showAnswers, setShowAnswers] = useState(false);
  const answers = done ? submittedAnswers! : draft;
  const t = UI[language] ?? UI.en;
  const prefix = OPTION_PREFIX[language] ?? OPTION_PREFIX.en;
  const total = questions.length;

  // Restore an in-progress draft (same browser) so a refresh doesn't lose the
  // answers — and the locks — the person already saw reviewed. Read after mount
  // (sessionStorage is an external store; reading it during render would make
  // the server and client HTML disagree on the public page).
  useEffect(() => {
    if (done) return;
    let restored: SurveyAnswers = {};
    try {
      const raw = sessionStorage.getItem(draftKey(surveyId));
      if (raw) restored = JSON.parse(raw) as SurveyAnswers;
    } catch {
      /* storage unavailable — start empty */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from sessionStorage
    setDraft(restored);
  }, [surveyId, done]);

  const constructiveCount = useMemo(
    () => questions.filter((q) => answers[q.id] === q.constructive).length,
    [questions, answers],
  );
  const answeredCount = questions.filter((q) => answers[q.id]).length;

  const scrollTop = () => {
    if (typeof window !== "undefined")
      window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const start = () => {
    // Resume at the first unanswered question.
    const firstOpen = questions.findIndex((q) => !draft[q.id]);
    setIndex(firstOpen === -1 ? Math.max(total - 1, 0) : firstOpen);
    setStarted(true);
    scrollTop();
  };

  const choose = (questionId: string, optionId: string) => {
    if (done || draft[questionId]) return; // locked once answered
    const next = { ...draft, [questionId]: optionId };
    setDraft(next);
    try {
      sessionStorage.setItem(draftKey(surveyId), JSON.stringify(next));
    } catch {
      /* storage unavailable — answers still live in state */
    }
  };

  const handleNext = async () => {
    const q = questions[index];
    if (!q || !draft[q.id]) return;
    if (index < total - 1) {
      setIndex(index + 1);
      scrollTop();
      return;
    }
    if (!onSubmit) return;
    try {
      await onSubmit(draft);
      try {
        sessionStorage.removeItem(draftKey(surveyId));
      } catch {
        /* ignore */
      }
      scrollTop();
    } catch {
      /* caller surfaces the error via submitError / toast */
    }
  };

  const languageBar = (
    <div className="flex justify-end">
      <SurveyLanguageToggle
        languages={languages}
        language={language}
        onChange={onLanguageChange}
      />
    </div>
  );

  // ---------------------------------------------------------------- complete
  if (done) {
    return (
      <div className="mx-auto w-full max-w-[850px] space-y-4">
        {languageBar}
        <section className={cn(PANEL, "text-center")}>
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-teal-50 text-4xl font-black text-teal-700">
            ✓
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
            {t.doneTitle}
          </h2>
          <p className="mt-2 text-slate-500">{t.doneBody}</p>
          <div className="my-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {[
              { v: answeredCount, l: t.answered },
              { v: `${constructiveCount}/${total}`, l: t.constructive },
              { v: "100%", l: t.complete },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <strong className="block text-2xl text-teal-700">{s.v}</strong>
                <span className="text-xs text-slate-500">{s.l}</span>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => setShowAnswers((v) => !v)}
            className="rounded-xl"
          >
            {showAnswers ? t.hideAnswers : t.showAnswers}
          </Button>
        </section>

        {showAnswers &&
          questions.map((q, qi) => (
            <section key={q.id} className={PANEL}>
              <h3 className="mb-2 text-lg font-extrabold text-slate-900">
                {lt(q.title, language) || `${t.question} ${qi + 1}`}
              </h3>
              <p className="mb-3 leading-relaxed text-slate-700">
                {lt(q.text, language)}
              </p>
              {answers[q.id] && (
                <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-slate-800">
                  <span className="mr-2 font-bold text-teal-700">
                    {prefix[
                      q.options.findIndex((o) => o.id === answers[q.id])
                    ] ?? answers[q.id]}
                    .
                  </span>
                  {lt(
                    q.options.find((o) => o.id === answers[q.id])?.text,
                    language,
                  )}
                </p>
              )}
              {answers[q.id] && (
                <AnswerReview
                  question={q}
                  picked={answers[q.id]}
                  t={t}
                  language={language}
                />
              )}
            </section>
          ))}
      </div>
    );
  }

  // ------------------------------------------------------------------- start
  if (!started) {
    return (
      <div className="mx-auto w-full max-w-[850px] space-y-4">
        {languageBar}
        <section className={cn(PANEL, "text-center")}>
          <div className="my-1 text-5xl">🧭</div>
          <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
            {t.startTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-[620px] leading-relaxed text-slate-500">
            {t.startBody}
          </p>
          <p className="mt-3 text-slate-600">
            <strong>{total}</strong> {t.scenarios} · ~
            {Math.max(1, Math.round(total * 0.6))}–
            {Math.max(2, Math.round(total * 0.85))} {t.minutes}
          </p>
          {startSlot && (
            <div className="mx-auto mt-6 max-w-[620px] text-left">
              {startSlot}
            </div>
          )}
          <Button
            onClick={start}
            disabled={!canStart || total === 0}
            className="mt-6 min-h-[46px] rounded-xl bg-teal-700 px-6 text-[15px] font-extrabold text-white hover:bg-teal-800"
          >
            {t.start}
          </Button>
          {!canStart && startHint && (
            <p className="mt-2 text-xs text-slate-500">{startHint}</p>
          )}
        </section>
      </div>
    );
  }

  // --------------------------------------------------------------- question
  const q = questions[index];
  const n = index + 1;
  const picked = draft[q.id];
  const pct = Math.round((n / total) * 100);
  const isLast = n === total;

  return (
    <div className="mx-auto w-full max-w-[850px] space-y-4">
      {languageBar}
      <section className={PANEL} aria-live="polite">
        <div className="flex items-end justify-between gap-3">
          <span className="font-extrabold text-teal-700">
            {t.question} {n} / {total}
          </span>
          <span className="text-sm text-slate-500">{pct}%</span>
        </div>
        <div className="mb-6 mt-2.5 h-[9px] overflow-hidden rounded-full bg-slate-200/70">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-700 to-teal-500 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <h2 className="mb-2.5 text-xl font-extrabold text-slate-900 sm:text-[22px]">
          {lt(q.title, language) || `${t.question} ${n}`}
        </h2>
        <p className="mb-5 text-base leading-relaxed text-slate-800 sm:text-[17px]">
          {lt(q.text, language)}
        </p>

        <div role="radiogroup" className="grid gap-3">
          {q.options.map((o, oi) => {
            const selected = picked === o.id;
            const locked = !!picked;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked && !selected}
                onClick={() => choose(q.id, o.id)}
                className={cn(
                  "flex items-start gap-3.5 rounded-2xl border-[1.5px] bg-white px-4 py-3.5 text-left transition-all",
                  selected
                    ? "border-teal-700 bg-teal-50 shadow-[0_0_0_3px_rgba(8,127,115,0.08)]"
                    : "border-slate-200",
                  !locked &&
                    "hover:-translate-y-px hover:border-teal-300 hover:bg-teal-50/30",
                  locked && !selected && "cursor-not-allowed opacity-55",
                )}
              >
                <span
                  className={cn(
                    "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] text-sm font-black",
                    selected
                      ? "bg-teal-700 text-white"
                      : "bg-slate-100 text-slate-600",
                  )}
                >
                  {prefix[oi] ?? o.id}
                </span>
                <span className="flex-1 pt-1 leading-relaxed text-slate-800">
                  {lt(o.text, language)}
                </span>
                <Check
                  className={cn(
                    "mt-1.5 h-5 w-5 shrink-0 text-teal-700",
                    selected ? "opacity-100" : "opacity-0",
                  )}
                  strokeWidth={3}
                />
              </button>
            );
          })}
        </div>

        <p className="mt-3 min-h-[24px] text-sm font-bold text-teal-700">
          {picked ? t.selected : ""}
        </p>
        {picked && (
          <AnswerReview
            question={q}
            picked={picked}
            t={t}
            language={language}
          />
        )}

        {isLast && submitError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {submitError}
            {startSlot && (
              <button
                type="button"
                className="ml-2 font-semibold underline"
                onClick={() => {
                  setStarted(false);
                  scrollTop();
                }}
              >
                {t.editDetails}
              </button>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setIndex(index - 1);
              scrollTop();
            }}
            disabled={index === 0}
            className="min-h-[46px] flex-1 rounded-xl font-extrabold sm:flex-none"
          >
            <ChevronLeft className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">{t.prev}</span>
          </Button>
          <Button
            onClick={handleNext}
            disabled={!picked || submitting}
            className="min-h-[46px] flex-1 rounded-xl bg-teal-700 px-6 font-extrabold text-white hover:bg-teal-800 sm:flex-none"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.submitting}
              </>
            ) : isLast ? (
              t.submit
            ) : (
              <>
                <span>{t.next}</span>
                <ChevronRight className="h-4 w-4 sm:hidden" />
              </>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
