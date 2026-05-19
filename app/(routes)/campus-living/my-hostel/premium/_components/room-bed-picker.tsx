// ============================================================================
// RoomBedPicker — floor-plan style room + bed selector
// ============================================================================
// Two-pane layout:
//   Left:  rooms grouped by block, each as a tile (room# + occupancy +
//          AC/bathroom icons). Click a tile → loads beds for that room.
//   Right: beds for the selected room as click-able tiles. Available =
//          green border, occupied = greyed, selected = solid.
// ============================================================================

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Bed,
  BedDouble,
  AirVent,
  Bath,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import type { PremiumAvailableRoom } from '@/lib/services/campus-living/hostel-premium-allocation-service';

interface BedRow {
  id: string;
  room_id: string;
  bed_number: string;
  bed_type: string;
  status: string;
  current_occupant_id: string | null;
}

interface RoomBedPickerProps {
  roomsByBlock: Map<string, PremiumAvailableRoom[]>;
  selectedRoomId: string | null;
  selectedBedId: string | null;
  beds: BedRow[];
  bedsLoading: boolean;
  onSelectRoom: (roomId: string) => void;
  onSelectBed: (bedId: string) => void;
}

export function RoomBedPicker({
  roomsByBlock,
  selectedRoomId,
  selectedBedId,
  beds,
  bedsLoading,
  onSelectRoom,
  onSelectBed,
}: RoomBedPickerProps) {
  if (roomsByBlock.size === 0) {
    return (
      <Card>
        <CardContent className='p-8 text-center text-muted-foreground'>
          No premium-eligible rooms available right now. Try different filters
          or check back later.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='grid md:grid-cols-3 gap-4'>
      {/* Rooms — left column (2/3) */}
      <Card className='md:col-span-2'>
        <CardHeader>
          <CardTitle className='text-base'>Rooms by block</CardTitle>
        </CardHeader>
        <CardContent className='space-y-5'>
          {Array.from(roomsByBlock.entries()).map(([blockLabel, blockRooms]) => (
            <div key={blockLabel}>
              <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2'>
                {blockLabel.replace(/ \(block:.+\)$/, '')}
              </p>
              <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2'>
                {blockRooms
                  .sort((a, b) => (a.floor - b.floor) || a.room_number.localeCompare(b.room_number))
                  .map((room) => {
                    const isSelected = room.room_id === selectedRoomId;
                    const isFull = room.current_occupancy >= room.capacity;
                    return (
                      <button
                        key={room.room_id}
                        type='button'
                        disabled={isFull}
                        onClick={() => onSelectRoom(room.room_id)}
                        className={cn(
                          'p-3 rounded-md border text-left transition-colors',
                          'hover:border-primary/60 hover:bg-primary/5',
                          isSelected && 'border-primary bg-primary/10',
                          isFull && 'opacity-50 cursor-not-allowed hover:bg-transparent',
                        )}
                      >
                        <div className='flex items-center justify-between'>
                          <span className='font-semibold text-sm'>
                            Room {room.room_number}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className='h-4 w-4 text-primary' />
                          )}
                        </div>
                        <div className='text-[11px] text-muted-foreground mt-1'>
                          Floor {room.floor} • {room.current_occupancy}/{room.capacity} occupied
                        </div>
                        <div className='flex items-center gap-1.5 mt-1.5'>
                          {room.ac_status === 'AC' && (
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                              <AirVent className='h-2.5 w-2.5 mr-0.5' />
                              AC
                            </Badge>
                          )}
                          {room.has_attached_bathroom && (
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                              <Bath className='h-2.5 w-2.5 mr-0.5' />
                              Attached
                            </Badge>
                          )}
                          {room.tier_access === 'premium_only' && (
                            <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                              Premium only
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Beds — right column (1/3) */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base flex items-center gap-2'>
            <BedDouble className='h-4 w-4' />
            Beds
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedRoomId ? (
            <div className='text-sm text-muted-foreground py-8 text-center'>
              Pick a room to see beds
            </div>
          ) : bedsLoading ? (
            <div className='flex items-center justify-center py-8'>
              <Loader2 className='h-5 w-5 animate-spin text-primary' />
            </div>
          ) : beds.length === 0 ? (
            <div className='text-sm text-muted-foreground py-8 text-center'>
              No beds found for this room.
            </div>
          ) : (
            <div className='grid grid-cols-2 gap-2'>
              {beds.map((bed) => {
                const available = bed.status === 'available' && !bed.current_occupant_id;
                const isSelected = bed.id === selectedBedId;
                return (
                  <button
                    key={bed.id}
                    type='button'
                    disabled={!available}
                    onClick={() => onSelectBed(bed.id)}
                    className={cn(
                      'p-2.5 rounded-md border text-center transition-colors',
                      available
                        ? 'border-emerald-300 hover:bg-emerald-50'
                        : 'border-muted bg-muted/40 text-muted-foreground cursor-not-allowed',
                      isSelected && 'bg-primary/10 border-primary text-primary',
                    )}
                  >
                    <Bed className='h-4 w-4 mx-auto mb-1' />
                    <div className='text-xs font-semibold'>Bed {bed.bed_number}</div>
                    <div className='text-[10px] text-muted-foreground capitalize'>
                      {bed.bed_type}
                    </div>
                    <div className='text-[10px] mt-1'>
                      {available ? (
                        <span className='text-emerald-700'>Available</span>
                      ) : (
                        <span>Occupied</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
