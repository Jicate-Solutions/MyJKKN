'use client';

/**
 * ScheduleDialog — "Repeat…" on a past question.
 * Asks how often, which day, what time (IST) and where to send the answer
 * (email and/or in MyJKKN), previews the next run, and saves it through
 * fn_ai_query_schedule_create (pinned to the signed-in person).
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createSchedule } from '@/lib/services/ai-query/schedules/schedule-service';
import {
  WEEKDAY_NAMES,
  computeNextRun,
  formatIstDateTime,
  formatTimeIst,
} from '@/lib/services/ai-query/schedules/next-run';
import type { ScheduleCadence, ScheduleChannel } from '@/lib/services/ai-query/schedules/types';

/** Every half hour of the day, 'HH:MM'. */
const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  return `${String(h).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`;
});

const DAY_OPTIONS: number[] = Array.from({ length: 31 }, (_, i) => i + 1);

function defaultTitle(question: string): string {
  const q = question.trim().replace(/\s+/g, ' ');
  return q.length <= 80 ? q : `${q.slice(0, 79).trimEnd()}…`;
}

export function ScheduleDialog({
  open,
  onOpenChange,
  question,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The past question to repeat. */
  question: string;
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [cadence, setCadence] = useState<ScheduleCadence>('weekly');
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [time, setTime] = useState('09:00');
  const [email, setEmail] = useState(true);
  const [inApp, setInApp] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fresh form each time the dialog opens for a question.
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle(question));
      setCadence('weekly');
      setWeekday(1);
      setDayOfMonth(1);
      setTime('09:00');
      setEmail(true);
      setInApp(true);
    }
  }, [open, question]);

  const next = useMemo(
    () =>
      computeNextRun(
        cadence,
        cadence === 'weekly' ? weekday : null,
        cadence === 'monthly' ? dayOfMonth : null,
        time,
        new Date(),
      ),
    [cadence, weekday, dayOfMonth, time],
  );

  const channels: ScheduleChannel[] = [
    ...(inApp ? (['in_app'] as const) : []),
    ...(email ? (['email'] as const) : []),
  ];
  const canSave = title.trim().length > 0 && channels.length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await createSchedule({
        title: title.trim(),
        question,
        cadence,
        weekday: cadence === 'weekly' ? weekday : null,
        day_of_month: cadence === 'monthly' ? dayOfMonth : null,
        time_ist: time,
        channels,
      });
      if (res.ok) {
        toast.success(
          res.next_run_at
            ? `Scheduled. First answer ${formatIstDateTime(res.next_run_at)}.`
            : 'Scheduled.',
        );
        onOpenChange(false);
        onCreated?.();
      } else {
        toast.error(res.error ?? 'Could not save the schedule.');
      }
    } catch {
      toast.error('Could not save the schedule. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Opens from INSIDE the History sheet (z-[85]/z-[90], components/ui/sheet.tsx):
          raise the dialog and its backdrop above it, or it renders dimmed and
          unclickable behind the sheet. Same fix as request-eligibility-dialog. */}
      <DialogContent className="z-[100] sm:max-w-md" overlayClassName="z-[95]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" />
            Repeat this question
          </DialogTitle>
          <DialogDescription className="text-xs">
            The AI Assistant will ask it again on your schedule and send you the answer. It only
            ever uses what your own account can see.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground/90 line-clamp-3">
            {question}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="schedule-title">Name</Label>
            <Input
              id="schedule-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="For example: Weekly attendance summary"
            />
            <p className="text-xs text-muted-foreground">This is the subject of the email.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>How often</Label>
              <Select value={cadence} onValueChange={(v) => setCadence(v as ScheduleCadence)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="weekly">Every week</SelectItem>
                  <SelectItem value="monthly">Every month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cadence === 'weekly' && (
              <div className="space-y-1.5">
                <Label>Which day</Label>
                <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_NAMES.map((name, i) => (
                      <SelectItem key={name} value={String(i)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {cadence === 'monthly' && (
              <div className="space-y-1.5">
                <Label>Which date</Label>
                <Select value={String(dayOfMonth)} onValueChange={(v) => setDayOfMonth(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {DAY_OPTIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>What time (IST)</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {formatTimeIst(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {cadence === 'monthly' && dayOfMonth > 28 && (
            <p className="text-xs text-muted-foreground">
              In a month without the {dayOfMonth}th, it runs on the last day of that month.
            </p>
          )}

          <div className="space-y-2">
            <Label>Send the answer to me by</Label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={email} onCheckedChange={(c) => setEmail(c === true)} />
                Email
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={inApp} onCheckedChange={(c) => setInApp(c === true)} />
                Notification in MyJKKN
              </label>
            </div>
            {channels.length === 0 && (
              <p className="text-xs text-red-600 dark:text-red-400">Choose at least one.</p>
            )}
          </div>

          {next && (
            <p className="text-xs text-muted-foreground">
              First answer: <span className="font-medium text-foreground">{formatIstDateTime(next)}</span>{' '}
              (it can arrive up to about 30 minutes later).
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ScheduleDialog;
