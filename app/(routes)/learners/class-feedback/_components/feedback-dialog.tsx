'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { BeatLoader } from 'react-spinners';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { useChecklistConfig, useSubmitFeedback } from '@/hooks/use-session-feedback';
import type { PendingSession } from '@/types/session-feedback';

const BRAND = '#0b6d41';

// 1–5 understanding scale. Lowest = "Lost", highest = "Crystal clear".
const UNDERSTOOD_SCALE: { value: number; label: string }[] = [
  { value: 1, label: 'Lost' },
  { value: 2, label: 'Shaky' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Clear' },
];

interface FeedbackDialogProps {
  /** The pending session being confirmed; null = dialog closed. */
  session: PendingSession | null;
  onOpenChange: (open: boolean) => void;
  /** Capture channel — 'live_poll' when answering an in-class Live Pulse. Default 'async'. */
  source?: 'async' | 'live_poll';
}

export function FeedbackDialog({ session, onOpenChange, source = 'async' }: FeedbackDialogProps) {
  const { data: checklistConfig, isLoading: loadingChecklist } = useChecklistConfig();
  const submit = useSubmitFeedback();

  const [understood, setUnderstood] = useState<number | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [freeText, setFreeText] = useState('');

  // Reset the form whenever a new session is opened.
  useEffect(() => {
    if (session) {
      setUnderstood(null);
      setChecklist({});
      setFreeText('');
    }
  }, [session]);

  const items = useMemo(() => checklistConfig ?? [], [checklistConfig]);
  const open = session !== null;

  const courseLabel =
    session?.course_name || session?.course_code || 'Class session';
  const periodLabel = session?.period_name || session?.start_time || null;

  async function handleSubmit() {
    if (!session) return;
    if (understood === null) {
      toast.error('Pick how well you understood the class.');
      return;
    }
    try {
      await submit.mutateAsync({
        attendanceDate: session.attendance_date,
        timetableId: session.timetable_id,
        periodId: session.period_id,
        understood,
        checklist,
        freeText: freeText.trim() ? freeText.trim() : null,
        source,
      });
      toast.success('Thanks! Your attendance for this class is now confirmed.');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit feedback.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ color: BRAND }}>{courseLabel}</DialogTitle>
          <DialogDescription>
            {[
              session?.course_code && session.course_name ? session.course_code : null,
              session?.faculty_name,
              periodLabel,
            ]
              .filter(Boolean)
              .join(' · ') || 'Quick feedback — takes about 10 seconds.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Understanding 1–5 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">How well did you understand?</Label>
            <div className="flex gap-2">
              {UNDERSTOOD_SCALE.map((opt) => {
                const selected = understood === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setUnderstood(opt.value)}
                    aria-pressed={selected}
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-2 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40 ${
                      selected
                        ? 'border-[#0b6d41] bg-[#0b6d41] text-white'
                        : 'border-input bg-background hover:bg-muted'
                    }`}
                  >
                    <span className="text-base font-semibold leading-none">{opt.value}</span>
                    <span className={selected ? 'text-white/90' : 'text-muted-foreground'}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Checklist */}
          {loadingChecklist ? (
            <div className="flex justify-center py-2">
              <BeatLoader color={BRAND} size={8} />
            </div>
          ) : items.length > 0 ? (
            <div className="space-y-3">
              <Label className="text-sm font-medium">In this class…</Label>
              <div className="space-y-2.5">
                {items.map((item) => {
                  const checked = !!checklist[item.item_key];
                  return (
                    <div key={item.id} className="flex items-start gap-2.5">
                      <Checkbox
                        id={`scf-${item.item_key}`}
                        checked={checked}
                        onCheckedChange={(v) =>
                          setChecklist((prev) => ({ ...prev, [item.item_key]: v === true }))
                        }
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor={`scf-${item.item_key}`}
                        className="text-sm font-normal leading-snug cursor-pointer"
                      >
                        {item.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Free text */}
          <div className="space-y-2">
            <Label htmlFor="scf-free-text" className="text-sm font-medium">
              Anything to add? <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="scf-free-text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="A doubt, a suggestion, anything…"
              rows={2}
              className="resize-none"
            />
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />
            Submitting confirms your attendance for this class.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submit.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submit.isPending}
            className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
          >
            {submit.isPending ? (
              <BeatLoader color="#ffffff" size={8} />
            ) : (
              <>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Confirm & submit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
