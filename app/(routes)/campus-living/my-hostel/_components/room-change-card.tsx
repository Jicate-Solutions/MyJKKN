'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DoorOpen, Loader2, TriangleAlert, CheckCircle2, BedDouble } from 'lucide-react';
import {
  useRoomChangeStatus,
  useRoomChangeOptions,
  useChangeRoom,
} from '@/hooks/campus-living/use-room-change';
import type { UpgradeRoomOption } from '@/types/campus-living/category-upgrade';

const floorLabel = (floor: number) => (floor === 0 ? 'Ground floor' : `Floor ${floor}`);

// One-time, same-category room change. Rendered only for categories flagged
// allow_self_room_change (Premium / Premium + AC) — the RPC is the real gate; this
// component just refuses to render when the status says it is unavailable.
export function RoomChangeCard() {
  const { data: status, isLoading } = useRoomChangeStatus();
  const eligibleCategory =
    !!status && status.reason !== 'category_not_eligible' && status.reason !== 'not_resident';
  const { data: rooms = [], isLoading: roomsLoading } = useRoomChangeOptions(
    !!status?.allowed
  );
  const changeRoom = useChangeRoom();
  const [picked, setPicked] = useState<UpgradeRoomOption | null>(null);
  const [confirming, setConfirming] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, UpgradeRoomOption[]>();
    for (const r of rooms) {
      const key = r.block_name ?? 'Block';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [rooms]);

  if (isLoading || !status || !eligibleCategory || status.reason === 'no_allocation') return null;

  const currentRoom = [
    status.current_block_name,
    status.current_room_number ? `Room ${status.current_room_number}` : null,
    status.current_bed_number ? `Bed ${status.current_bed_number}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const confirm = async () => {
    if (!picked || changeRoom.isPending) return;
    try {
      await changeRoom.mutateAsync({ roomId: picked.room_id });
      setPicked(null);
      setConfirming(false);
    } catch {
      // toast handled in the hook
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DoorOpen className="h-5 w-5 text-primary" /> Change My Room
        </CardTitle>
        <CardDescription>
          Picked the wrong room? Move to another {status.category_name ?? 'room'} — same
          category, no extra fee.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Your room: </span>
          <span className="font-medium">{currentRoom || '—'}</span>
        </div>

        {status.used ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Room change already used</AlertTitle>
            <AlertDescription>
              You&apos;ve used your one room change for this academic year. Contact the hostel
              office if you need to move again.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Shown BEFORE the options — the allowance is spent on confirm. */}
            <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/30">
              <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-amber-800 dark:text-amber-300">
                You can change your room only once
              </AlertTitle>
              <AlertDescription className="text-amber-800 dark:text-amber-300">
                This option is available <span className="font-semibold">one time only</span> for
                this academic year. Once you confirm, your current room is vacated, the new room
                is assigned to you, and this option will no longer be available. Choose carefully.
              </AlertDescription>
            </Alert>

            {status.reason === 'no_rooms' ? (
              <p className="py-2 text-sm text-muted-foreground">
                No other {status.category_name ?? ''} rooms are free right now — please check back
                later or contact the hostel office.
              </p>
            ) : roomsLoading ? (
              <div className="flex items-center py-4 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading available rooms…
              </div>
            ) : rooms.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                No other rooms are free right now.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {rooms.length} available {status.category_name ?? ''} room
                  {rooms.length === 1 ? '' : 's'} — pick one:
                </p>
                <div className="max-h-[320px] space-y-4 overflow-y-auto">
                  {Array.from(grouped.entries()).map(([block, list]) => (
                    <div key={block} className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">{block}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {list.map((r) => (
                          <button
                            key={r.room_id}
                            type="button"
                            onClick={() => setPicked(r)}
                            className={`rounded-md border p-3 text-left transition-colors hover:bg-muted/50 ${
                              picked?.room_id === r.room_id
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : ''
                            }`}
                          >
                            <p className="font-medium">Room {r.room_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {floorLabel(r.floor)} · {r.capacity} beds
                            </p>
                            <Badge variant="outline" className="mt-1.5">
                              <BedDouble className="mr-1 h-3 w-3" />
                              {r.available_beds} free
                            </Badge>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full sm:w-auto"
                  disabled={!picked || changeRoom.isPending}
                  onClick={() => setConfirming(true)}
                >
                  {changeRoom.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {picked ? `Move to Room ${picked.room_number}` : 'Select a room'}
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog
        open={confirming}
        onOpenChange={(o) => {
          if (!o && !changeRoom.isPending) setConfirming(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to Room {picked?.room_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              {currentRoom || 'Your current room'} will be vacated and{' '}
              <span className="font-medium text-foreground">
                {picked?.block_name} · Room {picked?.room_number}
              </span>{' '}
              assigned to you immediately.
              <br />
              <br />
              <span className="font-semibold text-foreground">
                This is your only room change for this academic year — it cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={changeRoom.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
              disabled={changeRoom.isPending}
            >
              {changeRoom.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Moving…
                </>
              ) : (
                'Yes, move me'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
