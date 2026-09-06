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
import type { CreatePurchaseRequestItemDto } from '@/types/procurement';
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
import { errorMessage } from '@/lib/utils/supabase-error';

// is_new is local UI state only — never sent to the server. domain_item_id
// (null = new item) is what the service actually derives request_type from.
type ItemRow = CreatePurchaseRequestItemDto & { is_new: boolean };

/**
 * The domain select decides which catalog the request draws from, but "Inventory
 * (IMS)" vs "Resource Management" is how the system is built, not how a requester
 * thinks. They know whether the thing gets used up or lasts — so lead with that and
 * keep the module name after it so this still matches the rest of the app.
 */
const DOMAIN_CHOICE: Record<string, string> = {
  ims: 'Consumables & chemicals',
  resource_mgmt: 'Equipment, furniture & instruments',
};

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
  is_new: false,
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
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Institution scope — defaults to the user's own; a multi-institution user can
  // switch, which re-scopes the catalog search and the institution the PR is raised for.
  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const effectiveInstitution = institutionId ?? profile?.institution_id ?? '';

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
    if (cleaned.some((i) => i.is_new && !i.reason?.trim())) {
      toast.error('Enter a reason for every new item.');
      return;
    }
    if (cleaned.some((i) => !i.is_new && !i.domain_item_id)) {
      toast.error('Existing-item lines must be picked from the inventory catalog. Use "New item" for items not yet in inventory.');
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

  // Display-only summary of the request's composition — mirrors the derivation the
  // server does from domain_item_id (see purchase-request-service.createPurchaseRequest).
  const requestTypeSummary = useMemo(() => {
    const hasRestock = cleanedItems.some((i) => !i.is_new);
    const hasNewItem = cleanedItems.some((i) => i.is_new);
    if (hasRestock && hasNewItem) return 'Mixed';
    if (hasNewItem) return 'New item';
    return 'Restock';
  }, [cleanedItems]);

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
          notes: notes || null,
          items: cleanedItems.map(({ is_new, ...i }) => ({
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
      toast.error(errorMessage(e, 'Failed to create request'));
    }
  };

  return (
    <ContentLayout title="New Purchase Request">
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" aria-label="Go back" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">New Purchase Request</h2>
            <p className="text-muted-foreground">
              Mix restock and new-item lines freely — each item picks its own type.
            </p>
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
              hint="Sets which item catalog you order from."
            />
            <div className="space-y-2 max-w-md">
              <Label>What are you buying?</Label>
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
                      {DOMAIN_CHOICE[opt.value]
                        ? `${DOMAIN_CHOICE[opt.value]} — ${opt.label}`
                        : opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Consumables and chemicals are tracked by batch and expiry. Equipment and
                furniture are tracked as assets.
              </p>
            </div>
            {domain === 'resource_mgmt' && requestTypeSummary !== 'Restock' && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                Buying consumables or chemicals — things that get used up or expire (reagents,
                cotton, gloves)? Purchase those through the <b>Inventory (IMS)</b> module instead,
                which tracks batches and expiry dates. Resource Management is for equipment,
                furniture and instruments.
              </div>
            )}
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
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">
                Items{cleanedItems.length ? ` (${cleanedItems.length})` : ''}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick each item from the catalog. If something is not stocked yet, choose
                “New item” and say why it is needed.
              </p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0" onClick={addRow}>
              <Plus className="mr-2 h-4 w-4" />
              Add item
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, idx) => (
              <div key={idx} className="grid gap-3 lg:grid-cols-12 items-start border-b pb-4 last:border-0">
                <div className="lg:col-span-2 space-y-1">
                  <Label className="text-xs">Source</Label>
                  <Select
                    value={item.is_new ? 'new_item' : 'restock'}
                    onValueChange={(v) => {
                      const isNew = v === 'new_item';
                      // Switching a row's type invalidates its catalog linkage — reset
                      // name + link so a restock pick can't leak into a new-item line
                      // (or vice versa).
                      updateItem(idx, {
                        is_new: isNew,
                        item_name: '',
                        domain_item_id: null,
                        current_stock: null,
                        reorder_level: null,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="restock">From the catalog</SelectItem>
                      <SelectItem value="new_item">New item — not in the catalog</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="lg:col-span-3 space-y-1">
                  <Label className="text-xs">Item name</Label>
                  {item.is_new ? (
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
                      {item.current_stock != null && (
                        <p
                          className={
                            item.reorder_level != null && item.current_stock <= item.reorder_level
                              ? 'text-[11px] font-medium text-amber-700 dark:text-amber-300'
                              : 'text-[11px] text-muted-foreground'
                          }
                        >
                          {item.reorder_level != null && item.current_stock <= item.reorder_level
                            ? 'Low stock — '
                            : ''}
                          {item.current_stock} in stock
                          {item.reorder_level != null ? `, reorder at ${item.reorder_level}` : ''}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="lg:col-span-2 space-y-1">
                  <Label className="text-xs">Specification</Label>
                  <Input
                    value={item.item_spec ?? ''}
                    onChange={(e) => updateItem(idx, { item_spec: e.target.value })}
                    placeholder={item.is_new ? 'Size, grade, packaging…' : 'From catalog'}
                  />
                </div>
                <div className="lg:col-span-2 space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    value={item.required_quantity}
                    onChange={(e) => updateItem(idx, { required_quantity: Number(e.target.value) })}
                  />
                </div>
                <div className="lg:col-span-2 space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Input
                    value={item.unit_label ?? ''}
                    onChange={(e) => updateItem(idx, { unit_label: e.target.value })}
                    placeholder="e.g. box"
                  />
                </div>
                <div className="lg:col-span-1 flex items-end justify-end h-full">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Remove item"
                    onClick={() => removeRow(idx)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {item.is_new && (
                  <div className="lg:col-span-12 space-y-1">
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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            This saves the request as a draft. You send it for approval from the request page.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createPR.isPending}>
              Review &amp; create
            </Button>
          </div>
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
                {requestTypeSummary}
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
                      <td className="px-3 py-2">{item.is_new ? 'New item' : 'From catalog'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            The request is saved as a draft. Send it for approval from the request page.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Back to edit
            </Button>
            <Button onClick={handleConfirmCreate} disabled={createPR.isPending}>
              {createPR.isPending ? 'Creating…' : 'Create draft request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
