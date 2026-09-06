'use client';

// Attendance check-in — a Senior Peer Mentor opens ONE session, sees the freshers
// assigned to them, and taps Present / Absent per fresher. Writes via the gated
// DEFINER RPC fn_induction_volunteer_mark_attendance, which is scoped to the mentor's
// own group and anti-clobber (never overwrites a staff mark). Defaults everyone to
// Present so a mentor just flips the few absentees and saves.
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionVolunteerService,
  type FeedbackGroupMember,
  type AttendanceMark,
} from '@/lib/services/induction/induction-volunteer-service';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { UserCheck, GraduationCap, Phone } from 'lucide-react';

const BRAND = '#0b6d41';
type Status = 'present' | 'absent';

export function AttendanceCheckinDialog({
  sessionId, sessionTitle, onSaved,
}: { sessionId: string; sessionTitle: string; onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<FeedbackGroupMember[]>([]);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, prior] = await Promise.all([
        InductionVolunteerService.myFeedbackGroup(sessionId),
        InductionVolunteerService.mySessionAttendance(sessionId),
      ]);
      setGroup(g);
      // Seed each fresher from any attendance ALREADY saved for this session, so
      // re-opening the dialog to mark one more absentee never resets previously-marked
      // absentees back to Present (audit 2026-07-06 #2). Unmarked freshers default to
      // Present. This two-state dialog only distinguishes present/absent; a staff-set
      // excused/od shows as Present here but is never overwritten (the RPC is
      // anti-clobber on staff marks).
      const priorByLearner = new Map(prior.map((a) => [a.learner_id, a.status]));
      setMarks(Object.fromEntries(g.map((m) => [
        m.learner_id,
        priorByLearner.get(m.learner_id) === 'absent' ? ('absent' as Status) : ('present' as Status),
      ])));
    } catch (e: any) {
      toast.error(`Couldn't load your group: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const onOpenChange = (o: boolean) => { setOpen(o); if (o) load(); };
  const setStatus = (id: string, s: Status) => setMarks((m) => ({ ...m, [id]: s }));

  const presentCount = Object.values(marks).filter((s) => s === 'present').length;
  const absentCount = Object.values(marks).filter((s) => s === 'absent').length;

  const save = async () => {
    const payload: AttendanceMark[] = group.map((m) => ({
      learner_id: m.learner_id,
      status: marks[m.learner_id] ?? 'present',
    }));
    if (payload.length === 0) { toast.error('No freshers assigned to you for this session.'); return; }
    setSaving(true);
    try {
      const n = await InductionVolunteerService.markAttendance(sessionId, payload);
      const skipped = payload.length - n;
      // The RPC skips a fresher outside the mentor's group OR one already marked by staff.
      toast.success(
        `Attendance saved for ${n} fresher${n === 1 ? '' : 's'}${skipped > 0 ? ` · ${skipped} not saved (already marked by staff or no longer in your group)` : ''}.`,
      );
      setOpen(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(`Couldn't save attendance: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserCheck className="h-4 w-4 mr-1" /> Attendance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] flex flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{sessionTitle} — attendance</DialogTitle>
          <DialogDescription>
            Anyone you&apos;ve already marked keeps their status; unmarked freshers start Present.
            Tap Absent for any fresher who didn&apos;t attend, then Save.
            You can only mark your own assigned freshers; a staff mark is never overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto divide-y -mx-1 px-1">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading your group…</p>
          ) : group.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No freshers assigned to you for this session yet.
            </p>
          ) : group.map((m) => {
            const status = marks[m.learner_id] ?? 'present';
            return (
              <div key={m.learner_id} className="py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{m.name || 'Unnamed'}</div>
                  {/* Programme first: register_number is still NULL for most freshers
                      at induction time, so this line used to be a bare em-dash on the
                      majority of rows and told the mentor nothing. The programme names
                      the branch (department cannot — every engineering fresher sits in
                      the shared first-year department), so it is what separates two
                      same-name freshers in the group. */}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {m.program_name && (
                      <span className="flex min-w-0 items-center gap-1">
                        <GraduationCap className="h-3 w-3 shrink-0" />
                        <span className="truncate">{m.program_name}</span>
                      </span>
                    )}
                    {/* The fresher's own number first — this is the mentor's
                        contact list. Parent's number is the fallback and is
                        labelled, so nobody rings a parent thinking it is the
                        fresher. A tel: link so it dials straight from the phone
                        the mentor is already holding. */}
                    {(m.student_mobile || m.father_mobile) && (
                      <a
                        href={`tel:${m.student_mobile || m.father_mobile}`}
                        className="flex items-center gap-1 tabular-nums hover:underline"
                        title={m.student_mobile ? 'Fresher mobile' : "Parent's mobile"}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Phone className="h-3 w-3 shrink-0" />
                        {m.student_mobile || m.father_mobile}
                        {!m.student_mobile && <span>(parent)</span>}
                      </a>
                    )}
                    {m.register_number && <span className="tabular-nums">{m.register_number}</span>}
                    {m.batch_label && <span>Batch {m.batch_label}</span>}
                    {!m.program_name && !m.register_number && !m.batch_label
                      && !m.student_mobile && !m.father_mobile && <span>—</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant={status === 'present' ? 'default' : 'outline'}
                    onClick={() => setStatus(m.learner_id, 'present')}
                    style={status === 'present' ? { backgroundColor: BRAND } : undefined}
                    className={status === 'present' ? 'text-white hover:opacity-90 h-8' : 'h-8'}
                  >
                    Present
                  </Button>
                  <Button
                    size="sm"
                    variant={status === 'absent' ? 'destructive' : 'outline'}
                    onClick={() => setStatus(m.learner_id, 'absent')}
                    className="h-8"
                  >
                    Absent
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            {presentCount} present · {absentCount} absent
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || group.length === 0}
              style={{ backgroundColor: BRAND }} className="text-white hover:opacity-90">
              {saving ? 'Saving…' : 'Save attendance'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
