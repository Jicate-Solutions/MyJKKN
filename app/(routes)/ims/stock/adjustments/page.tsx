'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  Plus,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  PackageOpen,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsItemsForSelect } from '@/hooks/ims/use-ims-inventory';
import { ImsStockAdjustmentService } from '@/lib/services/ims/stock-adjustment-service';
import type { ImsFinancialTransaction, ImsAdjustmentType } from '@/types/ims';

// Adjustment types categorised as increase or decrease
const INCREASE_TYPES: ImsAdjustmentType[] = [
  'physical_count',
  'transfer',
  'correction',
];

const DECREASE_TYPES: ImsAdjustmentType[] = [
  'damage',
  'expiry',
  'theft',
  'return_to_supplier',
];

const ALL_ADJUSTMENT_TYPES: { value: ImsAdjustmentType; label: string }[] = [
  { value: 'physical_count', label: 'Physical Count' },
  { value: 'correction', label: 'Correction' },
  { value: 'transfer', label: 'Transfer In' },
  { value: 'damage', label: 'Damage' },
  { value: 'expiry', label: 'Expiry' },
  { value: 'theft', label: 'Theft / Loss' },
  { value: 'return_to_supplier', label: 'Return to Supplier' },
];

/**
 * Determine whether an adjustment description indicates a decrease.
 * The service stores the type in the description as: "type_name - ItemName (CODE): reason"
 */
function isDecreaseAdjustment(description: string | undefined): boolean {
  if (!description) return false;
  const typeMatch = description.match(/^([^-]+)\s*-/);
  if (!typeMatch) return false;
  const typeName = typeMatch[1].trim().replace(/\s+/g, '_');
  return ['damage', 'expiry', 'theft', 'return_to_supplier', 'write_off'].includes(
    typeName
  );
}

/**
 * Extract the adjustment type label from the description string.
 */
function extractAdjustmentTypeLabel(description: string | undefined): string {
  if (!description) return 'Unknown';
  const typeMatch = description.match(/^([^-]+)\s*-/);
  if (!typeMatch) return 'Unknown';
  return typeMatch[1].trim().replace(/_/g, ' ');
}

/**
 * Extract the reason from the description string.
 * Format: "type_name - ItemName (CODE): reason"
 */
function extractReason(description: string | undefined): string {
  if (!description) return '';
  const reasonMatch = description.match(/:\s*(.+)$/);
  return reasonMatch ? reasonMatch[1].trim() : '';
}

export default function StockAdjustmentsPage() {
  const { profile } = useAuth();
  const { storeId, institutionId } = useImsStoreContext();
  const userId = profile?.id ?? '';
  const queryClient = useQueryClient();

  // -- State
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [formItemId, setFormItemId] = useState('');
  const [formAdjustmentType, setFormAdjustmentType] = useState<string>('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formReason, setFormReason] = useState('');

  // -- Queries
  const { data: adjustmentResult, isLoading } = useQuery({
    queryKey: ['ims-stock-adjustments', storeId, institutionId],
    queryFn: () =>
      ImsStockAdjustmentService.getAdjustments({
        store_id: storeId || '',
        institution_id: institutionId,
        page: 1,
        limit: 50,
      }),
    enabled: !!(storeId || institutionId),
  });

  const { data: itemsForSelect } = useImsItemsForSelect(storeId || '', institutionId);

  // -- Mutation
  const createMutation = useMutation({
    mutationFn: (data: {
      item_id: string;
      adjustment_type: string;
      quantity: number;
      reason: string;
      institution_id: string;
      store_id?: string;
    }) => ImsStockAdjustmentService.createAdjustment(data, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-stock-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
      toast.success('Stock adjustment created successfully');
      resetForm();
      setDialogOpen(false);
    },
    onError: () => {
      toast.error('Failed to create stock adjustment');
    },
  });

  // -- Helpers
  const resetForm = () => {
    setFormItemId('');
    setFormAdjustmentType('');
    setFormQuantity('');
    setFormReason('');
  };

  const handleSubmit = () => {
    if (!formItemId) {
      toast.error('Please select an item');
      return;
    }
    if (!formAdjustmentType) {
      toast.error('Please select an adjustment type');
      return;
    }
    const qty = Number(formQuantity);
    if (!qty || qty <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    if (!formReason.trim()) {
      toast.error('Please provide a reason for this adjustment');
      return;
    }

    createMutation.mutate({
      item_id: formItemId,
      adjustment_type: formAdjustmentType,
      quantity: qty,
      reason: formReason.trim(),
      store_id: storeId || '',
      institution_id: institutionId || null,
    });
  };

  // -- Data processing
  const adjustments: ImsFinancialTransaction[] = adjustmentResult?.data ?? [];

  // Client-side filtering
  const filteredAdjustments = adjustments.filter((adj) => {
    // Search filter: match item name or description
    if (search) {
      const q = search.toLowerCase();
      const itemName = adj.item?.name?.toLowerCase() ?? '';
      const desc = adj.description?.toLowerCase() ?? '';
      if (!itemName.includes(q) && !desc.includes(q)) return false;
    }

    // Type filter: increase or decrease
    if (typeFilter === 'increase') {
      return !isDecreaseAdjustment(adj.description);
    }
    if (typeFilter === 'decrease') {
      return isDecreaseAdjustment(adj.description);
    }

    return true;
  });

  // Items list for the select dropdown
  const items: { id: string; name: string }[] = Array.isArray(itemsForSelect)
    ? itemsForSelect
    : [];

  return (
    <ContentLayout title="Stock Adjustments">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
          <div>
            <h1 className="text-2xl font-bold">Stock Adjustments</h1>
            <p className="text-sm text-muted-foreground">
              Manage stock level corrections and adjustments
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Adjustment
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>New Stock Adjustment</DialogTitle>
                <DialogDescription>
                  Adjust stock levels for an inventory item. All adjustments are
                  recorded for audit purposes.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {/* Item Selection */}
                <div className="grid gap-2">
                  <Label htmlFor="adj-item">Item</Label>
                  <Select value={formItemId} onValueChange={setFormItemId}>
                    <SelectTrigger id="adj-item">
                      <SelectValue placeholder="Select an item" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Adjustment Type */}
                <div className="grid gap-2">
                  <Label htmlFor="adj-type">Adjustment Type</Label>
                  <Select
                    value={formAdjustmentType}
                    onValueChange={setFormAdjustmentType}
                  >
                    <SelectTrigger id="adj-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__increase_header" disabled>
                        -- Increase --
                      </SelectItem>
                      {ALL_ADJUSTMENT_TYPES.filter((t) =>
                        INCREASE_TYPES.includes(t.value)
                      ).map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <span className="flex items-center gap-2">
                            <ArrowUpCircle className="h-3 w-3 text-green-600" />
                            {t.label}
                          </span>
                        </SelectItem>
                      ))}
                      <SelectItem value="__decrease_header" disabled>
                        -- Decrease --
                      </SelectItem>
                      {ALL_ADJUSTMENT_TYPES.filter((t) =>
                        DECREASE_TYPES.includes(t.value)
                      ).map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <span className="flex items-center gap-2">
                            <ArrowDownCircle className="h-3 w-3 text-red-600" />
                            {t.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quantity */}
                <div className="grid gap-2">
                  <Label htmlFor="adj-qty">Quantity</Label>
                  <Input
                    id="adj-qty"
                    type="number"
                    min="1"
                    placeholder="Enter quantity"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value)}
                  />
                </div>

                {/* Reason */}
                <div className="grid gap-2">
                  <Label htmlFor="adj-reason">Reason</Label>
                  <Textarea
                    id="adj-reason"
                    placeholder="Provide a reason for this adjustment..."
                    rows={3}
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setDialogOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <BeatLoader color="#fff" size={8} />
                  ) : (
                    'Create Adjustment'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by item name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="increase">Increase Only</SelectItem>
                  <SelectItem value="decrease">Decrease Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="#6366f1" size={12} />
              </div>
            ) : filteredAdjustments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <PackageOpen className="h-10 w-10 mb-2" />
                <p>No stock adjustments found.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Adjustment Type</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Adjusted By</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdjustments.map((adj) => {
                    const isDecrease = isDecreaseAdjustment(adj.description);
                    const typeLabel = extractAdjustmentTypeLabel(adj.description);
                    const reason = extractReason(adj.description);
                    const displayQty = adj.quantity ?? 0;

                    return (
                      <TableRow key={adj.id}>
                        <TableCell className="whitespace-nowrap">
                          {adj.created_at
                            ? format(new Date(adj.created_at), 'dd MMM yyyy')
                            : '-'}
                        </TableCell>
                        <TableCell className="font-medium">
                          {adj.item?.name ?? '-'}
                          {adj.item?.code && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({adj.item.code})
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isDecrease ? 'destructive' : 'default'}
                            className={
                              isDecrease
                                ? ''
                                : 'bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400'
                            }
                          >
                            {isDecrease ? (
                              <ArrowDownCircle className="mr-1 h-3 w-3" />
                            ) : (
                              <ArrowUpCircle className="mr-1 h-3 w-3" />
                            )}
                            {typeLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <span
                            className={
                              isDecrease ? 'text-red-600' : 'text-green-600'
                            }
                          >
                            {isDecrease ? '-' : '+'}
                            {displayQty}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {reason || '-'}
                        </TableCell>
                        <TableCell>
                          {adj.created_by_profile?.full_name ?? '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">Completed</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
