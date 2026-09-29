'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useCreatePurchaseRequest } from '@/hooks/procurement/use-purchase-requests';
import { CatalogItemPicker } from '@/components/procurement/catalog-item-picker';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { registeredDomainOptions } from '@/lib/services/procurement/domain-adapters/registry';
import type { DomainCtx, ProcurementDomain } from '@/lib/services/procurement/domain-adapters/types';
import type { CreatePurchaseRequestItemDto } from '@/types/procurement';
import { Card, CardContent } from '@/components/ui/card';
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
  const searchParams = useSearchParams();
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

  // Institution scope — carries over whatever the requester had filtered the
  // Requests list to (?institution=…), so a multi-institution user isn't asked to
  // pick the same institution twice in one flow. Falls back to their own when
  // this page is opened directly. They can still switch it here if they mean to
  // raise this particular request against a different institution.
  const [institutionId, setInstitutionId] = useState<string | undefined>(
    () => searchParams.get('institution') ?? undefined
  );
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
      toast.success(`Request ${created.request_number} submitted`);
      router.push('/procurement/requests');
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to create request'));
    }
  };

  return (
    <ContentLayout title="New Request">
      <div className="max-w-5xl space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" aria-label="Go back" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">New Request</h2>
        </div>

        {/* ── Details: one compact row ─────────────────────────────────── */}
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <InstitutionFilter
                className="space-y-1"
                value={effectiveInstitution || undefined}
                onChange={(id) => {
                  setInstitutionId(id);
                  // Different institution = different inventory catalog; clear picks.
                  setItems([emptyRow()]);
                }}
              />
              <div className="space-y-1">
                <Label className="text-xs">What are you buying?</Label>
                <Select
                  value={domain}
                  onValueChange={(v) => {
                    setDomain(v as ProcurementDomain);
                    // Different module = different catalog; clear picked items.
                    setItems([emptyRow()]);
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {domainOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {DOMAIN_CHOICE[opt.value] ?? opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Note for the approver (optional)</Label>
                <Input
                  className="h-9"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why it is needed, by when…"
                />
              </div>
            </div>
            {domain === 'resource_mgmt' && requestTypeSummary !== 'Restock' && (
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Buying things that get used up or expire (reagents, gloves)? Request them under
                <b> Consumables &amp; chemicals</b> instead.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Items: one line each ─────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-medium">
              Items{cleanedItems.length ? ` (${cleanedItems.length})` : ''}
            </p>

            <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_80px_32px] gap-2 px-1 pb-1 text-xs text-muted-foreground md:grid">
              <span>Item</span>
              <span>Specification</span>
              <span>Qty</span>
              <span />
            </div>

            <div className="divide-y">
              {items.map((item, idx) => {
                return (
                  <div key={idx} className="space-y-1.5 py-2">
                    <div className="grid grid-cols-[1fr_80px_32px] gap-2 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_80px_32px]">
                      <div className="col-span-3 md:col-span-1">
                        <CatalogItemPicker
                          domain={domain}
                          ctx={ctx}
                          value={item.item_name || null}
                          placeholder="Search or type an item…"
                          onSelect={(sel) =>
                            updateItem(idx, {
                              is_new: false,
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
                          // Not in the catalog → the same box turns it into a new-item line.
                          onCreateNew={(name) =>
                            updateItem(idx, {
                              is_new: true,
                              item_name: name,
                              domain_item_id: null,
                              unit_id: null,
                              current_stock: null,
                              reorder_level: null,
                            })
                          }
                        />
                      </div>
                      <Input
                        className="col-span-3 h-9 md:col-span-1"
                        value={item.item_spec ?? ''}
                        onChange={(e) => updateItem(idx, { item_spec: e.target.value })}
                        placeholder="Size, brand, grade…"
                      />
                      <Input
                        className="h-9"
                        type="number"
                        min={1}
                        aria-label="Quantity"
                        value={item.required_quantity}
                        onChange={(e) => updateItem(idx, { required_quantity: Number(e.target.value) })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-8"
                        aria-label="Remove item"
                        onClick={() => removeRow(idx)}
                        disabled={items.length === 1}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    {item.is_new && (
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                          New item
                        </span>
                        <Input
                          className="h-8 text-sm"
                          value={item.reason ?? ''}
                          onChange={(e) => updateItem(idx, { reason: e.target.value })}
                          placeholder="Why is it needed? (required for items not in the catalog)"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Button variant="ghost" size="sm" className="mt-1 text-primary" onClick={addRow}>
              <Plus className="mr-1 h-4 w-4" />
              Add another item
            </Button>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <p className="text-xs text-muted-foreground sm:mr-auto">
            Goes for approval first; then the store collects vendor quotations.
          </p>
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createPR.isPending}>
            Review &amp; submit
          </Button>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review request</DialogTitle>
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
          <p className="hidden text-sm text-muted-foreground sm:block">
            It goes for approval first; then the store collects vendor quotations.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setPreviewOpen(false)}>
              Back to edit
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleConfirmCreate} disabled={createPR.isPending}>
              {createPR.isPending ? 'Submitting…' : 'Submit request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
