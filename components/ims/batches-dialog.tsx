'use client';

import { useState } from 'react';
import { format, isPast, addDays } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { Pencil, Trash2, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  useImsBatchesForItem,
  useUpdateImsBatch,
  useDeleteImsBatch,
} from '@/hooks/ims/use-ims-stock';
import type { ImsStockBatch, UpdateBatchDto } from '@/types/ims';

// ── Helpers ───────────────────────────────────────────────

function formatInr(n: number) {
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  });
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return format(new Date(d), 'dd MMM yyyy');
  } catch {
    return d;
  }
}

function isExpired(expiry: string | null): boolean {
  if (!expiry) return false;
  return isPast(new Date(expiry));
}

function isNearExpiry(expiry: string | null): boolean {
  if (!expiry) return false;
  return !isPast(new Date(expiry)) && new Date(expiry) <= addDays(new Date(), 30);
}

function ExpiryBadge({ expiry }: { expiry: string | null }) {
  if (!expiry) return <span className="text-muted-foreground text-xs">No expiry</span>;
  if (isExpired(expiry))
    return <Badge variant="destructive" className="text-xs">{formatDate(expiry)} — Expired</Badge>;
  if (isNearExpiry(expiry))
    return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">{formatDate(expiry)} — Expiring soon</Badge>;
  return <span className="text-xs">{formatDate(expiry)}</span>;
}

function BatchStatusBadge({ batch }: { batch: ImsStockBatch }) {
  if (batch.quantity_available <= 0 && isExpired(batch.expiry_date))
    return <Badge variant="destructive" className="text-xs">Expired & Depleted</Badge>;
  if (isExpired(batch.expiry_date))
    return <Badge variant="destructive" className="text-xs">Expired</Badge>;
  if (batch.quantity_available <= 0)
    return <Badge variant="outline" className="text-xs">Depleted</Badge>;
  if (isNearExpiry(batch.expiry_date))
    return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">Near Expiry</Badge>;
  return <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">Active</Badge>;
}

// ── Inline Edit Row ───────────────────────────────────────

interface EditFormState {
  cost_price: string;
  gst_rate: string;
  expiry_date: string;
  notes: string;
}

function BatchRow({
  batch,
  onDelete,
}: {
  batch: ImsStockBatch;
  onDelete: (b: ImsStockBatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditFormState>({
    cost_price:  String(batch.cost_price),
    gst_rate:    String(batch.gst_rate),
    expiry_date: batch.expiry_date ?? '',
    notes:       batch.notes ?? '',
  });
  const updateBatch = useUpdateImsBatch();

  const handleSave = async () => {
    try {
      const dto: UpdateBatchDto = {
        cost_price:  parseFloat(form.cost_price) || 0,
        gst_rate:    parseFloat(form.gst_rate) || 0,
        expiry_date: form.expiry_date || undefined,
        notes:       form.notes || undefined,
      };
      await updateBatch.mutateAsync({ id: batch.id, data: dto });
      toast.success('Batch updated');
      setEditing(false);
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Failed to update batch');
    }
  };

  if (editing) {
    return (
      <TableRow>
        <TableCell className="font-mono text-xs">{batch.batch_number ?? '—'}</TableCell>
        <TableCell>{formatDate(batch.entry_date)}</TableCell>
        <TableCell>
          <Input
            type="date"
            value={form.expiry_date}
            onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
            className="h-7 text-xs"
          />
        </TableCell>
        <TableCell>{batch.quantity}</TableCell>
        <TableCell>{batch.quantity_available}</TableCell>
        <TableCell>
          <Input
            type="number"
            value={form.cost_price}
            onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))}
            className="h-7 text-xs w-24"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            value={form.gst_rate}
            onChange={(e) => setForm((f) => ({ ...f, gst_rate: e.target.value }))}
            className="h-7 text-xs w-16"
          />
        </TableCell>
        <TableCell>{formatInr(batch.total_value)}</TableCell>
        <TableCell>{batch.supplier?.name ?? '—'}</TableCell>
        <TableCell><BatchStatusBadge batch={batch} /></TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSave}
              disabled={updateBatch.isPending}
            >
              {updateBatch.isPending ? <BeatLoader size={6} /> : <Check className="h-4 w-4 text-green-600" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{batch.batch_number ?? '—'}</TableCell>
      <TableCell className="text-xs">{formatDate(batch.entry_date)}</TableCell>
      <TableCell className="text-xs"><ExpiryBadge expiry={batch.expiry_date} /></TableCell>
      <TableCell className="text-xs">{batch.quantity}</TableCell>
      <TableCell className="text-xs font-medium">{batch.quantity_available}</TableCell>
      <TableCell className="text-xs">{formatInr(batch.cost_price)}</TableCell>
      <TableCell className="text-xs">{batch.gst_rate}%</TableCell>
      <TableCell className="text-xs">{formatInr(batch.total_value)}</TableCell>
      <TableCell className="text-xs">{batch.supplier?.name ?? '—'}</TableCell>
      <TableCell><BatchStatusBadge batch={batch} /></TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(batch)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ── Batch Table ───────────────────────────────────────────

const COLUMNS = (
  <TableRow>
    <TableHead className="text-xs">Batch #</TableHead>
    <TableHead className="text-xs">Entry Date</TableHead>
    <TableHead className="text-xs">Expiry</TableHead>
    <TableHead className="text-xs">Qty (Initial)</TableHead>
    <TableHead className="text-xs">Qty Available</TableHead>
    <TableHead className="text-xs">Cost Price</TableHead>
    <TableHead className="text-xs">GST</TableHead>
    <TableHead className="text-xs">Total Value</TableHead>
    <TableHead className="text-xs">Supplier</TableHead>
    <TableHead className="text-xs">Status</TableHead>
    <TableHead className="w-20" />
  </TableRow>
);

function BatchTable({
  batches,
  onDelete,
}: {
  batches: ImsStockBatch[];
  onDelete: (b: ImsStockBatch) => void;
}) {
  if (batches.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
        No batches found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>{COLUMNS}</TableHeader>
        <TableBody>
          {batches.map((b) => (
            <BatchRow key={b.id} batch={b} onDelete={onDelete} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Summary Cards ─────────────────────────────────────────

function SummaryCards({ batches }: { batches: ImsStockBatch[] }) {
  const totalStock    = batches.reduce((s, b) => s + b.quantity_available, 0);
  const activeBatches = batches.filter((b) => b.quantity_available > 0).length;
  const latestCost    = batches.length > 0
    ? batches.reduce((latest, b) =>
        new Date(b.entry_date) > new Date(latest.entry_date) ? b : latest
      ).cost_price
    : null;
  const nearestExpiry = batches
    .filter((b) => b.expiry_date && !isExpired(b.expiry_date))
    .sort((a, b) => (a.expiry_date! < b.expiry_date! ? -1 : 1))[0]?.expiry_date ?? null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Total Stock</p>
          <p className="text-xl font-bold">{totalStock}</p>
          <p className="text-xs text-muted-foreground">units available</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Active Batches</p>
          <p className="text-xl font-bold">{activeBatches}</p>
          <p className="text-xs text-muted-foreground">of {batches.length} total</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Latest Cost</p>
          <p className="text-xl font-bold">
            {latestCost != null ? formatInr(latestCost) : '—'}
          </p>
          <p className="text-xs text-muted-foreground">per unit ex-GST</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Nearest Expiry</p>
          <p className="text-base font-bold leading-tight">
            {nearestExpiry ? formatDate(nearestExpiry) : '—'}
          </p>
          {nearestExpiry && isNearExpiry(nearestExpiry) && (
            <Badge className="mt-1 text-xs bg-amber-100 text-amber-800 border-amber-300">
              &lt; 30 days
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Dialog ───────────────────────────────────────────

interface BatchesDialogProps {
  open: boolean;
  onClose: () => void;
  itemId: string;
  itemName: string;
  storeId: string;
}

export function BatchesDialog({
  open,
  onClose,
  itemId,
  itemName,
  storeId,
}: BatchesDialogProps) {
  const { data: batches, isLoading } = useImsBatchesForItem(itemId, storeId);
  const deleteBatch = useDeleteImsBatch();

  // Delete confirmation — kept in parent state to avoid Radix nested Dialog race
  const [batchToDelete, setBatchToDelete] = useState<ImsStockBatch | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleDeleteRequest = (b: ImsStockBatch) => {
    setBatchToDelete(b);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!batchToDelete) return;
    try {
      await deleteBatch.mutateAsync(batchToDelete.id);
      toast.success(`Batch ${batchToDelete.batch_number ?? batchToDelete.id.slice(0, 8)} deleted`);
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Failed to delete batch');
    } finally {
      setBatchToDelete(null);
      setDeleteConfirmOpen(false);
    }
  };

  const all       = batches ?? [];
  const available = all.filter((b) => b.quantity_available > 0);
  const expired   = all.filter((b) => isExpired(b.expiry_date));

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Batch Stock — {itemName}</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <BeatLoader color="hsl(var(--primary))" size={10} />
            </div>
          ) : (
            <>
              <SummaryCards batches={all} />

              <Tabs defaultValue="available">
                <TabsList className="mb-3">
                  <TabsTrigger value="available">
                    Available ({available.length})
                  </TabsTrigger>
                  <TabsTrigger value="expired">
                    Expired ({expired.length})
                  </TabsTrigger>
                  <TabsTrigger value="all">
                    All History ({all.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="available">
                  <BatchTable batches={available} onDelete={handleDeleteRequest} />
                </TabsContent>

                <TabsContent value="expired">
                  <BatchTable batches={expired} onDelete={handleDeleteRequest} />
                </TabsContent>

                <TabsContent value="all">
                  <BatchTable batches={all} onDelete={handleDeleteRequest} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — rendered outside main Dialog to avoid Radix race */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete batch{' '}
              <strong>{batchToDelete?.batch_number ?? 'this batch'}</strong> and reverse its
              quantity from stock. Batches used in sales cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBatchToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteBatch.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteBatch.isPending ? <BeatLoader size={8} color="white" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
