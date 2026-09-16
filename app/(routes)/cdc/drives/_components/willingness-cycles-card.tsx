'use client';

/**
 * Willingness Settings / Control / History for one drive (edit page).
 *
 * All date-times are entered and displayed in IST (Asia/Kolkata) regardless of
 * the browser's zone; the API receives ISO strings with a +05:30 offset.
 *
 * Data: /api/cdc/drives/[id]/willingness-cycles (see willingness-cycles.ts for
 * the one-notification-per-cycle rule).
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Bell, CalendarClock, History, Loader2, RotateCcw, Save } from 'lucide-react';
import { useCdcWillingnessCycles, useCdcWillingnessCycleMutation } from '@/hooks/cdc/use-cdc-willingness-cycles';
import type { CdcDriveStatus, CdcWillingnessCycle, CdcWillingnessCycleDisplayStatus } from '@/types/cdc';
import { CDC_WILLINGNESS_CYCLE_STATUS_LABELS } from '@/types/cdc';

const IST = 'Asia/Kolkata';
const IST_OFFSET = '+05:30';

/** ISO timestamp → { date: 'YYYY-MM-DD', time: 'HH:MM' } in IST. */
function isoToIst(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` };
}

/** IST date + time inputs → ISO with the +05:30 offset (null when the date is empty). */
function istToIso(date: string, time: string): string | null {
  if (!date) return null;
  return `${date}T${time || '00:00'}:00${IST_OFFSET}`;
}

export function formatIst(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: IST, dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_VARIANT: Record<CdcWillingnessCycleDisplayStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  scheduled: 'secondary',
  open: 'default',
  reopened: 'default',
  closed: 'outline',
  expired: 'destructive',
};

function CycleStatusBadge({ status }: { status: CdcWillingnessCycleDisplayStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className="gap-1">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {CDC_WILLINGNESS_CYCLE_STATUS_LABELS[status]}
    </Badge>
  );
}

function WindowFields({
  idPrefix,
  openDate,
  openTime,
  closeDate,
  closeTime,
  onChange,
  disabled,
}: {
  idPrefix: string;
  openDate: string;
  openTime: string;
  closeDate: string;
  closeTime: string;
  onChange: (next: { openDate?: string; openTime?: string; closeDate?: string; closeTime?: string }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-open-date`}>Open Date &amp; Time</Label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input id={`${idPrefix}-open-date`} type="date" value={openDate} disabled={disabled} onChange={(e) => onChange({ openDate: e.target.value })} />
          <Input id={`${idPrefix}-open-time`} type="time" value={openTime} disabled={disabled} onChange={(e) => onChange({ openTime: e.target.value })} className="w-32" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-close-date`}>Close Date &amp; Time</Label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input id={`${idPrefix}-close-date`} type="date" value={closeDate} disabled={disabled} onChange={(e) => onChange({ closeDate: e.target.value })} />
          <Input id={`${idPrefix}-close-time`} type="time" value={closeTime} disabled={disabled} onChange={(e) => onChange({ closeTime: e.target.value })} className="w-32" />
        </div>
        <p className="text-xs text-muted-foreground">Leave the close date empty for no deadline.</p>
      </div>
    </div>
  );
}

function describeDispatch(dispatched: { cycle_no: number; notify?: { notified: number; skipped?: string }; error?: string }[]): string | null {
  const d = dispatched[0];
  if (!d) return null;
  if (d.error) return `Notification failed: ${d.error}`;
  if (d.notify?.skipped === 'no_recipients') return 'No learner matched the audience, so nobody was notified.';
  if (d.notify?.skipped) return 'Learners were already notified for this cycle.';
  return `${d.notify?.notified ?? 0} learner${d.notify?.notified === 1 ? '' : 's'} notified (cycle ${d.cycle_no}).`;
}

export function WillingnessCyclesCard({ driveId, driveStatus }: { driveId: string; driveStatus: CdcDriveStatus }) {
  const { data, isLoading, error } = useCdcWillingnessCycles(driveId);
  const mutation = useCdcWillingnessCycleMutation(driveId);
  const current = data?.current ?? null;

  // Settings form seeded from the current cycle (render-time derivation, keyed on the cycle row).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [form, setForm] = useState({ openDate: '', openTime: '', closeDate: '', closeTime: '' });
  const seedKey = current ? `${current.id}:${current.updated_at}` : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    const o = isoToIst(current?.open_at);
    const c = isoToIst(current?.close_at);
    setForm({ openDate: o.date, openTime: o.time, closeDate: c.date, closeTime: c.time });
  }

  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenForm, setReopenForm] = useState({ openDate: '', openTime: '', closeDate: '', closeTime: '', reason: '' });

  const cyclesStarted = !!current;
  const editable = driveStatus !== 'closed' && driveStatus !== 'cancelled';

  async function saveSettings() {
    const open_at = istToIso(form.openDate, form.openTime);
    if (!open_at) {
      toast.error('Open date is required.');
      return;
    }
    try {
      const res = await mutation.mutateAsync({ action: 'update', open_at, close_at: istToIso(form.closeDate, form.closeTime) });
      const note = describeDispatch(res.dispatched);
      toast.success(note ? `Willingness settings saved. ${note}` : 'Willingness settings saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save settings');
    }
  }

  function openReopenDialog() {
    const now = new Date();
    const o = isoToIst(now.toISOString());
    setReopenForm({ openDate: o.date, openTime: o.time, closeDate: '', closeTime: '', reason: '' });
    setReopenOpen(true);
  }

  async function confirmReopen() {
    const open_at = istToIso(reopenForm.openDate, reopenForm.openTime);
    if (!open_at) {
      toast.error('Open date is required.');
      return;
    }
    try {
      const res = await mutation.mutateAsync({
        action: 'reopen',
        open_at,
        close_at: istToIso(reopenForm.closeDate, reopenForm.closeTime),
        reason: reopenForm.reason.trim() || null,
      });
      setReopenOpen(false);
      const note = describeDispatch(res.dispatched);
      toast.success(
        `Willingness reopened (cycle ${res.cycle.cycle_no}). ` +
          (note ?? 'Learners will be notified when the open time arrives.')
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reopen willingness');
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      {/* Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Willingness Settings
          </CardTitle>
          <CardDescription>
            Learners can submit willingness only between these times. Timezone: IST (Asia/Kolkata).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error instanceof Error ? error.message : 'Failed to load'}</p>
          ) : !cyclesStarted ? (
            <p className="text-sm text-muted-foreground">
              Willingness has not been opened yet. Set the deadline in the form above; the first cycle starts when
              the drive moves to <strong>Willingness Open</strong>.
            </p>
          ) : (
            <>
              <WindowFields idPrefix="ws" {...form} onChange={(n) => setForm((f) => ({ ...f, ...n }))} disabled={!editable || mutation.isPending} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Current Status</span>
                  <CycleStatusBadge status={current!.display_status} />
                  <span className="text-xs text-muted-foreground">
                    Cycle {current!.cycle_no}
                    {current!.notification_sent ? ` · notified ${formatIst(current!.notification_sent_at)}` : ' · notification pending'}
                  </span>
                </div>
                <Button onClick={saveSettings} disabled={!editable || mutation.isPending}>
                  {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Settings
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Saving does not re-notify learners. The notification for this cycle is sent once, when the open time
                arrives.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Control */}
      {cyclesStarted ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
              Willingness Control
            </CardTitle>
            <CardDescription>
              Reopen starts a new cycle with its own open/close window and sends a fresh notification to every
              assigned learner. Learners can submit or update their response again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={openReopenDialog} disabled={!data?.can_reopen || mutation.isPending}>
              <RotateCcw className="h-4 w-4 mr-2" /> Reopen Willingness
            </Button>
            {!data?.can_reopen ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Reopening is available while the drive is in Willingness Open or Eligibility Locked.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* History */}
      {cyclesStarted ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              Willingness History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {[...(data?.cycles ?? [])].reverse().map((c: CdcWillingnessCycle) => (
                <li key={c.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">Cycle {c.cycle_no}</span>
                    <CycleStatusBadge status={c.display_status} />
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {formatIst(c.open_at)} → {c.close_at ? formatIst(c.close_at) : 'no deadline'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <Bell className="h-3 w-3" />
                    Notification: {c.notification_sent ? `Sent ${formatIst(c.notification_sent_at)} · ${c.notified_count} learner${c.notified_count === 1 ? '' : 's'}` : 'Pending'}
                  </p>
                  {c.reopen_reason ? <p className="mt-1 text-xs text-muted-foreground">Reason: {c.reopen_reason}</p> : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reopen Willingness</DialogTitle>
            <DialogDescription>
              Cycle {(current?.cycle_no ?? 0) + 1}. Every assigned learner receives a new notification when the open
              time arrives. Times are IST.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <WindowFields idPrefix="ro" {...reopenForm} onChange={(n) => setReopenForm((f) => ({ ...f, ...n }))} disabled={mutation.isPending} />
            <div className="space-y-1.5">
              <Label htmlFor="ro-reason">Reopen reason (optional)</Label>
              <Textarea id="ro-reason" rows={2} value={reopenForm.reason} onChange={(e) => setReopenForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Deadline extended at recruiter's request" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button onClick={confirmReopen} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Confirm reopening
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
