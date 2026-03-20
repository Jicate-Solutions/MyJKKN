'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  MinusCircle,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useVenueAttendance, useMarkAttendance } from '@/hooks/startup-studio/use-event-venues';
import type { AttendanceStatus, DayType, EventVenueAssignment } from '@/types/startup-studio';

// ── Attendance status config ─────────────────────────────────────────────────
const STATUS_CONFIG: Record<AttendanceStatus, {
  label: string;
  icon: React.ReactNode;
  activeClass: string;
  badgeClass: string;
}> = {
  present: {
    label: 'Present',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    activeClass: 'bg-green-600 text-white border-green-600 hover:bg-green-700',
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  },
  absent: {
    label: 'Absent',
    icon: <XCircle className="h-3.5 w-3.5" />,
    activeClass: 'bg-red-600 text-white border-red-600 hover:bg-red-700',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  },
  late: {
    label: 'Late',
    icon: <Clock className="h-3.5 w-3.5" />,
    activeClass: 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  },
  excused: {
    label: 'Excused',
    icon: <MinusCircle className="h-3.5 w-3.5" />,
    activeClass: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  },
};

// ── Props ────────────────────────────────────────────────────────────────────
interface VenueAttendanceSheetProps {
  venue: EventVenueAssignment | null;
  eventId: string;
  dayType: DayType;
  open: boolean;
  onClose: () => void;
  readOnly?: boolean;
}

// ── Sheet ────────────────────────────────────────────────────────────────────
export function VenueAttendanceSheet({
  venue,
  eventId,
  dayType,
  open,
  onClose,
  readOnly = false,
}: VenueAttendanceSheetProps) {
  if (!venue) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Attendance — {venue.manual_name || venue.resource?.name || 'Venue'}
          </SheetTitle>
          <SheetDescription>
            {venue.institution?.name || 'Unknown institution'} · {dayType === 'build_day' ? 'Build Day' : 'Demo Day'}
            {readOnly && <span className="ml-2 text-amber-600">(View only)</span>}
          </SheetDescription>
        </SheetHeader>

        <AttendanceContent
          venue={venue}
          eventId={eventId}
          dayType={dayType}
          readOnly={readOnly}
        />
      </SheetContent>
    </Sheet>
  );
}

// ── Inner content (separated so it only mounts when venue is set) ─────────────
function AttendanceContent({ venue, eventId, dayType, readOnly }: {
  venue: EventVenueAssignment;
  eventId: string;
  dayType: DayType;
  readOnly: boolean;
}) {
  const { data: attendanceRecords = [], isLoading } = useVenueAttendance(eventId, venue.id, dayType);
  const markAttendance = useMarkAttendance();
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});

  // Build lookup: registrationId → attendance record
  const attendanceByReg = Object.fromEntries(
    attendanceRecords.map((a) => [a.registration_id, a])
  );

  const teams = venue.team_allocations || [];

  // Summary counts
  const counts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
  for (const team of teams) {
    const rec = attendanceByReg[(team as any).registration_id];
    if (rec) {
      counts[rec.status as AttendanceStatus]++;
    } else {
      counts.unmarked++;
    }
  }

  const handleMark = (registrationId: string, status: AttendanceStatus) => {
    if (readOnly) return;
    markAttendance.mutate({
      event_id: eventId,
      registration_id: registrationId,
      venue_assignment_id: venue.id,
      day_type: dayType,
      status,
      notes: notesMap[registrationId] || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <SummaryBadge label="Present" count={counts.present} colorClass="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" />
        <SummaryBadge label="Absent" count={counts.absent} colorClass="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" />
        <SummaryBadge label="Late" count={counts.late} colorClass="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" />
        <SummaryBadge label="Excused" count={counts.excused} colorClass="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" />
        {counts.unmarked > 0 && (
          <SummaryBadge label="Not marked" count={counts.unmarked} colorClass="bg-muted text-muted-foreground" />
        )}
      </div>

      {counts.unmarked > 0 && !readOnly && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {counts.unmarked} team{counts.unmarked !== 1 ? 's' : ''} not yet marked — click a status button to record attendance.
        </div>
      )}

      <Separator />

      {/* Team list */}
      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No teams allocated to this venue.</p>
      ) : (
        <div className="space-y-3">
          {teams.map((alloc: any, idx: number) => {
            const regId = alloc.registration_id;
            const teamName = alloc.registration?.team_name || 'Unknown';
            const rec = attendanceByReg[regId];
            const currentStatus: AttendanceStatus | null = rec?.status ?? null;
            const isPending = markAttendance.isPending;

            return (
              <div
                key={alloc.id}
                className={cn(
                  'rounded-lg border p-3 transition-colors',
                  currentStatus === 'present' && 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/10',
                  currentStatus === 'absent' && 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/10',
                  currentStatus === 'late' && 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/10',
                  currentStatus === 'excused' && 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/10',
                  !currentStatus && 'border-border bg-muted/20',
                )}
              >
                {/* Team row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0">{idx + 1}.</span>
                      <p className="text-sm font-medium truncate">{teamName}</p>
                      {currentStatus && (
                        <Badge className={cn('text-[10px] h-5 px-1.5 shrink-0', STATUS_CONFIG[currentStatus].badgeClass)}>
                          {STATUS_CONFIG[currentStatus].icon}
                          <span className="ml-1">{STATUS_CONFIG[currentStatus].label}</span>
                        </Badge>
                      )}
                    </div>
                    {/* Marked by / at */}
                    {rec && (
                      <p className="text-[10px] text-muted-foreground mt-1 ml-7">
                        Marked by {rec.marker?.full_name || rec.marker?.email || 'unknown'}
                        {rec.marked_at ? ` · ${format(new Date(rec.marked_at), 'h:mm a')}` : ''}
                      </p>
                    )}
                  </div>

                  {/* Status toggle buttons */}
                  {!readOnly && (
                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                      {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => handleMark(regId, s)}
                          className={cn(
                            'h-7 px-2 text-xs gap-1',
                            currentStatus === s && STATUS_CONFIG[s].activeClass
                          )}
                        >
                          {STATUS_CONFIG[s].icon}
                          <span className="hidden sm:inline">{STATUS_CONFIG[s].label}</span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes — shown only if there's an existing note, or editing */}
                {!readOnly && (
                  <div className="mt-2 ml-7">
                    <Textarea
                      placeholder="Add a note (optional)..."
                      value={notesMap[regId] ?? rec?.notes ?? ''}
                      onChange={(e) => setNotesMap((prev) => ({ ...prev, [regId]: e.target.value }))}
                      className="h-8 min-h-0 text-xs resize-none py-1.5"
                      rows={1}
                    />
                  </div>
                )}
                {readOnly && rec?.notes && (
                  <p className="text-xs text-muted-foreground mt-1.5 ml-7 italic">"{rec.notes}"</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer summary table */}
      {teams.length > 0 && (
        <>
          <Separator />
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-2.5 text-xs">Summary</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs text-right">Count</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Object.entries(counts) as [string, number][])
                  .filter(([key]) => key !== 'unmarked' || counts.unmarked > 0)
                  .map(([key, val]) => (
                    <TableRow key={key} className="border-b last:border-0">
                      <TableCell className="px-4 py-2 text-xs capitalize">{key === 'unmarked' ? 'Not marked' : key}</TableCell>
                      <TableCell className="px-4 py-2 text-xs text-right tabular-nums font-medium">{val}</TableCell>
                      <TableCell className="px-4 py-2 text-xs text-right tabular-nums text-muted-foreground">
                        {teams.length > 0 ? `${Math.round((val / teams.length) * 100)}%` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                <TableRow className="bg-muted/20">
                  <TableCell className="px-4 py-2 text-xs font-semibold">Total Teams</TableCell>
                  <TableCell className="px-4 py-2 text-xs text-right tabular-nums font-semibold">{teams.length}</TableCell>
                  <TableCell className="px-4 py-2 text-xs text-right text-muted-foreground">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryBadge({ label, count, colorClass }: { label: string; count: number; colorClass: string }) {
  return (
    <Badge className={cn('text-xs px-2.5 py-1 font-medium', colorClass)}>
      {count} {label}
    </Badge>
  );
}
