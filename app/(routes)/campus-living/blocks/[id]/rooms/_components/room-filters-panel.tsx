'use client';

// Advanced, collapsible filter panel for the block rooms DataTable.
//
// The block's full room set is already loaded client-side
// (useRoomsByBlockWithOccupancy → getRoomsByBlockWithOccupancy), so this
// filters the in-memory list — no server round-trip per filter change.
//
// Floor + status are handled by the chips on the page; this panel covers the
// remaining inventory columns (Type, AC, Category, Purpose, Tier, Bathroom,
// Vacancy). Dropdown options are derived from the rooms actually present in the
// block, so an operator can never pick a value that matches nothing.

import { useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { HostelRoomWithBedsAndOccupancy } from '@/lib/services/campus-living/hostel-room-service';
import { formatRoomPurpose, formatTierAccess } from './room-meta';

export interface RoomAdvancedFilters {
  room_type: string | null;
  ac_status: string | null;
  category: string | null;
  room_purpose: string | null;
  tier_access: string | null;
  bathroom: 'yes' | 'no' | null;
  vacancy: 'has_free' | 'full' | null;
}

export const EMPTY_ROOM_FILTERS: RoomAdvancedFilters = {
  room_type: null,
  ac_status: null,
  category: null,
  room_purpose: null,
  tier_access: null,
  bathroom: null,
  vacancy: null,
};

export function countActiveRoomFilters(f: RoomAdvancedFilters): number {
  return Object.values(f).filter((v) => v !== null).length;
}

// Single source of truth for the predicate so the page (which applies it) and
// the panel (which sets it) can't drift. Returns true when the room passes
// every active (non-null) filter — null means "Any" and is ignored.
export function roomMatchesFilters(
  room: HostelRoomWithBedsAndOccupancy,
  f: RoomAdvancedFilters
): boolean {
  if (f.room_type && room.room_type !== f.room_type) return false;
  if (f.ac_status && room.ac_status !== f.ac_status) return false;
  if (f.category && (room.hostel_categories?.name ?? null) !== f.category)
    return false;
  if (f.room_purpose && room.room_purpose !== f.room_purpose) return false;
  if (f.tier_access && room.tier_access !== f.tier_access) return false;
  if (f.bathroom && (room.has_attached_bathroom ? 'yes' : 'no') !== f.bathroom)
    return false;
  if (f.vacancy) {
    const hasFree = (room.beds_available ?? 0) > 0;
    if (f.vacancy === 'has_free' && !hasFree) return false;
    if (f.vacancy === 'full' && hasFree) return false;
  }
  return true;
}

// Radix Select forbids an empty-string item value, so "Any" uses a sentinel
// that maps back to null.
const ANY = '__any__';

const titleCase = (v: string) =>
  v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

interface Option {
  value: string;
  label: string;
}

// Distinct, label-sorted values present in the loaded rooms for one accessor.
function distinct(
  rooms: HostelRoomWithBedsAndOccupancy[],
  pick: (r: HostelRoomWithBedsAndOccupancy) => string | null | undefined,
  label: (v: string) => string
): Option[] {
  const set = new Set<string>();
  for (const r of rooms) {
    const v = pick(r);
    if (v) set.add(v);
  }
  return Array.from(set)
    .map((value) => ({ value, label: label(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function FilterRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Option[];
  onChange: (next: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-[5rem_1fr] items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select
        value={value ?? ANY}
        onValueChange={(v) => onChange(v === ANY ? null : v)}
      >
        <SelectTrigger className="h-8">
          <SelectValue placeholder="Any" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function RoomFiltersPanel({
  rooms,
  value,
  onChange,
}: {
  rooms: HostelRoomWithBedsAndOccupancy[];
  value: RoomAdvancedFilters;
  onChange: (next: RoomAdvancedFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveRoomFilters(value);

  const typeOptions = useMemo(
    () => distinct(rooms, (r) => r.room_type, titleCase),
    [rooms]
  );
  const acOptions = useMemo(
    () => distinct(rooms, (r) => r.ac_status, titleCase),
    [rooms]
  );
  const categoryOptions = useMemo(
    () => distinct(rooms, (r) => r.hostel_categories?.name, (v) => v),
    [rooms]
  );
  const purposeOptions = useMemo(
    () => distinct(rooms, (r) => r.room_purpose, formatRoomPurpose),
    [rooms]
  );
  const tierOptions = useMemo(
    () => distinct(rooms, (r) => r.tier_access, formatTierAccess),
    [rooms]
  );

  const set = (patch: Partial<RoomAdvancedFilters>) =>
    onChange({ ...value, ...patch });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-5 min-w-5 justify-center px-1 text-xs"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Filters</span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_ROOM_FILTERS)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {typeOptions.length > 0 && (
            <FilterRow
              label="Type"
              value={value.room_type}
              options={typeOptions}
              onChange={(v) => set({ room_type: v })}
            />
          )}
          {acOptions.length > 0 && (
            <FilterRow
              label="AC"
              value={value.ac_status}
              options={acOptions}
              onChange={(v) => set({ ac_status: v })}
            />
          )}
          {categoryOptions.length > 0 && (
            <FilterRow
              label="Category"
              value={value.category}
              options={categoryOptions}
              onChange={(v) => set({ category: v })}
            />
          )}
          {purposeOptions.length > 0 && (
            <FilterRow
              label="Purpose"
              value={value.room_purpose}
              options={purposeOptions}
              onChange={(v) => set({ room_purpose: v })}
            />
          )}
          {tierOptions.length > 0 && (
            <FilterRow
              label="Tier"
              value={value.tier_access}
              options={tierOptions}
              onChange={(v) => set({ tier_access: v })}
            />
          )}
          <FilterRow
            label="Bathroom"
            value={value.bathroom}
            options={[
              { value: 'yes', label: 'Attached' },
              { value: 'no', label: 'None' },
            ]}
            onChange={(v) =>
              set({ bathroom: v as RoomAdvancedFilters['bathroom'] })
            }
          />
          <FilterRow
            label="Vacancy"
            value={value.vacancy}
            options={[
              { value: 'has_free', label: 'Has free beds' },
              { value: 'full', label: 'Fully occupied' },
            ]}
            onChange={(v) =>
              set({ vacancy: v as RoomAdvancedFilters['vacancy'] })
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
