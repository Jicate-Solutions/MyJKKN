'use client';

// app/(routes)/campus-walk/spot-checks/_components/spot-checks-client.tsx
//
// Phone-first list of spot checks (Director, 2026-09-30 interview, ruling 3):
// before and after photos side by side and two big buttons. "Not fixed" takes
// an optional one-line note and reopens the job the same way the reporter's
// button does. The server decides which cards appear; the route re-checks.
//
// Below it, for a college head: open jobs of their college that a reporter has
// sent back twice or more (ruling 1) — read-only, so the head can see them.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, ImageOff, Loader2, MapPin, RotateCcw, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export interface SpotCheckItem {
  taskId: string;
  title: string;
  place: string | null;
  closedAt: string | null;
  hasBeforePhoto: boolean;
  beforePhotoUrl: string | null;
  hasAfterPhoto: boolean;
  afterPhotoUrl: string | null;
  fixNote: string | null;
}

export interface FailedTwiceItem {
  taskId: string;
  title: string;
  place: string | null;
  notFixedCount: number;
  dueDate: string | null;
  hasBeforePhoto: boolean;
  beforePhotoUrl: string | null;
}

const NOTE_MAX = 200;

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
        <img src={url} alt={label} className="aspect-square w-full rounded-md border object-cover" loading="lazy" />
      ) : (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border bg-muted text-center text-xs text-muted-foreground">
          <ImageOff className="h-5 w-5" aria-hidden="true" />
          <span className="px-2">{had ? 'Photo no longer kept' : 'No photo'}</span>
        </div>
      )}
    </figure>
  );
}

function SpotCheckCard({ item }: { item: SpotCheckItem }) {
  const router = useRouter();
  const { toast } = useToast();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'looks_fixed' | 'not_fixed' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(verdict: 'looks_fixed' | 'not_fixed') {
    if (busy) return;
    setBusy(verdict);
    setError(null);
    try {
      const res = await fetch('/api/campus-walk/spot-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: item.taskId, verdict, note: note.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}) as any);
      if (res.ok && json?.success) {
        toast({ title: verdict === 'looks_fixed' ? 'Checked' : 'Sent back', description: json.message ?? 'Saved.' });
        router.refresh();
        return;
      }
      setError(json?.error ?? 'That did not go through. Please try again.');
    } catch {
      setError('No connection. Please try again when you have signal.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <p className="font-medium leading-snug">{item.title}</p>
        {item.place && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            {item.place}
          </p>
        )}
        {item.closedAt && <p className="text-sm text-muted-foreground">Closed {formatDay(item.closedAt)}</p>}

        <div className="grid grid-cols-2 gap-3">
          <Photo label="Before" url={item.beforePhotoUrl} had={item.hasBeforePhoto} />
          <Photo label="After" url={item.afterPhotoUrl} had={item.hasAfterPhoto} />
        </div>
        {item.fixNote && <p className="text-sm text-muted-foreground">Fixer&rsquo;s note: {item.fixNote}</p>}

        {noteOpen && (
          <div className="space-y-1.5">
            <Label htmlFor={`note-${item.taskId}`} className="text-sm">
              What is still wrong? <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`note-${item.taskId}`}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="The crack is still there"
              className="h-11"
              autoComplete="off"
            />
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {!noteOpen && (
            <Button className="h-12 flex-1 text-base" onClick={() => void send('looks_fixed')} disabled={busy !== null}>
              {busy === 'looks_fixed' ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <ThumbsUp className="mr-2 h-5 w-5" aria-hidden="true" />
              )}
              Looks fixed
            </Button>
          )}
          <Button
            variant="outline"
            className="h-12 flex-1 border-red-300 text-base text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
            onClick={() => (noteOpen ? void send('not_fixed') : setNoteOpen(true))}
            disabled={busy !== null}
          >
            {busy === 'not_fixed' ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-5 w-5" aria-hidden="true" />
            )}
            {noteOpen ? 'Send it back — not fixed' : 'Not fixed'}
          </Button>
          {noteOpen && (
            <Button
              variant="outline"
              className="h-12 sm:w-32"
              onClick={() => {
                setNoteOpen(false);
                setError(null);
              }}
              disabled={busy !== null}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FailedTwiceCard({ item }: { item: FailedTwiceItem }) {
  return (
    <Card className="border-red-300">
      <CardContent className="space-y-2 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 flex-1 font-medium leading-snug">{item.title}</p>
          <span className="shrink-0 rounded-full border border-red-300 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
            Not fixed ×{item.notFixedCount}
          </span>
        </div>
        {item.place && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            {item.place}
          </p>
        )}
        {item.dueDate && <p className="text-sm text-muted-foreground">Open again · due {formatDay(item.dueDate)}</p>}
        {item.hasBeforePhoto && (
          <div className="w-1/2">
            <Photo label="Reported" url={item.beforePhotoUrl} had={item.hasBeforePhoto} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SpotChecksClient({
  pending,
  failedTwice,
  showFailedTwice,
}: {
  pending: SpotCheckItem[];
  failedTwice: FailedTwiceItem[];
  showFailedTwice: boolean;
}) {
  return (
    <div className="mt-4 max-w-2xl space-y-6">
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Waiting for your check</h2>
        {pending.length === 0 ? (
          <Card>
            <CardContent className="flex items-start gap-3 py-6">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Nothing to check right now. You will get a notification when a closed job is picked.
              </p>
            </CardContent>
          </Card>
        ) : (
          pending.map((item) => <SpotCheckCard key={item.taskId} item={item} />)
        )}
      </section>

      {showFailedTwice && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Sent back twice or more</h2>
          <p className="text-sm text-muted-foreground">
            Open jobs in your college that the person who reported them has said were not fixed at least twice.
          </p>
          {failedTwice.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">None right now.</CardContent>
            </Card>
          ) : (
            failedTwice.map((item) => <FailedTwiceCard key={item.taskId} item={item} />)
          )}
        </section>
      )}
    </div>
  );
}
