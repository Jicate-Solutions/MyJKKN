'use client';

// app/(routes)/health/admin/programs/_components/quiz-question-row.tsx
// Created: 2026-06-15 — Health → Wellness Programs admin (PR3/3).
// Single question editor: question text + 2–6 options (radio-select correct).
// Mirrors the AI Pulse question-row, single-language.

import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { QuizOption, QuizQuestion } from '@/types/health-programs';
import { makeBlankOption } from './quiz-helpers';
import { QuizOptionRow } from './quiz-option-row';

interface QuizQuestionRowProps {
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

export function QuizQuestionRow({
  index,
  total,
  question,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: QuizQuestionRowProps) {
  const updateOption = (optId: string, next: QuizOption) => {
    onChange({
      ...question,
      options: question.options.map((o) => (o.id === optId ? next : o)),
    });
  };

  const markCorrect = (optId: string) => {
    onChange({
      ...question,
      options: question.options.map((o) => ({ ...o, is_correct: o.id === optId })),
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
    onChange({ ...question, options: [...question.options, makeBlankOption()] });
  };

  const correctCount = question.options.filter((o) => o.is_correct).length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-slate-400"
              onClick={onMoveUp}
              disabled={index === 0}
              aria-label="Move question up"
            >
              <GripVertical className="h-3.5 w-3.5 rotate-90" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-slate-400"
              onClick={onMoveDown}
              disabled={index === total - 1}
              aria-label="Move question down"
            >
              <GripVertical className="h-3.5 w-3.5 -rotate-90" />
            </Button>
          </div>
          <h4 className="text-sm font-semibold text-slate-700">
            Question {index + 1}
          </h4>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-slate-400 hover:text-destructive"
          aria-label={`Delete question ${index + 1}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Textarea
        value={question.question}
        onChange={(e) => onChange({ ...question, question: e.target.value })}
        placeholder="e.g. How many hours of sleep do adults need each night?"
        className="min-h-[56px]"
      />

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">
            Answers
            <span className="ml-2 text-slate-400">
              {question.options.length} / {MAX_OPTIONS}
            </span>
          </span>
          {correctCount === 0 && (
            <span className="text-xs text-amber-600">
              Select the correct answer.
            </span>
          )}
          {correctCount > 1 && (
            <span className="text-xs text-destructive">
              Only one answer can be correct.
            </span>
          )}
        </div>

        {question.options.map((option, i) => (
          <QuizOptionRow
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
          Add answer
        </Button>
      </div>
    </div>
  );
}
