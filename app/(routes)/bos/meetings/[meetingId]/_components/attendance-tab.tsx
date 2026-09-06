'use client';

import { useState, useMemo } from 'react';
import { Save, Users, Lock, Monitor, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import {
  BosAttendanceMode,
  BosAttendanceStatus,
  BosMeetingStatus,
  BosMeetingType,
  BOS_MEETING_STATUS_ORDER,
  BosMember,
} from '@/types/bos';
import { useBosMembersByComposition } from '@/hooks/bos/use-bos-members';
import { useBosAttendance, useSaveBosAttendance } from '@/hooks/bos/use-bos-attendance';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AttendanceEntry {
  memberId: string;
  memberName: string;
  /**
   * External = expert-only member (expert_id set AND no staff_id).
   * A member with staff_id is internal staff regardless of any linked
   * expert record, so no travel distance is required.
   */
  isExternal: boolean;
  designation?: string;
  status: BosAttendanceStatus;
  /**
   * Offline (in person) or online — the dimension the SOP's sitting charges
   * are quoted against. Per member, not per meeting: hybrid sittings routinely
   * have the University Nominee dialling in while the rest are in the room.
   * Online attendance pays no travel allowance.
   */
  mode: BosAttendanceMode;
  distanceKm?: number | null;
}

// Per-member local edits that the user has made but not yet saved. Stored
// separately from the server-side `savedAttendance` so we can derive the
// displayed `entries` array purely from props + query data + this overlay —
// no useEffect-driven setState (which previously caused a render loop when
// the React-Query data refs churned).
interface AttendanceOverride {
  status?: BosAttendanceStatus;
  mode?: BosAttendanceMode;
}

// SOP cutover (2026-05-21): the TA/DA "eligible" toggle was removed because
// the per-role claim shape is fully determined by the member's source.
// Internal (staff-sourced) members get honorarium only; external
// (expert-sourced) members also receive the round-trip TA component. Derived
// from staff_id/expert_id — the same discriminator the server's auto-claim
// generation uses — since member_type now stores the free-form catalog type
// name (20260710150000) and can no longer be matched against an enum.
// staff_id WINS: a member with a staff record is internal even when an
// expert record is also linked (used only as a display snapshot source).

// ── Status toggle button labels ────────────────────────────────────────────────

const STATUS_LABELS: Record<BosAttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  leave_of_absence: 'LOA',
};

const STATUS_CYCLE: BosAttendanceStatus[] = ['present', 'absent', 'leave_of_absence'];

function nextStatus(current: BosAttendanceStatus): BosAttendanceStatus {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

// ── Attendance Row ─────────────────────────────────────────────────────────────

function AttendanceRow({
  entry,
  onToggle,
  onToggleMode,
}: {
  entry: AttendanceEntry;
  onToggle: () => void;
  onToggleMode: () => void;
}) {
  const statusColor: Record<BosAttendanceStatus, string> = {
    present: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200',
    absent: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200',
    leave_of_absence: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200',
  };

  const isExternal = entry.isExternal;
  const isOnline = entry.mode === 'online';
  // Distance only matters when an external member physically travelled. An
  // online attendee is paid the online sitting charge and no travel, so the
  // missing-distance block must lift — otherwise a remote University Nominee
  // could never be marked present without a fabricated distance.
  const hasNoDistance = isExternal && !isOnline && entry.distanceKm == null;
  const isToggleDisabled = hasNoDistance;

  return (
    <div className='flex items-center gap-3 rounded-lg border p-2.5'>
      <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted'>
        <Users className='h-3.5 w-3.5 text-muted-foreground' />
      </div>
      <div className='flex-1 min-w-0'>
        <p className='text-sm font-medium truncate'>{entry.memberName}</p>
        {entry.designation && (
          <p className='text-xs text-muted-foreground truncate'>{entry.designation}</p>
        )}
        {hasNoDistance && (
          <p className='text-xs text-amber-600 mt-1'>
            Distance not assigned — or mark this member Online
          </p>
        )}
      </div>
      <div className='flex items-center gap-2 shrink-0'>
        {/* Static TA/DA marker — shown for external members so reviewers can
            see at a glance which attendees will receive the travel allowance
            component on the auto-generated claim. Not interactive: eligibility
            is now determined by member type, not by per-meeting toggle. */}
        {isExternal && (
          <span
            className={`text-xs px-2 py-0.5 rounded border ${
              isOnline
                ? 'bg-muted text-muted-foreground border-border'
                : hasNoDistance
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-blue-100 text-blue-800 border-blue-200'
            }`}
            title={
              isOnline
                ? 'Attending online — sitting charge only, no travel allowance'
                : hasNoDistance
                  ? 'Distance not assigned — assign distance, or mark the member Online'
                  : 'External member — claim will include the travel allowance for their member type'
            }
          >
            {isOnline ? 'No TA' : hasNoDistance ? 'No Distance' : 'TA/DA'}
          </span>
        )}
        {/* Offline / Online toggle. Never disabled by the distance gate — it is
            the way OUT of that gate for a member who didn't travel. */}
        <button
          type='button'
          onClick={onToggleMode}
          className={`flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors ${
            isOnline
              ? 'border-indigo-200 bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
              : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          title={
            isOnline
              ? 'Attended online — online sitting charge, no travel allowance'
              : 'Attended in person — offline sitting charge plus travel allowance'
          }
        >
          {isOnline ? <Monitor className='h-3 w-3' /> : <MapPin className='h-3 w-3' />}
          {isOnline ? 'Online' : 'Offline'}
        </button>
        {/* Attendance status toggle */}
        <button
          type='button'
          onClick={onToggle}
          disabled={isToggleDisabled}
          className={`text-xs px-3 py-1 rounded border font-medium transition-colors ${
            isToggleDisabled
              ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500 border-gray-200'
              : statusColor[entry.status]
          }`}
          title={
            isToggleDisabled
              ? 'Assign distance to this expert, or mark them Online'
              : undefined
          }
        >
          {STATUS_LABELS[entry.status]}
        </button>
      </div>
    </div>
  );
}

// ── Attendance Tab ─────────────────────────────────────────────────────────────

interface AttendanceTabProps {
  meetingId: string;
  compositionId: string;
  institutionsId: string;
  canEdit: boolean;
  meetingStatus: BosMeetingStatus;
  /**
   * Convening council/committee of the meeting (bos_meetings.committee_id).
   * When set, attendance (and therefore quorum + auto-generated TA/DA claims)
   * is scoped to that committee's members instead of the whole composition.
   */
  committeeId?: string | null;
  /**
   * Seeds each unrecorded attendee's Offline/Online default: a meeting typed
   * 'online' starts everyone online, everything else (including 'hybrid')
   * starts offline. Only a default — the per-member toggle is authoritative.
   */
  meetingType?: BosMeetingType;
}

export function AttendanceTab({
  meetingId,
  compositionId,
  institutionsId,
  canEdit,
  meetingStatus,
  committeeId,
  meetingType,
}: AttendanceTabProps) {
  const completedIndex = BOS_MEETING_STATUS_ORDER.indexOf('completed');
  const currentStatusIndex = BOS_MEETING_STATUS_ORDER.indexOf(meetingStatus);
  const isBeforeMeeting = currentStatusIndex < completedIndex;
  const isReadOnly = meetingStatus === 'ratified';
  const { data: members, isLoading: loadingMembers } = useBosMembersByComposition(compositionId);
  const { data: savedAttendance, isLoading: loadingAttendance } = useBosAttendance(meetingId);
  const saveAttendance = useSaveBosAttendance(meetingId);

  // Only the user's unsaved edits live in local state. Server-side values are
  // read directly from React-Query data and merged during render — see the
  // `entries` useMemo below. Avoid the old `useEffect → setEntries` sync,
  // which infinite-looped whenever the query data refs were re-allocated.
  const [overrides, setOverrides] = useState<Record<string, AttendanceOverride>>({});

  const defaultMode: BosAttendanceMode = meetingType === 'online' ? 'online' : 'offline';

  const entries = useMemo<AttendanceEntry[]>(() => {
    let activeMembers = (members ?? []).filter((m) => m.is_active);
    // Scope to the meeting's convening committee. Legacy compositions may have
    // members with no committee assignment — fall back to the full composition
    // rather than rendering an empty (and quorum-breaking) attendance sheet.
    if (committeeId) {
      const scoped = activeMembers.filter((m) => m.committee_id === committeeId);
      if (scoped.length > 0) activeMembers = scoped;
    }
    const attendanceMap = new Map(
      (savedAttendance ?? []).map((a) => [a.member_id, a]),
    );
    return activeMembers.map((member) => {
      const existing = attendanceMap.get(member.id);
      const override = overrides[member.id];
      // bos_members.distance_km is the authoritative source; expert.distance_km is the fallback
      const memberWithExpert = member as BosMember & { distance_km?: number | null; expert?: { distance_km?: number | null } };
      const distanceKm = memberWithExpert.distance_km ?? memberWithExpert.expert?.distance_km;
      return {
        memberId: member.id,
        memberName: member.display_name,
        isExternal: member.staff_id == null && member.expert_id != null,
        designation: member.display_designation,
        distanceKm,
        status:
          override?.status ?? existing?.attendance_status ?? 'absent',
        // Saved rows written before 20260805120000 read back as 'offline' via
        // the column default, so `existing.attendance_mode` is only undefined
        // for members with no attendance row at all — those take the meeting's
        // format as their starting point.
        mode:
          override?.mode ?? existing?.attendance_mode ?? defaultMode,
      };
    });
  }, [members, savedAttendance, overrides, committeeId, defaultMode]);

  const isDirty = Object.keys(overrides).length > 0;

  const toggle = (memberId: string) => {
    const current = entries.find((e) => e.memberId === memberId);
    if (!current) return;
    const newStatus = nextStatus(current.status);
    setOverrides((prev) => ({
      ...prev,
      [memberId]: { ...prev[memberId], status: newStatus },
    }));
  };

  const toggleMode = (memberId: string) => {
    const current = entries.find((e) => e.memberId === memberId);
    if (!current) return;
    setOverrides((prev) => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        mode: current.mode === 'online' ? 'offline' : 'online',
      },
    }));
  };

  const presentCount = useMemo(
    () => entries.filter((e) => e.status === 'present').length,
    [entries]
  );

  const onlinePresentCount = useMemo(
    () => entries.filter((e) => e.status === 'present' && e.mode === 'online').length,
    [entries]
  );
  const totalCount = entries.length;
  const quorumThreshold = Math.floor(totalCount / 2) + 1;
  const quorumMet = presentCount >= quorumThreshold;

  // Check for external members without distance. Online attendees are excluded
  // throughout — they receive no travel allowance, so distance is irrelevant
  // to their claim and demanding it would block a legitimate remote sitting.
  const externalMembersWithoutDistance = useMemo(
    () =>
      entries.filter(
        (e) => e.isExternal && e.mode === 'offline' && e.distanceKm == null
      ),
    [entries]
  );

  const handleSave = async () => {
    try {
      // Validate external members attending in person have distance assigned
      const membersWithoutDistance = entries.filter(
        (e) =>
          e.isExternal &&
          e.status === 'present' &&
          e.mode === 'offline' &&
          e.distanceKm == null
      );

      if (membersWithoutDistance.length > 0) {
        const names = membersWithoutDistance.map((m) => m.memberName).join(', ');
        toast.error(
          `Please assign distance for: ${names}`
        );
        return;
      }

      // ta_da_eligible is derived, not user-set: external members are
      // always eligible (auto-TA via distance_km), internals are always
      // marked ineligible (honorarium-only per SOP). Kept on the payload
      // so the column has a meaningful value for downstream reporting,
      // but no longer gates claim generation server-side.
      const records = entries.map((e) => ({
        member_id: e.memberId,
        attendance_status: e.status,
        attendance_mode: e.mode,
        ta_da_eligible: e.isExternal,
        institutions_id: institutionsId,
      }));
      await saveAttendance.mutateAsync(records);
      toast.success('Attendance saved');
      // Saved values are now authoritative in React-Query cache (via the
      // mutation's onSuccess setQueryData). Drop local overrides so the next
      // render shows the server-confirmed state.
      setOverrides({});
    } catch (err) {
      logger.error('academic/bos', 'Failed to save attendance', err);
      toast.error((err as Error).message || 'Failed to save attendance');
    }
  };

  if (isBeforeMeeting) {
    return (
      <div className='rounded-lg border border-dashed p-8 text-center'>
        <Lock className='h-8 w-8 mx-auto mb-3 opacity-30' />
        <p className='text-sm font-medium'>Attendance not available yet</p>
        <p className='text-xs text-muted-foreground mt-1'>
          Attendance can be recorded once the meeting is marked as{' '}
          <strong>Completed</strong>.
        </p>
      </div>
    );
  }

  if (loadingMembers || loadingAttendance) {
    return (
      <div className='space-y-2'>
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className='h-14 w-full' />)}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className='rounded-lg border border-dashed p-8 text-center'>
        <Users className='h-8 w-8 mx-auto mb-2 opacity-40' />
        <p className='text-sm text-muted-foreground'>
          No members found. Add members to the composition first.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {externalMembersWithoutDistance.length > 0 && (
        <div className='rounded-lg border border-amber-200 bg-amber-50 p-3'>
          <p className='text-sm text-amber-900'>
            <strong>⚠ Distance not assigned:</strong> {externalMembersWithoutDistance.map((m) => m.memberName).join(', ')}
          </p>
        </div>
      )}

      {/* ── Quorum indicator ───────────────────────────────── */}
      <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-4 py-2.5'>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm'>
          <Users className='h-4 w-4 text-muted-foreground' />
          <span className='text-muted-foreground'>
            Present: <strong className='text-foreground'>{presentCount}</strong> / {totalCount}
          </span>
          <span className='text-muted-foreground text-xs'>(quorum: {quorumThreshold})</span>
          {onlinePresentCount > 0 && (
            <span className='flex items-center gap-1 text-xs text-muted-foreground'>
              <Monitor className='h-3 w-3' />
              {onlinePresentCount} online
            </span>
          )}
        </div>
        <Badge variant={quorumMet ? 'default' : 'outline'} className='text-xs'>
          {quorumMet ? 'Quorum Met' : 'Quorum Not Met'}
        </Badge>
      </div>

      {/* ── Member rows ────────────────────────────────────── */}
      <div className='grid gap-2 sm:grid-cols-2'>
        {entries.map((entry) => (
          <AttendanceRow
            key={entry.memberId}
            entry={entry}
            onToggle={() => toggle(entry.memberId)}
            onToggleMode={() => toggleMode(entry.memberId)}
          />
        ))}
      </div>

      {/* ── Save button ────────────────────────────────────── */}
      {canEdit && !isReadOnly && (
        <div className='flex justify-end pt-2'>
          <Button
            size='sm'
            onClick={handleSave}
            disabled={!isDirty || saveAttendance.isPending}
          >
            <Save className='mr-2 h-4 w-4' />
            {saveAttendance.isPending ? 'Saving...' : 'Save Attendance'}
          </Button>
        </div>
      )}
    </div>
  );
}
