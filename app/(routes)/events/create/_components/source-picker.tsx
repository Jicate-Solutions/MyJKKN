'use client';

// "Create from an existing record" — see event-sources.ts. Optional: the
// organizer can ignore it and fill the tabs by hand.

import { Link2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCdcDrives } from '@/hooks/cdc/use-cdc-drives';
import { formatIstDate } from '@/lib/utils/date-format';
import {
  EVENT_SOURCES,
  prefillFromCdcDrive,
  type EventSourceLink,
  type EventSourcePrefill,
  type EventSourceType,
} from './event-sources';

const NONE = '__none__';

function CdcDriveList({ onPick }: { onPick: (p: EventSourcePrefill) => void }) {
  const { data, isLoading, isError, error } = useCdcDrives({ pageSize: 100 });
  const drives = (data?.data ?? []).filter((d) => d.status !== 'cancelled');

  if (isError) {
    return (
      <p className="text-xs text-destructive">
        {(error as Error)?.message || 'Could not load campus drives.'}
      </p>
    );
  }

  return (
    <Select
      onValueChange={(id) => {
        const drive = drives.find((d) => d.id === id);
        if (drive) onPick(prefillFromCdcDrive(drive));
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? 'Loading drives…' : 'Choose a campus drive'} />
      </SelectTrigger>
      <SelectContent>
        {drives.length === 0 && !isLoading ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No campus drives found.</div>
        ) : (
          drives.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.title}
              {d.drive_date ? ` · ${formatIstDate(d.drive_date)}` : ''}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

export function SourcePicker({
  sourceType,
  onSourceTypeChange,
  linked,
  onPick,
  onClear,
}: {
  sourceType: EventSourceType | null;
  onSourceTypeChange: (t: EventSourceType | null) => void;
  linked: EventSourceLink | null;
  onPick: (p: EventSourcePrefill) => void;
  onClear: () => void;
}) {
  const def = EVENT_SOURCES.find((s) => s.type === sourceType);

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Link2 className="h-4 w-4 opacity-60" /> Create from an existing record
        <span className="text-xs font-normal text-muted-foreground">(optional)</span>
      </div>

      {linked ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-primary/5 p-2 text-sm">
          <span>
            Linked to {def?.label.toLowerCase() ?? 'record'}:{' '}
            <span className="font-medium">{linked.label}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={onClear} className="h-7 gap-1">
            <X className="h-3.5 w-3.5" /> Unlink
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Source</Label>
            <Select
              value={sourceType ?? NONE}
              onValueChange={(v) => onSourceTypeChange(v === NONE ? null : (v as EventSourceType))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None — fill it in myself</SelectItem>
                {EVENT_SOURCES.map((s) => (
                  <SelectItem key={s.type} value={s.type}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {sourceType === 'cdc_drive' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Campus drive</Label>
              <CdcDriveList onPick={onPick} />
            </div>
          )}
        </div>
      )}

      {def && !linked && (
        <p className="text-xs text-muted-foreground">{def.description}</p>
      )}
      {linked && (
        <p className="text-xs text-muted-foreground">
          Fields were prefilled — check each tab before creating. Unlinking keeps what was filled.
        </p>
      )}
    </div>
  );
}
