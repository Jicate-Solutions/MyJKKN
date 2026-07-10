'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useCreatePurchaseRequest } from '@/hooks/procurement/use-purchase-requests';
import { CatalogItemPicker } from '@/components/procurement/catalog-item-picker';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { registeredDomainOptions } from '@/lib/services/procurement/domain-adapters/registry';
import type { DomainCtx, ProcurementDomain } from '@/lib/services/procurement/domain-adapters/types';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

type ItemRow = CreatePurchaseRequestItemDto;

const emptyRow = (): ItemRow => ({
  domain_item_id: null,
  item_name: '',
  item_spec: '',
  required_quantity: 1,
  unit_id: null,
  unit_label: '',
  reason: '',
  current_stock: null,
  reorder_level: null,
  estimated_cost: undefined,
});

export default function NewPurchaseRequestPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const createPR = useCreatePurchaseRequest();

  // Module (domain) chooser — populated from the registered adapters. Only IMS today;
  // Resource Management appears automatically once its adapter is registered.
  const domainOptions = useMemo(() => registeredDomainOptions(), []);
  const [domain, setDomain] = useState<ProcurementDomain>(
    () => domainOptions[0]?.value ?? 'ims'
  );
  const [requestType, setRequestType] = useState<PurchaseRequestType>('restock');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Institution scope — defaults to the user's own; a multi-institution user can
  // switch, which re-scopes the catalog search and the institution the PR is raised for.
  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const effectiveInstitution = institutionId ?? profile?.institution_id ?? '';

  const isNewItem = requestType === 'new_item';

  // Ambient context handed to the domain adapter's catalog search.
  const ctx: DomainCtx = useMemo(
    () => ({
      institutionId: effectiveInstitution,
      storeId: null,
      userId: profile?.id ?? '',
    }),
    [effectiveInstitution, profile?.id]
  );

  const updateItem = (idx: number, patch: Partial<ItemRow>) =>
    setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const addRow = () => setItems((rows) => [...rows, emptyRow()]);
  const removeRow = (idx: number) =>
    setItems((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));

  const handleSubmit = async () => {
    if (!profile?.id || !effectiveInstitution) {
      toast.error('No institution selected — pick one or contact an administrator.');
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
    if (!isNewItem && cleaned.some((i) => !i.domain_item_id)) {
      toast.error('Restock lines must be picked from the inventory catalog. Use "New item" for items not yet in inventory.');
      return;
    }

    // Validation passed — gate creation behind a read-only review step.
    setPreviewOpen(true);
  };

  // Cleaned line items as they will be submitted (also drives the preview table).
  const cleanedItems = useMemo(
    () => items.filter((i) => i.item_name.trim()),
    [items]
  );

  const handleConfirmCreate = async () => {
    if (!profile?.id || !effectiveInstitution) {
      toast.error('No institution selected — pick one or contact an administrator.');
      return;
    }
    try {
      const created = await createPR.mutateAsync({
        data: {
          institution_id: effectiveInstitution,
          domain,
          request_type: requestType,
          notes: notes || null,
          items: cleanedItems.map((i) => ({
            ...i,
            required_quantity: Number(i.required_quantity) || 0,
            estimated_cost: i.estimated_cost != null ? Number(i.estimated_cost) : null,
          })),
        },
        userId: profile.id,
      });
      setPreviewOpen(false);
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
            <InstitutionFilter
              value={effectiveInstitution || undefined}
              onChange={(id) => {
                setInstitutionId(id);
                // Different institution = different inventory catalog; clear picks.
                setItems([emptyRow()]);
              }}
              hint="Which institution’s inventory this request is raised against."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Module (inventory)</Label>
                <Select
                  value={domain}
                  onValueChange={(v) => {
                    setDomain(v as ProcurementDomain);
                    // Different module = different catalog; clear picked items.
                    setItems([emptyRow()]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {domainOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Which module’s inventory this request draws from.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Request type</Label>
                <Select
                  value={requestType}
                  onValueChange={(v) => {
                    setRequestType(v as PurchaseRequestType);
                    // Switching types invalidates catalog linkage — reset name + link so
                    // a restock pick can't leak into a new-item request (or vice versa).
                    setItems((rows) =>
                      rows.map((r) => ({
                        ...r,
                        item_name: '',
                        domain_item_id: null,
                        current_stock: null,
                        reorder_level: null,
                      }))
                    );
                  }}
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
                  {isNewItem ? (
                    <Input
                      value={item.item_name}
                      onChange={(e) => updateItem(idx, { item_name: e.target.value })}
                      placeholder="e.g. A4 paper"
                    />
                  ) : (
                    <>
                      <CatalogItemPicker
                        domain={domain}
                        ctx={ctx}
                        value={item.item_name || null}
                        placeholder="Pick an inventory item…"
                        onSelect={(sel) =>
                          updateItem(idx, {
                            domain_item_id: sel.domainItemId,
                            item_name: sel.name,
                            item_spec: sel.spec ?? item.item_spec ?? '',
                            unit_id: sel.unitId ?? null,
                            unit_label: sel.unitLabel ?? item.unit_label ?? '',
                            current_stock: sel.currentStock ?? null,
                            reorder_level: sel.reorderLevel ?? null,
                            estimated_cost:
                              item.estimated_cost ?? (sel.costPrice != null ? sel.costPrice : undefined),
                          })
                        }
                      />
                      {item.reorder_level != null && (
                        <p className="text-[11px] text-muted-foreground">
                          Reorder level: {item.reorder_level}
                          {item.current_stock != null && ` · in stock: ${item.current_stock}`}
                        </p>
                      )}
                    </>
                  )}
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
            Review &amp; create
          </Button>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review purchase request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Request type: </span>
                {requestType === 'new_item' ? 'New item' : 'Restock (existing item)'}
              </div>
              <div>
                <span className="text-muted-foreground">Items: </span>
                {cleanedItems.length}
              </div>
              {notes.trim() && (
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">Notes: </span>
                  {notes}
                </div>
              )}
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">Qty</th>
                    <th className="px-3 py-2 font-medium">Unit</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {cleanedItems.map((item, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        {item.item_name}
                        {item.item_spec?.trim() && (
                          <span className="block text-xs text-muted-foreground">
                            {item.item_spec}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{item.required_quantity}</td>
                      <td className="px-3 py-2">{item.unit_label?.trim() || '—'}</td>
                      <td className="px-3 py-2">
                        {requestType === 'new_item' ? 'new_item' : 'restock'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Back to edit
            </Button>
            <Button onClick={handleConfirmCreate} disabled={createPR.isPending}>
              {createPR.isPending ? 'Creating...' : 'Confirm & create request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
