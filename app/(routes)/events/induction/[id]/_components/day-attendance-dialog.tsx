'use client';

// Day-level attendance roster (bulk mark: one pass covers every session that
// day). Fans out into the SAME event_session_attendance rows the per-session
// AttendanceDialog writes — this is a marking-UX convenience, not a new data
// model. A learner whose sessions that day already carry DIFFERENT statuses
// shows "Varies by session" instead of a misleading pre-selected button, so a
// day-mark can't silently overwrite a deliberate partial-day mark.
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionService,
  type DayRosterRow,
  type AttendanceStatus,
  type AttendanceMark,
} from '@/lib/services/induction/induction-service';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { CalendarCheck } from 'lucide-react';

const OPTIONS: { value: AttendanceStatus; label: string; on: string }[] = [
  { value: 'present', label: 'P',  on: 'bg-green-600 text-white border-green-600' },
  { value: 'absent',  label: 'A',  on: 'bg-red-600 text-white border-red-600' },
  { value: 'excused', label: 'E',  on: 'bg-amber-500 text-white border-amber-500' },
  { value: 'od',      label: 'OD', on: 'bg-blue-600 text-white border-blue-600' },
];

export function DayAttendanceDialog({ eventId, dayNumber, dayLabel }: { eventId: string; dayNumber: number; dayLabel: string }) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<DayRosterRow[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await InductionService.getDayRoster(eventId, dayNumber);
      setRoster(r);
      const init: Record<string, AttendanceStatus> = {};
      for (const row of r) if (row.status) init[row.learner_id] = row.status;
      setMarks(init);
    } catch (e: any) {
      toast.error(`Couldn't load day roster: ${e.message ?? e}`);
    } finally { setLoading(false); }
  }, [eventId, dayNumber]);

  const onOpenChange = (o: boolean) => { setOpen(o); if (o) load(); };
  const set = (id: string, s: AttendanceStatus) => setMarks((m) => ({ ...m, [id]: s }));
  const allPresent = () => {
    const m: Record<string, AttendanceStatus> = {};
    for (const row of roster) m[row.learner_id] = 'present';
    setMarks(m);
  };

  const save = async () => {
    const payload: AttendanceMark[] = Object.entries(marks).map(([learner_id, status]) => ({ learner_id, status }));
    if (payload.length === 0) { toast.error('Mark at least one learner.'); return; }
    setSaving(true);
    try {
      const n = await InductionService.markDayAttendance(eventId, dayNumber, payload);
      toast.success(`Saved ${dayLabel} attendance for ${n} learner${n === 1 ? '' : 's'}.`);
      setOpen(false);
    } catch (e: any) {
      toast.error(`Couldn't save day attendance: ${e.message ?? e}`);
    } finally { setSaving(false); }
  };

  const markedCount = Object.keys(marks).length;
  const presentCount = Object.values(marks).filter((s) => s === 'present' || s === 'od').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
          <CalendarCheck className="h-3.5 w-3.5" /> Mark day attendance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Attendance — {dayLabel}</DialogTitle>
          <DialogDescription>
            One mark applies to every session {dayLabel.toLowerCase()} for that learner. Present and OD count toward completion.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-b pb-2">
          <span className="text-sm text-muted-foreground">
            {roster.length} enrolled · {markedCount} marked · {presentCount} present/OD
          </span>
          <Button size="sm" variant="outline" onClick={allPresent} disabled={loading || roster.length === 0}>
            Mark all present
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No freshers enrolled for this day&apos;s sessions yet.</p>
          ) : roster.map((row) => (
            <div key={row.learner_id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{row.name || 'Unnamed'}</div>
                <div className="text-xs text-muted-foreground">
                  {row.register_number ?? '—'}{row.batch_label ? ` · Batch ${row.batch_label}` : ''}
                  {row.is_mixed && <span className="ml-1.5 text-amber-600">· Varies by session</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {OPTIONS.map((o) => {
                  const selected = marks[row.learner_id] === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set(row.learner_id, o.value)}
                      className={`h-7 min-w-[32px] px-2 rounded border text-xs font-medium transition-colors ${
                        selected ? o.on : 'bg-background text-muted-foreground hover:bg-muted'
                      }`}
                      aria-pressed={selected}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || markedCount === 0}>
            {saving ? 'Saving…' : 'Save day attendance'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
