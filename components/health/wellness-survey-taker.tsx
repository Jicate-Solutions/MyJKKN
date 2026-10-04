"use client";

// components/health/wellness-survey-taker.tsx
// Logged-in Wellness Survey taker (learners + team members), shared by
// /health/surveys (inside the app shell) and /survey (standalone, no sidebar /
// header — the shared "JKKN users" link + QR). Pick a program → its survey
// loads → each answer is reviewed immediately and locks → submit once.
// ?program=<id>&survey=<id> pre-selects. Created: 2026-09-28

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck, ClipboardList } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SurveyHero } from "@/components/health/survey-banner";
import { SurveyRunner } from "@/components/health/survey-runner";
import { useAuth } from "@/hooks/use-auth";
import {
  useMySurveyResponse,
  useMySurveyType,
  useProgramsWithActiveSurveys,
  useSubmitSurvey,
} from "@/hooks/health/use-wellness-surveys";
import type { SurveyLanguage } from "@/types/health-surveys";

export function WellnessSurveyTaker({
  standalone = false,
}: {
  standalone?: boolean;
}) {
  // ?program=<id>&survey=<id> — the shared "JKKN users" link / QR pre-selects.
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const userId = profile?.id;
  // Category decides access: staff-only surveys never show to learners and
  // vice versa (RLS enforces the same; this also hides them from managers).
  const {
    data: myType,
    isLoading: typeLoading,
    error: typeError,
  } = useMySurveyType(userId);

  const {
    data: programs,
    isLoading: programsLoading,
    error: programsError,
  } = useProgramsWithActiveSurveys();
  const error = programsError ?? typeError;
  const isLoading = programsLoading || typeLoading;
  const [programId, setProgramId] = useState<string>(
    () => searchParams.get("program") ?? "",
  );
  const [surveyId, setSurveyId] = useState<string>(
    () => searchParams.get("survey") ?? "",
  );
  const [language, setLanguage] = useState<SurveyLanguage>("en");

  // Only surveys open to this person's category.
  const eligiblePrograms = useMemo(
    () =>
      (programs ?? [])
        .map((p) => ({
          ...p,
          surveys: myType
            ? p.surveys.filter((s) => s.audience.includes(myType))
            : [],
        }))
        .filter((p) => p.surveys.length > 0),
    [programs, myType],
  );

  const program = eligiblePrograms.find((p) => p.id === programId);
  const survey = program?.surveys.find((s) => s.id === surveyId);

  // Auto-pick when there's only one choice.
  useEffect(() => {
    if (!programId && eligiblePrograms.length === 1)
      setProgramId(eligiblePrograms[0].id);
  }, [eligiblePrograms, programId]);
  useEffect(() => {
    if (program && !program.surveys.some((s) => s.id === surveyId)) {
      setSurveyId(program.surveys.length === 1 ? program.surveys[0].id : "");
    }
  }, [program, surveyId]);

  const { data: mine, isLoading: mineLoading } = useMySurveyResponse(
    survey?.id,
    userId,
  );
  const submit = useSubmitSurvey();

  useEffect(() => {
    if (!survey) return;
    if (mine?.language && survey.languages.includes(mine.language))
      setLanguage(mine.language);
    else if (!survey.languages.includes(language))
      setLanguage(survey.languages[0] ?? "en");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey?.id, mine?.language]);

  // Standalone link (/survey?program=&survey=) that resolved to a survey: show
  // just the form, no picker.
  const hidePicker = standalone && !!survey;

  return (
    <div className="space-y-5">
      {!hidePicker && (
        <div>
          <h1 className="py-1 text-2xl font-bold text-slate-800">
            Wellness Surveys
          </h1>
          <p className="text-sm text-slate-500 sm:text-base">
            Choose a program to take its survey. You&apos;ll see a short review
            after each answer. Each survey can be submitted only once.
          </p>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load surveys</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : eligiblePrograms.length === 0 ? (
        <Card className="border-dashed border-emerald-200">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ClipboardList className="h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium text-slate-600">
              No open surveys right now
            </p>
            <p className="max-w-xs text-xs text-slate-400">
              When a wellness program opens a survey for you, it will appear
              here.
            </p>
          </CardContent>
        </Card>
      ) : hidePicker ? null : (
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ws-program">Program</Label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger id="ws-program">
                  <SelectValue placeholder="Select a program" />
                </SelectTrigger>
                <SelectContent>
                  {eligiblePrograms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {program && program.surveys.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="ws-survey">Survey</Label>
                <Select value={surveyId} onValueChange={setSurveyId}>
                  <SelectTrigger id="ws-survey">
                    <SelectValue placeholder="Select a survey" />
                  </SelectTrigger>
                  <SelectContent>
                    {program.surveys.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {survey && (
        <div className="space-y-4">
          <SurveyHero
            bannerUrl={survey.banner_url}
            eyebrow={program?.title !== survey.title ? program?.title : null}
            title={survey.title}
            description={survey.description}
            aside={
              mine ? (
                <Badge className="gap-1 bg-teal-700 text-white hover:bg-teal-700">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Submitted{" "}
                  {new Date(mine.submitted_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </Badge>
              ) : null
            }
          />

          {mineLoading ? (
            <Skeleton className="mx-auto h-64 w-full max-w-[850px] rounded-[22px]" />
          ) : (
            <SurveyRunner
              wide={standalone}
              surveyId={survey.id}
              questions={survey.questions}
              languages={survey.languages}
              language={language}
              onLanguageChange={setLanguage}
              submittedAnswers={mine?.answers ?? null}
              submitting={submit.isPending}
              onSubmit={(answers) =>
                submit.mutateAsync({ surveyId: survey.id, answers, language })
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
