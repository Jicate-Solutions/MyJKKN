'use client';

import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, BedDouble, Info } from 'lucide-react';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { useActiveMessCategories } from '@/hooks/campus-living/use-mess-categories';
import { useEffectiveMessCategories } from '@/hooks/campus-living/use-allocation-eligibility';
import {
  useRoomBedOccupancy, useAllocateBedAdmin, useAllocatableRooms,
} from '@/hooks/campus-living/use-hostel-allocations';
import type { LearnerHostelite } from '@/types/campus-living';

interface Props {
  learner: LearnerHostelite | null;
  onClose: () => void;
  onSuccess: () => void;
}

function learnerName(l: LearnerHostelite): string {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || '(unnamed)';
}

export function AllocateRoomDialog({ learner, onClose, onSuccess }: Props) {
  const open = !!learner;
  const { profile } = useAuth();
  const [blockId, setBlockId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bedId, setBedId] = useState('');
  const [messId, setMessId] = useState('');

  // Reset selections whenever a new learner opens the dialog.
  useEffect(() => {
    if (learner) { setBlockId(''); setRoomId(''); setBedId(''); setMessId(learner.mess_category_id ?? ''); }
  }, [learner]);

  const { data: blocksResult } = useHostelBlocks(profile?.institution_id ?? '');
  const blocks = blocksResult?.data ?? [];
  // Rooms in the chosen block the learner can ACTUALLY be allocated to: physical
  // (student room, gender, institution-serving, cohort eligibility, free beds) +
  // category conditions are all applied server-side (fn_cl_admin_allocatable_rooms).
  const { data: allocatableRooms, isLoading: roomsLoading } = useAllocatableRooms(
    learner?.id ?? null,
    blockId,
  );
  const { data: occupancy, isLoading: occLoading } = useRoomBedOccupancy(roomId);
  const { messCategories } = useActiveMessCategories();
  const { data: eligibleMessCats } = useEffectiveMessCategories(learner?.id ?? null);
  const allocateMut = useAllocateBedAdmin();

  const messFilterActive = (eligibleMessCats?.length ?? 0) > 0;
  const visibleMess = messFilterActive
    ? messCategories.filter((m) => eligibleMessCats!.includes(m.id))
    : messCategories;

  const freeCount = useMemo(
    () => (occupancy ?? []).filter((b) => !b.is_occupied).length,
    [occupancy],
  );

  async function handleAllocate() {
    if (!learner || !roomId || !bedId) return;
    try {
      await allocateMut.mutateAsync({
        learnerProfileId: learner.id,
        roomId, bedId,
        messCategoryId: messId || null,
      });
      onSuccess();
    } catch {
      /* toast surfaced by the hook */
    }
  }

  if (!learner) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !allocateMut.isPending) onClose(); }}>
      <DialogContent className="max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Allocate room — {learnerName(learner)}</DialogTitle>
          <DialogDescription>
            {learner.roll_number ?? '—'} · pick a block, room and free bed.
          </DialogDescription>
        </DialogHeader>

        {/* Current state context */}
        <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Current room</div>
            <div>{learner.current_room_id
              ? `${learner.current_block_code ?? learner.current_block_name ?? ''} · ${learner.current_room_number ?? '—'}`
              : <Badge variant="outline">Unassigned</Badge>}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Mess category</div>
            <div>{learner.mess_category_name ?? '—'}</div>
          </div>
        </div>

        {/* Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Block</Label>
            <Select value={blockId} onValueChange={(v) => { setBlockId(v); setRoomId(''); setBedId(''); }}>
              <SelectTrigger><SelectValue placeholder="Select block" /></SelectTrigger>
              <SelectContent>
                {blocks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Room</Label>
            <Select value={roomId} onValueChange={(v) => { setRoomId(v); setBedId(''); }} disabled={!blockId || roomsLoading}>
              <SelectTrigger><SelectValue placeholder={roomsLoading ? 'Loading rooms…' : 'Select room'} /></SelectTrigger>
              <SelectContent>
                {(allocatableRooms ?? []).map((r) => (
                  <SelectItem key={r.room_id} value={r.room_id}>
                    {r.room_number}{r.category_name ? ` · ${r.category_name}` : ''} · {r.available_beds} free
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {blockId && !roomsLoading && (allocatableRooms?.length ?? 0) === 0 && (
              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <Info className="h-3 w-3" /> No allocatable rooms for this learner here (gender, eligibility, or no free beds). Try another block.
              </p>
            )}
            {blockId && (allocatableRooms?.length ?? 0) > 0 && (
              <p className="text-[11px] text-muted-foreground">Rooms this learner is eligible for, with free beds.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Mess</Label>
            <Select value={messId} onValueChange={setMessId}>
              <SelectTrigger><SelectValue placeholder="No mess" /></SelectTrigger>
              <SelectContent>
                {visibleMess.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Occupancy panel — the "who's already allocated" view */}
        {roomId && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BedDouble className="h-4 w-4" /> Beds in this room
              </div>
              <span className="text-xs text-muted-foreground">
                {occLoading ? 'Loading…' : `${freeCount} of ${occupancy?.length ?? 0} free`}
              </span>
            </div>
            <div className="space-y-1">
              {(occupancy ?? []).map((b) => (
                <label key={b.bed_id}
                  className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${
                    b.is_occupied ? 'opacity-60 cursor-not-allowed' :
                    bedId === b.bed_id ? 'border-primary bg-primary/5 cursor-pointer' : 'cursor-pointer hover:bg-muted/50'
                  }`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="bed" disabled={b.is_occupied}
                      checked={bedId === b.bed_id} onChange={() => setBedId(b.bed_id)} />
                    Bed {b.bed_number ?? '—'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {b.is_occupied
                      ? `${b.occupant_name ?? 'Occupied'}${b.occupant_roll ? ` · ${b.occupant_roll}` : ''}`
                      : 'Free'}
                  </span>
                </label>
              ))}
              {!occLoading && (occupancy?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Info className="h-3 w-3" /> No beds configured in this room.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={allocateMut.isPending}>Cancel</Button>
          <Button onClick={handleAllocate} disabled={!roomId || !bedId || allocateMut.isPending}>
            {allocateMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Allocate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
