'use client';

/**
 * VenueRoomPicker — single-select, searchable picker for a Resource Management
 * "Spaces & Venues" room, used by the Manage Meeting Types form for in-person
 * meetings (venue-from-resource PR1).
 *
 * - Reads the canonical registry via ResourceService (browser client, RLS) so a
 *   host sees ALL JKKN rooms (the resources SELECT policy is org-wide for any
 *   authenticated user) — no institution restriction, per the Director's spec.
 * - Each row shows the room name + a muted directions line + its institution, so
 *   same-named rooms across colleges are distinguishable.
 * - Selecting a room sets the resource id; "Custom place instead" clears it so
 *   the host can type a free-text location (the fallback handled by the parent).
 *
 * Combobox shape mirrors app/(routes)/cdc/bulletin/new/_components/audience-multi-select.tsx
 * (Popover + cmdk Command), reduced to single-select.
 */

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ResourceService } from '@/lib/services/resource-management/resource-service';
import { ParentCategoryService } from '@/lib/services/resource-management/parent-category-service';
import { formatVenueDirections } from '@/lib/services/meetings/venue-directions';
import type { Resource } from '@/types/resource-management';

const SPACES_VENUES_CATEGORY_NAME = 'Spaces & Venues';

interface RoomOption {
  id: string;
  name: string;
  directions: string | null;
  institutionName: string | null;
  /** Searchable haystack (name + directions + institution). */
  search: string;
}

interface VenueRoomPickerProps {
  /** Selected resource id, or '' when none (custom place / not chosen). */
  value: string;
  onChange: (resourceId: string) => void;
  /** Name to show before the room list has loaded (round-tripped on edit). */
  initialName?: string | null;
  disabled?: boolean;
  /**
   * STRICT mode (e.g. induction sessions): there is no free-text fallback, so the
   * clear option reads "Clear venue (no room)" instead of "Custom place instead".
   * Selecting it still clears to '' — a record may legitimately have no venue.
   * Defaults to false to preserve the Meetings (custom-place-fallback) behavior.
   */
  strict?: boolean;
}

export function VenueRoomPicker({ value, onChange, initialName, disabled, strict = false }: VenueRoomPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [rooms, setRooms] = React.useState<RoomOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Resolve the "Spaces & Venues" category id by name (robust to reseeds),
        // then pull every room in it (limit high enough for the full registry).
        const cats = await ParentCategoryService.getParentCategories({
          search: SPACES_VENUES_CATEGORY_NAME,
          status: 'all',
        });
        const cat = (cats.data ?? []).find(
          (c) => c.name?.trim().toLowerCase() === SPACES_VENUES_CATEGORY_NAME.toLowerCase(),
        );
        if (!cat) {
          if (!cancelled) {
            setLoadError('Venue registry not found.');
            setLoading(false);
          }
          return;
        }
        const res = await ResourceService.getResources({
          parent_category_id: cat.id,
          status: 'available',
          limit: 500,
          sortBy: 'name',
          sortOrder: 'asc',
        });
        if (cancelled) return;
        const opts: RoomOption[] = (res.data ?? []).map((r: Resource) => {
          const directions = formatVenueDirections(r);
          const institutionName = r.institution?.name ?? null;
          return {
            id: r.id,
            name: r.name,
            directions,
            institutionName,
            search: [r.name, directions, institutionName].filter(Boolean).join(' '),
          };
        });
        setRooms(opts);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('[venue-room-picker] load failed:', err);
          setLoadError('Could not load the venue list.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = React.useMemo(
    () => rooms.find((r) => r.id === value) ?? null,
    [rooms, value],
  );

  // Label on the trigger: the loaded room, else the round-tripped name, else placeholder.
  const triggerLabel = selected?.name ?? (value ? initialName ?? null : null);

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || loading}
            className={cn('w-full justify-between', !triggerLabel && 'text-muted-foreground')}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading rooms…
              </span>
            ) : triggerLabel ? (
              <span className="flex items-center gap-2 truncate">
                <MapPin className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                <span className="truncate">{triggerLabel}</span>
              </span>
            ) : (
              'Pick a room from Resource Management'
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(460px,calc(100vw-2rem))] p-0"
          align="start"
          side="bottom"
          sideOffset={4}
          collisionPadding={16}
          avoidCollisions
        >
          <Command className="max-h-[340px] overflow-hidden">
            <CommandInput placeholder="Search rooms by name, block, institution…" />
            <CommandList className="max-h-[280px] overflow-y-auto">
              <CommandEmpty>No matching rooms.</CommandEmpty>
              {value && (
                <CommandGroup>
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onChange('');
                      setOpen(false);
                    }}
                    className="text-muted-foreground"
                  >
                    {strict ? 'Clear venue (no room)' : 'Custom place instead (type the location)'}
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup>
                {rooms.map((r) => {
                  const isSelected = r.id === value;
                  return (
                    <CommandItem
                      key={r.id}
                      value={r.search}
                      onSelect={() => {
                        onChange(r.id);
                        setOpen(false);
                      }}
                      className="flex items-start gap-2"
                    >
                      <Check
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0',
                          isSelected ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{r.name}</span>
                        {(r.directions || r.institutionName) && (
                          <span className="truncate text-xs text-muted-foreground">
                            {[r.directions, r.institutionName].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {loadError && <p className="text-xs text-destructive">{loadError}</p>}
      {selected?.directions && (
        <p className="text-xs text-muted-foreground">
          Visitors will see: {selected.directions}
          {selected.institutionName ? ` · ${selected.institutionName}` : ''}
        </p>
      )}
    </div>
  );
}

export default VenueRoomPicker;
