'use client';

// app/(routes)/health/admin/programs/_components/quiz-option-row.tsx
// Created: 2026-06-15 — Health → Wellness Programs admin (PR3/3).
// Single answer-option editor: text input + "correct" radio. Single-language,
// mirroring the AI Pulse option-row interaction (radio = exactly one correct).

import { CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QuizOption } from '@/types/health-programs';

interface QuizOptionRowProps {
  index: number;
  option: QuizOption;
  questionId: string;
  canDelete: boolean;
  onChange: (next: QuizOption) => void;
  onMarkCorrect: () => void;
  onDelete: () => void;
}

export function QuizOptionRow({
  index,
  option,
  questionId,
  canDelete,
  onChange,
  onMarkCorrect,
  onDelete,
}: QuizOptionRowProps) {
  const groupName = `correct-${questionId}`;
  return (
    <div
      className={`flex items-center gap-2 rounded-md border p-2.5 ${
        option.is_correct
          ? 'border-emerald-300 bg-emerald-50/60'
          : 'border-slate-200'
      }`}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name={groupName}
          checked={option.is_correct}
          onChange={onMarkCorrect}
          className="h-4 w-4 cursor-pointer accent-emerald-600"
          aria-label={`Mark option ${String.fromCharCode(65 + index)} as correct`}
        />
        <span className="font-mono text-xs text-slate-400">
          {String.fromCharCode(65 + index)}
        </span>
      </label>

      <Input
        value={option.text}
        onChange={(e) => onChange({ ...option, text: e.target.value })}
        placeholder={`Answer ${String.fromCharCode(65 + index)}`}
        className="flex-1"
      />

      {option.is_correct && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-3 w-3" />
          Correct
        </span>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={!canDelete}
        aria-label={`Delete option ${String.fromCharCode(65 + index)}`}
        className="shrink-0 text-slate-400 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
