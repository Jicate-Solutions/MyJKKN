'use client';

import { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateImsPushTransfer } from '@/hooks/ims/use-ims-transfers';
import { useImsItems } from '@/hooks/ims/use-ims-inventory';
import { useImsStoresByInstitution } from '@/hooks/ims/use-ims-stores';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';

interface PushToStoreSlideoverProps {
  open: boolean;
  onClose: () => void;
  /** The warehouse doing the sending — must be this institution's warehouse. */
  warehouseStoreId: string;
  institutionId: string;
}

interface PushLine {
  item_id: string;
  item_name: string;
  quantity: number;
  available: number;
}

/**
 * Warehouse-initiated distribution: "Send to Store".
 *
 * The mirror image of NewRequestSlideover — instead of an operating store asking
 * for stock, the warehouse allocates and sends it. One RPC does the whole thing
 * (request + shipment + FEFO allocation + dispatch), so warehouse stock is
 * deducted the moment this succeeds; the receiving store then confirms receipt.
 */
export function PushToStoreSlideover({
  open,
  onClose,
  warehouseStoreId,
  institutionId,
}: PushToStoreSlideoverProps) {
  const { userProfile } = usePermissions();
  const pushTransfer = useCreateImsPushTransfer();

  const [destinationStoreId, setDestinationStoreId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<PushLine[]>([]);

  // Candidate destinations: every other active store in this institution.
  // The warehouse cannot send to itself (the RPC rejects it too).
  const { data: storesData } = useImsStoresByInstitution(open ? institutionId : null);
  const destStores = useMemo(
    () => (storesData ?? []).filter((s) => s.id !== warehouseStoreId),
    [storesData, warehouseStoreId]
  );

  // Only what the warehouse actually holds and is allowed to distribute.
  //
  // It now does what that sentence says. store_id alone used to filter on
  // ims_items.store_id — which store CREATED the row — so this listed items the
  // warehouse had never held, and at Dental (where every item was created at the
  // student store) it listed nothing at all. has_stock reads ims_stock_summary,
  // and is_distributable/is_bundle were passed here but silently ignored by
  // getItems until 20260804090000.
  const { data: itemsData } = useImsItems({
    store_id: warehouseStoreId || undefined,
    scope: 'store',
    has_stock: true,
    is_distributable: true,
    is_bundle: false,
    limit: 200,
  });

  const items = useMemo(() => {
    if (!search) return [];
    const chosen = new Set(lines.map((l) => l.item_id));
    return (itemsData?.data ?? [])
      .filter(
        (i) =>
          !chosen.has(i.id) &&
          (i.name.toLowerCase().includes(search.toLowerCase()) ||
            i.code.toLowerCase().includes(search.toLowerCase()))
      )
      .slice(0, 25);
  }, [itemsData, search, lines]);

  const addLine = (item: (typeof items)[number]) => {
    setLines((prev) => [
      ...prev,
      {
        item_id: item.id,
        item_name: item.name,
        quantity: 1,
        available: item.stock?.available_quantity ?? 0,
      },
    ]);
    setSearch('');
  };

  const updateQty = (itemId: string, qty: number) =>
    setLines((prev) => prev.map((l) => (l.item_id === itemId ? { ...l, quantity: qty } : l)));

  const removeLine = (itemId: string) =>
    setLines((prev) => prev.filter((l) => l.item_id !== itemId));

  const reset = () => {
    setDestinationStoreId('');
    setPurpose('');
    setSearch('');
    setLines([]);
  };

  // Catch the obvious mistake in the browser; the RPC is still the real guard
  // (it blocks rather than clamps, inside one transaction).
  const overQty = lines.filter((l) => l.quantity > l.available);
  const canSubmit =
    !!destinationStoreId &&
    lines.length > 0 &&
    lines.every((l) => l.quantity > 0) &&
    overQty.length === 0 &&
    !pushTransfer.isPending;

  const handleSubmit = async () => {
    if (!userProfile?.id) return;
    try {
      await pushTransfer.mutateAsync({
        warehouse_store_id: warehouseStoreId,
        destination_store_id: destinationStoreId,
        actor_id: userProfile.id,
        purpose: purpose || 'Warehouse distribution',
        items: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
        dispatch_now: true,
      });
      toast.success('Stock sent. The receiving store now confirms receipt.');
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send stock.');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Send Stock to a Store</SheetTitle>
          <SheetDescription>
            Allocate stock from this warehouse and dispatch it. The receiving store confirms
            receipt, which credits its inventory.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>Send to *</Label>
            <Select value={destinationStoreId} onValueChange={setDestinationStoreId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a store" />
              </SelectTrigger>
              <SelectContent>
                {destStores.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No other stores in this institution yet
                  </div>
                ) : (
                  destStores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {destinationStoreId && (
            <>
              <div>
                <Label>Purpose</Label>
                <Input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Monthly clinic replenishment"
                />
              </div>

              <div>
                <Label>Search warehouse stock</Label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by item name or code..."
                />
              </div>

              {search && items.length > 0 && (
                <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
                  {items.map((item) => {
                    const available = item.stock?.available_quantity ?? 0;
                    const canSend = !!item.base_unit_id && available > 0;
                    return (
                      <button
                        key={item.id}
                        onClick={() => canSend && addLine(item)}
                        disabled={!canSend}
                        className="w-full text-left px-3 py-2 text-sm flex justify-between items-center disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-muted/50"
                      >
                        <span className="truncate">{item.name}</span>
                        <span className="text-xs shrink-0 ml-2">
                          {!item.base_unit_id
                            ? 'No unit'
                            : available <= 0
                              ? 'No stock'
                              : `${available} available`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {search && items.length === 0 && (
                <p className="text-sm text-muted-foreground">No matching stock in this warehouse.</p>
              )}

              {lines.length > 0 && (
                <div>
                  <Label>
                    Sending {lines.length} item{lines.length !== 1 ? 's' : ''}
                  </Label>
                  <div className="border rounded-lg divide-y mt-1">
                    {lines.map((l) => (
                      <div key={l.item_id} className="flex items-center gap-2 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{l.item_name}</p>
                          <p
                            className={`text-xs ${
                              l.quantity > l.available ? 'text-destructive' : 'text-muted-foreground'
                            }`}
                          >
                            {l.available} available
                          </p>
                        </div>
                        <Input
                          type="number"
                          min={1}
                          max={l.available}
                          value={l.quantity}
                          onChange={(e) => updateQty(l.item_id, Number(e.target.value))}
                          className="w-20 h-7 text-sm"
                        />
                        <button
                          onClick={() => removeLine(l.item_id)}
                          className="text-destructive text-xs ml-1"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  {overQty.length > 0 && (
                    <p className="text-xs text-destructive mt-1">
                      Reduce the highlighted quantities — the warehouse does not hold that much.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={!canSubmit} className="flex-1">
              {pushTransfer.isPending ? 'Sending...' : 'Send Stock'}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
