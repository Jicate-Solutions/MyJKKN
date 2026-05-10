'use client';

import { useState, useMemo } from 'react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { useAddImsBatch } from '@/hooks/ims/use-ims-stock';
import { useImsSuppliersForSelect } from '@/hooks/ims/use-ims-settings';

// ── Schema ────────────────────────────────────────────────

const schema = z.object({
  batch_number: z.string().optional(),
  quantity: z.coerce.number().positive('Quantity must be > 0'),
  cost_price: z.coerce.number().min(0, 'Cost price must be ≥ 0'),
  gst_rate: z.coerce.number().min(0).max(100),
  entry_date: z.string().min(1, 'Entry date required'),
  expiry_date: z.string().optional(),
  supplier_id: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const GST_OPTIONS = [
  { label: '0%',  value: '0' },
  { label: '5%',  value: '5' },
  { label: '12%', value: '12' },
  { label: '18%', value: '18' },
  { label: '28%', value: '28' },
];

// ── Props ─────────────────────────────────────────────────

interface AddBatchModalProps {
  open: boolean;
  onClose: () => void;
  itemId: string;
  itemName: string;
  storeId: string;
  institutionId: string;
}

// ── Component ─────────────────────────────────────────────

export function AddBatchModal({
  open,
  onClose,
  itemId,
  itemName,
  storeId,
  institutionId,
}: AddBatchModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];

  const { data: suppliers } = useImsSuppliersForSelect(storeId, institutionId);
  const addBatch = useAddImsBatch();

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      batch_number: '',
      quantity: 1,
      cost_price: 0,
      gst_rate: 0,
      entry_date: today,
      expiry_date: '',
      supplier_id: '',
      notes: '',
    },
  });

  const quantity   = watch('quantity')   ?? 0;
  const costPrice  = watch('cost_price') ?? 0;
  const gstRate    = watch('gst_rate')   ?? 0;

  const costWithGst   = useMemo(() => costPrice * (1 + gstRate / 100), [costPrice, gstRate]);
  const totalBatchVal = useMemo(() => quantity * costWithGst, [quantity, costWithGst]);

  const formatInr = (n: number) =>
    n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

  const onSubmit = async (values: FormValues) => {
    try {
      await addBatch.mutateAsync({
        item_id:        itemId,
        batch_number:   values.batch_number?.trim() || undefined,
        quantity:       values.quantity,
        cost_price:     values.cost_price,
        gst_rate:       values.gst_rate,
        entry_date:     values.entry_date,
        expiry_date:    values.expiry_date?.trim() || undefined,
        supplier_id:    values.supplier_id?.trim() || undefined,
        notes:          values.notes?.trim() || undefined,
        store_id:       storeId || undefined,
        institution_id: institutionId,
      });
      toast.success('Batch added successfully');
      reset();
      onClose();
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Failed to add batch');
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add Batch Stock</DialogTitle>
          <p className="text-sm text-muted-foreground truncate">{itemName}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Batch Number */}
          <div className="space-y-1">
            <Label htmlFor="batch_number">Batch Number</Label>
            <Input
              id="batch_number"
              placeholder="Auto-generated (e.g. BTH-260304-00001)"
              {...register('batch_number')}
            />
            <p className="text-xs text-muted-foreground">Leave blank to auto-generate</p>
          </div>

          {/* Quantity */}
          <div className="space-y-1">
            <Label htmlFor="quantity">Quantity *</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              step={1}
              {...register('quantity')}
              className={errors.quantity ? 'border-destructive' : ''}
            />
            {errors.quantity && (
              <p className="text-xs text-destructive">{errors.quantity.message}</p>
            )}
          </div>

          {/* Cost Price + GST */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cost_price">Cost Price (ex-GST) *</Label>
              <Input
                id="cost_price"
                type="number"
                min={0}
                step={0.01}
                {...register('cost_price')}
                className={errors.cost_price ? 'border-destructive' : ''}
              />
              {errors.cost_price && (
                <p className="text-xs text-destructive">{errors.cost_price.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>GST Rate</Label>
              <Controller
                name="gst_rate"
                control={control}
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GST_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Cost with GST (read-only) */}
          <div className="space-y-1">
            <Label>Cost with GST (per unit)</Label>
            <Input
              value={formatInr(costWithGst)}
              readOnly
              className="bg-muted text-muted-foreground"
            />
          </div>

          {/* Entry Date */}
          <div className="space-y-1">
            <Label htmlFor="entry_date">Stock Entry Date *</Label>
            <Input
              id="entry_date"
              type="date"
              max={today}
              {...register('entry_date')}
              className={errors.entry_date ? 'border-destructive' : ''}
            />
            {errors.entry_date && (
              <p className="text-xs text-destructive">{errors.entry_date.message}</p>
            )}
          </div>

          {/* Expiry Date */}
          <div className="space-y-1">
            <Label htmlFor="expiry_date">Expiry Date</Label>
            <Input
              id="expiry_date"
              type="date"
              min={tomorrow}
              {...register('expiry_date')}
            />
          </div>

          {/* Supplier */}
          <div className="space-y-1">
            <Label>Supplier</Label>
            <Controller
              name="supplier_id"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || ''}
                  onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No supplier</SelectItem>
                    {(suppliers || []).map((s: { id: string; name: string }) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Optional notes..."
              {...register('notes')}
            />
          </div>

          {/* Live Summary */}
          <Separator />
          <div className="rounded-md bg-muted px-4 py-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantity</span>
              <span>{Number(quantity) > 0 ? quantity : '–'} units</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unit Cost (with GST)</span>
              <span>{formatInr(costWithGst)}</span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between font-semibold">
              <span>Total Batch Value</span>
              <span>{formatInr(totalBatchVal)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={addBatch.isPending}>
              {addBatch.isPending ? <BeatLoader color="white" size={8} /> : 'Add Batch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
