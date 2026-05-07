'use client';

// app/(routes)/ai-pulse/admin/quiz/[cycle]/_components/quiz-preview-dialog.tsx
// Renders the learner-facing quiz UI for sanity check. Read-only (no submit
// wiring). Lets Champion see exactly what learners will face — bilingual
// stacked layout, clickable options, correct-answer reveal toggle.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Eye, EyeOff, Languages } from 'lucide-react';
import type { QuizPayload } from '@/lib/services/ai-pulse/quiz-service';

interface QuizPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quiz: QuizPayload;
  cycleTitle: string | null;
}

type LangMode = 'both' | 'en' | 'ta';

export function QuizPreviewDialog({
  open,
  onOpenChange,
  quiz,
  cycleTitle,
}: QuizPreviewDialogProps) {
  const [revealAnswers, setRevealAnswers] = useState(false);
  const [langMode, setLangMode] = useState<LangMode>('both');
  const [selected, setSelected] = useState<Record<string, string>>({});

  const totalQuestions = quiz.questions.length;
  const completed = Object.keys(selected).length;
  const showEn = langMode === 'both' || langMode === 'en';
  const showTa = langMode === 'both' || langMode === 'ta';

  // Compute mock score for the bottom panel
  const correctCount = quiz.questions.filter((q) => {
    const sel = selected[q.id];
    if (!sel) return false;
    const opt = q.options.find((o) => o.id === sel);
    return opt?.is_correct;
  }).length;
  const scorePct = totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quiz preview — learner view</DialogTitle>
          <DialogDescription>
            {cycleTitle || 'AI Pulse cycle'} · This is exactly what learners will see.
            Selections are not persisted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-y py-2">
          <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-1">
            <Button
              type="button"
              size="sm"
              variant={langMode === 'both' ? 'default' : 'ghost'}
              onClick={() => setLangMode('both')}
              className="h-7 gap-1 text-xs"
            >
              <Languages className="h-3 w-3" /> Both
            </Button>
            <Button
              type="button"
              size="sm"
              variant={langMode === 'en' ? 'default' : 'ghost'}
              onClick={() => setLangMode('en')}
              className="h-7 text-xs"
            >
              EN
            </Button>
            <Button
              type="button"
              size="sm"
              variant={langMode === 'ta' ? 'default' : 'ghost'}
              onClick={() => setLangMode('ta')}
              className="h-7 text-xs"
            >
              தமிழ்
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            variant={revealAnswers ? 'default' : 'outline'}
            onClick={() => setRevealAnswers((v) => !v)}
            className="gap-1"
          >
            {revealAnswers ? (
              <>
                <EyeOff className="h-4 w-4" /> Hide correct answers
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" /> Show correct answers
              </>
            )}
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {completed} / {totalQuestions} answered
          </span>
        </div>

        {totalQuestions === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No questions yet. Add or AI-suggest questions to preview.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {quiz.questions.map((q, qi) => (
              <Card key={q.id}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      Q{qi + 1}
                    </span>
                    <div className="flex-1 space-y-1">
                      {showEn && (
                        <p className="text-sm font-medium">
                          {q.question_en || (
                            <span className="italic text-muted-foreground">
                              (English question missing)
                            </span>
                          )}
                        </p>
                      )}
                      {showTa && (
                        <p className="text-sm font-medium" lang="ta">
                          {q.question_ta || (
                            <span className="italic text-muted-foreground">
                              (Tamil translation missing)
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => {
                      const isSelected = selected[q.id] === opt.id;
                      const showCorrect = revealAnswers && opt.is_correct;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setSelected((prev) => ({ ...prev, [q.id]: opt.id }))
                          }
                          className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-muted/50'
                          } ${
                            showCorrect
                              ? 'ring-2 ring-green-400 dark:ring-green-600'
                              : ''
                          }`}
                        >
                          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background font-mono text-xs">
                            {String.fromCharCode(65 + oi)}
                          </span>
                          <span className="flex-1 space-y-0.5 text-sm">
                            {showEn && (
                              <span className="block">
                                {opt.text_en || (
                                  <span className="italic text-muted-foreground">
                                    (EN missing)
                                  </span>
                                )}
                              </span>
                            )}
                            {showTa && (
                              <span className="block" lang="ta">
                                {opt.text_ta || (
                                  <span className="italic text-muted-foreground">
                                    (TA missing)
                                  </span>
                                )}
                              </span>
                            )}
                          </span>
                          {showCorrect && (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card className="border-dashed bg-muted/30">
              <CardContent className="flex items-center justify-between py-3 text-sm">
                <span>
                  Mock score: <strong>{correctCount}</strong> / {totalQuestions} ({scorePct}%)
                </span>
                <span className="text-xs text-muted-foreground">
                  Live pass ≥ {quiz.pass_threshold_live}% · Async pass ≥ {quiz.pass_threshold_async}%
                </span>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
