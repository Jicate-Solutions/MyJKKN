'use client';

import { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateImsTransfer } from '@/hooks/ims/use-ims-transfers';
import { useImsItems } from '@/hooks/ims/use-ims-inventory';
import { useImsStores, useImsStoresByInstitution } from '@/hooks/ims/use-ims-stores';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';
import type { ImsIndentUrgency } from '@/types/ims';

interface NewRequestSlideoverProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  institutionId: string;
}

interface LineItem {
  item_id: string;
  item_name: string;
  quantity: number;
  unit_id: string;
}

export function NewRequestSlideover({
  open,
  onClose,
  storeId,
  institutionId,
}: NewRequestSlideoverProps) {
  const { userProfile } = usePermissions();
  const createTransfer = useCreateImsTransfer();

  const [purpose, setPurpose] = useState('');
  const [urgency, setUrgency] = useState<ImsIndentUrgency>('normal');
  const [destinationInstitutionId, setDestinationInstitutionId] = useState<string>('');
  const [destinationStoreId, setDestinationStoreId] = useState<string>('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [search, setSearch] = useState('');

  // ── Step 1: Load all active stores → extract unique institutions ────────────
  // Limit 200 to cover large deployments; institution_name is a snapshot column
  // on ims_stores so no extra join is needed.
  const { data: allStoresData } = useImsStores({ is_active: true, limit: 200 });

  const otherInstitutions = useMemo(() => {
    const stores = allStoresData?.data ?? [];
    const seen = new Map<string, string>(); // institution_id → institution_name
    for (const s of stores) {
      if (s.institution_id && s.institution_id !== institutionId && s.institution_name) {
        if (!seen.has(s.institution_id)) {
          seen.set(s.institution_id, s.institution_name);
        }
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [allStoresData, institutionId]);

  // ── Step 2: Stores at the chosen institution ─────────────────────────────────
  const { data: destStoresData } = useImsStoresByInstitution(destinationInstitutionId || null);
  const destStores = destStoresData ?? [];

  // ── Step 3: Items catalog at chosen destination store ────────────────────────
  const { data: itemsData } = useImsItems({
    store_id: destinationStoreId || undefined,
    is_distributable: true,
    is_bundle: false,
  });

  const items = useMemo(() => {
    if (!destinationStoreId) return [];
    return (itemsData?.data ?? []).filter(
      (i) => i.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [itemsData, destinationStoreId, search]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleInstitutionChange = (instId: string) => {
    setDestinationInstitutionId(instId);
    setDestinationStoreId('');
    setLines([]);
    setSearch('');
  };

  const handleStoreChange = (sId: string) => {
    setDestinationStoreId(sId);
    setLines([]);
    setSearch('');
  };

  const addLine = (item: { id: string; name: string; indent_unit_id: string | null }) => {
    if (lines.find((l) => l.item_id === item.id)) return;
    setLines((prev) => [
      ...prev,
      { item_id: item.id, item_name: item.name, quantity: 1, unit_id: item.indent_unit_id ?? '' },
    ]);
  };

  const updateQty = (itemId: string, qty: number) => {
    setLines((prev) =>
      prev.map((l) => (l.item_id === itemId ? { ...l, quantity: Math.max(1, qty) } : l))
    );
  };

  const removeLine = (itemId: string) => {
    setLines((prev) => prev.filter((l) => l.item_id !== itemId));
  };

  const resetForm = () => {
    setPurpose('');
    setUrgency('normal');
    setDestinationInstitutionId('');
    setDestinationStoreId('');
    setLines([]);
    setSearch('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!destinationInstitutionId || !destinationStoreId) {
      toast.error('Select a destination institution and store.');
      return;
    }
    if (!purpose.trim()) {
      toast.error('Add a purpose for this request.');
      return;
    }
    if (lines.length === 0) {
      toast.error('Add at least one item.');
      return;
    }
    if (lines.some((l) => !l.unit_id)) {
      toast.error('Some items are missing a unit. Check the destination store catalog.');
      return;
    }

    try {
      await createTransfer.mutateAsync({
        data: {
          purpose,
          urgency,
          institution_id: institutionId,
          store_id: storeId,
          request_scope: 'inter_institution',
          source_store_id: storeId,
          destination_institution_id: destinationInstitutionId,
          destination_store_id: destinationStoreId,
          items: lines.map((l) => ({
            item_id: l.item_id,
            quantity: l.quantity,
            unit_id: l.unit_id,
          })),
        },
        userId: userProfile?.id ?? '',
      });
      toast.success('Supply request submitted.');
      resetForm();
      onClose();
    } catch {
      toast.error('Failed to submit request. Please try again.');
    }
  };

  const selectedInstitutionName =
    otherInstitutions.find((i) => i.id === destinationInstitutionId)?.name ?? '';
  const selectedStoreName =
    destStores.find((s) => s.id === destinationStoreId)?.name ?? '';

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Transfer Request</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {selectedStoreName
              ? `Requesting from: ${selectedStoreName} · ${selectedInstitutionName}`
              : 'Select a destination institution to get started.'}
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-5">

          {/* ── Step 1: Institution ── */}
          <div>
            <Label>Destination Institution *</Label>
            <Select
              value={destinationInstitutionId}
              onValueChange={handleInstitutionChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select institution..." />
              </SelectTrigger>
              <SelectContent>
                {otherInstitutions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No other institutions found
                  </div>
                ) : (
                  otherInstitutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* ── Step 2: Store within institution ── */}
          {destinationInstitutionId && (
            <div>
              <Label>Destination Store *</Label>
              <Select
                value={destinationStoreId}
                onValueChange={handleStoreChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select store..." />
                </SelectTrigger>
                <SelectContent>
                  {destStores.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No active stores for this institution
                    </div>
                  ) : (
                    destStores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.is_central_supply_store && (
                          <span className="ml-2 text-xs text-muted-foreground">(Central)</span>
                        )}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Step 3: Request details (unlocked after store is chosen) ── */}
          {destinationStoreId && (
            <>
              <div>
                <Label>Purpose *</Label>
                <Input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Exam week stationery"
                />
              </div>

              <div>
                <Label>Priority</Label>
                <Select value={urgency} onValueChange={(v) => setUrgency(v as ImsIndentUrgency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Search Items</Label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${selectedStoreName} catalog...`}
                />
              </div>

              {search && items.length > 0 && (
                <div className="border rounded-lg max-h-40 overflow-y-auto divide-y">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addLine(item)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex justify-between"
                    >
                      <span>{item.name}</span>
                      <span className="text-xs text-primary">+ Add</span>
                    </button>
                  ))}
                </div>
              )}

              {search && items.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No items found in {selectedStoreName}&apos;s catalog.
                </p>
              )}

              {lines.length > 0 && (
                <div>
                  <Label>Request Summary ({lines.length} item{lines.length !== 1 ? 's' : ''})</Label>
                  <div className="border rounded-lg divide-y mt-1">
                    {lines.map((l) => (
                      <div key={l.item_id} className="flex items-center gap-2 px-3 py-2">
                        <span className="flex-1 text-sm truncate">{l.item_name}</span>
                        <Input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) => updateQty(l.item_id, Number(e.target.value))}
                          className="w-16 h-7 text-sm"
                        />
                        <button
                          onClick={() => removeLine(l.item_id)}
                          className="text-destructive text-xs ml-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={createTransfer.isPending || !destinationStoreId || lines.length === 0}
            >
              {createTransfer.isPending ? 'Submitting...' : 'Submit Request →'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
