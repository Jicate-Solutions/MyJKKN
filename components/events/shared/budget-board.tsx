'use client';

// components/events/shared/budget-board.tsx
// Shared event budget board (income/expense lines + summary + finance sign-off) for ANY event type.
// Events Platform Promotion PR2; UI overhaul 2026-07. Decision #7: organizer drafts/edits → a
// finance-approved person (events.budget.approve) signs off, which locks the budget (enforced
// server-side by a DB trigger).
//
// Lines are EDITABLE (pencil → shared add/edit dialog; the edit form also records the actual
// amount spent/received, which the original board never exposed). Mobile-first: summary tiles
// stack 1→3, line rows keep amounts + actions reachable at 375px with no horizontal scroll.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Scale,
  Lock,
  CheckCircle2,
  Send,
  Unlock,
  Wallet,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useEventBudgetItems,
  useEventBudgetSummary,
  useEventBudgetApproval,
  useCreateEventBudgetItem,
  useUpdateEventBudgetItem,
  useDeleteEventBudgetItem,
  useSubmitEventBudget,
  useApproveEventBudget,
  useReopenEventBudget,
} from '@/hooks/events/shared/use-event-budget';
import type {
  MarathonBudgetItem,
  BudgetItemType,
} from '@/types/events-marathon';
import type { EventBudgetStatus } from '@/lib/services/events/shared/event-budget-service';

const rupee = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

const STATUS_BADGE: Record<EventBudgetStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  submitted: { label: 'Awaiting sign-off', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  approved: { label: 'Approved & locked', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  locked: { label: 'Locked', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
};

function ApprovalBanner({ eventId, canApprove }: { eventId: string; canApprove: boolean }) {
  const { data: approval } = useEventBudgetApproval(eventId);
  const submit = useSubmitEventBudget(eventId);
  const approve = useApproveEventBudget(eventId);
  const reopen = useReopenEventBudget(eventId);

  const status: EventBudgetStatus = approval?.status ?? 'draft';
  const badge = STATUS_BADGE[status];
  const isLocked = status === 'approved' || status === 'locked';

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-2">
          {isLocked ? (
            <Lock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Scale className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">Finance sign-off</span>
          <Badge className={`border-0 ${badge.className}`}>{badge.label}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isLocked && (
            <Button
              size="sm"
              variant="outline"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              <Send className="mr-1 h-3.5 w-3.5" />
              {status === 'submitted' ? 'Re-submit' : 'Submit for sign-off'}
            </Button>
          )}
          {canApprove && status === 'submitted' && (
            <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate()}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Approve &amp; lock
            </Button>
          )}
          {canApprove && isLocked && (
            <Button
              size="sm"
              variant="outline"
              disabled={reopen.isPending}
              onClick={() => reopen.mutate()}
            >
              <Unlock className="mr-1 h-3.5 w-3.5" />
              Reopen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCards({ eventId }: { eventId: string }) {
  const { data: s, isLoading } = useEventBudgetSummary(eventId);
  if (isLoading || !s) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="py-4">
              <div className="h-14 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  const balancePositive = s.estimated_balance >= 0;
  const cards = [
    {
      label: 'Income (est.)',
      value: rupee(s.total_estimated_income),
      sub: `Actual: ${rupee(s.total_actual_income)}`,
      icon: TrendingUp,
      chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
    },
    {
      label: 'Expense (est.)',
      value: rupee(s.total_estimated_expense),
      sub: `Actual: ${rupee(s.total_actual_expense)}`,
      icon: TrendingDown,
      chip: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
    },
    {
      label: 'Balance (est.)',
      value: rupee(s.estimated_balance),
      sub: `Actual: ${rupee(s.actual_balance)}`,
      icon: Scale,
      chip: balancePositive
        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
        : 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="flex items-start gap-3 p-4">
            <div className={`mt-0.5 shrink-0 rounded-lg p-2 ${c.chip}`}>
              <c.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="truncate text-xl font-semibold leading-tight tabular-nums">{c.value}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">{c.sub}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Add / Edit line dialog ────────────────────────────────────────────────────
// One dialog for both modes; the inner form is keyed by the item id so it mounts
// with fresh initial state per line (no setState-in-effect re-seeding).

function ItemForm({
  eventId,
  initial,
  onClose,
}: {
  eventId: string;
  initial: MarathonBudgetItem | null;
  onClose: () => void;
}) {
  const create = useCreateEventBudgetItem(eventId);
  const update = useUpdateEventBudgetItem(eventId);
  const isEdit = !!initial;

  const [form, setForm] = useState({
    type: (initial?.type ?? 'expense') as BudgetItemType,
    category: initial?.category ?? '',
    description: initial?.description ?? '',
    estimated: initial?.estimated_amount ?? 0,
    actual: initial?.actual_amount ?? 0,
    vendor: initial?.vendor ?? '',
    notes: initial?.notes ?? '',
  });
  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const isPending = create.isPending || update.isPending;
  const valid = !!form.category.trim() && !!form.description.trim();

  const submit = () => {
    if (!valid) return;
    if (isEdit && initial) {
      update.mutate(
        {
          id: initial.id,
          dto: {
            type: form.type,
            category: form.category.trim(),
            description: form.description.trim(),
            estimated_amount: form.estimated,
            actual_amount: form.actual,
            vendor: form.vendor.trim() || null,
            notes: form.notes.trim() || null,
          },
        },
        { onSuccess: onClose }
      );
    } else {
      create.mutate(
        {
          event_id: eventId,
          type: form.type,
          category: form.category.trim(),
          description: form.description.trim(),
          estimated_amount: form.estimated,
          vendor: form.vendor.trim() || undefined,
          notes: form.notes.trim() || undefined,
        },
        { onSuccess: onClose }
      );
    }
  };

  return (
    <>
      <div className="space-y-3 py-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={form.type} onValueChange={(v) => set('type', v as BudgetItemType)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estimated (₹)</Label>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={form.estimated || ''}
              onChange={(e) => set('estimated', Number(e.target.value))}
            />
          </div>
        </div>
        {isEdit && (
          <div className="space-y-1">
            <Label className="text-xs">
              Actual (₹) — {form.type === 'income' ? 'received' : 'spent'} so far
            </Label>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={form.actual || ''}
              onChange={(e) => set('actual', Number(e.target.value))}
            />
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Category *</Label>
          <Input
            placeholder="Venue, Catering, Sponsorship…"
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Description *</Label>
          <Input
            placeholder="What is this line for?"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Vendor</Label>
            <Input
              placeholder="Optional"
              value={form.vendor}
              onChange={(e) => set('vendor', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input
              placeholder="Optional"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={isPending || !valid}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isEdit ? 'Save Changes' : 'Add Line'}
        </Button>
      </DialogFooter>
    </>
  );
}

function ItemDialog({
  open,
  onClose,
  eventId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  initial: MarathonBudgetItem | null;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Budget Line' : 'Add Budget Line'}</DialogTitle>
        </DialogHeader>
        <ItemForm key={initial?.id ?? 'new'} eventId={eventId} initial={initial} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

export function BudgetBoard({ eventId, canManage = true }: { eventId: string; canManage?: boolean }) {
  const { can } = usePermissions();
  const canApprove = can('events.budget.approve');
  const { data: items, isLoading } = useEventBudgetItems(eventId);
  const { data: approval } = useEventBudgetApproval(eventId);
  const del = useDeleteEventBudgetItem(eventId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MarathonBudgetItem | null>(null);

  const status: EventBudgetStatus = approval?.status ?? 'draft';
  const locked = (status === 'approved' || status === 'locked') && !canApprove;
  const canEdit = canManage && !locked;

  const income = (items ?? []).filter((i) => i.type === 'income');
  const expense = (items ?? []).filter((i) => i.type === 'expense');
  const sectionTotal = (list: MarathonBudgetItem[]) =>
    list.reduce((sum, i) => sum + (i.estimated_amount ?? 0), 0);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (item: MarathonBudgetItem) => {
    setEditing(item);
    setDialogOpen(true);
  };

  const Row = ({ item }: { item: MarathonBudgetItem }) => (
    <div className="flex items-center gap-2 border-b py-2.5 text-sm last:border-0">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.category}</div>
        <div className="truncate text-xs text-muted-foreground">{item.description}</div>
        {item.vendor && (
          <div className="truncate text-[11px] text-muted-foreground">{item.vendor}</div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-medium tabular-nums">{rupee(item.estimated_amount)}</div>
        {(item.actual_amount ?? 0) > 0 && (
          <div className="text-[11px] text-muted-foreground tabular-nums">
            Actual {rupee(item.actual_amount)}
          </div>
        )}
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => openEdit(item)}
            title="Edit line"
            aria-label={`Edit ${item.category}`}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            disabled={del.isPending}
            onClick={() => del.mutate(item.id)}
            title="Delete line"
            aria-label={`Delete ${item.category}`}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <ApprovalBanner eventId={eventId} canApprove={canApprove && canManage} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Budget</h3>
          <p className="text-sm text-muted-foreground">
            {locked ? 'Approved and locked — ask an approver to reopen to edit.' : 'Track income and expenses.'}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" />
            Add Line
          </Button>
        )}
      </div>

      <SummaryCards eventId={eventId} />

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (items ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">No budget lines yet</p>
              <p className="text-xs text-muted-foreground">
                Add income and expense lines to plan and track this event&apos;s money.
              </p>
            </div>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={openAdd}>
                <Plus className="mr-1 h-4 w-4" />
                Add Line
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card>
            <CardContent className="py-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <TrendingUp className="h-4 w-4" /> Income
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                    {income.length}
                  </Badge>
                </span>
                <span className="text-sm font-semibold tabular-nums">{rupee(sectionTotal(income))}</span>
              </div>
              {income.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">No income lines.</p>
              ) : (
                income.map((i) => <Row key={i.id} item={i} />)
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
                  <TrendingDown className="h-4 w-4" /> Expense
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                    {expense.length}
                  </Badge>
                </span>
                <span className="text-sm font-semibold tabular-nums">{rupee(sectionTotal(expense))}</span>
              </div>
              {expense.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">No expense lines.</p>
              ) : (
                expense.map((i) => <Row key={i.id} item={i} />)
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <ItemDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        eventId={eventId}
        initial={editing}
      />
    </div>
  );
}
