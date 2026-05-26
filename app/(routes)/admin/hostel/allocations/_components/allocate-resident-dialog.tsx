'use client';
// app/(routes)/admin/hostel/allocations/_components/allocate-resident-dialog.tsx
//
// Hostel rooms-v2 PR 4b (2026-05-26)
//
// Single-page allocation form. NOT a multi-step wizard (anti-stall
// discipline + matches sibling room-access dialog style). Picks:
//
//   1. Institution            ─┐
//   2. Tier (per institution)  │ all required by the
//   3. Academic year           │ hostel_allocations NOT NULL schema
//   4. Learner (per institution)│
//   5. Block / Room / Bed      │ access-gated via room_institution_access
//   6. Monthly fee (₹)         │
//   7. Check-in date           │
//   8. Emergency contact x3    ─┘ (name / phone / relation, all required)
//
// Optional collapsible section: warden, vacate notes, expected vacate.
// Submit calls useAllocateResident().

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAllocateResident } from '@/hooks/campus-living/use-hostel-allocations';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface InstitutionRow {
  id: string;
  name: string;
}
interface TierRow {
  id: string;
  tier_display_name: string;
  tier_key: string;
}
interface AcademicYearRow {
  id: string;
  academic_year_name: string;
  is_active: boolean;
  start_date: string;
}
interface LearnerRow {
  id: string;
  full_name: string | null;
  email: string | null;
}
interface BlockRow {
  id: string;
  name: string;
  code: string | null;
}
interface RoomRow {
  id: string;
  room_number: string;
  capacity: number;
  block_id: string;
}
interface BedRow {
  id: string;
  bed_number: string | null;
  room_id: string;
  status: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

export function AllocateResidentDialog({ open, onOpenChange }: Props) {
  const allocate = useAllocateResident();

  // Form state — plain useState (no react-hook-form) for tighter
  // anti-stall budget. Validation is gating-on-submit + required attrs.
  const [institutionId, setInstitutionId] = useState('');
  const [tierId, setTierId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [learnerId, setLearnerId] = useState('');
  const [blockId, setBlockId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bedId, setBedId] = useState('');
  const [monthlyFee, setMonthlyFee] = useState<string>('');
  const [checkInDate, setCheckInDate] = useState(today());
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [wardenId, setWardenId] = useState('');
  const [vacateNotes, setVacateNotes] = useState('');

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setInstitutionId('');
      setTierId('');
      setAcademicYearId('');
      setLearnerId('');
      setBlockId('');
      setRoomId('');
      setBedId('');
      setMonthlyFee('');
      setCheckInDate(today());
      setEmergencyName('');
      setEmergencyPhone('');
      setEmergencyRelation('');
      setShowMore(false);
      setWardenId('');
      setVacateNotes('');
    }
  }, [open]);

  // ── Institutions ─────────────────────────────────────────────────
  const institutionsQuery = useQuery<InstitutionRow[]>({
    queryKey: ['institutions', 'for-allocation-picker'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return (data ?? []) as InstitutionRow[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  // ── Tiers for selected institution ────────────────────────────────
  const tiersQuery = useQuery<TierRow[]>({
    queryKey: ['hostel-tier-policy', 'for-allocation-picker', institutionId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_tier_policy')
        .select('id, tier_display_name, tier_key, sort_order, is_active')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TierRow[];
    },
    enabled: open && Boolean(institutionId),
  });

  // Auto-select first tier when institution changes
  useEffect(() => {
    if (tiersQuery.data && tiersQuery.data.length > 0 && !tierId) {
      setTierId(tiersQuery.data[0].id);
    }
  }, [tiersQuery.data, tierId]);

  // ── Academic years for selected institution ───────────────────────
  const academicYearsQuery = useQuery<AcademicYearRow[]>({
    queryKey: ['academic-years', 'for-allocation-picker', institutionId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, academic_year_name, is_active, start_date')
        .eq('institution_id', institutionId)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AcademicYearRow[];
    },
    enabled: open && Boolean(institutionId),
  });

  // Auto-pick the active (or most recent) academic year
  useEffect(() => {
    if (academicYearsQuery.data && academicYearsQuery.data.length > 0 && !academicYearId) {
      const active = academicYearsQuery.data.find((y) => y.is_active);
      setAcademicYearId(active?.id ?? academicYearsQuery.data[0].id);
    }
  }, [academicYearsQuery.data, academicYearId]);

  // ── Learners for selected institution ─────────────────────────────
  const learnersQuery = useQuery<LearnerRow[]>({
    queryKey: ['learners', 'for-allocation-picker', institutionId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, institution_id')
        .eq('institution_id', institutionId)
        .eq('role', 'student')
        .order('full_name')
        .limit(500);
      if (error) throw error;
      return (data ?? []) as LearnerRow[];
    },
    enabled: open && Boolean(institutionId),
  });

  // ── Blocks accessible to institution (via rooms→access junction) ──
  // Strategy: pull all rooms accessible to this institution, then derive
  // distinct blocks + per-block rooms client-side.
  const accessibleRoomsQuery = useQuery<RoomRow[]>({
    queryKey: ['rooms', 'accessible-for-institution', institutionId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      // First get room IDs from junction
      const { data: junction, error: jErr } = await supabase
        .from('room_institution_access')
        .select('room_id')
        .eq('institution_id', institutionId)
        .eq('is_active', true);
      if (jErr) throw jErr;
      const roomIds = (junction ?? []).map((r: { room_id: string }) => r.room_id);
      if (roomIds.length === 0) return [];

      const { data, error } = await supabase
        .from('hostel_rooms')
        .select('id, room_number, capacity, block_id')
        .in('id', roomIds)
        .order('room_number');
      if (error) throw error;
      return (data ?? []) as RoomRow[];
    },
    enabled: open && Boolean(institutionId),
  });

  const blocksQuery = useQuery<BlockRow[]>({
    queryKey: ['blocks', 'for-allocation-picker', institutionId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_blocks')
        .select('id, name, code')
        .order('name');
      if (error) throw error;
      return (data ?? []) as BlockRow[];
    },
    enabled: open,
  });

  // Filter blocks to those that have at least one accessible room.
  const blockOptions = useMemo(() => {
    if (!blocksQuery.data || !accessibleRoomsQuery.data) return [];
    const accessibleBlockIds = new Set(accessibleRoomsQuery.data.map((r) => r.block_id));
    return blocksQuery.data.filter((b) => accessibleBlockIds.has(b.id));
  }, [blocksQuery.data, accessibleRoomsQuery.data]);

  // Filter rooms to selected block.
  const roomOptions = useMemo(() => {
    if (!accessibleRoomsQuery.data || !blockId) return [];
    return accessibleRoomsQuery.data.filter((r) => r.block_id === blockId);
  }, [accessibleRoomsQuery.data, blockId]);

  // ── Beds for selected room ────────────────────────────────────────
  const bedsQuery = useQuery<BedRow[]>({
    queryKey: ['beds', 'for-room', roomId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_beds')
        .select('id, bed_number, room_id, status')
        .eq('room_id', roomId)
        .order('bed_number');
      if (error) throw error;
      return (data ?? []) as BedRow[];
    },
    enabled: open && Boolean(roomId),
  });

  // Reset cascading dependents when a parent changes.
  useEffect(() => {
    setTierId('');
    setAcademicYearId('');
    setLearnerId('');
    setBlockId('');
    setRoomId('');
    setBedId('');
  }, [institutionId]);
  useEffect(() => {
    setRoomId('');
    setBedId('');
  }, [blockId]);
  useEffect(() => {
    setBedId('');
  }, [roomId]);

  const canSubmit =
    Boolean(institutionId) &&
    Boolean(tierId) &&
    Boolean(academicYearId) &&
    Boolean(learnerId) &&
    Boolean(blockId) &&
    Boolean(roomId) &&
    Boolean(bedId) &&
    Boolean(emergencyName.trim()) &&
    Boolean(emergencyPhone.trim()) &&
    Boolean(emergencyRelation.trim()) &&
    Boolean(checkInDate) &&
    !allocate.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const feeNum = monthlyFee.trim() === '' ? null : Number(monthlyFee);
    allocate.mutate(
      {
        institution_id: institutionId,
        learner_id: learnerId,
        block_id: blockId,
        room_id: roomId,
        bed_id: bedId,
        academic_year_id: academicYearId,
        tier_id: tierId,
        allocation_type: 'regular',
        allocation_date: checkInDate,
        status: 'active',
        emergency_contact_name: emergencyName.trim(),
        emergency_contact_phone: emergencyPhone.trim(),
        emergency_contact_relation: emergencyRelation.trim(),
        check_in_date: checkInDate,
        monthly_fee_at_allocation_inr: feeNum,
        warden_id: wardenId || null,
        roommate_preference_notes: vacateNotes.trim() || null,
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-emerald-600" />
            Allocate Resident
          </DialogTitle>
          <DialogDescription>
            Assign a learner to a specific room and bed. Fee snapshot is saved
            at allocation time so later rate changes don&apos;t rewrite history.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Institution */}
          <div className="space-y-1.5">
            <Label htmlFor="institution">Institution *</Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger id="institution">
                <SelectValue placeholder={institutionsQuery.isLoading ? 'Loading…' : 'Pick an institution'} />
              </SelectTrigger>
              <SelectContent>
                {(institutionsQuery.data ?? []).map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tier + academic year row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tier">Stay tier *</Label>
              <Select value={tierId} onValueChange={setTierId} disabled={!institutionId}>
                <SelectTrigger id="tier">
                  <SelectValue placeholder={tiersQuery.isLoading ? 'Loading…' : 'Pick a tier'} />
                </SelectTrigger>
                <SelectContent>
                  {(tiersQuery.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.tier_display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="academic-year">Academic year *</Label>
              <Select value={academicYearId} onValueChange={setAcademicYearId} disabled={!institutionId}>
                <SelectTrigger id="academic-year">
                  <SelectValue placeholder={academicYearsQuery.isLoading ? 'Loading…' : 'Pick a year'} />
                </SelectTrigger>
                <SelectContent>
                  {(academicYearsQuery.data ?? []).map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.academic_year_name}
                      {y.is_active && ' (current)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Learner */}
          <div className="space-y-1.5">
            <Label htmlFor="learner">Learner *</Label>
            <Select value={learnerId} onValueChange={setLearnerId} disabled={!institutionId}>
              <SelectTrigger id="learner">
                <SelectValue placeholder={learnersQuery.isLoading ? 'Loading learners…' : 'Pick a learner'} />
              </SelectTrigger>
              <SelectContent>
                {(learnersQuery.data ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.full_name ?? l.email ?? l.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Block / Room / Bed row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="block">Block *</Label>
              <Select value={blockId} onValueChange={setBlockId} disabled={!institutionId}>
                <SelectTrigger id="block">
                  <SelectValue placeholder={accessibleRoomsQuery.isLoading ? 'Loading…' : 'Pick a block'} />
                </SelectTrigger>
                <SelectContent>
                  {blockOptions.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room">Room *</Label>
              <Select value={roomId} onValueChange={setRoomId} disabled={!blockId}>
                <SelectTrigger id="room">
                  <SelectValue placeholder="Pick a room" />
                </SelectTrigger>
                <SelectContent>
                  {roomOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.room_number} (cap {r.capacity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bed">Bed *</Label>
              <Select value={bedId} onValueChange={setBedId} disabled={!roomId}>
                <SelectTrigger id="bed">
                  <SelectValue placeholder={bedsQuery.isLoading ? 'Loading…' : 'Pick a bed'} />
                </SelectTrigger>
                <SelectContent>
                  {(bedsQuery.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      Bed {b.bed_number ?? b.id.slice(0, 6)}
                      {b.status && b.status !== 'available' ? ` (${b.status})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fee + check-in date */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fee">Monthly fee (₹)</Label>
              <Input
                id="fee"
                type="number"
                inputMode="numeric"
                min={0}
                value={monthlyFee}
                onChange={(e) => setMonthlyFee(e.target.value)}
                placeholder="e.g. 4500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="check-in">Check-in date *</Label>
              <Input
                id="check-in"
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Emergency contact */}
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Emergency contact (required)
            </legend>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ec-name">Name *</Label>
                <Input
                  id="ec-name"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-phone">Phone *</Label>
                <Input
                  id="ec-phone"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-relation">Relation *</Label>
                <Input
                  id="ec-relation"
                  value={emergencyRelation}
                  onChange={(e) => setEmergencyRelation(e.target.value)}
                  placeholder="e.g. Father"
                  required
                />
              </div>
            </div>
          </fieldset>

          {/* Optional fields */}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowMore((v) => !v)}
            >
              {showMore ? 'Hide' : 'Show'} optional fields
            </Button>
            {showMore && (
              <div className="mt-3 space-y-3 rounded-md border border-border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="warden">Warden (profile id)</Label>
                  <Input
                    id="warden"
                    value={wardenId}
                    onChange={(e) => setWardenId(e.target.value)}
                    placeholder="UUID — leave blank if unknown"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={vacateNotes}
                    onChange={(e) => setVacateNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {allocate.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Allocate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
