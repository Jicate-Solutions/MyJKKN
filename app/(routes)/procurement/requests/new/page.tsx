'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useCreatePurchaseRequest } from '@/hooks/procurement/use-purchase-requests';
import { CatalogItemPicker } from '@/components/procurement/catalog-item-picker';
import { RequestFileImport } from '@/components/procurement/request-file-import';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { ApprovalRoutePicker, useApprovalRouteReady } from '@/components/procurement/approval-route-picker';
import { registeredDomainOptions } from '@/lib/services/procurement/domain-adapters/registry';
import type { DomainCtx, ProcurementDomain } from '@/lib/services/procurement/domain-adapters/types';
import type { CreatePurchaseRequestItemDto } from '@/types/procurement';
import { Button } from '@/components/ui/button';
import { DetailHeader } from '@/components/procurement/detail-header';
import { FormActionBar } from '@/components/procurement/form-action-bar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { PastRatingHint } from '@/components/procurement/past-rating-hint';
import { useItemVendorRatings } from '@/hooks/procurement/use-ratings';

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
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  // How each picked catalog item went last time (requester ratings).
  const { data: itemRatings = [] } = useItemVendorRatings(
    items.map((i) => i.domain_item_id).filter((x): x is string => !!x)
  );
  // "What is it for?" — ONE field. It names the purchase on every list and is the
  // reason the approver reads; it also fills each new item's reason (the server
  // needs one per new line) unless an AI-read reason is already there.
  const [title, setTitle] = useState('');
  // Field errors show only after a first Send, so an untouched form isn't all red.
  const [triedSubmit, setTriedSubmit] = useState(false);

  // Institution scope — carries over whatever the requester had filtered the
  // Requests list to (?institution=…), so a multi-institution user isn't asked to
  // pick the same institution twice in one flow. Falls back to their own when
  // this page is opened directly. They can still switch it here if they mean to
  // raise this particular request against a different institution.
  const [institutionId, setInstitutionId] = useState<string | undefined>(
    () => searchParams.get('institution') ?? undefined
  );
  const effectiveInstitution = institutionId ?? profile?.institution_id ?? '';

  // Category decides the approval steps (set by the Super Admin); the department is
  // whose HOD approves when a step is "HOD".
  const [route, setRoute] = useState<{ categoryId: string | null; departmentId: string | null }>({
    categoryId: null,
    departmentId: null,
  });
  const routeReady = useApprovalRouteReady(effectiveInstitution || undefined, route.categoryId, route.departmentId);

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
    setTriedSubmit(true);
    if (!profile?.id || !effectiveInstitution) {
      toast.error('No institution selected — pick one or contact an administrator.');
      return;
    }
    const cleaned = items.filter((i) => i.item_name.trim());
    if (cleaned.length === 0) {
      toast.error('Add at least one item.');
      return;
    }
    if (!title.trim()) {
      toast.error('Say what it is for (e.g. Microbiology practicals).');
      return;
    }
    if (!routeReady.ready) {
      toast.error(routeReady.problem ?? 'Wait a moment — checking who approves this request.');
      return;
    }
    if (cleaned.some((i) => !i.is_new && !i.domain_item_id)) {
      toast.error('Existing-item lines must be picked from the inventory catalog. Use "New item" for items not yet in inventory.');
      return;
    }

    // Validation passed — the form itself is the review, so submit straight away.
    await handleConfirmCreate();
  };

  // Cleaned line items as they will be submitted (also drives the preview table).
  const cleanedItems = useMemo(
    () =>
      items
        .filter((i) => i.item_name.trim())
        .map((i) =>
          i.is_new && !i.reason?.trim() ? { ...i, reason: title.trim() } : i
        ),
    [items, title]
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
          title: title.trim(),
          notes: null,
          category_id: routeReady.required ? route.categoryId : null,
          department_id: routeReady.required ? route.departmentId : null,
          items: cleanedItems.map(({ is_new, ...i }) => ({
            ...i,
            required_quantity: Number(i.required_quantity) || 0,
            estimated_cost: i.estimated_cost != null ? Number(i.estimated_cost) : null,
          })),
        },
        userId: profile.id,
      });
      toast.success(`Purchase ${displayRequestNumber(created.request_number)} submitted for approval`);
      // Straight to the purchase page — its progress line shows who acts next.
      router.push(created.id ? `/procurement/requests/${created.id}` : '/procurement/requests');
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to create request'));
    }
  };

  return (
    <ContentLayout title="New request">
      {/* Full width, several fields to a row: the header fields share one line, each
          item is one line (what · size/brand · qty), so a long list stays short. */}
      <div className="w-full space-y-5">
        <DetailHeader backLabel="Back" onBack={() => router.back()} title="What do you need?" />

        <section className="space-y-5 rounded-xl border bg-background p-5 shadow">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InstitutionFilter
              className="w-full space-y-1 [&_label]:text-xs [&_label]:font-semibold"
              value={effectiveInstitution || undefined}
              onChange={(id) => {
                setInstitutionId(id);
                // Different institution = different inventory catalog; clear picks.
                setItems([emptyRow()]);
                // …and different departments.
                setRoute((r) => ({ ...r, departmentId: null }));
              }}
            />
            {domainOptions.length > 1 && (
              <div className="w-full space-y-1">
                <Label className="text-xs font-semibold">Type</Label>
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
            )}
            <div className={`space-y-1 sm:col-span-2 ${domainOptions.length > 1 ? '' : 'lg:col-span-3'}`}>
              <Label htmlFor="request-title" className="text-xs font-semibold">
                What is it for?
              </Label>
              <Input
                id="request-title"
                className="h-9"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                autoComplete="off"
                placeholder="e.g. Microbiology practicals, 2026-27 batch"
                aria-invalid={triedSubmit && !title.trim()}
                aria-describedby={triedSubmit && !title.trim() ? 'request-title-error' : undefined}
              />
              {triedSubmit && !title.trim() && (
                <p id="request-title-error" className="text-xs text-destructive">
                  Say what it is for.
                </p>
              )}
            </div>
          </div>
          <ApprovalRoutePicker
            institutionId={effectiveInstitution || undefined}
            categoryId={route.categoryId}
            departmentId={route.departmentId}
            onChange={setRoute}
          />
          {domain === 'resource_mgmt' && requestTypeSummary !== 'Restock' && (
            <p className="text-xs text-foreground">
              Buying things that get used up or expire (reagents, gloves)? Request them under
              <b> Consumables &amp; chemicals</b> instead.
            </p>
          )}

          {/* Items: a light row each — what, a hint, qty, remove */}
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold">Items</legend>
            {triedSubmit && !items.some((i) => i.item_name.trim()) && (
              <p className="text-xs text-destructive">Add at least one item.</p>
            )}
            {triedSubmit && items.some((i) => i.item_name.trim() && !i.is_new && !i.domain_item_id) && (
              <p className="text-xs text-destructive">
                Pick each item from the list, or choose &ldquo;New item&rdquo; for one that isn&rsquo;t in the store yet.
              </p>
            )}
            {items.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[minmax(0,1fr)_4.5rem_2rem] items-start gap-2 rounded-xl bg-muted/50 p-2.5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_5rem_2rem]"
              >
                <div className="min-w-0 space-y-1.5 [&_button]:h-9">
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
                        estimated_cost: item.estimated_cost ?? (sel.costPrice != null ? sel.costPrice : undefined),
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
                  {item.is_new ? (
                    <p className="text-xs text-primary">New item — not in the store yet</p>
                  ) : item.current_stock != null ? (
                    <p className="text-xs text-foreground">
                      {Number(item.current_stock)} already in stock
                      {item.reorder_level != null ? ` · reorder at ${Number(item.reorder_level)}` : ''}
                    </p>
                  ) : null}
                  {item.domain_item_id && (
                    <PastRatingHint ratings={itemRatings.filter((r) => r.item_id === item.domain_item_id)} />
                  )}
                </div>
                {/* Size / brand / grade: beside the item on wide screens, under it on a phone. */}
                <Input
                  className="order-last col-span-3 h-9 bg-background text-sm md:order-none md:col-span-1"
                  value={item.item_spec ?? ''}
                  onChange={(e) => updateItem(idx, { item_spec: e.target.value })}
                  placeholder="Size, brand, grade (optional)"
                  aria-label={`Specification${item.item_name ? ` for ${item.item_name}` : ''}`}
                />
                <Input
                  className="h-9 w-full bg-background text-center tabular-nums"
                  type="number"
                  min={1}
                  aria-label={`Quantity${item.item_name ? ` for ${item.item_name}` : ''}`}
                  value={item.required_quantity}
                  onChange={(e) => updateItem(idx, { required_quantity: Number(e.target.value) })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-8 text-muted-foreground"
                  aria-label="Remove item"
                  onClick={() => removeRow(idx)}
                  disabled={items.length === 1}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="sm" className="text-primary" onClick={addRow}>
                <Plus className="mr-1 h-4 w-4" />
                Add item
              </Button>
              <RequestFileImport
                domain={domain}
                ctx={ctx}
                // Imported lines replace the blank starter row(s) and follow any already filled in.
                onAdd={(rows) => setItems((cur) => [...cur.filter((r) => r.item_name.trim()), ...rows])}
              />
            </div>
          </fieldset>

        </section>

        <FormActionBar
          status={`${items.filter((i) => i.item_name.trim()).length} item${
            items.filter((i) => i.item_name.trim()).length === 1 ? '' : 's'
          }`}
        >
          <Button variant="ghost" className="h-11 sm:h-9" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button className="h-11 px-6 sm:h-9" onClick={handleSubmit} disabled={createPR.isPending}>
            {createPR.isPending ? 'Sending…' : 'Send for approval'}
          </Button>
        </FormActionBar>
      </div>
    </ContentLayout>
  );
}
