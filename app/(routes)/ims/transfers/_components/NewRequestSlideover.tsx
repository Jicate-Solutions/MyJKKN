'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateImsTransfer } from '@/hooks/ims/use-ims-transfers';
import { useImsItems } from '@/hooks/ims/use-ims-inventory';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';
import type { ImsIndentUrgency } from '@/types/ims';

interface NewRequestSlideoverProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  institutionId: string;
  centralStoreId: string;
  centralInstitutionId: string;
}

interface LineItem {
  item_id: string;
  item_name: string;
  quantity: number;
  unit_id: string;
  unit_name: string;
}

export function NewRequestSlideover({
  open,
  onClose,
  storeId,
  institutionId,
  centralStoreId,
  centralInstitutionId,
}: NewRequestSlideoverProps) {
  const { userProfile } = usePermissions();
  const createTransfer = useCreateImsTransfer();

  const [purpose, setPurpose] = useState('');
  const [urgency, setUrgency] = useState<ImsIndentUrgency>('normal');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [search, setSearch] = useState('');

  // Fetch distributable, non-bundle items from the central store catalog
  const { data: itemsData } = useImsItems({
    store_id: centralStoreId,
    is_distributable: true,
    is_bundle: false,
  });

  const items = (itemsData?.data ?? []).filter(
    (i) => i.name.toLowerCase().includes(search.toLowerCase())
  );

  const addLine = (item: { id: string; name: string; indent_unit_id: string | null }) => {
    if (lines.find((l) => l.item_id === item.id)) return;
    setLines((prev) => [
      ...prev,
      {
        item_id: item.id,
        item_name: item.name,
        quantity: 1,
        unit_id: item.indent_unit_id ?? '',
        unit_name: '',
      },
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

  const handleSubmit = async () => {
    if (!purpose.trim() || lines.length === 0) {
      toast.error('Add a purpose and at least one item.');
      return;
    }
    if (lines.some((l) => !l.unit_id)) {
      toast.error('Some items are missing a unit. Please check the central store catalog.');
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
          destination_institution_id: centralInstitutionId,
          destination_store_id: centralStoreId,
          items: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity, unit_id: l.unit_id })),
        },
        userId: userProfile?.id ?? '',
      });
      toast.success('Supply request submitted.');
      setLines([]);
      setPurpose('');
      setSearch('');
      onClose();
    } catch {
      toast.error('Failed to submit request. Please try again.');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Transfer Request</SheetTitle>
          <p className="text-sm text-muted-foreground">Requesting from: Central Store</p>
        </SheetHeader>

        <div className="mt-6 space-y-4">
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
              placeholder="Search central store catalog..."
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
            <p className="text-sm text-muted-foreground">No items found in the central store catalog.</p>
          )}

          {lines.length > 0 && (
            <div>
              <Label>Request Summary</Label>
              <div className="border rounded-lg divide-y mt-1">
                {lines.map((l) => (
                  <div key={l.item_id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 text-sm">{l.item_name}</span>
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

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={createTransfer.isPending}
            >
              {createTransfer.isPending ? 'Submitting...' : 'Submit Request →'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
