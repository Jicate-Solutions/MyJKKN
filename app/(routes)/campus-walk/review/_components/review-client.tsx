'use client';

/**
 * Campus Walk — the Director's approvals queue.
 *
 * The person reading this is walking. He has a phone in one hand and about four
 * seconds per ticket. Every decision below follows from that:
 *
 *   · The two photos are the screen. Reported on the left, done on the right.
 *     Anything that let him approve without looking at both would quietly undo
 *     guardrail G5 — closure verification is the entire product.
 *   · Approving is ONE tap. Sending back costs a sentence, because a rejection
 *     with no reason is a job the fixer cannot redo.
 *   · A decided card leaves the list immediately. The queue is a queue; it
 *     should visibly get shorter.
 *   · The ticket says "Management walk" and never names who reported it (D10).
 *     The person who DID the work is named — he is approving their work, and
 *     they deserve the credit.
 *   · A failed decision never clears the note the Director just typed.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ImageOff,
  Loader2,
  RotateCcw,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

// ── Types shared with the server component ──────────────────────────────────

export type ReviewDecision = 'approve' | 'request_changes';

export interface ReviewItem {
  taskId: string;
  title: string;
  description: string | null;
  /** Free-text category confirmed at capture time (D3). */
  category: string | null;
  /** D13 — a one-off condition vs. a missing system. */
  kind: 'symptom' | 'system_gap' | string | null;
  /** D6 urgent lane. */
  unsafe: boolean;
  dueDate: string | null;
  statusKey: string;
  isBlocked: boolean;
  /** Signed URLs — the `campus-walk` bucket is private and stays that way (G4). */
  problemPhotoUrl: string | null;
  fixPhotoUrl: string | null;
  submittedAt: string | null;
  /** Who did the work. Not the observer — see D10 note above. */
  submittedByName: string | null;
  fixNote: string | null;
  /** What was asked for the last time this was sent back, if it was. */
  previousAskNote: string | null;
  /** Days already taken off this deadline because the job was held up (D8). */
  slaPausedDays: number;
}

/** Matches MIN_NOTE in app/api/campus-walk/review/route.ts. */
const MIN_NOTE = 4;

// ── Small helpers ───────────────────────────────────────────────────────────

function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMoment(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Was due today" / "3 days late" — no date arithmetic in the head. */
function dueLabel(dueDate: string | null): { text: string; tone: 'ok' | 'warn' | 'late' } {
  if (!dueDate) return { text: 'No deadline was set', tone: 'ok' };
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return { text: 'No deadline was set', tone: 'ok' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) {
    return {
      text: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} past its deadline`,
      tone: 'late',
    };
  }
  if (days === 0) return { text: 'Due today', tone: 'warn' };
  return { text: `Due ${formatDay(dueDate)}`, tone: 'ok' };
}

// ── One photo ───────────────────────────────────────────────────────────────

function Photo({
  url,
  label,
  missingText,
  missingTone,
}: {
  url: string | null;
  label: string;
  missingText: string;
  missingTone: 'muted' | 'warn';
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {url ? (
        // Tapping opens the full photo — a thumbnail is not proof on a phone.
        <a href={url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="aspect-[4/3] w-full rounded-md border object-cover"
          />
        </a>
      ) : (
        <div
          className={
            'flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-md border px-3 text-center text-xs ' +
            (missingTone === 'warn'
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'bg-muted text-muted-foreground')
          }
        >
          <ImageOff className="h-5 w-5" />
          <span>{missingText}</span>
        </div>
      )}
    </div>
  );
}

// ── One ticket ──────────────────────────────────────────────────────────────

function ReviewCard({
  item,
  onDecided,
}: {
  item: ReviewItem;
  onDecided: (taskId: string) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const due = dueLabel(item.dueDate);

  const decide = useCallback(
    async (decision: ReviewDecision) => {
      if (busy) return;
      if (decision === 'request_changes' && note.trim().length < MIN_NOTE) {
        setError('Say what needs redoing — this note is the only thing they will see.');
        return;
      }

      setBusy(decision);
      setError(null);

      try {
        const res = await fetch('/api/campus-walk/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: item.taskId,
            decision,
            ...(decision === 'request_changes' ? { note: note.trim() } : {}),
          }),
        });
        const json = await res.json().catch(() => ({}) as any);

        if (res.ok && json?.ok) {
          toast({
            title: decision === 'approve' ? 'Approved and closed' : 'Sent back',
            description:
              json.message ??
              (decision === 'approve'
                ? 'The job is closed and the person who fixed it has been told.'
                : 'They have been told what to redo.'),
          });
          onDecided(item.taskId);
          router.refresh();
          return;
        }

        // The note stays on screen. Retyping a rejection because the network
        // blinked is exactly the friction that stops people reviewing at all.
        setError(json?.error ?? 'That did not go through. Please try again.');
      } catch {
        setError('No connection. Nothing was changed — try again when you have signal.');
      } finally {
        setBusy(null);
      }
    },
    [busy, note, item.taskId, toast, onDecided, router]
  );

  return (
    <Card className={item.unsafe ? 'border-red-300' : undefined}>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          {/* D10: the ticket is attributed to the walk, never to a person. */}
          <Badge variant="secondary">Management walk</Badge>
          {item.unsafe && (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" />
              Safety
            </Badge>
          )}
          {item.category && <Badge variant="outline">{item.category}</Badge>}
          {item.kind === 'system_gap' && <Badge variant="outline">Needs a proper fix</Badge>}
          {item.isBlocked && <Badge variant="outline">Was held up</Badge>}
        </div>

        <div>
          <h3 className="text-base font-semibold leading-snug">{item.title}</h3>
          {item.description && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {item.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5" />
            {item.submittedByName ? `Fixed by ${item.submittedByName}` : 'Fixed by a team member'}
          </span>
          {item.submittedAt && <span>Sent {formatMoment(item.submittedAt)}</span>}
          <span
            className={
              'inline-flex items-center gap-1 ' +
              (due.tone === 'late'
                ? 'font-medium text-red-700'
                : due.tone === 'warn'
                  ? 'font-medium text-amber-700'
                  : '')
            }
          >
            <Clock className="h-3.5 w-3.5" />
            {due.text}
          </span>
          {item.slaPausedDays > 0 && (
            <span>
              {item.slaPausedDays} day{item.slaPausedDays === 1 ? '' : 's'} were taken off the
              deadline
            </span>
          )}
        </div>

        {/* ── G5: the proof, side by side ─────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Photo
            url={item.problemPhotoUrl}
            label="What was reported"
            missingText="No photo was attached to the report."
            missingTone="muted"
          />
          <Photo
            url={item.fixPhotoUrl}
            label="What was done"
            // Deliberately a warning, not a disabled Approve button: a photo can
            // be missing here because the signed URL failed, not because the work
            // was never proved, and locking the button would strand the ticket
            // with nobody able to close it — the exact failure this screen exists
            // to remove. Warn loudly, let the Director judge.
            missingText="No fix photo could be loaded. Do not approve without seeing the work."
            missingTone="warn"
          />
        </div>

        {item.fixNote && (
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What they said
            </p>
            <p className="whitespace-pre-wrap">{item.fixNote}</p>
          </div>
        )}

        {/* Was this one already sent back once? Then the only question that
            matters is whether the thing you asked for was actually done. */}
        {item.previousAskNote && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="mb-0.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
              <RotateCcw className="h-3.5 w-3.5" />
              You sent this back before, asking for
            </p>
            <p className="whitespace-pre-wrap">{item.previousAskNote}</p>
          </div>
        )}

        {/* ── Decide ──────────────────────────────────────────────────────── */}
        {sendBackOpen ? (
          <div className="space-y-2 rounded-md border p-3">
            <Label htmlFor={`note-${item.taskId}`} className="text-sm">
              What needs redoing?
            </Label>
            <Textarea
              id={`note-${item.taskId}`}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. The sill is clean but the broken latch is still there."
              rows={3}
              maxLength={2000}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              They see this note and nothing else, so say the one thing to fix.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                className="h-11 flex-1"
                onClick={() => void decide('request_changes')}
                disabled={busy !== null}
              >
                {busy === 'request_changes' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Send back
              </Button>
              <Button
                variant="ghost"
                className="h-11"
                onClick={() => {
                  setSendBackOpen(false);
                  setError(null);
                }}
                disabled={busy !== null}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11 flex-1 bg-green-700 text-white hover:bg-green-800"
              onClick={() => void decide('approve')}
              disabled={busy !== null}
            >
              {busy === 'approve' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Approve and close
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-1"
              onClick={() => setSendBackOpen(true)}
              disabled={busy !== null}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Send back for changes
            </Button>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-1.5 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── The queue ───────────────────────────────────────────────────────────────

export function ReviewClient({ items }: { items: ReviewItem[] }) {
  // Decided cards leave the list at once, before router.refresh() catches up.
  // On a campus connection that refresh can take seconds, and a queue that does
  // not visibly shrink invites the same ticket being decided twice.
  const [decidedIds, setDecidedIds] = useState<Set<string>>(() => new Set());

  const onDecided = useCallback((taskId: string) => {
    setDecidedIds((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
  }, []);

  const visible = useMemo(
    () => items.filter((i) => !decidedIds.has(i.taskId)),
    [items, decidedIds]
  );

  const unsafeCount = visible.filter((i) => i.unsafe).length;

  if (visible.length === 0) {
    return (
      <Card className="mx-auto mt-4 w-full max-w-3xl border-green-300 bg-green-50">
        <CardContent className="flex items-start gap-3 py-6">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
          <div>
            <p className="font-medium text-green-900">All clear</p>
            <p className="text-sm text-green-900/80">
              You have decided everything that was waiting. Pull to refresh if you are expecting
              more.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        {visible.length} job{visible.length === 1 ? '' : 's'} waiting on your decision
        {unsafeCount > 0 && (
          <span className="font-medium text-red-700">
            {' '}
            — {unsafeCount} safety {unsafeCount === 1 ? 'job is' : 'jobs are'} first
          </span>
        )}
        .
      </p>

      {visible.map((item) => (
        <ReviewCard key={item.taskId} item={item} onDecided={onDecided} />
      ))}
    </div>
  );
}
