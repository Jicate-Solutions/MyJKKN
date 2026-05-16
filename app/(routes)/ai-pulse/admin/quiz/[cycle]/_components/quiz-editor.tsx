'use client';

// app/(routes)/ai-pulse/admin/quiz/[cycle]/_components/quiz-editor.tsx
// Main client orchestrator for the Quiz Authoring Console.
// Owns the local QuizPayload state, threads it to children, persists via
// useSaveQuiz mutation. Read-modify-write keeps sibling startup_events.config
// keys intact (e.g. ai_pulse.recording_url, featured_tool_id).

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Save,
  Plus,
  Loader2,
  RefreshCw,
  Eye,
  AlertTriangle,
  CalendarClock,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useCycleQuiz,
  useSaveQuiz,
  makeBlankQuestion,
  type QuizPayload,
  type QuizQuestion,
} from '@/lib/services/ai-pulse/quiz-service';
import { QuestionRow } from './question-row';
import { AiSuggestButton } from './ai-suggest-button';
import { QuizPreviewDialog } from './quiz-preview-dialog';

interface QuizEditorProps {
  cycleId: string;
}

interface QuizValidation {
  ok: boolean;
  errors: string[];
}

function validateQuiz(quiz: QuizPayload): QuizValidation {
  const errors: string[] = [];
  if (quiz.questions.length === 0) {
    errors.push('Quiz must have at least one question.');
  }
  quiz.questions.forEach((q, i) => {
    const tag = `Q${i + 1}`;
    if (!q.question_en.trim()) errors.push(`${tag}: English question is empty.`);
    if (!q.question_ta.trim()) errors.push(`${tag}: Tamil translation is empty.`);
    if (q.options.length < 2) errors.push(`${tag}: needs at least 2 options.`);
    const correctCount = q.options.filter((o) => o.is_correct).length;
    if (correctCount === 0) errors.push(`${tag}: pick a correct option.`);
    if (correctCount > 1) errors.push(`${tag}: only one option can be correct.`);
    q.options.forEach((o, oi) => {
      const otag = `${tag} option ${String.fromCharCode(65 + oi)}`;
      if (!o.text_en.trim()) errors.push(`${otag}: English text empty.`);
      if (!o.text_ta.trim()) errors.push(`${otag}: Tamil text empty.`);
    });
  });
  if (
    !Number.isFinite(quiz.pass_threshold_live) ||
    quiz.pass_threshold_live < 0 ||
    quiz.pass_threshold_live > 100
  ) {
    errors.push('Live pass threshold must be 0–100.');
  }
  if (
    !Number.isFinite(quiz.pass_threshold_async) ||
    quiz.pass_threshold_async < 0 ||
    quiz.pass_threshold_async > 100
  ) {
    errors.push('Async pass threshold must be 0–100.');
  }
  return { ok: errors.length === 0, errors };
}

export function QuizEditor({ cycleId }: QuizEditorProps) {
  const { data: ctx, isLoading, refetch, isFetching } = useCycleQuiz(cycleId);
  const saveMutation = useSaveQuiz(cycleId);

  const [draft, setDraft] = useState<QuizPayload | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Hydrate draft from server payload once loaded; reset whenever cycle changes.
  useEffect(() => {
    if (ctx?.quiz) {
      setDraft(ctx.quiz);
    }
  }, [ctx?.cycleId, ctx?.quiz]);

  const validation = useMemo<QuizValidation>(() => {
    if (!draft) return { ok: false, errors: [] };
    return validateQuiz(draft);
  }, [draft]);

  const isDirty = useMemo(() => {
    if (!draft || !ctx?.quiz) return false;
    return JSON.stringify(draft) !== JSON.stringify(ctx.quiz);
  }, [draft, ctx?.quiz]);

  if (isLoading || !draft) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!ctx) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Cycle not found</AlertTitle>
        <AlertDescription>
          No AI Pulse cycle with id <code className="font-mono">{cycleId}</code>.
          Verify the cycle exists in <code>startup_events</code> with{' '}
          <code>config.kind = &apos;ai_pulse&apos;</code>.
        </AlertDescription>
      </Alert>
    );
  }

  // ── Mutations on the draft ──────────────────────────────────

  const updateQuestion = (qid: string, next: QuizQuestion) => {
    setDraft((prev) =>
      prev
        ? { ...prev, questions: prev.questions.map((q) => (q.id === qid ? next : q)) }
        : prev,
    );
  };

  const deleteQuestion = (qid: string) => {
    setDraft((prev) =>
      prev
        ? { ...prev, questions: prev.questions.filter((q) => q.id !== qid) }
        : prev,
    );
  };

  const moveQuestion = (qid: string, dir: 'up' | 'down') => {
    setDraft((prev) => {
      if (!prev) return prev;
      const idx = prev.questions.findIndex((q) => q.id === qid);
      if (idx === -1) return prev;
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.questions.length) return prev;
      const next = [...prev.questions];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return { ...prev, questions: next };
    });
  };

  const addQuestion = () => {
    setDraft((prev) =>
      prev ? { ...prev, questions: [...prev.questions, makeBlankQuestion()] } : prev,
    );
  };

  const appendSuggested = (questions: QuizQuestion[]) => {
    setDraft((prev) =>
      prev ? { ...prev, questions: [...prev.questions, ...questions] } : prev,
    );
  };

  const replaceWithSuggested = (questions: QuizQuestion[]) => {
    setDraft((prev) => (prev ? { ...prev, questions } : prev));
  };

  const updateThreshold = (key: 'pass_threshold_live' | 'pass_threshold_async', value: string) => {
    const n = parseInt(value, 10);
    setDraft((prev) =>
      prev ? { ...prev, [key]: Number.isFinite(n) ? n : 0 } : prev,
    );
  };

  const togglePublishSchedule = (checked: boolean) => {
    setDraft((prev) => (prev ? { ...prev, schedule_publication: checked } : prev));
  };

  const handleSave = async () => {
    if (!draft) return;
    if (!validation.ok) {
      toast.error('Fix the validation errors below before saving.');
      return;
    }
    try {
      await saveMutation.mutateAsync(draft);
      toast.success('Quiz saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(msg);
    }
  };

  const handleDiscard = () => {
    if (ctx?.quiz) setDraft(ctx.quiz);
    toast('Reverted to last saved version', { icon: 'ℹ️' });
  };

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Cycle context card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">
                {ctx.title || 'AI Pulse cycle'}
              </CardTitle>
              <CardDescription>
                Cycle id: <code className="font-mono text-xs">{ctx.cycleId}</code>
                {' · '}
                Languages: {ctx.primaryLanguage.toUpperCase()} + {ctx.secondaryLanguage.toUpperCase()}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              Reload
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="text-sm">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Recording (transcript source)
            </Label>
            {ctx.recordingUrl ? (
              <a
                href={ctx.recordingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open recording
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <p className="mt-1 text-muted-foreground">
                No recording_url set yet — AI-suggest will return placeholder seeds.
              </p>
            )}
          </div>
          <div className="text-sm">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Session end time (publication anchor)
            </Label>
            <p className="mt-1 inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
              {ctx.sessionEndTime
                ? new Date(ctx.sessionEndTime).toLocaleString()
                : '— not set on cycle —'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={addQuestion} variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          Add question
        </Button>
        <AiSuggestButton
          cycleId={cycleId}
          hasRecording={!!ctx.recordingUrl}
          hasExistingQuestions={draft.questions.length > 0}
          onAppend={appendSuggested}
          onReplace={replaceWithSuggested}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setPreviewOpen(true)}
          className="gap-2"
        >
          <Eye className="h-4 w-4" />
          Preview
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleDiscard}
            disabled={!isDirty || saveMutation.isPending}
          >
            Discard changes
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending || !validation.ok}
            className="gap-2"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save quiz
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Validation summary */}
      {!validation.ok && draft.questions.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fix {validation.errors.length} issue(s) before saving</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs">
              {validation.errors.slice(0, 8).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {validation.errors.length > 8 && (
                <li>…and {validation.errors.length - 8} more</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Question list */}
      <div className="space-y-4">
        {draft.questions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No questions yet. Add one manually or use AI-suggest to seed 5 placeholders.
              </p>
            </CardContent>
          </Card>
        ) : (
          draft.questions.map((q, i) => (
            <QuestionRow
              key={q.id}
              index={i}
              total={draft.questions.length}
              question={q}
              onChange={(next) => updateQuestion(q.id, next)}
              onDelete={() => deleteQuestion(q.id)}
              onMoveUp={() => moveQuestion(q.id, 'up')}
              onMoveDown={() => moveQuestion(q.id, 'down')}
            />
          ))
        )}
      </div>

      {/* Pass thresholds + publication */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pass thresholds & publication</CardTitle>
          <CardDescription>
            Spec defaults: live ≥ 40%, async ≥ 60% (engagement-gate signals).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="threshold-live" className="text-sm">
                Live pass threshold (%)
              </Label>
              <Input
                id="threshold-live"
                type="number"
                min={0}
                max={100}
                step={1}
                value={draft.pass_threshold_live}
                onChange={(e) => updateThreshold('pass_threshold_live', e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="threshold-async" className="text-sm">
                Async make-up pass threshold (%)
              </Label>
              <Input
                id="threshold-async"
                type="number"
                min={0}
                max={100}
                step={1}
                value={draft.pass_threshold_async}
                onChange={(e) => updateThreshold('pass_threshold_async', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
            <Checkbox
              id="schedule-publication"
              checked={draft.schedule_publication}
              onCheckedChange={(v) => togglePublishSchedule(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="schedule-publication" className="cursor-pointer space-y-0.5">
              <span className="block text-sm font-medium">
                Schedule publication at session end
              </span>
              <span className="block text-xs text-muted-foreground">
                When ON, the quiz becomes visible to learners at the cycle&apos;s
                <code className="mx-1 font-mono">session_end_time</code>
                {ctx.sessionEndTime && (
                  <>
                    {' '}({new Date(ctx.sessionEndTime).toLocaleString()})
                  </>
                )}
                . When OFF, learners cannot attempt the quiz until you flip this on.
              </span>
            </Label>
          </div>
        </CardContent>
      </Card>

      <QuizPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        quiz={draft}
        cycleTitle={ctx.title}
      />
    </div>
  );
}
