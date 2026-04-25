'use client';

import { useState, useEffect, useMemo } from 'react';
import { Save, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { BosAttendanceStatus, BosMemberType } from '@/types/bos';
import { useBosMembersByComposition } from '@/hooks/bos/use-bos-members';
import { useBosAttendance, useSaveBosAttendance } from '@/hooks/bos/use-bos-attendance';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AttendanceEntry {
  memberId: string;
  memberName: string;
  memberType: BosMemberType;
  designation?: string;
  status: BosAttendanceStatus;
  taEligible: boolean;
}

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
  onTaToggle,
}: {
  entry: AttendanceEntry;
  onToggle: () => void;
  onTaToggle: () => void;
}) {
  const statusColor: Record<BosAttendanceStatus, string> = {
    present: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200',
    absent: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200',
    leave_of_absence: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200',
  };

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
      </div>
      <div className='flex items-center gap-2 shrink-0'>
        {/* TA/DA eligible toggle — only shown for non-internal members */}
        {entry.memberType !== 'internal_member' && entry.memberType !== 'chairman' && (
          <button
            type='button'
            onClick={onTaToggle}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              entry.taEligible
                ? 'bg-blue-100 text-blue-800 border-blue-200'
                : 'bg-muted text-muted-foreground border-transparent'
            }`}
            title='Toggle TA/DA eligibility'
          >
            TA/DA
          </button>
        )}
        {/* Attendance status toggle */}
        <button
          type='button'
          onClick={onToggle}
          className={`text-xs px-3 py-1 rounded border font-medium transition-colors ${statusColor[entry.status]}`}
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
}

export function AttendanceTab({
  meetingId,
  compositionId,
  institutionsId,
  canEdit,
}: AttendanceTabProps) {
  const { data: members = [], isLoading: loadingMembers } = useBosMembersByComposition(compositionId);
  const { data: savedAttendance = [], isLoading: loadingAttendance } = useBosAttendance(meetingId);
  const saveAttendance = useSaveBosAttendance(meetingId);

  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Seed local state from saved attendance + composition members
  useEffect(() => {
    if (loadingMembers || loadingAttendance) return;

    const activeMembers = members.filter((m) => m.is_active);
    const attendanceMap = new Map(savedAttendance.map((a) => [a.member_id, a]));

    const merged: AttendanceEntry[] = activeMembers.map((member) => {
      const existing = attendanceMap.get(member.id);
      return {
        memberId: member.id,
        memberName: member.display_name,
        memberType: member.member_type,
        designation: member.display_designation,
        status: existing?.attendance_status ?? 'absent',
        taEligible: existing?.ta_da_eligible ?? false,
      };
    });

    setEntries(merged);
    setIsDirty(false);
  }, [members, savedAttendance, loadingMembers, loadingAttendance]);

  const toggle = (memberId: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.memberId === memberId ? { ...e, status: nextStatus(e.status) } : e
      )
    );
    setIsDirty(true);
  };

  const toggleTa = (memberId: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.memberId === memberId ? { ...e, taEligible: !e.taEligible } : e
      )
    );
    setIsDirty(true);
  };

  const presentCount = useMemo(
    () => entries.filter((e) => e.status === 'present').length,
    [entries]
  );
  const totalCount = entries.length;
  const quorumThreshold = Math.floor(totalCount / 2) + 1;
  const quorumMet = presentCount >= quorumThreshold;

  const handleSave = async () => {
    try {
      const records = entries.map((e) => ({
        member_id: e.memberId,
        attendance_status: e.status,
        ta_da_eligible: e.taEligible,
        institutions_id: institutionsId,
      }));
      await saveAttendance.mutateAsync(records);
      toast.success('Attendance saved');
      setIsDirty(false);
    } catch (err) {
      logger.error('academic/bos', 'Failed to save attendance', err);
      toast.error((err as Error).message || 'Failed to save attendance');
    }
  };

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
      {/* ── Quorum indicator ───────────────────────────────── */}
      <div className='flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5'>
        <div className='flex items-center gap-3 text-sm'>
          <Users className='h-4 w-4 text-muted-foreground' />
          <span className='text-muted-foreground'>
            Present: <strong className='text-foreground'>{presentCount}</strong> / {totalCount}
          </span>
          <span className='text-muted-foreground text-xs'>(quorum: {quorumThreshold})</span>
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
            onTaToggle={() => toggleTa(entry.memberId)}
          />
        ))}
      </div>

      {/* ── Save button ────────────────────────────────────── */}
      {canEdit && (
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
