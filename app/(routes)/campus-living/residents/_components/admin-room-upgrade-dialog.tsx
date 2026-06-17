'use client';

// Phase 2: office-side single-learner ROOM upgrade into a MANUAL (room-picked)
// category e.g. Premium — the gap the bulk path can't cover (it needs a specific
// bed per learner). Mirrors the self My Hostel room upgrade: pick category ->
// pick room -> confirm, with the same pay-to-confirm lifecycle.

import { useMemo, useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, ArrowUpCircle, BedDouble, DoorOpen, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  useAdminRoomUpgradeOptions, useAdminRoomOptions, useAdminUpgradeRoom,
} from '@/hooks/campus-living/use-admin-category-upgrade';
import type { LearnerHostelite } from '@/types/campus-living';
import type {
  UpgradeRoomCategoryOption, UpgradeRoomOption,
} from '@/types/campus-living/category-upgrade';

const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;
const floorLabel = (f: number) => (f === 0 ? 'Ground floor' : `Floor ${f}`);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learner: LearnerHostelite | null;
  onCommitted: () => void;
}

type Step = 'category' | 'room' | 'confirm';

export function AdminRoomUpgradeDialog({ open, onOpenChange, learner, onCommitted }: Props) {
  const learnerId = learner?.id ?? null;
  const { data: options = [], isLoading: optsLoading } = useAdminRoomUpgradeOptions(open ? learnerId : null);
  const [picked, setPicked] = useState<UpgradeRoomCategoryOption | null>(null);
  const { data: rooms = [], isLoading: roomsLoading } = useAdminRoomOptions(
    open ? learnerId : null,
    picked?.category_id ?? null,
  );
  const upgrade = useAdminUpgradeRoom();
  const [roomId, setRoomId] = useState('');
  const [step, setStep] = useState<Step>('category');

  useEffect(() => {
    if (open) { setPicked(null); setRoomId(''); setStep('category'); }
  }, [open]);

  const selectedRoom = rooms.find((r) => r.room_id === roomId) ?? null;
  const grouped = useMemo(
    () => rooms.reduce<Record<string, UpgradeRoomOption[]>>((acc, r) => {
      (acc[`${r.block_name} · ${floorLabel(r.floor)}`] ??= []).push(r);
      return acc;
    }, {}),
    [rooms],
  );

  const hasFee = (picked?.upgrade_fee ?? 0) > 0;

  async function confirm() {
    if (!learnerId || !picked || !selectedRoom || upgrade.isPending) return;
    try {
      const res = await upgrade.mutateAsync({
        learnerId, categoryId: picked.category_id, roomId: selectedRoom.room_id,
      });
      if (res.state === 'upgraded' || res.state === 'booked') {
        toast.success('Room upgraded — moved into the new room');
      } else if (res.state === 'pending_payment') {
        toast.success(`Room reserved — upgrade bill of ${inr(res.upgrade_fee)} generated; confirms when paid`);
      } else {
        toast.success('Room reserved — confirms once the learner’s fee payment reaches the required level');
      }
      onCommitted();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upgrade failed');
    }
  }

  const name = learner
    ? [learner.first_name, learner.last_name].filter(Boolean).join(' ') || '(unnamed)'
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[640px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Upgrade room — {name}</DialogTitle>
          <DialogDescription>
            {step === 'category'
              ? 'Pick a room category to move this learner into. Only room-picked (e.g. Premium) categories are shown here — Classic/Deluxe and mess use the bulk flow.'
              : step === 'room'
                ? `Only ${picked?.name} rooms with a free bed are shown. Pick a room.`
                : 'Review and confirm — the learner is moved into the room immediately and the upgrade fee is billed.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'category' && (
          optsLoading ? (
            <div className='flex items-center text-sm text-muted-foreground py-6'>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading options…
            </div>
          ) : options.length === 0 ? (
            <p className='text-sm text-muted-foreground py-6'>
              No room-picked upgrade categories available for this learner (gender / fee / current category).
            </p>
          ) : (
            <div className='space-y-2'>
              {options.map((opt) => {
                const hasRooms = opt.available_beds > 0;
                return (
                  <div key={opt.category_id} className='flex items-center justify-between gap-3 rounded-md border p-3'>
                    <div className='min-w-0'>
                      <p className='font-medium'>
                        {learner?.hostel_category_name && (
                          <span className='text-muted-foreground'>{learner.hostel_category_name} → </span>
                        )}
                        {opt.name}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        Upgrade fee {inr(opt.upgrade_fee)} · {opt.available_beds} bed{opt.available_beds === 1 ? '' : 's'} free
                      </p>
                    </div>
                    {hasRooms ? (
                      <Button size='sm' onClick={() => { setPicked(opt); setRoomId(''); setStep('room'); }}>
                        <ArrowUpCircle className='mr-1.5 h-4 w-4' /> Choose
                      </Button>
                    ) : (
                      <Badge variant='outline'>No room free</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {step === 'room' && (
          roomsLoading ? (
            <div className='flex items-center text-sm text-muted-foreground py-6'>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading rooms…
            </div>
          ) : rooms.length === 0 ? (
            <p className='text-sm text-muted-foreground py-6'>No available rooms right now.</p>
          ) : (
            <div className='space-y-4 max-h-[360px] overflow-y-auto'>
              {Object.entries(grouped).map(([group, list]) => (
                <div key={group} className='space-y-2'>
                  <p className='text-xs font-medium text-muted-foreground'>{group}</p>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                    {list.map((r) => (
                      <button
                        key={r.room_id}
                        type='button'
                        onClick={() => setRoomId(r.room_id)}
                        className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm text-left ${
                          roomId === r.room_id ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                        }`}
                      >
                        <span className='flex items-center gap-1.5 min-w-0'>
                          <DoorOpen className='h-4 w-4 shrink-0 text-muted-foreground' />
                          <span className='truncate'>Room {r.room_number}</span>
                        </span>
                        <Badge variant='outline' className='shrink-0 font-normal'>
                          {r.available_beds} of {r.capacity} free
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {step === 'confirm' && picked && selectedRoom && (
          <div className='space-y-3'>
            <div className='rounded-md border divide-y text-sm'>
              <Row label='Category'>
                {learner?.hostel_category_name ? `${learner.hostel_category_name} → ` : ''}{picked.name}
              </Row>
              <Row label='Room'>
                {selectedRoom.block_name} · {floorLabel(selectedRoom.floor)} · Room {selectedRoom.room_number}
              </Row>
              <Row label='Capacity'>
                <span className='flex items-center gap-1.5'>
                  <BedDouble className='h-4 w-4 text-muted-foreground' />
                  {selectedRoom.capacity} beds · {selectedRoom.available_beds} free
                </span>
              </Row>
              <Row label='Upgrade fee'><span className='font-semibold'>{inr(picked.upgrade_fee)}</span></Row>
            </div>
            <div className='rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm'>
              On confirm, the learner is moved into this room immediately
              {hasFee
                ? <> and an upgrade bill of <span className='font-semibold'>{inr(picked.upgrade_fee)}</span> is generated (payable by the learner).</>
                : <> at no extra fee.</>}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'category' && (
            <Button variant='outline' onClick={() => onOpenChange(false)}>Cancel</Button>
          )}
          {step === 'room' && (
            <>
              <Button variant='outline' onClick={() => setStep('category')}>Back</Button>
              <Button onClick={() => setStep('confirm')} disabled={!selectedRoom}>
                Continue <ArrowRight className='ml-1.5 h-4 w-4' />
              </Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant='outline' onClick={() => setStep('room')} disabled={upgrade.isPending}>Back</Button>
              <Button onClick={confirm} disabled={upgrade.isPending}>
                {upgrade.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {hasFee ? 'Move & bill' : 'Confirm move'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-3 px-3 py-2'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='font-medium text-right'>{children}</span>
    </div>
  );
}
