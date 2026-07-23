'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, BedDouble, Info, XCircle } from 'lucide-react';
import { useActiveMessCategories } from '@/hooks/campus-living/use-mess-categories';
import { useEffectiveMessCategories } from '@/hooks/campus-living/use-allocation-eligibility';
import {
  useRoomBedOccupancy, useAllocateBedAdmin, useAllocatableRooms, useAllocatableBlocks,
} from '@/hooks/campus-living/use-hostel-allocations';
import type { LearnerHostelite, AllocatableRoom } from '@/types/campus-living';

interface Props {
  learner: LearnerHostelite | null;
  onClose: () => void;
  onSuccess: () => void;
}

function learnerName(l: LearnerHostelite): string {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || '(unnamed)';
}

// Human labels for the per-room verdict flags (same conditions the
// auto-allocate preview reports, room-scoped here).
function excludedReasons(r: AllocatableRoom): string[] {
  const reasons: string[] = [];
  if (!r.gender_ok) reasons.push("block gender doesn't match learner");
  if (!r.institution_ok) reasons.push("doesn't serve learner's college");
  if (!r.eligibility_ok) reasons.push('reserved for a different cohort');
  if (!r.category_ok) reasons.push("category not in learner's eligible set");
  if (!r.has_free_beds) reasons.push('no free beds');
  return reasons;
}

export function AllocateRoomDialog({ learner, onClose, onSuccess }: Props) {
  const open = !!learner;
  const [blockId, setBlockId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bedId, setBedId] = useState('');
  const [messId, setMessId] = useState('');

  // Reset selections whenever a new learner opens the dialog.
  useEffect(() => {
    if (learner) { setBlockId(''); setRoomId(''); setBedId(''); setMessId(learner.mess_category_id ?? ''); }
  }, [learner]);

  // Blocks ranked by how many rooms THIS learner can actually get (gender,
  // college, cohort eligibility, category, free beds — all server-side), so
  // the picker steers the admin to a block that works instead of guessing.
  const { data: blocksData, isLoading: blocksLoading } = useAllocatableBlocks(learner?.id ?? null);
  // Only offer blocks matching the learner's gender (girls/boys + mixed) —
  // a wrong-gender block can never yield a room, so it's noise in the picker.
  const blocks = useMemo(
    () => (blocksData ?? []).filter((b) => b.gender_ok),
    [blocksData],
  );
  const noGenderBlocks = !blocksLoading && (blocksData?.length ?? 0) > 0 && blocks.length === 0;
  const noBlockHasRooms = !blocksLoading && blocks.length > 0
    && blocks.every((b) => b.allocatable_rooms === 0);
  // ALL student rooms in the chosen block with per-condition verdict flags
  // (gender, institution-serving, cohort eligibility, category, free beds)
  // computed server-side (fn_cl_admin_allocatable_rooms). The picker offers
  // only is_allocatable rooms; the rest feed the "why not" diagnostics below.
  const { data: blockRooms, isLoading: roomsLoading } = useAllocatableRooms(
    learner?.id ?? null,
    blockId,
  );
  const eligibleRooms = useMemo(
    () => (blockRooms ?? []).filter((r) => r.is_allocatable),
    [blockRooms],
  );
  const excludedRooms = useMemo(
    () => (blockRooms ?? []).filter((r) => !r.is_allocatable),
    [blockRooms],
  );
  // Gender is a block-level condition — when it fails, it fails for every room,
  // so collapse 30+ identical rows into one clear message.
  const blockGenderMismatch =
    excludedRooms.length > 0 && excludedRooms.every((r) => !r.gender_ok);
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

  // Auto-select cascade — a "Ready" learner should be one click from allocated:
  // best block (most allocatable rooms) → its first room → its first free bed.
  // Each step only fills an EMPTY selection, so manual choices are never overridden.
  useEffect(() => {
    if (!learner || blockId || blocks.length === 0) return;
    const best = blocks.find((b) => b.allocatable_rooms > 0);
    if (best) setBlockId(best.block_id);
  }, [learner, blockId, blocks]);

  useEffect(() => {
    if (!blockId || roomId || roomsLoading) return;
    if (eligibleRooms.length > 0) setRoomId(eligibleRooms[0].room_id);
  }, [blockId, roomId, roomsLoading, eligibleRooms]);

  useEffect(() => {
    if (!roomId || bedId || occLoading) return;
    const firstFree = (occupancy ?? []).find((b) => !b.is_occupied);
    if (firstFree) setBedId(firstFree.bed_id);
  }, [roomId, bedId, occLoading, occupancy]);

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
              <SelectTrigger><SelectValue placeholder={blocksLoading ? 'Loading blocks…' : 'Select block'} /></SelectTrigger>
              <SelectContent>
                {blocks.map((b) => (
                  <SelectItem key={b.block_id} value={b.block_id}>
                    {b.block_name} ({b.block_code}) · {b.allocatable_rooms > 0
                      ? `${b.allocatable_rooms} rooms`
                      : 'no rooms'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {noBlockHasRooms && (
              <p className="text-[11px] text-destructive inline-flex items-center gap-1">
                <Info className="h-3 w-3" /> No block currently has an allocatable room for this learner.
              </p>
            )}
            {noGenderBlocks && (
              <p className="text-[11px] text-destructive inline-flex items-center gap-1">
                <Info className="h-3 w-3" /> No block matches this learner&apos;s gender — check the gender on their profile.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Room</Label>
            <Select value={roomId} onValueChange={(v) => { setRoomId(v); setBedId(''); }} disabled={!blockId || roomsLoading}>
              <SelectTrigger><SelectValue placeholder={roomsLoading ? 'Loading rooms…' : 'Select room'} /></SelectTrigger>
              <SelectContent>
                {eligibleRooms.map((r) => (
                  <SelectItem key={r.room_id} value={r.room_id}>
                    {r.room_number}{r.category_name ? ` · ${r.category_name}` : ''} · {r.available_beds} free
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {blockId && !roomsLoading && (
              <p className="text-[11px] text-muted-foreground">
                {eligibleRooms.length} of {(blockRooms?.length ?? 0)} rooms available for this learner.
              </p>
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

        {/* Why-not diagnostics — per-room failing conditions, mirroring the
            auto-allocate preview's verdicts, so admins can see exactly what
            blocks an allocation instead of a generic "no rooms" hint. */}
        {blockId && !roomsLoading && excludedRooms.length > 0 && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <XCircle className="h-4 w-4 text-destructive" />
              Why {excludedRooms.length === (blockRooms?.length ?? 0) ? 'no rooms are' : `${excludedRooms.length} rooms are not`} available
            </div>
            {blockGenderMismatch ? (
              <p className="text-xs text-muted-foreground">
                This block&apos;s gender doesn&apos;t match the learner&apos;s, so no room here
                qualifies. Try a block for the learner&apos;s gender (or a mixed block).
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {excludedRooms.map((r) => (
                  <div key={r.room_id} className="flex items-start justify-between gap-3 rounded border px-3 py-1.5 text-xs">
                    <span className="whitespace-nowrap font-medium">
                      {r.room_number}{r.category_name ? ` · ${r.category_name}` : ''}
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {excludedReasons(r).map((reason) => (
                        <Badge key={reason} variant="outline" className="font-normal text-[10px] text-muted-foreground">
                          {reason}
                        </Badge>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
