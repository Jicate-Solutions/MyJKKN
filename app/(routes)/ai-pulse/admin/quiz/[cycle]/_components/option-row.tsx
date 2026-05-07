'use client';

// app/(routes)/ai-pulse/admin/quiz/[cycle]/_components/option-row.tsx
// Single bilingual option editor (English text + Tamil text + correct radio).

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, CheckCircle2 } from 'lucide-react';
import type { QuizOption } from '@/lib/services/ai-pulse/quiz-service';

interface OptionRowProps {
  index: number;
  option: QuizOption;
  questionId: string;
  canDelete: boolean;
  onChange: (next: QuizOption) => void;
  onMarkCorrect: () => void;
  onDelete: () => void;
}

export function OptionRow({
  index,
  option,
  questionId,
  canDelete,
  onChange,
  onMarkCorrect,
  onDelete,
}: OptionRowProps) {
  const groupName = `correct-${questionId}`;
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-[auto_1fr_1fr_auto] items-start gap-2 rounded-md border p-3 ${
        option.is_correct
          ? 'border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-950/20'
          : 'border-border'
      }`}
    >
      <label className="flex items-center gap-2 pt-2 text-sm">
        <input
          type="radio"
          name={groupName}
          checked={option.is_correct}
          onChange={onMarkCorrect}
          className="h-4 w-4 cursor-pointer"
          aria-label={`Mark option ${index + 1} as correct`}
        />
        <span className="font-mono text-xs text-muted-foreground">
          {String.fromCharCode(65 + index)}
        </span>
      </label>

      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
          English
        </label>
        <Input
          value={option.text_en}
          onChange={(e) => onChange({ ...option, text_en: e.target.value })}
          placeholder={`Option ${String.fromCharCode(65 + index)} (EN)`}
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
          தமிழ் (Tamil)
        </label>
        <Input
          value={option.text_ta}
          onChange={(e) => onChange({ ...option, text_ta: e.target.value })}
          placeholder={`விடை ${String.fromCharCode(65 + index)}`}
          className="mt-1"
          lang="ta"
        />
      </div>

      <div className="flex flex-col items-end gap-1 pt-2">
        {option.is_correct && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-100">
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
          aria-label={`Delete option ${index + 1}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
