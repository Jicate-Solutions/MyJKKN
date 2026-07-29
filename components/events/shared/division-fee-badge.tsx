'use client';

// Entry-fee badge for one division, shown in the Event Logistics
// "Registrations" tab.
//
// Fees are NOT a registration-form field — they live on the division
// (config.entry_fee) because each division prices independently (Cricket ₹500,
// Chess free). Once a division's fee is above 0, the public self-registration
// form turns itself into a Razorpay checkout; nothing else has to be wired.
//
// History: first surfaced on the tournaments LIST -> Edit dialog only, so the
// page organizers actually work on showed no pricing. Then added to the division
// cards on the tournament detail page. Moved here 2026-07-28 and lifted out of
// the tournament route into shared/, because pricing belongs with the
// registration view and a shared board must not import a route-local component.
// The division cards now carry fixtures only.

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Pencil } from 'lucide-react';
import { useUpdateDivision } from '@/hooks/events/use-tournaments';
import type { TournamentDivision } from '@/types/tournament';

function feeOf(d: TournamentDivision): number {
  return Number((d.config as { entry_fee?: number } | null)?.entry_fee ?? 0) || 0;
}

function feeLabel(fee: number): string {
  return fee > 0 ? `₹${fee.toLocaleString('en-IN')} entry` : 'Free entry';
}

export function DivisionFeeBadge({
  division,
  eventId,
  canManage,
}: {
  division: TournamentDivision;
  eventId: string;
  canManage: boolean;
}) {
  const fee = feeOf(division);
  const updateDivision = useUpdateDivision();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  if (!canManage) {
    return (
      <Badge variant="outline" className="shrink-0 text-[10px] font-normal tabular-nums">
        {feeLabel(fee)}
      </Badge>
    );
  }

  const parsed = value.trim() === '' ? 0 : Number(value);
  const valid = Number.isFinite(parsed) && parsed >= 0;

  async function save() {
    if (!valid) return;
    await updateDivision.mutateAsync({
      id: division.id,
      eventId,
      // config is replaced wholesale, so spread the existing keys — otherwise
      // anything else stored on the division would be wiped.
      dto: {
        config: { ...((division.config as Record<string, unknown>) ?? {}), entry_fee: parsed },
      },
    });
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(fee > 0 ? String(fee) : '');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Set this division's entry fee"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {feeLabel(fee)}
          <Pencil className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`fee-${division.id}`} className="text-sm">
            Entry fee (₹)
          </Label>
          <Input
            id={`fee-${division.id}`}
            type="number"
            min="0"
            step="1"
            placeholder="0 = free entry"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Applies to this division only. Above 0, the public registration form collects it online.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={updateDivision.isPending}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={!valid || updateDivision.isPending}>
            {updateDivision.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
