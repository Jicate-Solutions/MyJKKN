'use client';

// app/(routes)/instasolver/my-reports/_components/my-reports-client.tsx
//
// The list of the viewer's own reports, phone-first. Two actions (Director,
// 2026-09-30): "Not fixed" — on a job marked fixed within the last 7 days, the
// reporter can send it straight back to the people who fix it, with an
// optional one-line note — and "Say thanks": 1–5 stars, an optional line and
// "Sign with my name", once per fix. The server decides which cards get each
// (`canSayNotFixed`, `canRate`); the routes re-check independently.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, ImageOff, Loader2, MapPin, RotateCcw, Star, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { THANKS_MAX, type ReportStatus } from '@/lib/campus-walk/my-reports';

export interface MyReport {
  taskId: string;
  title: string;
  place: string | null;
  status: ReportStatus;
  statusLabel: string;
  dueDate: string | null;
  reportedAt: string | null;
  fixedAt: string | null;
  hasBeforePhoto: boolean;
  beforePhotoUrl: string | null;
  hasAfterPhoto: boolean;
  afterPhotoUrl: string | null;
  /** The viewer added to somebody else's open report instead of filing a new one. */
  joined: boolean;
  /** Other reporters' words only — never who said them (ruling, 1 Oct 2026). */
  alsoReported: string[];
  canSayNotFixed: boolean;
  /** A fixed job the viewer has not yet given stars for THIS fix. */
  canRate: boolean;
  /** The stars the viewer already gave for this fix, if any. */
  myRating: { stars: number; thanks: string | null; signed: boolean } | null;
}

const NOTE_MAX = 200;

/** Status colours per design-system/MASTER.md §6 — 700 weights on white. */
const STATUS_TONE: Record<ReportStatus, string> = {
  open: 'border-amber-300 text-amber-700 dark:text-amber-400',
  being_checked: 'border-blue-300 text-blue-700 dark:text-blue-400',
  fixed: 'border-green-300 text-green-700 dark:text-emerald-400',
  reopened: 'border-red-300 text-red-600 dark:text-red-400',
  cancelled: 'border-border text-muted-foreground',
  closed: 'border-border text-muted-foreground',
};

function formatDay(value: string | null): string {
  if (!value) return '';
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function Photo({ label, url, had }: { label: string; url: string | null; had: boolean }) {
  return (
    <figure className="space-y-1">
      <figcaption className="text-xs font-medium text-muted-foreground">{label}</figcaption>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={label}
          className="aspect-square w-full rounded-md border object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border bg-muted text-center text-xs text-muted-foreground">
          <ImageOff className="h-5 w-5" aria-hidden="true" />
          <span className="px-2">{had ? 'Photo no longer kept' : 'No photo'}</span>
        </div>
      )}
    </figure>
  );
}

/**
 * Stars and thanks (Director, 2026-09-30). Five big tappable stars, an optional
 * one-line thanks, and "Sign with my name" — off by default, so the person who
 * fixed it reads "Someone thanked you" unless the reporter chooses otherwise.
 * One rating per fix; the route and the database both hold that line.
 */
function ThanksPanel({ taskId }: { taskId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [stars, setStars] = useState(0);
  const [thanks, setThanks] = useState('');
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (busy || stars < 1) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/instasolver/thanks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, stars, thanks: thanks.trim() || undefined, signed }),
      });
      const json = await res.json().catch(() => ({}) as any);
      if (res.ok && json?.success) {
        toast({ title: 'Thank you', description: json.message ?? 'Your stars are saved.' });
        router.refresh();
        return;
      }
      setError(json?.error ?? 'That did not go through. Please try again.');
    } catch {
      setError('No connection. Please try again when you have signal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">How was the fix?</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Stars for this fix">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => setStars(n)}
            disabled={busy}
            className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star
              className={`h-7 w-7 ${
                n <= stars ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'
              }`}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`thanks-${taskId}`} className="text-sm">
          Say thanks <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id={`thanks-${taskId}`}
          value={thanks}
          onChange={(e) => setThanks(e.target.value.slice(0, THANKS_MAX))}
          placeholder="Thank you — the tap works now"
          className="h-11"
          autoComplete="off"
          disabled={busy}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`sign-${taskId}`} className="text-sm">
          Sign with my name
          <span className="block text-xs font-normal text-muted-foreground">
            {signed ? 'They will see your name.' : 'They will see “Someone thanked you”.'}
          </span>
        </Label>
        <Switch id={`sign-${taskId}`} checked={signed} onCheckedChange={setSigned} disabled={busy} />
      </div>
      {error && (
        <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      <Button className="h-12 w-full text-base" onClick={() => void send()} disabled={busy || stars < 1}>
        {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
        {busy ? 'Sending…' : stars < 1 ? 'Tap the stars first' : 'Send thanks'}
      </Button>
    </div>
  );
}

function GivenStars({ rating }: { rating: NonNullable<MyReport['myRating']> }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span className="flex" aria-label={`You gave ${rating.stars} of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`h-4 w-4 ${n <= rating.stars ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`}
            aria-hidden="true"
          />
        ))}
      </span>
      <span>You thanked them{rating.signed ? ' with your name' : ''}.</span>
    </div>
  );
}

function ReportCard({ report, windowDays }: { report: MyReport; windowDays: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showPhotos = report.hasBeforePhoto || report.hasAfterPhoto;

  async function sendNotFixed() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/campus-walk/not-fixed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: report.taskId, note: note.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}) as any);
      if (res.ok && json?.success) {
        toast({ title: 'Sent back', description: json.message ?? 'It is back with the people who fix it.' });
        setOpen(false);
        setNote('');
        router.refresh();
        return;
      }
      setError(json?.error ?? 'That did not go through. Please try again.');
    } catch {
      setError('No connection. Please try again when you have signal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 flex-1 font-medium leading-snug">{report.title}</p>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[report.status]}`}
          >
            {report.statusLabel}
          </span>
        </div>

        {report.place && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            {report.place}
          </p>
        )}

        {report.joined && (
          <p className="text-sm text-muted-foreground">
            You added to this report — someone had already reported it. You will be told when it is fixed.
          </p>
        )}

        {report.alsoReported.length > 0 && (
          <ul className="space-y-1 border-l-2 pl-3 text-sm text-muted-foreground">
            {report.alsoReported.map((words, i) => (
              <li key={i} className="break-words">
                Someone also reported: “{words}”
              </li>
            ))}
          </ul>
        )}

        <p className="text-sm text-muted-foreground">
          {report.reportedAt ? `Reported ${formatDay(report.reportedAt)}` : 'Reported'}
          {report.status === 'fixed' && report.fixedAt
            ? ` · Fixed ${formatDay(report.fixedAt)}`
            : report.dueDate && (report.status === 'open' || report.status === 'reopened')
              ? ` · Due ${formatDay(report.dueDate)}`
              : ''}
        </p>

        {showPhotos && (
          <div className="grid grid-cols-2 gap-3">
            <Photo label="Before" url={report.beforePhotoUrl} had={report.hasBeforePhoto} />
            {report.status === 'fixed' || report.status === 'being_checked' ? (
              <Photo label="After" url={report.afterPhotoUrl} had={report.hasAfterPhoto} />
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">After</p>
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed text-center text-xs text-muted-foreground">
                  <Wrench className="h-5 w-5" aria-hidden="true" />
                  <span className="px-2">Not fixed yet</span>
                </div>
              </div>
            )}
          </div>
        )}

        {report.myRating && <GivenStars rating={report.myRating} />}

        {report.canRate && !open && <ThanksPanel taskId={report.taskId} />}

        {report.canSayNotFixed && !open && (
          <Button
            variant="outline"
            className="h-12 w-full border-red-300 text-base text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
            onClick={() => setOpen(true)}
          >
            <RotateCcw className="mr-2 h-5 w-5" aria-hidden="true" />
            Not fixed
          </Button>
        )}

        {report.canSayNotFixed && open && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1.5">
              <Label htmlFor={`note-${report.taskId}`} className="text-sm">
                What is still wrong? <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id={`note-${report.taskId}`}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                placeholder="The tap is still dripping"
                className="h-11"
                autoComplete="off"
              />
            </div>
            {error && (
              <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="h-12 flex-1 text-base" onClick={() => void sendNotFixed()} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                {busy ? 'Sending…' : 'Send it back — not fixed'}
              </Button>
              <Button
                variant="outline"
                className="h-12 sm:w-32"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              It goes back to the people who fix it with a new deadline. You can do this for{' '}
              {windowDays} days after it is marked fixed.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MyReportsClient({ reports, windowDays }: { reports: MyReport[]; windowDays: number }) {
  if (reports.length === 0) {
    return (
      <Card className="mt-6 max-w-2xl">
        <CardContent className="flex items-start gap-3 py-6">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-2">
            <p className="font-medium">You have not reported anything yet</p>
            <p className="text-sm text-muted-foreground">
              When you report something broken, it shows up here and you can see when it is fixed.
            </p>
            <Button asChild className="h-11">
              <Link href="/instasolver/broken">Report something broken</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-4 max-w-2xl space-y-3">
      <p className="text-sm text-muted-foreground">
        {reports.length} report{reports.length === 1 ? '' : 's'}, newest first.
      </p>
      {reports.map((r) => (
        <ReportCard key={r.taskId} report={r} windowDays={windowDays} />
      ))}
    </div>
  );
}
