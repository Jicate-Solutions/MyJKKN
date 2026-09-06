'use client';

/**
 * VenueRoomPicker (events) — single-select, searchable picker for a Resource
 * Management "Spaces & Venues" room, used by the Create-an-Event flow to link an
 * on-campus event to a real room (the booking-spine room core, 2026-06-28).
 *
 * This is an events-local copy of the proven meetings picker
 * (app/(routes)/meetings/manage/_components/venue-room-picker.tsx) so the events
 * module doesn't import another route's private _components. Behaviour is
 * identical: reads the canonical registry via ResourceService (browser/RLS), so
 * the organiser sees ALL JKKN rooms; selecting a room sets its resource id;
 * "Custom place instead" clears it so the parent can fall back to free text.
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
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { formatVenueDirections } from '@/lib/services/meetings/venue-directions';
import type { Resource } from '@/types/resource-management';

const SPACES_VENUES_CATEGORY_NAME = 'Spaces & Venues';

interface RoomOption {
  id: string;
  name: string;
  directions: string | null;
  institutionName: string | null;
  search: string;
}

interface VenueRoomPickerProps {
  /** Selected resource id, or '' when none (custom place / not chosen). */
  value: string;
  onChange: (resourceId: string) => void;
  /** Name to show before the room list has loaded (round-tripped on edit). */
  initialName?: string | null;
  disabled?: boolean;
}

export function VenueRoomPicker({ value, onChange, initialName, disabled }: VenueRoomPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [rooms, setRooms] = React.useState<RoomOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
        const opts: RoomOption[] = (res.data ?? [])
          // Only offer rooms the booking spine can actually hold — exclude
          // walk-in-only and non-reservable rooms (they'd be rejected after the
          // event is created). Defensive: today all venue rooms are reservable.
          .filter(
            (r: Resource) =>
              (r as { is_reservable?: boolean }).is_reservable !== false &&
              (r as { booking_type?: string }).booking_type !== 'walk_in',
          )
          .map((r: Resource) => {
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
        // An empty result is AMBIGUOUS and must never be shown as a bare
        // "No matching rooms." Both SELECT policies on `resources` require
        // auth.uid(), and PostgREST answers an unauthenticated read with
        // 200 [] — not an error — so a lapsed browser session renders as an
        // empty picker while the registry actually holds 100+ bookable rooms.
        // (The category step does NOT catch this: its policy is
        // `status = 'active'`, which anon passes, so the registry lookup still
        // succeeds and the organizer gets no clue anything is wrong.)
        // Tell them which of the two it is, because the actions differ.
        if (opts.length === 0) {
          const {
            data: { session },
          } = await createClientSupabaseClient().auth.getSession();
          if (cancelled) return;
          setLoadError(
            session
              ? 'No bookable rooms found in the venue registry.'
              : 'Your session has expired — sign out and sign in again to load the room list.',
          );
        }
        setRooms(opts);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('[events/venue-room-picker] load failed:', err);
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
                    Custom place instead (type the location)
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
          Where: {selected.directions}
          {selected.institutionName ? ` · ${selected.institutionName}` : ''}
        </p>
      )}
    </div>
  );
}

export default VenueRoomPicker;
