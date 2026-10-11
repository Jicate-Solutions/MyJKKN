'use client';

// One store-item search result in the kit rule panel: source picker (for an
// unclassified item), quantity, cadence and Add. While an add is in flight
// (`pending`) both the Add button and the source picker are disabled, so the
// same screen cannot double-submit (#4346 panel round 3).

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { KitSource } from '@/lib/services/ims/kit-service';

export interface KitItemResult {
  id: string;
  name: string;
  code: string | null;
  kit_source: string | null;
}

export function KitItemResultRow({
  item,
  picked,
  onPick,
  sourceOptions,
  qty,
  onQty,
  cadence,
  onCadence,
  pending,
  onAdd,
}: {
  item: KitItemResult;
  picked: KitSource | undefined;
  onPick: (v: KitSource) => void;
  sourceOptions: ReadonlyArray<{ value: KitSource; label: string }>;
  qty: string;
  onQty: (v: string) => void;
  cadence: string;
  onCadence: (v: string) => void;
  pending: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>{item.name}{item.code ? ` (${item.code})` : ''}</span>
      <span className="flex flex-wrap items-center gap-2">
        {item.kit_source ? (
          <Badge variant="secondary">{item.kit_source === 'college' ? 'College store' : 'Central store'}</Badge>
        ) : (
          <Select value={picked ?? ''} onValueChange={(v) => onPick(v as KitSource)} disabled={pending}>
            <SelectTrigger className="w-36 h-8" aria-label="Kit source">
              <SelectValue placeholder="Source…" />
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input className="w-16 h-8" type="number" min={1} value={qty} onChange={(e) => onQty(e.target.value)} />
        <Select value={cadence} onValueChange={onCadence}>
          <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="yearly">Every year</SelectItem>
            <SelectItem value="once">Once</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" disabled={pending || (!item.kit_source && !picked)} onClick={onAdd}>Add</Button>
      </span>
    </div>
  );
}
