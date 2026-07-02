'use client';

// ============================================================================
// Schedule editor — per-routine day-of-week + time (IST) picker, plus helpers
// and a small hook to load all schedules from /api/admin/ai-routines/schedule.
// Writes go to POST the same endpoint (→ fn_ai_routine_schedule_upsert).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export type ScheduleRow = {
  routine_id: string;
  enabled: boolean;
  days_of_week: number[];
  minute_of_day: number;
  managed: boolean;
  last_fired_slot: string | null;
  last_fired_at: string | null;
  last_status: string | null;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BRAND = '#0b6d41';

export function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function fmtDays(days: number[]): string {
  if (!days || days.length === 0) return 'never';
  if (days.length === 7) return 'Every day';
  const sorted = [...days].sort((a, b) => a - b);
  // Weekdays shortcut
  if (sorted.join() === '1,2,3,4,5') return 'Weekdays';
  return sorted.map((d) => DAY_LABELS[d]).join(', ');
}

/** Loads all schedule rows into a Map keyed by routine_id. */
export function useSchedules() {
  const [map, setMap] = useState<Map<string, ScheduleRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/admin/ai-routines/schedule', { cache: 'no-store' });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error ?? 'failed to load schedules');
      const m = new Map<string, ScheduleRow>();
      for (const r of data.schedules as ScheduleRow[]) m.set(r.routine_id, r);
      setMap(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { map, loading, error, reload, setMap };
}

export function ScheduleEditor({
  schedule,
  onSaved,
  onCancel,
}: {
  schedule: ScheduleRow;
  onSaved: (next: ScheduleRow) => void;
  onCancel: () => void;
}) {
  const [enabled, setEnabled] = useState(schedule.enabled);
  const [days, setDays] = useState<number[]>([...schedule.days_of_week].sort((a, b) => a - b));
  const [time, setTime] = useState(fmtTime(schedule.minute_of_day));
  const [saving, setSaving] = useState(false);

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  }

  async function save() {
    if (days.length === 0) {
      toast.error('Pick at least one day');
      return;
    }
    const [hh, mm] = time.split(':').map((x) => parseInt(x, 10));
    const rawMin = hh * 60 + mm;
    // snap to 15-min mark, capped at 23:45 so a near-midnight round-up can't hit 1440
    const minuteOfDay = Math.min(Math.round(rawMin / 15) * 15, 1425);
    setSaving(true);
    try {
      const resp = await fetch('/api/admin/ai-routines/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ routineId: schedule.routine_id, enabled, daysOfWeek: days, minuteOfDay }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error ?? 'save failed');
      toast.success('Schedule saved');
      onSaved(data.schedule as ScheduleRow);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border bg-background p-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Enabled {enabled ? '' : '(paused — will not run)'}</span>
      </label>

      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Days</span>
        <div className="flex flex-wrap gap-1">
          {DAY_LABELS.map((label, d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`h-8 w-11 rounded-md border text-xs font-medium transition-colors ${
                  on ? 'text-white' : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
                style={on ? { backgroundColor: BRAND, borderColor: BRAND } : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Time (IST)</span>
          <input
            type="time"
            step={900}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          />
        </div>
        <span className="pb-2 text-xs text-muted-foreground">snaps to 15-min marks</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
            <X className="mr-1 h-3.5 w-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
