'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useMarkAttendance,
  useMarkableResidents,
  useMyBlockAccess,
  useAttendanceByDate,
} from '@/hooks/campus-living/use-hostel-attendance';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import type { HostelAttendanceStatus, MarkableResident } from '@/types/campus-living';
import {
  groupSelectionState,
  toggleGroup,
  pruneToVisible,
  applyStatusToSelection,
  countSelected,
} from '@/lib/campus-living/attendance-selection';
import { GroupCheckbox } from './_components/group-checkbox';
import { BulkActionBar } from './_components/bulk-action-bar';
import {
  ArrowLeft,
  ClipboardCheck,
  Search,
  Loader2,
  Save,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  // Clear All previously used XCircle, which now belongs to Mark All Absent
  // sitting immediately beside it — two identical icons on adjacent buttons
  // that do very different things.
  Eraser
} from 'lucide-react';

type AttendanceStatus = 'present' | 'absent' | 'on_leave' | 'late_entry' | 'medical';

const statusOptions: { value: AttendanceStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'present', label: 'Present', icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-green-600 bg-green-50 border-green-200' },
  { value: 'absent', label: 'Absent', icon: <XCircle className="h-4 w-4" />, color: 'text-red-600 bg-red-50 border-red-200' },
  { value: 'on_leave', label: 'On Leave', icon: <Clock className="h-4 w-4" />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'late_entry', label: 'Late Entry', icon: <Clock className="h-4 w-4" />, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { value: 'medical', label: 'Medical', icon: <Clock className="h-4 w-4" />, color: 'text-purple-600 bg-purple-50 border-purple-200' },
];

export default function MarkAttendancePage() {
  const { profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const blockParam = searchParams.get('block');

  // 'all' = every block; previously defaulted to the literal '1' which is not
  // a block UUID, so untouched submits failed and the select matched nothing.
  const [selectedBlock, setSelectedBlock] = useState(blockParam ?? 'all');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: blocksData } = useHostelBlocks(profile?.institution_id ?? '');
  const blocks = blocksData as any;

  // Warden scoping: a user with active user_block_access grants (auto-synced
  // from hostel_wardens) only sees — and marks — residents of those blocks.
  // RLS on hostel_attendance/hostel_allocations enforces the same boundary
  // server-side; this keeps the UI honest about it.
  const { isSuperAdmin } = usePermissions();
  const { data: myBlockIds = [] } = useMyBlockAccess();
  const isBlockScoped = !isSuperAdmin && myBlockIds.length > 0;

  const blockOptions = useMemo(() => {
    const all = (blocks?.data ?? []) as Array<{ id: string; name: string; code: string }>;
    return isBlockScoped ? all.filter((b) => myBlockIds.includes(b.id)) : all;
  }, [blocks?.data, isBlockScoped, myBlockIds]);

  // Keep the selection inside the warden's scope: 'all' collapses to the
  // single assigned block, and an out-of-scope block resets to the first.
  useEffect(() => {
    if (!isBlockScoped) return;
    if (selectedBlock === 'all' && myBlockIds.length === 1) {
      setSelectedBlock(myBlockIds[0]);
      setSelectedFloor('all');
      setSelectedCategory('all');
    } else if (selectedBlock !== 'all' && !myBlockIds.includes(selectedBlock)) {
      // Previously reverted silently — the operator would pick a block outside
      // their access and just watch the selection snap back with no
      // explanation, reading as "the dropdown won't let me choose anything."
      toast.warning("You don't have access to that block — showing your assigned block instead.");
      setSelectedBlock(myBlockIds[0]);
      setSelectedFloor('all');
      setSelectedCategory('all');
    }
  }, [isBlockScoped, myBlockIds, selectedBlock]);

  // BUG-003327 fix: was useAttendanceByDate which returns *existing* attendance
  // rows — empty if nothing is marked yet, so the marking UI never appeared.
  // Now sources active residents merged with their active allocation, so the
  // block filter works and each row carries block/room/bed context.
  const { data: studentsRaw, isLoading } = useMarkableResidents(
    profile?.institution_id ?? '',
    selectedBlock === 'all' ? undefined : selectedBlock
  );
  // For block-scoped users viewing "All my blocks", drop residents outside
  // their grants (incl. unallocated ones — those aren't assigned to them).
  const students = useMemo(() => {
    if (!isBlockScoped || selectedBlock !== 'all') return studentsRaw;
    return studentsRaw?.filter(
      (s) => s.allocation && myBlockIds.includes(s.allocation.block_id)
    );
  }, [studentsRaw, isBlockScoped, selectedBlock, myBlockIds]);

  // Floors present among the currently loaded (block-scoped) residents. Only
  // meaningful once a specific block is chosen — floor numbers repeat across
  // blocks, so "All blocks" + a floor number would be ambiguous.
  const floorOptions = useMemo(() => {
    if (selectedBlock === 'all') return [] as number[];
    const floors = new Set<number>();
    students?.forEach((s) => {
      const floor = s.allocation?.room?.floor;
      if (floor !== null && floor !== undefined) floors.add(floor);
    });
    return Array.from(floors).sort((a, b) => a - b);
  }, [students, selectedBlock]);

  // Room categories present within the current Block -> Floor scope.
  const categoryOptions = useMemo(() => {
    if (selectedBlock === 'all') return [] as { id: string; name: string; sortOrder: number }[];
    const categories = new Map<string, { id: string; name: string; sortOrder: number }>();
    students?.forEach((s) => {
      if (selectedFloor !== 'all' && s.allocation?.room?.floor !== Number(selectedFloor)) return;
      const category = s.allocation?.room?.category;
      if (category && !categories.has(category.id)) {
        categories.set(category.id, {
          id: category.id,
          name: category.name,
          sortOrder: category.sort_order ?? 0,
        });
      }
    });
    return Array.from(categories.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    );
  }, [students, selectedBlock, selectedFloor]);

  const floorLabel = (floor: number) => (floor === 0 ? 'Ground floor' : `Floor ${floor}`);

  const getInitials = (name?: string | null) => {
    const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
    const initials = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
    return initials.toUpperCase() || '?';
  };

  const markAttendance = useMarkAttendance();

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});

  // Multi-select for bulk Present/Absent. Keyed by hostel_residents.id — the
  // SAME key as `attendance` above, so the two never drift (see the keying
  // warning on the pre-fill effect below).
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  // Pre-fill from whatever was already saved for this date — BUG-003327's fix
  // (above) removed the existing-attendance fetch entirely because it made the
  // whole roster disappear when nothing was marked yet. That was the wrong
  // trade: it also meant re-opening a date that WAS already submitted (e.g.
  // after handleSubmit's router.push away and back) always showed 0 marked,
  // even though the records existed. This fetch is additive — the resident
  // roster above still always renders from useMarkableResidents — it only
  // pre-fills the local marks, keyed by the resident row (not learner_id, so
  // it lines up with handleMarkStatus/handleSubmit's own keying).
  // Scoped by the selected BLOCK, not the marker's own institution_id — a
  // block can house residents from several affiliated colleges, so filtering
  // by the marker's institution silently hid real records for residents of a
  // different institution in the same block (confirmed bug: attendance saved
  // correctly but never showed up on reload).
  const { data: existingAttendance } = useAttendanceByDate(
    profile?.institution_id ?? '',
    attendanceDate,
    selectedBlock !== 'all' ? selectedBlock : undefined
  );
  useEffect(() => {
    if (!existingAttendance || !students) return;
    const statusByLearnerId = new Map(
      existingAttendance.map((r) => [r.learner_id, r.evening_status as AttendanceStatus])
    );
    const next: Record<string, AttendanceStatus> = {};
    students.forEach((s) => {
      const status = statusByLearnerId.get(s.profile_id);
      if (status) next[s.id] = status;
    });
    setAttendance(next);
    // Must re-run (and REPLACE, not merge) whenever `students` changes — that
    // happens when the Hostel Block dropdown loads a genuinely different
    // resident set, not just when floor/category/search narrow the CURRENT
    // one. Without `students` here, switching blocks left the previous
    // block's marks stuck in state — markedCount/presentCount/absentCount
    // below intentionally sum the whole `attendance` object (so marking
    // everyone, then searching one name, doesn't reset the count), which
    // made the leftover marks from the old block silently keep counting
    // toward the new block's totals, and handleSubmit would have tried to
    // submit them under the new block's id.
  }, [existingAttendance, attendanceDate, students]);

  const handleMarkStatus = useCallback((studentId: string, status: AttendanceStatus) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: prev[studentId] === status ? undefined as unknown as AttendanceStatus : status,
    }));
  }, []);

  // NOTE: handleMarkAllPresent and the multi-select handlers live further down,
  // after `filteredStudents`/`visibleIds` — they depend on the visible roster.

  const handleClearAll = useCallback(() => {
    setAttendance({});
  }, []);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      let skippedNoBlock = 0;
      let skippedNoInstitution = 0;
      const records = Object.entries(attendance)
        .filter(([, status]) => !!status)
        .flatMap(([residentId, status]) => {
          // residentId is hostel_residents.id; the attendance record needs the
          // underlying learner_id (== profile_id on the resident row).
          const resident = students?.find((s) => s.id === residentId);
          // Stamp the resident's OWN allocated block — not the page filter —
          // so "All blocks" submissions land on the right block. Residents
          // with no active allocation fall back to an explicitly selected
          // block; with neither, hostel_attendance.block_id (NOT NULL) cannot
          // be satisfied, so the row is skipped and reported.
          const blockId =
            resident?.allocation?.block_id ??
            (selectedBlock !== 'all' ? selectedBlock : null);
          if (!blockId) {
            skippedNoBlock += 1;
            return [];
          }
          // institution_id must be the RESIDENT's own institution, not the
          // marking staff member's — a block can house residents from
          // multiple affiliated colleges (hostel-rooms-v2), and the marker
          // (e.g. a super admin) may carry no institution_id at all. Falling
          // back to '' crashes the insert with 22P02 on this NOT NULL uuid.
          const residentInstitutionId =
            resident?.profile?.institution_id ?? resident?.allocation?.learner?.institution_id ?? null;
          if (!residentInstitutionId) {
            skippedNoInstitution += 1;
            return [];
          }
          return [{
            institution_id: residentInstitutionId,
            learner_id: resident?.profile_id ?? residentId,
            block_id: blockId,
            date: attendanceDate,
            check_in_time: null,
            check_out_time: null,
            evening_status: status as HostelAttendanceStatus,
            morning_status: null,
            marked_by: profile?.id ?? null,
            marking_method: 'manual' as const,
            is_curfew_violation: false,
            late_minutes: status === 'late_entry' ? 0 : null,
            remarks: null,
          }];
        });
      if (skippedNoBlock > 0) {
        toast.warning(
          `${skippedNoBlock} resident${skippedNoBlock === 1 ? '' : 's'} skipped — no room allocation. Allocate them to a block first or pick a specific block.`
        );
      }
      if (skippedNoInstitution > 0) {
        toast.warning(
          `${skippedNoInstitution} resident${skippedNoInstitution === 1 ? '' : 's'} skipped — no institution on record.`
        );
      }
      if (records.length > 0) {
        await markAttendance.mutateAsync(records);
        // Success (mutateAsync throws on RLS/constraint errors, so we only reach
        // here when the write landed): close the report and hand the warden back
        // to the attendance dashboard to see the updated totals.
        setConfirmOpen(false);
        router.push('/campus-living/attendance');
      } else {
        // Everything was skipped (no block / no institution) — keep the user
        // on the page; the skip warnings above explain why nothing was saved.
        setConfirmOpen(false);
      }
    } catch (error) {
      // Error is handled by the mutation hook's onError; keep the dialog open
      // so the warden can retry without re-marking.
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredStudents = useMemo(() => students?.filter((s: MarkableResident) => {
    if (selectedFloor !== 'all' && s.allocation?.room?.floor !== Number(selectedFloor)) {
      return false;
    }
    if (selectedCategory !== 'all' && s.allocation?.room?.category?.id !== selectedCategory) {
      return false;
    }
    const q = searchQuery.toLowerCase();
    return (
      (s.profile?.full_name ?? '').toLowerCase().includes(q) ||
      (s.profile?.email ?? '').toLowerCase().includes(q) ||
      (s.id_proof_number ?? '').toLowerCase().includes(q) ||
      (s.allocation?.room?.room_number ?? '').toLowerCase().includes(q) ||
      (s.allocation?.block?.name ?? '').toLowerCase().includes(q)
    );
  }) ?? [], [students, selectedFloor, selectedCategory, searchQuery]);

  const visibleIds = useMemo(() => filteredStudents.map((s) => s.id), [filteredStudents]);

  // Selection is confined to what's on screen: switching block, floor, category
  // or search drops anything that scrolled out of scope.
  //
  // This is deliberately the OPPOSITE of how `attendance` behaves (which sums
  // its whole contents so narrowing a filter doesn't reset the counts). Marks
  // are reviewable — each shows on its card and is itemised in the confirm
  // dialog before anything is written. A bulk apply is instant and unreviewed,
  // so a selection surviving out of view would let one click rewrite off-screen
  // residents with no confirmation step.
  //
  // pruneToVisible returns the SAME Set instance when nothing needs pruning,
  // which is what keeps this effect from re-firing forever.
  useEffect(() => {
    setSelectedIds((prev) => pruneToVisible(prev, visibleIds));
  }, [visibleIds]);

  // Changing the date swaps the whole attendance context but leaves the roster
  // (and therefore visibleIds) identical, so the prune above can't catch it.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [attendanceDate]);

  const toggleResident = useCallback((residentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(residentId)) next.delete(residentId);
      else next.add(residentId);
      return next;
    });
  }, []);

  const toggleGroupSelection = useCallback((ids: string[]) => {
    setSelectedIds((prev) => toggleGroup(ids, prev));
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Apply one status to everyone selected, then drop the selection so the
  // marker moves on to the next room. The marks themselves stay put.
  const handleBulkStatus = useCallback((status: AttendanceStatus) => {
    setAttendance((prev) => applyStatusToSelection(prev, selectedIds, status));
    setSelectedIds(new Set());
  }, [selectedIds]);

  // Scoped to the VISIBLE roster, not every loaded resident. It previously
  // iterated all of `students` and replaced the whole map, so filtering to one
  // floor and pressing this silently marked the other floors too — while the
  // counter beside it read `{markedCount}/{filteredStudents.length}`. With
  // "Select all → Present" now sitting next to it, two adjacent controls that
  // disagreed about filters would be a trap.
  const handleMarkAllPresent = useCallback(() => {
    setAttendance((prev) => applyStatusToSelection(prev, new Set(visibleIds), 'present'));
  }, [visibleIds]);

  // Counterpart to Mark All Present, same visible-roster scoping. Useful when
  // a whole floor is out on a trip and only the handful who stayed back get
  // corrected to Present afterwards.
  const handleMarkAllAbsent = useCallback(() => {
    setAttendance((prev) => applyStatusToSelection(prev, new Set(visibleIds), 'absent'));
  }, [visibleIds]);

  const selectedCount = useMemo(
    () => countSelected(selectedIds, visibleIds),
    [selectedIds, visibleIds]
  );

  const visibleSelectionState = useMemo(
    () => groupSelectionState(visibleIds, selectedIds),
    [visibleIds, selectedIds]
  );

  // Roll-call grouping: Block -> Floor -> Room, mirroring the physical walk
  // a warden does through the hostel. Relies on filteredStudents already
  // being sorted Block/Floor/Room/Name by getMarkableResidents — grouping is
  // a single pass that preserves that order via Map insertion order.
  const groupedStudents = useMemo(() => {
    const blocks = new Map<
      string,
      { label: string; floors: Map<string, { label: string; rooms: Map<string, { label: string; students: MarkableResident[] }> }> }
    >();

    for (const s of filteredStudents) {
      const alloc = s.allocation;
      const blockKey = alloc?.block_id ?? 'unallocated';
      if (!blocks.has(blockKey)) {
        blocks.set(blockKey, { label: alloc?.block?.name ?? 'Unallocated', floors: new Map() });
      }
      const block = blocks.get(blockKey)!;

      const floor = alloc?.room?.floor;
      const floorKey = floor != null ? `f${floor}` : 'no-floor';
      if (!block.floors.has(floorKey)) {
        block.floors.set(floorKey, { label: floor != null ? floorLabel(floor) : 'No Room Allocated', rooms: new Map() });
      }
      const floorGroup = block.floors.get(floorKey)!;

      const roomKey = alloc?.room?.id ?? 'no-room';
      if (!floorGroup.rooms.has(roomKey)) {
        floorGroup.rooms.set(roomKey, {
          label: alloc?.room?.room_number ? `Room ${alloc.room.room_number}` : 'Unassigned',
          students: [],
        });
      }
      floorGroup.rooms.get(roomKey)!.students.push(s);
    }

    // Each level carries the resident ids beneath it so its select-all
    // checkbox can toggle the whole group. Built by rolling ids upward
    // (room -> floor -> block) rather than re-walking filteredStudents, so the
    // groups and their ids can never disagree.
    return Array.from(blocks.entries()).map(([key, b]) => {
      const floors = Array.from(b.floors.entries()).map(([fKey, f]) => {
        const rooms = Array.from(f.rooms.entries()).map(([rKey, r]) => ({
          key: rKey,
          ...r,
          ids: r.students.map((s) => s.id),
        }));
        return { key: fKey, label: f.label, rooms, ids: rooms.flatMap((r) => r.ids) };
      });
      return { key, label: b.label, floors, ids: floors.flatMap((f) => f.ids) };
    });
  }, [filteredStudents]);

  const markedCount = Object.values(attendance).filter(Boolean).length;
  const presentCount = Object.values(attendance).filter((s) => s === 'present').length;
  // Summary bar only ever shows Present/Absent (no separate On Leave slot),
  // so On Leave is folded into the Absent count here — otherwise those
  // students counted toward "Marked" with no visible bucket, which read as
  // "vanished". Each resident's own status button still shows the real
  // 'On Leave' state, and the submitted record still saves evening_status
  // as 'on_leave' distinctly — only this rolled-up display number merges it.
  const absentCount = Object.values(attendance).filter((s) => s === 'absent' || s === 'on_leave').length;

  // Confirmation-report breakdown — counts EVERY marked status (not just the
  // filtered view) because handleSubmit submits all of `attendance`, including
  // residents the user marked before narrowing a filter.
  const statusBreakdown = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0, absent: 0, on_leave: 0, late_entry: 0, medical: 0,
    };
    for (const s of Object.values(attendance)) {
      if (s && s in counts) counts[s] += 1;
    }
    return counts;
  }, [attendance]);

  const selectedBlockLabel =
    selectedBlock === 'all'
      ? (isBlockScoped ? 'All my blocks' : 'All blocks')
      : (blockOptions.find((b) => b.id === selectedBlock)?.name ?? '—');

  return (
    <ContentLayout title="Mark Attendance">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Attendance', href: '/campus-living/attendance' },
          { label: 'Mark Attendance' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/attendance">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold py-1">Mark Attendance</h1>
              <p className="text-sm text-muted-foreground">
                Bulk attendance marking for hostel students
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4">
              <div className="space-y-1.5 flex-1">
                <Label>Hostel Block</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectedBlock}
                  onChange={(e) => {
                    setSelectedBlock(e.target.value);
                    setSelectedFloor('all');
                    setSelectedCategory('all');
                  }}
                >
                  {(!isBlockScoped || myBlockIds.length > 1) && (
                    <option value="all">{isBlockScoped ? 'All my blocks' : 'All blocks'}</option>
                  )}
                  {blockOptions.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))}
                </select>
                {isBlockScoped && (
                  <p className="text-xs text-muted-foreground">
                    You can mark attendance only for residents of your assigned block
                    {myBlockIds.length === 1 ? '' : 's'}.
                  </p>
                )}
              </div>
              {/* Floor/category only make sense once a specific block is picked —
                  floor numbers repeat across blocks, so "All blocks" + a floor
                  would silently mix residents from unrelated blocks. */}
              {selectedBlock !== 'all' && floorOptions.length > 0 && (
                <div className="space-y-1.5 flex-1">
                  <Label className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    Floor
                  </Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedFloor}
                    onChange={(e) => {
                      setSelectedFloor(e.target.value);
                      setSelectedCategory('all');
                    }}
                  >
                    <option value="all">All Floors</option>
                    {floorOptions.map((f) => (
                      <option key={f} value={String(f)}>{floorLabel(f)}</option>
                    ))}
                  </select>
                </div>
              )}
              {selectedBlock !== 'all' && categoryOptions.length > 0 && (
                <div className="space-y-1.5 flex-1">
                  <Label className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    Room Category
                  </Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <option value="all">All Categories</option>
                    {categoryOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="space-y-1.5 flex-1 max-w-sm">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Name, roll no, room..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions & Summary */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Covers the case the per-group checkboxes can't: the Block
                heading only renders when more than one block is in view, so a
                single-block roster would otherwise have no select-all at all. */}
            {filteredStudents.length > 0 && (
              <div
                className="flex cursor-pointer select-none items-center gap-2 pr-1 text-sm"
                onClick={() => toggleGroupSelection(visibleIds)}
              >
                <GroupCheckbox
                  state={visibleSelectionState}
                  onToggle={() => toggleGroupSelection(visibleIds)}
                  label="Select all visible residents"
                />
                <span>Select all ({filteredStudents.length})</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleMarkAllPresent}>
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
              Mark All Present
            </Button>
            <Button variant="outline" size="sm" onClick={handleMarkAllAbsent}>
              <XCircle className="mr-2 h-4 w-4 text-red-600" />
              Mark All Absent
            </Button>
            <Button variant="outline" size="sm" onClick={handleClearAll} disabled={markedCount === 0}>
              <Eraser className="mr-2 h-4 w-4 text-muted-foreground" />
              Clear All
            </Button>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-muted-foreground">
              Marked: <span className="font-medium text-foreground">{markedCount}/{filteredStudents.length}</span>
            </span>
            <span className="text-green-600">
              Present: <span className="font-medium">{presentCount}</span>
            </span>
            <span className="text-red-600">
              Absent: <span className="font-medium">{absentCount}</span>
            </span>
          </div>
        </div>

        {/* Student List — grouped Block -> Floor -> Room for roll-call order */}
        {isLoading ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            {groupedStudents.map((block) => (
              <div key={block.key} className="space-y-4">
                {groupedStudents.length > 1 && (
                  <h2 className="flex items-center gap-2 text-base font-semibold border-b pb-1">
                    <GroupCheckbox
                      state={groupSelectionState(block.ids, selectedIds)}
                      onToggle={() => toggleGroupSelection(block.ids)}
                      label={`Select all in ${block.label}`}
                    />
                    {block.label}
                  </h2>
                )}
                {block.floors.map((floor) => (
                  <div key={floor.key} className="space-y-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <GroupCheckbox
                        state={groupSelectionState(floor.ids, selectedIds)}
                        onToggle={() => toggleGroupSelection(floor.ids)}
                        label={`Select all on ${floor.label}`}
                      />
                      {floor.label}
                    </h3>
                    {floor.rooms.map((room) => (
                      <div key={room.key} className="space-y-1.5 pl-2 border-l-2 border-muted">
                        <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide pl-2">
                          <GroupCheckbox
                            state={groupSelectionState(room.ids, selectedIds)}
                            onToggle={() => toggleGroupSelection(room.ids)}
                            label={`Select all in ${room.label}`}
                          />
                          <span>
                            {room.label}{' '}
                            <span className="normal-case font-normal">({room.students.length})</span>
                          </span>
                        </h4>
                        <div className="space-y-2">
                          {room.students.map((student) => {
                            const status = attendance[student.id];
                            return (
                              <Card key={student.id} className={status ? 'border-l-4' : ''} style={{
                                borderLeftColor: status === 'present' ? '#16a34a' : status === 'absent' ? '#dc2626' : status === 'on_leave' ? '#d97706' : status === 'late_entry' ? '#ea580c' : status === 'medical' ? '#9333ea' : undefined,
                              }}>
                                <CardContent className="p-4">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                      <Checkbox
                                        checked={selectedIds.has(student.id)}
                                        onCheckedChange={() => toggleResident(student.id)}
                                        aria-label={`Select ${student.profile?.full_name ?? 'resident'}`}
                                        className="h-5 w-5"
                                      />
                                      <Avatar className="h-10 w-10">
                                        <AvatarImage
                                          src={student.profile?.avatar_url ?? student.student_photo_url ?? undefined}
                                          alt={student.profile?.full_name ?? 'Learner'}
                                        />
                                        <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
                                          {getInitials(student.profile?.full_name)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <p className="font-medium">{student.profile?.full_name ?? 'Unknown'}</p>
                                        <p className="text-sm text-muted-foreground">
                                          {student.id_proof_number ?? student.profile?.email ?? student.id.slice(0, 8)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {student.allocation
                                            ? [
                                                student.allocation.block?.name,
                                                student.allocation.room?.room_number
                                                  ? `Room ${student.allocation.room.room_number}`
                                                  : null,
                                                student.allocation.bed?.bed_number
                                                  ? `Bed ${student.allocation.bed.bed_number}`
                                                  : null,
                                              ]
                                                .filter(Boolean)
                                                .join(' · ')
                                            : 'No room allocated'}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex gap-1.5 flex-wrap">
                                      {statusOptions.map((opt) => (
                                        <button
                                          key={opt.value}
                                          onClick={() => handleMarkStatus(student.id, opt.value)}
                                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                                            status === opt.value ? opt.color + ' border-current' : 'bg-background hover:bg-muted border-border'
                                          }`}
                                        >
                                          {opt.icon}
                                          {opt.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {filteredStudents.length === 0 && !isLoading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              {/* BUG-003896: distinguish "no residents allocated yet" (the
                  reporter's case — empty hostel_residents table) from
                  "current search/filter excluded everyone". The first needs
                  a CTA to allocate residents; the second a hint to clear
                  filters. */}
              {students && students.length === 0 ? (
                <>
                  <p className="text-lg font-medium">No residents to mark yet</p>
                  <p className="text-sm text-muted-foreground max-w-md mb-4">
                    Attendance can only be taken for hostel residents. Allocate students to a hostel block first, then return here to mark attendance.
                  </p>
                  <Button asChild>
                    <Link href="/campus-living/allocations/new">
                      Allocate residents
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium">No matching residents</p>
                  <p className="text-sm text-muted-foreground">
                    Clear the search, or pick a different block, floor, or room category
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Submit. The bulk bar lives INSIDE this sticky container, above the
            submit row — two independently pinned bars would overlap at the
            bottom of the viewport. It renders nothing when nothing is
            selected. */}
        {filteredStudents.length > 0 && (
          <div className="sticky bottom-4 space-y-3 bg-background/80 backdrop-blur-sm p-4 rounded-lg border">
            <BulkActionBar
              count={selectedCount}
              onMarkPresent={() => handleBulkStatus('present')}
              onMarkAbsent={() => handleBulkStatus('absent')}
              onClearSelection={clearSelection}
            />
            <div className="flex justify-end gap-3">
              <div className="flex-1 text-sm text-muted-foreground flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" />
                {markedCount} of {filteredStudents.length} students marked
              </div>
              <Button variant="outline" asChild>
                <Link href="/campus-living/attendance">Cancel</Link>
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={isSubmitting || markedCount === 0}
              >
                <Save className="mr-2 h-4 w-4" />
                Review &amp; Submit
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Final confirmation — shows a report of what's about to be submitted,
          then commits on confirm and redirects to the attendance dashboard. */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!isSubmitting) setConfirmOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm attendance</DialogTitle>
            <DialogDescription>
              Review the summary before submitting. This records attendance for the
              selected residents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground text-xs">Date</p>
                <p className="font-medium">{attendanceDate}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground text-xs">Block</p>
                <p className="font-medium truncate">{selectedBlockLabel}</p>
              </div>
            </div>

            <div className="rounded-md border divide-y">
              <div className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium">Residents to mark</span>
                <span className="font-semibold">{markedCount}</span>
              </div>
              {statusOptions.map((opt) => (
                statusBreakdown[opt.value] > 0 && (
                  <div key={opt.value} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${opt.color}`}>
                      {opt.icon}
                      {opt.label}
                    </span>
                    <span className="font-medium">{statusBreakdown[opt.value]}</span>
                  </div>
                )
              ))}
            </div>

            {markedCount < filteredStudents.length && (
              <p className="text-xs text-amber-600">
                {filteredStudents.length - markedCount} resident
                {filteredStudents.length - markedCount === 1 ? '' : 's'} in view {filteredStudents.length - markedCount === 1 ? 'is' : 'are'} not marked and will be skipped.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isSubmitting}>
              Back
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || markedCount === 0}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm &amp; Submit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
