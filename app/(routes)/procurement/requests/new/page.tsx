'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useCreatePurchaseRequest } from '@/hooks/procurement/use-purchase-requests';
import type {
  PurchaseRequestType,
  CreatePurchaseRequestItemDto,
} from '@/types/procurement';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

type ItemRow = CreatePurchaseRequestItemDto;

const emptyRow = (): ItemRow => ({
  item_name: '',
  item_spec: '',
  required_quantity: 1,
  unit_label: '',
  reason: '',
  estimated_cost: undefined,
});

export default function NewPurchaseRequestPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const createPR = useCreatePurchaseRequest();

  const [requestType, setRequestType] = useState<PurchaseRequestType>('restock');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);

  const isNewItem = requestType === 'new_item';

  const updateItem = (idx: number, patch: Partial<ItemRow>) =>
    setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const addRow = () => setItems((rows) => [...rows, emptyRow()]);
  const removeRow = (idx: number) =>
    setItems((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));

  const handleSubmit = async () => {
    if (!profile?.id || !profile?.institution_id) {
      toast.error('Your profile has no institution set — contact an administrator.');
      return;
    }
    const cleaned = items.filter((i) => i.item_name.trim());
    if (cleaned.length === 0) {
      toast.error('Add at least one item.');
      return;
    }
    if (isNewItem && cleaned.some((i) => !i.reason?.trim())) {
      toast.error('New-item requests require a reason for every item.');
      return;
    }

    try {
      const created = await createPR.mutateAsync({
        data: {
          institution_id: profile.institution_id,
          request_type: requestType,
          notes: notes || null,
          items: cleaned.map((i) => ({
            ...i,
            required_quantity: Number(i.required_quantity) || 0,
            estimated_cost: i.estimated_cost != null ? Number(i.estimated_cost) : null,
          })),
        },
        userId: profile.id,
      });
      toast.success(`Purchase request ${created.request_number} created`);
      router.push(`/procurement/requests/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create request');
    }
  };

  return (
    <ContentLayout title="New Purchase Request">
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">New Purchase Request</h2>
            <p className="text-muted-foreground">Restock existing items or request a new item.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Request type</Label>
                <Select
                  value={requestType}
                  onValueChange={(v) => setRequestType(v as PurchaseRequestType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="restock">Restock (existing item)</SelectItem>
                    <SelectItem value="new_item">New item</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any context for the approver..."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Items</CardTitle>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="mr-2 h-4 w-4" />
              Add item
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, idx) => (
              <div key={idx} className="grid gap-3 sm:grid-cols-12 items-start border-b pb-4 last:border-0">
                <div className="sm:col-span-4 space-y-1">
                  <Label className="text-xs">Item name</Label>
                  <Input
                    value={item.item_name}
                    onChange={(e) => updateItem(idx, { item_name: e.target.value })}
                    placeholder="e.g. A4 paper"
                  />
                </div>
                <div className="sm:col-span-3 space-y-1">
                  <Label className="text-xs">Specification</Label>
                  <Input
                    value={item.item_spec ?? ''}
                    onChange={(e) => updateItem(idx, { item_spec: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    value={item.required_quantity}
                    onChange={(e) => updateItem(idx, { required_quantity: Number(e.target.value) })}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Input
                    value={item.unit_label ?? ''}
                    onChange={(e) => updateItem(idx, { unit_label: e.target.value })}
                    placeholder="e.g. box"
                  />
                </div>
                <div className="sm:col-span-1 flex items-end justify-end h-full">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(idx)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {isNewItem && (
                  <div className="sm:col-span-12 space-y-1">
                    <Label className="text-xs">
                      Reason for new item <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={item.reason ?? ''}
                      onChange={(e) => updateItem(idx, { reason: e.target.value })}
                      placeholder="Why is this new item needed? (mandatory)"
                    />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createPR.isPending}>
            {createPR.isPending ? 'Creating...' : 'Create request'}
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
