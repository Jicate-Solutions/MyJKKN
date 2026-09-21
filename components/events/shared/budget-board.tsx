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
  DialogDescription,
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
  ChevronDown,
  ChevronRight,
  ListPlus,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useEventBudgetItems,
  useEventBudgetCategories,
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
  BudgetLineNode,
  BudgetItemType,
} from '@/types/events-marathon';
import { buildBudgetTree } from '@/lib/services/events/shared/event-budget-service';
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

/** Sentinel for the "type my own" option — the catalogue has no such row. */
const FREE_TEXT = '__free__';

function ItemForm({
  eventId,
  initial,
  parent,
  childCount,
  onClose,
}: {
  eventId: string;
  initial: MarathonBudgetItem | null;
  /** Set when adding a sub-line: the line being itemised. */
  parent: MarathonBudgetItem | null;
  /** How many sub-lines `initial` already has. Non-zero makes its amounts derived. */
  childCount: number;
  onClose: () => void;
}) {
  const create = useCreateEventBudgetItem(eventId);
  const update = useUpdateEventBudgetItem(eventId);
  const { data: categories } = useEventBudgetCategories();
  const isEdit = !!initial;
  // A line with sub-lines has its amounts computed by the database from those
  // sub-lines. Offering a box here would let someone type a figure that is
  // silently overwritten by the next child edit.
  const derived = childCount > 0;

  const [form, setForm] = useState({
    type: (initial?.type ?? parent?.type ?? 'expense') as BudgetItemType,
    categoryId: initial?.category_id ?? '',
    category: initial?.category ?? '',
    description: initial?.description ?? '',
    estimated: initial?.estimated_amount ?? 0,
    actual: initial?.actual_amount ?? 0,
    quantity: initial?.quantity ?? ('' as number | ''),
    unitRate: initial?.unit_rate ?? ('' as number | ''),
    vendor: initial?.vendor ?? '',
    notes: initial?.notes ?? '',
  });
  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const options = (categories ?? []).filter((c) => c.kind === form.type);
  // A line saved before the catalogue existed keeps its own words rather than
  // being silently re-labelled by whichever option happens to sort first.
  const legacy =
    !form.categoryId && form.category.trim() && !options.some((o) => o.name === form.category);
  const categoryChoice = form.categoryId || (legacy ? FREE_TEXT : '');

  const qty = form.quantity === '' ? null : Number(form.quantity);
  const rate = form.unitRate === '' ? null : Number(form.unitRate);
  const computed = qty !== null && rate !== null ? qty * rate : null;
  const estimatedShown = derived ? form.estimated : (computed ?? form.estimated);

  const isPending = create.isPending || update.isPending;
  const valid = !!form.category.trim() && !!form.description.trim();

  const pickCategory = (v: string) => {
    if (v === FREE_TEXT) {
      setForm((f) => ({ ...f, categoryId: '', category: legacy ? f.category : '' }));
      return;
    }
    const hit = options.find((o) => o.id === v);
    setForm((f) => ({ ...f, categoryId: v, category: hit?.name ?? f.category }));
  };

  const submit = () => {
    if (!valid) return;
    // quantity and unit_rate only mean anything together; half of a pair would
    // leave the database computing nothing and the screen implying otherwise.
    const pair = qty !== null && rate !== null;
    if (isEdit && initial) {
      update.mutate(
        {
          id: initial.id,
          dto: {
            type: form.type,
            category: form.category.trim(),
            category_id: form.categoryId || null,
            description: form.description.trim(),
            // Omitted when derived: the database owns those two numbers.
            ...(derived ? {} : { estimated_amount: form.estimated, actual_amount: form.actual }),
            quantity: pair ? qty : null,
            unit_rate: pair ? rate : null,
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
          category_id: form.categoryId || null,
          description: form.description.trim(),
          estimated_amount: form.estimated,
          quantity: pair ? qty : null,
          unit_rate: pair ? rate : null,
          parent_id: parent?.id ?? null,
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
        {parent && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            An item inside <span className="font-medium text-foreground">{parent.description}</span>.
            That line&apos;s total becomes the sum of its items.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select
              value={form.type}
              // A sub-line must match its parent, so there is nothing to choose.
              disabled={!!parent}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v as BudgetItemType, categoryId: '' }))}
            >
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
              disabled={derived || computed !== null}
              value={estimatedShown || ''}
              onChange={(e) => set('estimated', Number(e.target.value))}
            />
            {derived ? (
              <p className="text-[11px] text-muted-foreground">
                Added up from {childCount} item{childCount === 1 ? '' : 's'} below this line.
              </p>
            ) : computed !== null ? (
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {qty} × {rupee(rate ?? 0)} = {rupee(computed)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">How many</Label>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="e.g. 12 referees"
              disabled={derived}
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rate each (₹)</Label>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="e.g. 1500"
              disabled={derived}
              value={form.unitRate}
              onChange={(e) => set('unitRate', e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Fill both and the estimate is worked out for you — and it is there to re-use next year.
        </p>
        {isEdit && !derived && (
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
          <Select value={categoryChoice} onValueChange={pickCategory}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Pick a category…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
              <SelectItem value={FREE_TEXT}>Something else…</SelectItem>
            </SelectContent>
          </Select>
          {categoryChoice === FREE_TEXT && (
            <Input
              className="mt-1"
              placeholder="Name it"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            />
          )}
          {legacy && (
            <p className="text-[11px] text-muted-foreground">
              Saved before the list existed. Pick a category above to make it count across events.
            </p>
          )}
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
  parent,
  childCount,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  initial: MarathonBudgetItem | null;
  parent: MarathonBudgetItem | null;
  childCount: number;
}) {
  const title = initial ? 'Edit Budget Line' : parent ? 'Add an item' : 'Add Budget Line';
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {initial ? 'Update this budget line item.' : 'Add a new budget line item to this event.'}
          </DialogDescription>
        </DialogHeader>
        <ItemForm
          // Keyed so the form mounts with fresh state per line, and so switching
          // from "edit line" to "add an item inside it" does not reuse the old state.
          key={initial?.id ?? (parent ? `child-of-${parent.id}` : 'new')}
          eventId={eventId}
          initial={initial}
          parent={parent}
          childCount={childCount}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

/** What a row needs to draw itself and act. Passed in, so these components are
 *  defined once rather than rebuilt on every render of the board. */
interface RowActions {
  canEdit: boolean;
  deleting: boolean;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  onEdit: (item: MarathonBudgetItem) => void;
  onAddChild: (item: MarathonBudgetItem) => void;
  onDelete: (id: string) => void;
}

function BudgetRow({
  item,
  childCount = 0,
  isChild = false,
  a,
}: {
  item: MarathonBudgetItem;
  childCount?: number;
  isChild?: boolean;
  a: RowActions;
}) {
  const open = childCount > 0 && a.isOpen(item.id);
  return (
    <div
      className={`flex items-center gap-2 border-b py-2.5 text-sm last:border-0 ${
        isChild ? 'pl-4' : ''
      }`}
    >
      {childCount > 0 ? (
        <button
          className="-ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => a.onToggle(item.id)}
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} the ${childCount} items inside ${item.description}`}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      ) : (
        // Keeps every row's text on the same left edge, parent or not.
        <span className={isChild ? '' : 'w-4 shrink-0'} aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.category}</div>
        <div className="truncate text-xs text-muted-foreground">{item.description}</div>
        {item.quantity != null && item.unit_rate != null && (
          <div className="truncate text-[11px] text-muted-foreground tabular-nums">
            {item.quantity} × {rupee(item.unit_rate)}
          </div>
        )}
        {childCount > 0 && (
          <div className="truncate text-[11px] text-muted-foreground">
            {childCount} item{childCount === 1 ? '' : 's'} — total added up from them
          </div>
        )}
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
      {a.canEdit && (
        <div className="flex shrink-0 items-center">
          {/* One level only, so a sub-line offers no "add an item". */}
          {!isChild && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => a.onAddChild(item)}
              title="Break this down into items"
              aria-label={`Add an item inside ${item.description}`}
            >
              <ListPlus className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => a.onEdit(item)}
            title="Edit line"
            aria-label={`Edit ${item.category}`}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            disabled={a.deleting}
            onClick={() => a.onDelete(item.id)}
            title={childCount > 0 ? 'Delete this line and its items' : 'Delete line'}
            aria-label={`Delete ${item.category}`}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      )}
    </div>
  );
}

function BudgetSection({ nodes, a }: { nodes: BudgetLineNode[]; a: RowActions }) {
  return (
    <>
      {nodes.map((n) => (
        <div key={n.line.id}>
          <BudgetRow item={n.line} childCount={n.children.length} a={a} />
          {a.isOpen(n.line.id) &&
            n.children.map((c) => <BudgetRow key={c.id} item={c} isChild a={a} />)}
        </div>
      ))}
    </>
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
  const [parentFor, setParentFor] = useState<MarathonBudgetItem | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const status: EventBudgetStatus = approval?.status ?? 'draft';
  const locked = (status === 'approved' || status === 'locked') && !canApprove;
  const canEdit = canManage && !locked;

  const incomeTree = buildBudgetTree((items ?? []).filter((i) => i.type === 'income'));
  const expenseTree = buildBudgetTree((items ?? []).filter((i) => i.type === 'expense'));
  // Top-level lines only. A line that has been itemised already equals the sum
  // of its items, so adding the items too would count that money twice.
  const sectionTotal = (nodes: BudgetLineNode[]) =>
    nodes.reduce((sum, n) => sum + (n.line.estimated_amount ?? 0), 0);
  const lineCount = (nodes: BudgetLineNode[]) =>
    nodes.reduce((n, node) => n + 1 + node.children.length, 0);

  const openAdd = () => {
    setEditing(null);
    setParentFor(null);
    setDialogOpen(true);
  };
  const openEdit = (item: MarathonBudgetItem) => {
    setEditing(item);
    setParentFor(null);
    setDialogOpen(true);
  };
  const openAddChild = (item: MarathonBudgetItem) => {
    setEditing(null);
    setParentFor(item);
    setDialogOpen(true);
  };
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rowActions: RowActions = {
    canEdit,
    deleting: del.isPending,
    isOpen: (id) => !collapsed.has(id),
    onToggle: toggle,
    onEdit: openEdit,
    onAddChild: openAddChild,
    onDelete: (id) => del.mutate(id),
  };


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
                    {lineCount(incomeTree)}
                  </Badge>
                </span>
                <span className="text-sm font-semibold tabular-nums">{rupee(sectionTotal(incomeTree))}</span>
              </div>
              {incomeTree.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">No income lines.</p>
              ) : (
                <BudgetSection nodes={incomeTree} a={rowActions} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
                  <TrendingDown className="h-4 w-4" /> Expense
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                    {lineCount(expenseTree)}
                  </Badge>
                </span>
                <span className="text-sm font-semibold tabular-nums">{rupee(sectionTotal(expenseTree))}</span>
              </div>
              {expenseTree.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">No expense lines.</p>
              ) : (
                <BudgetSection nodes={expenseTree} a={rowActions} />
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
          setParentFor(null);
        }}
        eventId={eventId}
        initial={editing}
        parent={parentFor}
        childCount={editing ? (items ?? []).filter((i) => i.parent_id === editing.id).length : 0}
      />
    </div>
  );
}
