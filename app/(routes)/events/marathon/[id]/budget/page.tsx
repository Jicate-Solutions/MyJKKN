'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useMarathonBudget,
  useBudgetSummary,
  useCreateBudgetItem,
  useUpdateBudgetItem,
  useDeleteBudgetItem,
} from '@/hooks/events/marathon/use-marathon-budget';
import { useMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import { useMarathonAccess } from '@/hooks/events/marathon/use-marathon-access';
import { MarathonAccessDenied } from '../_components/marathon-access-denied';
import {
  Loader2,
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
  MoreHorizontal,
  Pencil,
  Trash2,
  IndianRupee,
} from 'lucide-react';
import type {
  MarathonBudgetItem,
  BudgetItemType,
  BudgetItemStatus,
  CreateMarathonBudgetItemDto,
} from '@/types/events-marathon';

// ============================================================================
// Constants
// ============================================================================

const CATEGORIES = [
  'venue',
  'logistics',
  'marketing',
  'prizes',
  'food',
  'medical',
  'sponsorship_income',
  'registration_income',
  'misc',
] as const;

type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  venue: 'Venue',
  logistics: 'Logistics',
  marketing: 'Marketing',
  prizes: 'Prizes',
  food: 'Food & Beverages',
  medical: 'Medical',
  sponsorship_income: 'Sponsorship Income',
  registration_income: 'Registration Income',
  misc: 'Miscellaneous',
};

const STATUS_CONFIG: Record<BudgetItemStatus, { label: string; className: string }> = {
  planned: {
    label: 'Planned',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
  approved: {
    label: 'Approved',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  },
  spent: {
    label: 'Spent',
    className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400',
  },
};

const STATUS_OPTIONS: BudgetItemStatus[] = ['planned', 'approved', 'spent', 'cancelled'];

// ============================================================================
// Helpers
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as Category] ?? category;
}

// ============================================================================
// Summary Cards
// ============================================================================

function SummaryCards({ eventId }: { eventId: string }) {
  const { data: summary, isLoading } = useBudgetSummary(eventId);

  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <div className="h-16 animate-pulse bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const estimatedBalancePositive = summary.estimated_balance >= 0;
  const actualBalancePositive = summary.actual_balance >= 0;

  const cards = [
    {
      label: 'Estimated Income',
      estimated: summary.total_estimated_income,
      actual: summary.total_actual_income,
      icon: TrendingUp,
      iconClass: 'text-green-500',
      isBalance: false,
    },
    {
      label: 'Estimated Expense',
      estimated: summary.total_estimated_expense,
      actual: summary.total_actual_expense,
      icon: TrendingDown,
      iconClass: 'text-red-500',
      isBalance: false,
    },
    {
      label: 'Balance',
      estimated: summary.estimated_balance,
      actual: summary.actual_balance,
      icon: Wallet,
      iconClass: estimatedBalancePositive ? 'text-green-500' : 'text-red-500',
      isBalance: true,
      estimatedPositive: estimatedBalancePositive,
      actualPositive: actualBalancePositive,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <c.icon className={`h-3.5 w-3.5 ${c.iconClass}`} />
              {c.label}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                  Estimated
                </p>
                <p
                  className={`text-lg font-bold ${
                    c.isBalance
                      ? c.estimatedPositive
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                      : ''
                  }`}
                >
                  {formatCurrency(c.estimated)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                  Actual
                </p>
                <p
                  className={`text-lg font-bold ${
                    c.isBalance
                      ? c.actualPositive
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                      : ''
                  }`}
                >
                  {formatCurrency(c.actual)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Budget Table Row
// ============================================================================

function BudgetRow({
  item,
  onEdit,
}: {
  item: MarathonBudgetItem;
  onEdit: (item: MarathonBudgetItem) => void;
}) {
  const updateItem = useUpdateBudgetItem();
  const deleteItem = useDeleteBudgetItem();

  const status = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.planned;

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 text-sm">
      {/* Category */}
      <td className="py-2.5 px-3">
        <Badge variant="secondary" className="text-xs font-normal">
          {getCategoryLabel(item.category)}
        </Badge>
      </td>

      {/* Description */}
      <td className="py-2.5 px-3">
        <p className="font-medium leading-tight">{item.description}</p>
        {item.vendor && (
          <p className="text-xs text-muted-foreground mt-0.5">{item.vendor}</p>
        )}
      </td>

      {/* Type */}
      <td className="py-2.5 px-3 whitespace-nowrap">
        {item.type === 'income' ? (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium text-xs">
            <TrendingUp className="h-3.5 w-3.5" />
            Income
          </span>
        ) : (
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium text-xs">
            <TrendingDown className="h-3.5 w-3.5" />
            Expense
          </span>
        )}
      </td>

      {/* Estimated */}
      <td className="py-2.5 px-3 whitespace-nowrap text-right font-medium">
        {formatCurrency(item.estimated_amount)}
      </td>

      {/* Actual */}
      <td className="py-2.5 px-3 whitespace-nowrap text-right">
        <span
          className={
            item.actual_amount > item.estimated_amount
              ? 'text-red-600 dark:text-red-400 font-medium'
              : item.actual_amount > 0
              ? 'text-green-600 dark:text-green-400 font-medium'
              : 'text-muted-foreground'
          }
        >
          {formatCurrency(item.actual_amount)}
        </span>
      </td>

      {/* Status */}
      <td className="py-2.5 px-3">
        <Select
          value={item.status}
          onValueChange={(v) =>
            updateItem.mutate({
              id: item.id,
              eventId: item.event_id,
              dto: { status: v as BudgetItemStatus },
            })
          }
        >
          <SelectTrigger className="h-6 text-[11px] w-[100px] border-none bg-transparent p-0 focus:ring-0">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${status.className}`}>
              {status.label}
            </span>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Actions */}
      <td className="py-2.5 px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(item)}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => deleteItem.mutate({ id: item.id, eventId: item.event_id })}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// ============================================================================
// Add / Edit Budget Item Dialog
// ============================================================================

function BudgetItemDialog({
  open,
  onClose,
  eventId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  initial?: MarathonBudgetItem | null;
}) {
  const createItem = useCreateBudgetItem();
  const updateItem = useUpdateBudgetItem();

  const isEdit = !!initial;

  const [form, setForm] = useState<Partial<CreateMarathonBudgetItemDto>>({
    event_id: eventId,
    category: initial?.category ?? 'misc',
    description: initial?.description ?? '',
    type: initial?.type ?? 'expense',
    estimated_amount: initial?.estimated_amount ?? 0,
    vendor: initial?.vendor ?? '',
    notes: initial?.notes ?? '',
  });

  const [actualAmount, setActualAmount] = useState<number>(
    initial?.actual_amount ?? 0
  );

  const set = (key: keyof CreateMarathonBudgetItemDto, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    if (!form.description?.trim() || !form.category) return;

    const payload: CreateMarathonBudgetItemDto = {
      event_id: eventId,
      category: form.category!,
      description: form.description!,
      type: form.type as BudgetItemType,
      estimated_amount: Number(form.estimated_amount) || 0,
      vendor: form.vendor || undefined,
      notes: form.notes || undefined,
    };

    if (isEdit) {
      updateItem.mutate(
        {
          id: initial.id,
          eventId,
          dto: { ...payload, actual_amount: actualAmount },
        },
        { onSuccess: onClose }
      );
    } else {
      createItem.mutate(payload, { onSuccess: onClose });
    }
  };

  const isPending = createItem.isPending || updateItem.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Budget Item' : 'Add Budget Item'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Category + Type row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Category *</Label>
              <Select
                value={form.category ?? 'misc'}
                onValueChange={(v) => set('category', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="text-sm">
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Type *</Label>
              <Select
                value={form.type ?? 'expense'}
                onValueChange={(v) => set('type', v as BudgetItemType)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income" className="text-sm">Income</SelectItem>
                  <SelectItem value="expense" className="text-sm">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label className="text-xs">Description *</Label>
            <Input
              placeholder="e.g. Venue booking deposit"
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          {/* Amounts row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Estimated Amount (₹) *</Label>
              <div className="relative">
                <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  className="pl-7"
                  value={form.estimated_amount ?? ''}
                  onChange={(e) => set('estimated_amount', Number(e.target.value))}
                />
              </div>
            </div>

            {isEdit && (
              <div className="space-y-1">
                <Label className="text-xs">Actual Amount (₹)</Label>
                <div className="relative">
                  <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="pl-7"
                    value={actualAmount}
                    onChange={(e) => setActualAmount(Number(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Vendor */}
          <div className="space-y-1">
            <Label className="text-xs">Vendor / Source</Label>
            <Input
              placeholder="e.g. ABC Events Pvt Ltd"
              value={form.vendor ?? ''}
              onChange={(e) => set('vendor', e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea
              placeholder="Additional details..."
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !form.description?.trim() || !form.category}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? 'Save Changes' : 'Add Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function MarathonBudgetPage() {
  const params = useParams();
  const eventId = params.id as string;
  const access = useMarathonAccess();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MarathonBudgetItem | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const { data: event, isLoading: eventLoading } = useMarathonEvent(eventId);
  const { data: items, isLoading, error } = useMarathonBudget(eventId);

  // Block non-admin users
  if (!access.isLoading && !access.canManage) {
    return <MarathonAccessDenied title="Budget" eventId={eventId} />;
  }

  const handleEdit = (item: MarathonBudgetItem) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingItem(null);
  };

  // Filter items by category or type
  const filteredItems = (items ?? []).filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'income') return item.type === 'income';
    if (activeFilter === 'expense') return item.type === 'expense';
    return item.category === activeFilter;
  });

  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'income', label: 'Income' },
    { key: 'expense', label: 'Expense' },
    ...CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c] })),
  ];

  if (eventLoading) {
    return (
      <ContentLayout title="Budget">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${event?.name ?? 'Event'} - Budget`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: event?.name ?? '...', href: `/events/marathon/${eventId}/dashboard` },
          { label: 'Budget' },
        ]}
      />

      <div className="space-y-4 mt-4">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Budget Tracker</h1>
            <p className="text-sm text-muted-foreground">
              Track income and expenses for {event?.name ?? 'this event'}.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingItem(null);
              setDialogOpen(true);
            }}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>

        {/* Summary cards */}
        <SummaryCards eventId={eventId} />

        {/* Category / type filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                activeFilter === tab.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading / error */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-destructive">
            Failed to load budget items. Please try again.
          </div>
        )}

        {/* Budget table */}
        {!isLoading && !error && (
          <>
            {filteredItems.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground border rounded-lg">
                <IndianRupee className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No budget items</p>
                <p className="text-sm mt-1">
                  {activeFilter === 'all'
                    ? 'Add your first income or expense item to get started.'
                    : 'No items match the selected filter.'}
                </p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/50 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        <th className="text-left py-2 px-3">Category</th>
                        <th className="text-left py-2 px-3">Description</th>
                        <th className="text-left py-2 px-3">Type</th>
                        <th className="text-right py-2 px-3">Estimated</th>
                        <th className="text-right py-2 px-3">Actual</th>
                        <th className="text-left py-2 px-3">Status</th>
                        <th className="py-2 px-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item) => (
                        <BudgetRow key={item.id} item={item} onEdit={handleEdit} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Table footer with visible count */}
                <div className="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
                  {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
                  {activeFilter !== 'all' && ` in "${filterTabs.find((t) => t.key === activeFilter)?.label}"`}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add / Edit dialog */}
      {dialogOpen && (
        <BudgetItemDialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          eventId={eventId}
          initial={editingItem}
        />
      )}
    </ContentLayout>
  );
}
