'use client';

// Clickable room number in the rooms table → opens a quick-look details modal
// rendered from the row data already in hand (no extra fetch). A footer link
// jumps to the full room page (beds / furniture / maintenance / edit) for
// anyone who wants the heavy view.

import { useState } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import type { HostelRoomWithBedsAndOccupancy } from '@/lib/services/campus-living/hostel-room-service';
import { RoomDetailsContent } from './room-details-content';

export function RoomNumberCell({
  room,
  blockId,
}: {
  room: HostelRoomWithBedsAndOccupancy;
  blockId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-medium text-primary underline-offset-4 hover:underline focus:underline focus:outline-none"
      >
        {room.room_number}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Room {room.room_number}</DialogTitle>
            <DialogDescription>Room details</DialogDescription>
          </DialogHeader>

          <RoomDetailsContent room={room} />

          <div className="flex justify-end pt-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/campus-living/blocks/${blockId}/rooms/${room.id}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open full page
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
