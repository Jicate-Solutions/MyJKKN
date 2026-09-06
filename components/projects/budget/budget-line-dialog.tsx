'use client';

/**
 * Budget Line Dialog — create / edit a project_budget row.
 *
 * Fields: category (picker from project_budget_categories), period (month),
 * planned amount, actual amount, forecast amount, currency (INR default),
 * notes.
 *
 * Pattern: components/projects/risks/risk-form-dialog.tsx
 * (Dialog + key-remount for reset-free initial state).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F6.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useCreateBudgetLine, useUpdateBudgetLine } from '@/hooks/projects/use-budget';
import type { ProjectBudget, ProjectBudgetCategory } from '@/types/projects';

const NONE = '__none__'; // Radix SelectItem must never be empty-string.

interface BudgetLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  categories: ProjectBudgetCategory[];
  /** Provided → edit mode; omitted → create mode. */
  line?: ProjectBudget | null;
}

/** Outer shell — owns Dialog. Inner form is key-remounted on open/line change. */
export function BudgetLineDialog({
  open,
  onOpenChange,
  projectId,
  categories,
  line,
}: BudgetLineDialogProps) {
  const isEdit = !!line;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit budget line' : 'Add budget line'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the amounts or metadata for this budget line.'
              : 'Add a planned budget line. Actual and forecast can be filled in later.'}
          </DialogDescription>
        </DialogHeader>
        <BudgetLineForm
          key={line?.id ?? 'new'}
          projectId={projectId}
          categories={categories}
          line={line ?? null}
          onSuccess={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── Inner form ──────────────────────────────────────────────────────────────────

interface FormProps {
  projectId: string;
  categories: ProjectBudgetCategory[];
  line: ProjectBudget | null;
  onSuccess: () => void;
  onCancel: () => void;
}

function BudgetLineForm({ projectId, categories, line, onSuccess, onCancel }: FormProps) {
  const createLine = useCreateBudgetLine();
  const updateLine = useUpdateBudgetLine();

  const [categoryId, setCategoryId] = useState<string>(line?.category_id ?? NONE);
  const [planned, setPlanned] = useState(String(line?.planned_amount_inr ?? ''));
  const [actual, setActual] = useState(String(line?.actual_amount_inr ?? '0'));
  const [forecast, setForecast] = useState(
    line?.forecast_amount_inr != null ? String(line.forecast_amount_inr) : ''
  );
  const [periodMonth, setPeriodMonth] = useState(
    line?.period_month ? line.period_month.slice(0, 7) : '' // "YYYY-MM"
  );
  const [notes, setNotes] = useState(line?.notes ?? '');

  const isLoading = createLine.isPending || updateLine.isPending;

  function parseMoney(val: string): number {
    const n = parseFloat(val.replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!planned.trim()) {
      toast.error('Planned amount is required.');
      return;
    }

    const resolvedCategoryId = categoryId === NONE ? null : categoryId;
    // period_month: turn "YYYY-MM" into "YYYY-MM-01" (date column)
    const resolvedPeriod = periodMonth ? `${periodMonth}-01` : null;

    try {
      if (line) {
        await updateLine.mutateAsync({
          id: line.id,
          input: {
            category_id: resolvedCategoryId,
            planned_amount_inr: parseMoney(planned),
            actual_amount_inr: parseMoney(actual),
            forecast_amount_inr: forecast.trim() ? parseMoney(forecast) : null,
            period_month: resolvedPeriod,
            notes: notes.trim() || null,
          },
        });
        toast.success('Budget line updated.');
      } else {
        await createLine.mutateAsync({
          project_id: projectId,
          category_id: resolvedCategoryId,
          planned_amount_inr: parseMoney(planned),
          actual_amount_inr: parseMoney(actual),
          forecast_amount_inr: forecast.trim() ? parseMoney(forecast) : null,
          period_month: resolvedPeriod,
          notes: notes.trim() || null,
        });
        toast.success('Budget line added.');
      }
      onSuccess();
    } catch (err) {
      toast.error((err as Error).message ?? 'Save failed.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Category */}
      <div className="space-y-1.5">
        <Label htmlFor="budget-category">Category</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="budget-category">
            <SelectValue placeholder="Select category…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Uncategorized</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Period month */}
      <div className="space-y-1.5">
        <Label htmlFor="budget-period">Period (month)</Label>
        <Input
          id="budget-period"
          type="month"
          value={periodMonth}
          onChange={(e) => setPeriodMonth(e.target.value)}
          placeholder="e.g. 2026-04"
        />
        <p className="text-xs text-muted-foreground">
          Leave blank for a project-level (non-periodic) line.
        </p>
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="budget-planned">
            Planned amount (INR) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="budget-planned"
            type="number"
            min="0"
            step="0.01"
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            placeholder="0"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="budget-actual">Actual amount (INR)</Label>
          <Input
            id="budget-actual"
            type="number"
            min="0"
            step="0.01"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="budget-forecast">Forecast amount (INR)</Label>
        <Input
          id="budget-forecast"
          type="number"
          min="0"
          step="0.01"
          value={forecast}
          onChange={(e) => setForecast(e.target.value)}
          placeholder="Leave blank to use planned"
        />
        <p className="text-xs text-muted-foreground">
          If blank, the planned amount is used as the forecast in summaries.
        </p>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="budget-notes">Notes</Label>
        <Textarea
          id="budget-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional context…"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading} className="gap-1.5">
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {line ? 'Save changes' : 'Add line'}
        </Button>
      </DialogFooter>
    </form>
  );
}
