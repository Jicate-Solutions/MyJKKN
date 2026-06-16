'use client';

// app/(routes)/health/admin/programs/_components/day-editor.tsx
// Created: 2026-06-15 — Health → Wellness Programs admin (PR3/3).
// One accordion-style card per day: title / summary / video_url / publish_date
// + an optional, collapsible quiz authoring section (QuizSpec). Saves the whole
// day (incl. quiz) via useUpsertDay in a single upsert keyed on
// (program_id, day_number).

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ChevronDown,
  ListChecks,
  Loader2,
  Plus,
  Save,
  Video,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUpsertDay } from '@/hooks/health/use-wellness-programs';
import type {
  HealthProgramDay,
  QuizQuestion,
  QuizSpec,
} from '@/types/health-programs';
import {
  emptyQuiz,
  makeBlankQuestion,
  quizHasContent,
  validateQuiz,
} from './quiz-helpers';
import { QuizQuestionRow } from './quiz-question-row';
import { isYouTubeUrl } from '@/lib/health/youtube';

interface DayEditorProps {
  programId: string;
  dayNumber: number;
  /** Existing saved day, or null if this slot has never been authored. */
  day: HealthProgramDay | null;
}

interface DayForm {
  title: string;
  summary: string;
  video_url: string;
  publish_date: string;
  quiz: QuizSpec;
}

function toForm(day: HealthProgramDay | null): DayForm {
  return {
    title: day?.title ?? '',
    summary: day?.summary ?? '',
    video_url: day?.video_url ?? '',
    publish_date: day?.publish_date ?? '',
    quiz: day?.quiz ?? emptyQuiz(),
  };
}

export function DayEditor({ programId, dayNumber, day }: DayEditorProps) {
  const upsert = useUpsertDay();
  const [open, setOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [form, setForm] = useState<DayForm>(() => toForm(day));
  const [dirty, setDirty] = useState(false);

  // Re-hydrate when the saved day changes (e.g. after a refetch).
  useEffect(() => {
    setForm(toForm(day));
    setDirty(false);
  }, [day]);

  const setField = <K extends keyof DayForm>(key: K, value: DayForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const quizValidation = useMemo(() => validateQuiz(form.quiz), [form.quiz]);
  const hasQuiz = quizHasContent(form.quiz);
  const videoInvalid =
    form.video_url.trim() !== '' && !isYouTubeUrl(form.video_url);
  const isAuthored = !!day;

  // ---- quiz mutators ----
  const setQuestions = (next: QuizQuestion[]) => {
    setForm((prev) => ({ ...prev, quiz: { questions: next } }));
    setDirty(true);
  };
  const addQuestion = () => setQuestions([...form.quiz.questions, makeBlankQuestion()]);
  const updateQuestion = (id: string, next: QuizQuestion) =>
    setQuestions(form.quiz.questions.map((q) => (q.id === id ? next : q)));
  const deleteQuestion = (id: string) =>
    setQuestions(form.quiz.questions.filter((q) => q.id !== id));
  const moveQuestion = (id: string, dir: 'up' | 'down') => {
    const idx = form.quiz.questions.findIndex((q) => q.id === id);
    if (idx === -1) return;
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= form.quiz.questions.length) return;
    const next = [...form.quiz.questions];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    setQuestions(next);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error(`Day ${dayNumber}: add a title before saving.`);
      return;
    }
    if (form.video_url.trim() && !isYouTubeUrl(form.video_url)) {
      toast.error(
        `Day ${dayNumber}: video must be a YouTube link (set it to Unlisted on YouTube).`
      );
      return;
    }
    if (hasQuiz && !quizValidation.ok) {
      toast.error(`Day ${dayNumber}: fix the quiz issues before saving.`);
      return;
    }

    try {
      await upsert.mutateAsync({
        program_id: programId,
        day_number: dayNumber,
        title: form.title.trim(),
        summary: form.summary.trim() || null,
        video_url: form.video_url.trim() || null,
        publish_date: form.publish_date || null,
        // Persist null when no questions authored — keeps the column clean.
        quiz: hasQuiz ? form.quiz : null,
      });
      setDirty(false);
    } catch {
      // hook shows an error toast
    }
  };

  return (
    <Card className={isAuthored ? 'border-emerald-100' : 'border-dashed border-slate-200'}>
      <CardContent className="p-0">
        {/* Header row — click to expand */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
          aria-expanded={open}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700">
              {dayNumber}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">
                {form.title || `Day ${dayNumber}`}
                {!isAuthored && (
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    not added yet
                  </span>
                )}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {form.video_url && (
                  <span className="inline-flex items-center gap-1">
                    <Video className="h-3 w-3" /> Video
                  </span>
                )}
                {hasQuiz && (
                  <Badge
                    variant="outline"
                    className="border-teal-200 bg-teal-50 text-teal-700"
                  >
                    <ListChecks className="mr-1 h-3 w-3" />
                    {form.quiz.questions.length} quiz Q
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {dirty && (
              <span className="text-xs font-medium text-amber-600">
                Unsaved
              </span>
            )}
            <ChevronDown
              className={`h-5 w-5 text-slate-400 transition-transform ${
                open ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        {/* Body */}
        {open && (
          <div className="space-y-4 border-t border-slate-100 p-4">
            <div className="space-y-1.5">
              <Label htmlFor={`day-${dayNumber}-title`}>Title</Label>
              <Input
                id={`day-${dayNumber}-title`}
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder={`e.g. Day ${dayNumber}: Wind-down routine`}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`day-${dayNumber}-summary`}>Summary (optional)</Label>
              <Textarea
                id={`day-${dayNumber}-summary`}
                value={form.summary}
                onChange={(e) => setField('summary', e.target.value)}
                placeholder="One or two lines describing today's video."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`day-${dayNumber}-video`}>YouTube video link</Label>
                <Input
                  id={`day-${dayNumber}-video`}
                  type="url"
                  value={form.video_url}
                  onChange={(e) => setField('video_url', e.target.value)}
                  placeholder="https://youtu.be/… or youtube.com/watch?v=…"
                  className={
                    videoInvalid
                      ? 'border-destructive focus-visible:ring-destructive'
                      : undefined
                  }
                  aria-invalid={videoInvalid}
                />
                {videoInvalid ? (
                  <p className="text-xs text-destructive">
                    Enter a valid YouTube link (youtube.com or youtu.be). Other
                    sites and file uploads aren&apos;t supported.
                  </p>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-500">
                    Paste a <strong>YouTube</strong> link only. Set the video to{' '}
                    <strong>Unlisted</strong> on YouTube — hidden from search, but
                    anyone with the link can watch.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`day-${dayNumber}-publish`}>
                  Publish date (optional)
                </Label>
                <Input
                  id={`day-${dayNumber}-publish`}
                  type="date"
                  value={form.publish_date}
                  onChange={(e) => setField('publish_date', e.target.value)}
                />
              </div>
            </div>

            {/* Quiz section */}
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <button
                type="button"
                onClick={() => setQuizOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
                aria-expanded={quizOpen}
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <ListChecks className="h-4 w-4 text-teal-600" />
                  Quiz (optional)
                  <span className="text-xs font-normal text-slate-400">
                    {hasQuiz
                      ? `${form.quiz.questions.length} question${
                          form.quiz.questions.length === 1 ? '' : 's'
                        }`
                      : 'none yet'}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${
                    quizOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {quizOpen && (
                <div className="mt-3 space-y-3">
                  {hasQuiz && !quizValidation.ok && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>
                        Fix {quizValidation.errors.length} quiz issue(s)
                      </AlertTitle>
                      <AlertDescription>
                        <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                          {quizValidation.errors.slice(0, 6).map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                          {quizValidation.errors.length > 6 && (
                            <li>…and {quizValidation.errors.length - 6} more</li>
                          )}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {form.quiz.questions.map((q, i) => (
                    <QuizQuestionRow
                      key={q.id}
                      index={i}
                      total={form.quiz.questions.length}
                      question={q}
                      onChange={(next) => updateQuestion(q.id, next)}
                      onDelete={() => deleteQuestion(q.id)}
                      onMoveUp={() => moveQuestion(q.id, 'up')}
                      onMoveDown={() => moveQuestion(q.id, 'down')}
                    />
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addQuestion}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add question
                  </Button>
                </div>
              )}
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={!dirty || upsert.isPending || !form.title.trim()}
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {upsert.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save day {dayNumber}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
