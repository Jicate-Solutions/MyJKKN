'use client';

// app/(routes)/health/admin/programs/_components/form-option-row.tsx
// Created: 2026-06-16 — Wellness Programs form builder.
// One option editor for a choice field. The "correct" control only shows when the
// field is graded: a radio for single_choice/dropdown (one correct), a checkbox
// for multi_choice (many correct). Replaces quiz-option-row.tsx.

import { CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FormFieldOption } from '@/types/health-programs';

interface FormOptionRowProps {
  index: number;
  option: FormFieldOption;
  fieldId: string;
  graded: boolean;
  /** multi_choice → checkbox (many correct); else radio (one correct). */
  multi: boolean;
  canDelete: boolean;
  onChange: (next: FormFieldOption) => void;
  onToggleCorrect: () => void;
  onDelete: () => void;
}

export function FormOptionRow({
  index,
  option,
  fieldId,
  graded,
  multi,
  canDelete,
  onChange,
  onToggleCorrect,
  onDelete,
}: FormOptionRowProps) {
  const groupName = `correct-${fieldId}`;
  const showCorrect = graded && option.is_correct;
  return (
    <div
      className={`flex items-center gap-2 rounded-md border p-2.5 ${
        showCorrect ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200'
      }`}
    >
      {graded && (
        <input
          type={multi ? 'checkbox' : 'radio'}
          name={multi ? undefined : groupName}
          checked={!!option.is_correct}
          onChange={onToggleCorrect}
          className="h-4 w-4 cursor-pointer accent-emerald-600"
          aria-label={`Select option ${String.fromCharCode(65 + index)} as correct`}
        />
      )}

      <span className="font-mono text-xs text-slate-400">
        {String.fromCharCode(65 + index)}
      </span>

      <Input
        value={option.text}
        onChange={(e) => onChange({ ...option, text: e.target.value })}
        placeholder={`Option ${String.fromCharCode(65 + index)}`}
        className="flex-1"
      />

      {showCorrect && (
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
