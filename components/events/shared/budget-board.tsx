'use client';

// components/events/shared/budget-board.tsx
// Shared event budget board (income/expense lines + summary + finance sign-off) for ANY event type.
// Events Platform Promotion PR2. Decision #7: organizer drafts/edits → a finance-approved person
// (events.budget.approve) signs off, which locks the budget (enforced server-side by a DB trigger).

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
  Trash2,
  TrendingUp,
  TrendingDown,
  Scale,
  Lock,
  CheckCircle2,
  Send,
  Unlock,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useEventBudgetItems,
  useEventBudgetSummary,
  useEventBudgetApproval,
  useCreateEventBudgetItem,
  useDeleteEventBudgetItem,
  useSubmitEventBudget,
  useApproveEventBudget,
  useReopenEventBudget,
} from '@/hooks/events/shared/use-event-budget';
import type {
  MarathonBudgetItem,
  BudgetItemType,
  CreateMarathonBudgetItemDto,
} from '@/types/events-marathon';
import type { EventBudgetStatus } from '@/lib/services/events/shared/event-budget-service';

const rupee = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

const STATUS_BADGE: Record<EventBudgetStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'Awaiting sign-off', className: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved & locked', className: 'bg-emerald-100 text-emerald-700' },
  locked: { label: 'Locked', className: 'bg-emerald-100 text-emerald-700' },
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
            <Lock className="h-4 w-4 text-emerald-600" />
          ) : (
            <Scale className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">Finance sign-off</span>
          <Badge className={badge.className}>{badge.label}</Badge>
        </div>
        <div className="flex items-center gap-2">
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="py-4">
              <div className="h-12 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  const cards = [
    { label: 'Income (est.)', value: rupee(s.total_estimated_income), icon: TrendingUp, tone: 'text-emerald-600' },
    { label: 'Expense (est.)', value: rupee(s.total_estimated_expense), icon: TrendingDown, tone: 'text-red-600' },
    {
      label: 'Balance (est.)',
      value: rupee(s.estimated_balance),
      icon: Scale,
      tone: s.estimated_balance >= 0 ? 'text-emerald-600' : 'text-red-600',
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="py-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <c.icon className={`h-3.5 w-3.5 ${c.tone}`} />
              {c.label}
            </div>
            <div className="text-xl font-bold">{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AddItemDialog({
  open,
  onClose,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
}) {
  const create = useCreateEventBudgetItem(eventId);
  const [form, setForm] = useState<Partial<CreateMarathonBudgetItemDto>>({
    event_id: eventId,
    type: 'expense',
    estimated_amount: 0,
  });
  const set = (k: keyof CreateMarathonBudgetItemDto, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.category?.trim() || !form.description?.trim()) return;
    create.mutate(
      {
        event_id: eventId,
        category: form.category,
        description: form.description,
        type: (form.type as BudgetItemType) ?? 'expense',
        estimated_amount: form.estimated_amount ?? 0,
        vendor: form.vendor,
        notes: form.notes,
      },
      {
        onSuccess: () => {
          setForm({ event_id: eventId, type: 'expense', estimated_amount: 0 });
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Budget Line</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={form.type ?? 'expense'} onValueChange={(v) => set('type', v as BudgetItemType)}>
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
                value={form.estimated_amount ?? ''}
                onChange={(e) => set('estimated_amount', Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category *</Label>
            <Input
              placeholder="Venue, Catering, Sponsorship…"
              value={form.category ?? ''}
              onChange={(e) => set('category', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description *</Label>
            <Input
              placeholder="What is this line for?"
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vendor</Label>
            <Input
              placeholder="Optional"
              value={form.vendor ?? ''}
              onChange={(e) => set('vendor', e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={create.isPending || !form.category?.trim() || !form.description?.trim()}
          >
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add Line
          </Button>
        </DialogFooter>
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
  const [addOpen, setAddOpen] = useState(false);

  const status: EventBudgetStatus = approval?.status ?? 'draft';
  const locked = (status === 'approved' || status === 'locked') && !canApprove;
  const canEdit = canManage && !locked;

  const income = (items ?? []).filter((i) => i.type === 'income');
  const expense = (items ?? []).filter((i) => i.type === 'expense');

  const Row = ({ item }: { item: MarathonBudgetItem }) => (
    <div className="flex items-center gap-2 border-b py-2 text-sm last:border-0">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.category}</div>
        <div className="truncate text-xs text-muted-foreground">{item.description}</div>
      </div>
      <div className="text-right">
        <div className="font-medium">{rupee(item.estimated_amount)}</div>
        {item.vendor && <div className="text-[11px] text-muted-foreground">{item.vendor}</div>}
      </div>
      {canEdit && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          disabled={del.isPending}
          onClick={() => del.mutate(item.id)}
          title="Delete line"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <ApprovalBanner eventId={eventId} canApprove={canApprove && canManage} />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Budget</h3>
          <p className="text-sm text-muted-foreground">
            {locked ? 'Approved and locked — ask an approver to reopen to edit.' : 'Track income and expenses.'}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
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
        <p className="py-8 text-center text-sm text-muted-foreground">
          No budget lines yet{canEdit ? ' — add the first one.' : '.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="py-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <TrendingUp className="h-4 w-4" /> Income
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
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-red-700">
                <TrendingDown className="h-4 w-4" /> Expense
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

      <AddItemDialog open={addOpen} onClose={() => setAddOpen(false)} eventId={eventId} />
    </div>
  );
}
