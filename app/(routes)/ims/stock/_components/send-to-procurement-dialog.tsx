'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useCreatePurchaseRequest } from '@/hooks/procurement/use-purchase-requests';
import type { ImsStockSummary } from '@/types/ims';
import type { CreatePurchaseRequestItemDto } from '@/types/procurement';

interface SendToProcurementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRows: ImsStockSummary[];
  onRemove: (itemId: string) => void;
  institutionId: string;
  storeId: string | null;
  userId: string;
  onSuccess: (request: { id: string; request_number: string }) => void;
}

/** Top up to the item's max stock level; never less than 1. */
function defaultQuantity(row: ImsStockSummary): number {
  const suggested = (row.item?.max_stock_level ?? 0) - row.current_quantity;
  return suggested > 0 ? suggested : 1;
}

export function SendToProcurementDialog({
  open,
  onOpenChange,
  selectedRows,
  onRemove,
  institutionId,
  storeId,
  userId,
  onSuccess,
}: SendToProcurementDialogProps) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const createPR = useCreatePurchaseRequest();

  const quantityFor = (row: ImsStockSummary) =>
    quantities[row.item_id] ?? String(defaultQuantity(row));

  const handleConfirm = async () => {
    if (!userId || !institutionId) {
      toast.error('No institution selected — pick one or contact an administrator.');
      return;
    }
    if (selectedRows.length === 0) return;

    const items: CreatePurchaseRequestItemDto[] = selectedRows.map((row) => ({
      domain_item_id: row.item_id,
      item_name: row.item?.name ?? '',
      item_spec: null,
      required_quantity: Number(quantityFor(row)) || 1,
      unit_id: null,
      unit_label: row.item?.base_unit?.abbreviation ?? null,
      current_stock: row.current_quantity,
      reorder_level: row.item?.reorder_level ?? null,
      estimated_cost: null,
    }));

    try {
      const created = await createPR.mutateAsync({
        data: {
          institution_id: institutionId,
          store_id: storeId,
          domain: 'ims',
          notes: notes.trim() || null,
          items,
        },
        userId,
      });
      toast.success(`Purchase request ${created.request_number} created`);
      setQuantities({});
      setNotes('');
      onSuccess({ id: created.id, request_number: created.request_number });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create purchase request');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send to Procurement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="max-h-[50vh] overflow-y-auto overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">In stock</TableHead>
                  <TableHead className="text-right">Reorder</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead className="w-[120px] text-right">Qty to request</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                      No items selected.
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedRows.map((row) => (
                    <TableRow key={row.item_id}>
                      <TableCell>
                        <div className="font-medium">{row.item?.name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{row.item?.code ?? '—'}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.current_quantity} {row.item?.base_unit?.abbreviation ?? ''}
                      </TableCell>
                      <TableCell className="text-right">{row.item?.reorder_level ?? '—'}</TableCell>
                      <TableCell className="text-right">{row.item?.max_stock_level ?? '—'}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={quantityFor(row)}
                          onChange={(e) =>
                            setQuantities((prev) => ({ ...prev, [row.item_id]: e.target.value }))
                          }
                          className="text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemove(row.item_id)}
                          aria-label={`Remove ${row.item?.name ?? 'item'}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context for the approver..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedRows.length === 0 || createPR.isPending}
          >
            {createPR.isPending ? 'Creating...' : `Create request (${selectedRows.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
