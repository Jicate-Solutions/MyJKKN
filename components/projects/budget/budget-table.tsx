'use client';

/**
 * Budget Table
 *
 * Lists project_budget rows grouped by period_month (latest first) then by
 * category. Each row shows: category name, period, planned, actual, forecast,
 * variance (planned − actual), notes, and an actions menu (edit / delete /
 * record change).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F6.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { TAP_TARGET_ICON } from '@/app/(routes)/projects/_lib/tap-targets';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Plus,
  GitBranch,
} from 'lucide-react';
import { BudgetLineDialog } from './budget-line-dialog';
import { BudgetChangeDialog } from './budget-change-dialog';
import { useDeleteBudgetLine } from '@/hooks/projects/use-budget';
import type { ProjectBudget, ProjectBudgetCategory } from '@/types/projects';

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function fmtINR(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtPeriod(period: string | null): string {
  if (!period) return 'No period';
  const d = new Date(period);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function categoryName(
  categoryId: string | null,
  categories: ProjectBudgetCategory[]
): string {
  if (!categoryId) return 'Uncategorized';
  return categories.find((c) => c.id === categoryId)?.name ?? 'Unknown';
}

function VarianceCell({ planned, actual }: { planned: number; actual: number }) {
  const v = planned - actual;
  const cls = v < 0 ? 'text-destructive' : 'text-emerald-600';
  return (
    <span className={`font-medium ${cls}`}>
      {v >= 0 ? '+' : ''}
      {fmtINR(v)}
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────────

interface BudgetTableProps {
  projectId: string;
  lines: ProjectBudget[];
  categories: ProjectBudgetCategory[];
}

export function BudgetTable({ projectId, lines, categories }: BudgetTableProps) {
  const deleteLine = useDeleteBudgetLine();

  const [addOpen, setAddOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<ProjectBudget | null>(null);
  const [changingLine, setChangingLine] = useState<ProjectBudget | null>(null);
  const [deletingLine, setDeletingLine] = useState<ProjectBudget | null>(null);

  // Sort: lines with period first (most recent), then no-period
  const sorted = [...lines].sort((a, b) => {
    if (!a.period_month && !b.period_month) return 0;
    if (!a.period_month) return 1;
    if (!b.period_month) return -1;
    return b.period_month.localeCompare(a.period_month);
  });

  function handleDelete() {
    if (!deletingLine) return;
    deleteLine.mutate(
      { id: deletingLine.id, projectId },
      {
        onSuccess: () => {
          toast.success('Budget line deleted.');
          setDeletingLine(null);
        },
        onError: (err) => {
          toast.error((err as Error).message ?? 'Delete failed.');
          setDeletingLine(null);
        },
      }
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Budget Lines
        </h3>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add line
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No budget lines yet.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add the first line
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Planned</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Forecast</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {categoryName(line.category_id, categories)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtPeriod(line.period_month)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtINR(line.planned_amount_inr)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtINR(line.actual_amount_inr)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtINR(line.forecast_amount_inr)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    <VarianceCell
                      planned={line.planned_amount_inr}
                      actual={line.actual_amount_inr}
                    />
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground">
                    {line.notes ?? '—'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${TAP_TARGET_ICON}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditingLine(line)}
                          className="gap-2"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit line
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setChangingLine(line)}
                          className="gap-2"
                        >
                          <GitBranch className="h-3.5 w-3.5" />
                          Record change
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeletingLine(line)}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add dialog */}
      <BudgetLineDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        categories={categories}
      />

      {/* Edit dialog */}
      {editingLine && (
        <BudgetLineDialog
          key={editingLine.id}
          open={!!editingLine}
          onOpenChange={(o) => { if (!o) setEditingLine(null); }}
          projectId={projectId}
          categories={categories}
          line={editingLine}
        />
      )}

      {/* Record-change dialog */}
      {changingLine && (
        <BudgetChangeDialog
          key={`change-${changingLine.id}`}
          open={!!changingLine}
          onOpenChange={(o) => { if (!o) setChangingLine(null); }}
          projectId={projectId}
          line={changingLine}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog
        open={!!deletingLine}
        onOpenChange={(o) => { if (!o) setDeletingLine(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete budget line?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the budget line. Any recorded budget
              changes linked to it will retain the reference but the line itself
              cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteLine.isPending}
            >
              {deleteLine.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
