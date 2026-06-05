'use client';

// Shared compact room-details grid. Rendered in two places off the same row
// data (no extra fetch): the row-action "View" popup and the click-the-room-
// number quick-look modal. Keeping it in one component stops the two detail
// views drifting apart.

import { Badge } from '@/components/ui/badge';
import type { HostelRoomWithBedsAndOccupancy } from '@/lib/services/campus-living/hostel-room-service';
import { formatRoomPurpose, formatTierAccess } from './room-meta';

const FLOOR_LABELS = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor'];

const inr = (v: number | null | undefined) =>
  v != null
    ? new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(v)
    : '—';

export function RoomDetailsContent({
  room,
}: {
  room: HostelRoomWithBedsAndOccupancy;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div className="text-muted-foreground">Room No.:</div>
      <div className="font-medium">{room.room_number}</div>

      <div className="text-muted-foreground">Floor:</div>
      <div>{FLOOR_LABELS[room.floor] ?? `Floor ${room.floor}`}</div>

      <div className="text-muted-foreground">Type:</div>
      <div className="capitalize">{room.room_type}</div>

      <div className="text-muted-foreground">AC:</div>
      <div className="capitalize">{room.ac_status.replace('_', ' ')}</div>

      <div className="text-muted-foreground">Category:</div>
      <div>{room.hostel_categories?.name ?? '—'}</div>

      <div className="text-muted-foreground">Purpose:</div>
      <div>{formatRoomPurpose(room.room_purpose)}</div>

      <div className="text-muted-foreground">Tier:</div>
      <div>{formatTierAccess(room.tier_access)}</div>

      <div className="text-muted-foreground">Occupancy:</div>
      <div>
        {room.active_residents}/{room.capacity}
      </div>

      <div className="text-muted-foreground">Actual Capacity:</div>
      <div>{room.actual_capacity ?? '—'}</div>

      <div className="text-muted-foreground">Status:</div>
      <div>
        <Badge variant="outline" className="capitalize">
          {room.derived_status.replace('_', ' ')}
        </Badge>
      </div>

      <div className="text-muted-foreground">Attached Bathroom:</div>
      <div>{room.has_attached_bathroom ? 'Yes' : 'No'}</div>

      <div className="text-muted-foreground">Annual Fee:</div>
      <div>{inr(room.annual_fee)}</div>

      <div className="text-muted-foreground">Renovation:</div>
      <div>{room.renovated ?? '—'}</div>

      <div className="text-muted-foreground">Painting:</div>
      <div>{room.painting ?? '—'}</div>
    </div>
  );
}
