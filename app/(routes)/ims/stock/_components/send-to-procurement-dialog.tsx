'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useCreateImsReorderRequest } from '@/hooks/procurement/use-purchase-requests';
import { errorMessage } from '@/lib/utils/supabase-error';
import type { ImsReorderRequestResult, ImsReorderRow } from '@/types/ims';

interface SendToProcurementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  storeName: string | null;
  selectedRows: ImsReorderRow[];
  onRemove: (itemId: string) => void;
  onSuccess: (request: ImsReorderRequestResult) => void;
}

const defaultQuantity = (row: ImsReorderRow) => String(row.suggested_quantity ?? 1);

/**
 * Confirms a reorder selection and raises ONE purchase request for it.
 * Quantities start at the list's suggestion (top-up to max level) and stay editable.
 */
export function SendToProcurementDialog({
  open,
  onOpenChange,
  storeId,
  storeName,
  selectedRows,
  onRemove,
  onSuccess,
}: SendToProcurementDialogProps) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const createRequest = useCreateImsReorderRequest();

  const quantityFor = (row: ImsReorderRow) => quantities[row.item_id] ?? defaultQuantity(row);
  const invalidRow = selectedRows.find((row) => !(Number(quantityFor(row)) > 0));

  const send = async (submit: boolean) => {
    if (selectedRows.length === 0 || invalidRow) return;
    try {
      const result = await createRequest.mutateAsync({
        storeId,
        items: selectedRows.map((row) => ({
          item_id: row.item_id,
          quantity: Number(quantityFor(row)),
        })),
        notes: notes.trim() || null,
        submit,
      });
      toast.success(
        submit
          ? `${result.request_number} sent for approval with ${result.item_count} items`
          : `${result.request_number} saved as a draft with ${result.item_count} items`
      );
      setQuantities({});
      setNotes('');
      onSuccess(result);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not raise the purchase request'));
    }
  };

  const busy = createRequest.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Send to Procurement</DialogTitle>
          <DialogDescription>
            {selectedRows.length} item{selectedRows.length === 1 ? '' : 's'} from{' '}
            {storeName ?? 'this store'} go into one purchase request. The approver sees each
            item&apos;s current stock and reorder level alongside the quantity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reorder</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead className="w-[130px] text-right">Qty to order</TableHead>
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
                  selectedRows.map((row) => {
                    const qty = quantityFor(row);
                    const bad = !(Number(qty) > 0);
                    return (
                      <TableRow key={row.item_id}>
                        <TableCell>
                          <div className="font-medium">{row.item_name}</div>
                          <div className="text-xs text-muted-foreground">{row.item_code ?? '—'}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.on_hand} {row.unit_abbreviation ?? ''}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.reorder_level}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.max_stock_level > row.reorder_level ? row.max_stock_level : '—'}
                        </TableCell>
                        <TableCell>
                          <Input
                            id={`reorder-qty-${row.item_id}`}
                            type="number"
                            min={1}
                            inputMode="decimal"
                            value={qty}
                            aria-invalid={bad}
                            aria-label={`Quantity for ${row.item_name}`}
                            onChange={(e) =>
                              setQuantities((prev) => ({ ...prev, [row.item_id]: e.target.value }))
                            }
                            className={`text-right ${bad ? 'border-destructive' : ''}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => onRemove(row.item_id)}
                            aria-label={`Remove ${row.item_name}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {invalidRow && (
            <p className="text-sm text-destructive">
              Enter a quantity greater than zero for {invalidRow.item_name}.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="reorder-notes">Note for the approver (optional)</Label>
            <Textarea
              id="reorder-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Needed before the practical exams start"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={busy || selectedRows.length === 0 || !!invalidRow}
            onClick={() => send(false)}
          >
            Save as draft
          </Button>
          <Button
            disabled={busy || selectedRows.length === 0 || !!invalidRow}
            onClick={() => send(true)}
          >
            {busy ? 'Sending…' : `Submit for approval (${selectedRows.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
