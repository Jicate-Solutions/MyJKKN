'use client';

// app/(routes)/ai-pulse/admin/quiz/[cycle]/_components/question-row.tsx
// Single bilingual question editor — manages 2x text fields (EN + TA) +
// up to 6 OptionRow children.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import {
  type QuizQuestion,
  type QuizOption,
  makeBlankOption,
} from '@/lib/services/ai-pulse/quiz-service';
import { OptionRow } from './option-row';

interface QuestionRowProps {
  index: number;
  total: number;
  question: QuizQuestion;
  onChange: (next: QuizQuestion) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

export function QuestionRow({
  index,
  total,
  question,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: QuestionRowProps) {
  const updateOption = (optId: string, next: QuizOption) => {
    onChange({
      ...question,
      options: question.options.map((o) => (o.id === optId ? next : o)),
    });
  };

  const markCorrect = (optId: string) => {
    onChange({
      ...question,
      options: question.options.map((o) => ({
        ...o,
        is_correct: o.id === optId,
      })),
    });
  };

  const deleteOption = (optId: string) => {
    if (question.options.length <= MIN_OPTIONS) return;
    onChange({
      ...question,
      options: question.options.filter((o) => o.id !== optId),
    });
  };

  const addOption = () => {
    if (question.options.length >= MAX_OPTIONS) return;
    onChange({
      ...question,
      options: [...question.options, makeBlankOption()],
    });
  };

  const correctCount = question.options.filter((o) => o.is_correct).length;

  return (
    <Card className="border-2">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-2">
          <div className="flex flex-col items-center gap-1 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onMoveUp}
              disabled={index === 0}
              aria-label="Move question up"
            >
              <GripVertical className="h-4 w-4 rotate-90" />
            </Button>
            <span className="text-xs text-muted-foreground">{index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onMoveDown}
              disabled={index === total - 1}
              aria-label="Move question down"
            >
              <GripVertical className="h-4 w-4 -rotate-90" />
            </Button>
          </div>
          <CardTitle className="text-base">Question {index + 1}</CardTitle>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Delete question ${index + 1}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Question (English)
            </label>
            <Textarea
              value={question.question_en}
              onChange={(e) =>
                onChange({ ...question, question_en: e.target.value })
              }
              placeholder="What is the featured AI tool covered in this session?"
              className="mt-1 min-h-[64px]"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              கேள்வி (Tamil)
            </label>
            <Textarea
              value={question.question_ta}
              onChange={(e) =>
                onChange({ ...question, question_ta: e.target.value })
              }
              placeholder="இந்த அமர்வில் முன்னிலைப்படுத்தப்பட்ட AI கருவி என்ன?"
              className="mt-1 min-h-[64px]"
              lang="ta"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">
              Options
              <span className="ml-2 text-xs text-muted-foreground">
                {question.options.length} / {MAX_OPTIONS}
              </span>
            </h4>
            {correctCount === 0 && (
              <span className="text-xs text-amber-700 dark:text-amber-400">
                Select one option as the correct answer.
              </span>
            )}
            {correctCount > 1 && (
              <span className="text-xs text-destructive">
                Only one option can be correct.
              </span>
            )}
          </div>

          {question.options.map((option, i) => (
            <OptionRow
              key={option.id}
              index={i}
              option={option}
              questionId={question.id}
              canDelete={question.options.length > MIN_OPTIONS}
              onChange={(next) => updateOption(option.id, next)}
              onMarkCorrect={() => markCorrect(option.id)}
              onDelete={() => deleteOption(option.id)}
            />
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addOption}
            disabled={question.options.length >= MAX_OPTIONS}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add option
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
