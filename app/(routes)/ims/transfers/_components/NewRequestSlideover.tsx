'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateImsTransfer } from '@/hooks/ims/use-ims-transfers';
import { useImsItems } from '@/hooks/ims/use-ims-inventory';
import { useImsStoresByInstitution } from '@/hooks/ims/use-ims-stores';
import { usePermissions } from '@/hooks/use-permissions';
import { createClientSupabaseClient } from '@/lib/supabase/client';
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

  // ── Step 1: All institutions except the current one ─────────────────────────
  // Queries the `institutions` table directly — RLS SELECT policy is now
  // USING (true) so any authenticated user sees all institutions. Session guard
  // prevents anon calls on cold mount (session race at page load).
  const {
    data: institutionsData,
    isLoading: isLoadingInstitutions,
    isError: isInstitutionsError,
    refetch: refetchInstitutions,
  } = useQuery({
    queryKey: ['institutions-list', 'v2'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('[NewRequestSlideover] Session not ready — will retry');
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: open,
    retry: 3,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 8000),
  });

  const otherInstitutions = useMemo(
    () => (institutionsData ?? []).filter((i) => i.id !== institutionId),
    [institutionsData, institutionId]
  );

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

  const addLine = (item: { id: string; name: string; indent_unit_id: string | null; base_unit_id?: string | null }) => {
    if (lines.find((l) => l.item_id === item.id)) return;
    // indent_unit_id is preferred; fall back to base_unit_id if not set
    const unitId = item.indent_unit_id ?? item.base_unit_id ?? '';
    setLines((prev) => [
      ...prev,
      { item_id: item.id, item_name: item.name, quantity: 1, unit_id: unitId },
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
          <SheetDescription>
            {selectedStoreName
              ? `Requesting from: ${selectedStoreName} · ${selectedInstitutionName}`
              : 'Select a destination institution to get started.'}
          </SheetDescription>
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
                {isLoadingInstitutions ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Loading institutions...
                  </div>
                ) : isInstitutionsError ? (
                  <div className="px-3 py-2 text-sm text-destructive">
                    Failed to load.{' '}
                    <button
                      className="underline"
                      onClick={(e) => { e.preventDefault(); void refetchInstitutions(); }}
                    >
                      Retry
                    </button>
                  </div>
                ) : otherInstitutions.length === 0 ? (
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
                  {items.map((item) => {
                    const hasUnit = !!(item.indent_unit_id ?? item.base_unit_id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => hasUnit && addLine(item)}
                        disabled={!hasUnit}
                        className="w-full text-left px-3 py-2 text-sm flex justify-between disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-muted/50"
                      >
                        <span>{item.name}</span>
                        <span className={`text-xs ${hasUnit ? 'text-primary' : 'text-muted-foreground'}`}>
                          {hasUnit ? '+ Add' : 'No unit'}
                        </span>
                      </button>
                    );
                  })}
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
