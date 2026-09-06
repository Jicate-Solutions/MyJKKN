'use client';

/**
 * Campus Walk — the fixer's screen.
 *
 * The person reading this is a cleaner, a plumber or an electrician, on a phone,
 * standing next to the thing they just fixed. Every decision below follows from
 * that one fact:
 *
 *   · Two photos side by side and almost no words. The proof IS the screen.
 *   · Buttons are thumb-sized and say what happens, not what they do
 *     ("Send for approval", not "Submit").
 *   · The ticket says "Management walk" and never a person's name (D10). A named
 *     observer turns a maintenance job into being watched.
 *   · "Sent for approval" is stated plainly, because it is TRUE — a fix photo
 *     alone does not close the ticket (D4). Pretending otherwise would be the
 *     one thing that destroys trust in the whole loop.
 *   · "I can't fix this yet" is a first-class button, not a hidden escape hatch
 *     (D8). A cleaner with no supplies budget is not a slow cleaner, and the
 *     deadline visibly stops when they say so.
 *   · A failed send NEVER loses the photo. It stays on screen with a retry.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  Camera,
  CheckCircle2,
  Clock,
  Hourglass,
  Loader2,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/utils/compress-image';
import { stripImageMetadata } from '@/lib/services/pde/strip-image-metadata';

// ── Types shared with the server component ──────────────────────────────────

export type ApprovalState = 'awaiting_approval' | 'approved' | 'changes_requested';

export interface FixTicket {
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
  fix: {
    submittedAt: string | null;
    submittedByName: string | null;
    note: string | null;
    approvalState: ApprovalState | null;
    approvalNote: string | null;
    decidedAt: string | null;
  } | null;
  blocked: {
    at: string | null;
    reasonCode: string | null;
    reason: string | null;
  } | null;
  /** Days already taken off the clock by earlier blocks (D8). */
  slaPausedDays: number;
  /** True when a supervisor is closing out on behalf of their staff member. */
  actingAsDepartmentHead: boolean;
}

// D8 — the reasons a fix genuinely stalls through no fault of the fixer.
const BLOCK_REASONS: Array<{ code: string; label: string }> = [
  { code: 'no_budget', label: 'No money / supplies budget' },
  { code: 'materials_not_delivered', label: 'Materials not delivered yet' },
  { code: 'no_access', label: "Can't get into the area" },
  { code: 'needs_contractor', label: 'Needs an outside contractor' },
  { code: 'other', label: 'Something else' },
];

const REASON_LABEL: Record<string, string> = Object.fromEntries(
  BLOCK_REASONS.map((r) => [r.code, r.label])
);

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

/** "Due today" / "2 days left" / "3 days late" — no date arithmetic in the head. */
function dueLabel(dueDate: string | null, blocked: boolean): { text: string; tone: 'ok' | 'warn' | 'late' } {
  if (!dueDate) return { text: 'No deadline set', tone: 'ok' };
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return { text: 'No deadline set', tone: 'ok' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (blocked) return { text: `Deadline paused (was ${formatDay(dueDate)})`, tone: 'ok' };
  if (days < 0) return { text: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} late`, tone: 'late' };
  if (days === 0) return { text: 'Due today', tone: 'warn' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'warn' };
  return { text: `${days} days left`, tone: 'ok' };
}

// ── Component ───────────────────────────────────────────────────────────────

interface FixClientProps {
  ticket: FixTicket;
}

export function FixClient({ ticket }: FixClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);

  // The photo the fixer just took. Held here and NEVER cleared on failure —
  // losing it means walking back to the corridor.
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState<string>('');
  const [blockNote, setBlockNote] = useState('');
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  // Optimistic view of the two things a send changes, so the screen answers
  // instantly on a slow campus connection while router.refresh() catches up.
  const [submittedNow, setSubmittedNow] = useState(false);
  const [blockedNow, setBlockedNow] = useState<null | boolean>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // A photo taken but not yet sent is unsaved work. Warn before it evaporates.
  useEffect(() => {
    if (!photo) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [photo]);

  const approvalState: ApprovalState | null = submittedNow
    ? 'awaiting_approval'
    : (ticket.fix?.approvalState ?? null);

  const isBlocked = blockedNow === null ? ticket.isBlocked : blockedNow;
  const isClosed = ticket.statusKey === 'done' || approvalState === 'approved';
  const isAwaiting = !isClosed && approvalState === 'awaiting_approval';
  const changesRequested = !isClosed && approvalState === 'changes_requested';
  // The upload form is open when there is work left to prove: a fresh ticket, or
  // one sent back for changes. It stays reachable while awaiting approval too —
  // a fixer who realises the photo was blurry must be able to replace it.
  const showUploadForm = !isClosed;

  const due = dueLabel(ticket.dueDate, isBlocked);

  // ── Photo pipeline (G4) ───────────────────────────────────────────────────
  // compress -> strip EXIF, exactly as the capture side does, so both photos on
  // this ticket went through the same door. Both passes are canvas re-encodes,
  // so location and device metadata cannot survive. The SERVER re-strips and
  // fails closed — this half is speed and bandwidth, not the security boundary.
  const onPick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      setPreparing(true);
      setSendError(null);
      try {
        const compressed = await compressImage(file);
        const staged = new File([compressed], 'fix.jpg', { type: 'image/jpeg' });
        const { blob } = await stripImageMetadata(staged);
        const ready = new File([blob], 'fix.jpg', { type: 'image/jpeg' });

        setPhoto(ready);
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(ready);
        });
      } catch (err: any) {
        setSendError(
          err?.message ??
            'That photo could not be read on this phone. Please take it again with the camera.'
        );
      } finally {
        setPreparing(false);
      }
    },
    []
  );

  // ── Send the fix ──────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    if (!photo || sending) return;
    setSending(true);
    setSendError(null);

    const body = new FormData();
    body.set('task_id', ticket.taskId);
    body.set('action', 'submit');
    body.set('photo', photo);
    if (note.trim()) body.set('note', note.trim());

    try {
      const res = await fetch('/api/campus-walk/fix', { method: 'POST', body });
      const json = await res.json().catch(() => ({}) as any);

      if (res.ok && json?.ok) {
        setSubmittedNow(true);
        setBlockedNow(false);
        setPhoto(null);
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        toast({
          title: 'Sent for approval',
          description: json.message ?? 'A manager will check the photo before the job is closed.',
        });
        router.refresh();
        return;
      }

      // Everything below KEEPS the photo on screen. `photo_stored_not_recorded`
      // in particular means the bytes are already safely in the bucket and the
      // retry is a no-op upload, so the fixer loses nothing by tapping again.
      setSendError(
        json?.error ??
          'That did not go through. Your photo is still here — please tap Send again.'
      );
    } catch {
      setSendError('No connection. Your photo is still here — try again when you have signal.');
    } finally {
      setSending(false);
    }
  }, [photo, sending, ticket.taskId, note, toast, router]);

  // ── Block / unblock (D8) ──────────────────────────────────────────────────

  const submitBlock = useCallback(async () => {
    if (blockBusy) return;
    if (!blockReason) {
      setBlockError('Pick what is holding this up.');
      return;
    }
    if (blockNote.trim().length < 4) {
      setBlockError('Add a line so the office knows what to sort out.');
      return;
    }
    setBlockBusy(true);
    setBlockError(null);

    const body = new FormData();
    body.set('task_id', ticket.taskId);
    body.set('action', 'block');
    body.set('reason_code', blockReason);
    body.set('note', blockNote.trim());

    try {
      const res = await fetch('/api/campus-walk/fix', { method: 'POST', body });
      const json = await res.json().catch(() => ({}) as any);
      if (res.ok && json?.ok) {
        setBlockedNow(true);
        setBlockOpen(false);
        toast({
          title: 'Marked as held up',
          description:
            json.message ?? 'The deadline has stopped. This is not counted against you.',
        });
        router.refresh();
        return;
      }
      setBlockError(json?.error ?? 'That did not go through. Please try again.');
    } catch {
      setBlockError('No connection. Please try again when you have signal.');
    } finally {
      setBlockBusy(false);
    }
  }, [blockBusy, blockReason, blockNote, ticket.taskId, toast, router]);

  const submitUnblock = useCallback(async () => {
    if (blockBusy) return;
    setBlockBusy(true);
    setBlockError(null);

    const body = new FormData();
    body.set('task_id', ticket.taskId);
    body.set('action', 'unblock');

    try {
      const res = await fetch('/api/campus-walk/fix', { method: 'POST', body });
      const json = await res.json().catch(() => ({}) as any);
      if (res.ok && json?.ok) {
        setBlockedNow(false);
        toast({ title: 'Back on', description: json.message ?? 'The deadline has restarted.' });
        router.refresh();
        return;
      }
      setBlockError(json?.error ?? 'That did not go through. Please try again.');
    } catch {
      setBlockError('No connection. Please try again when you have signal.');
    } finally {
      setBlockBusy(false);
    }
  }, [blockBusy, ticket.taskId, toast, router]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {/* ── The ticket ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            {/* D10: the ticket is attributed to the walk, never to a person. */}
            <Badge variant="secondary">Management walk</Badge>
            {ticket.unsafe && (
              <Badge variant="destructive" className="gap-1">
                <ShieldAlert className="h-3 w-3" />
                Safety — do this first
              </Badge>
            )}
            {ticket.category && <Badge variant="outline">{ticket.category}</Badge>}
            {ticket.kind === 'system_gap' && <Badge variant="outline">Needs a proper fix</Badge>}
          </div>

          <div>
            <h2 className="text-lg font-semibold leading-snug">{ticket.title}</h2>
            {ticket.description && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {ticket.description}
              </p>
            )}
          </div>

          <div
            className={
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm ' +
              (due.tone === 'late'
                ? 'bg-red-50 text-red-800'
                : due.tone === 'warn'
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-muted text-muted-foreground')
            }
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span className="font-medium">{due.text}</span>
            <span className="text-xs opacity-80">({formatDay(ticket.dueDate)})</span>
          </div>

          {ticket.slaPausedDays > 0 && !isBlocked && (
            <p className="text-xs text-muted-foreground">
              {ticket.slaPausedDays} day{ticket.slaPausedDays === 1 ? '' : 's'} were taken off this
              deadline because the job was held up.
            </p>
          )}

          {ticket.actingAsDepartmentHead && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
              You are closing this on behalf of your team member.
            </p>
          )}

          {ticket.problemPhotoUrl ? (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                What was reported
              </p>
              <a href={ticket.problemPhotoUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ticket.problemPhotoUrl}
                  alt="The reported condition"
                  className="w-full rounded-md border object-cover"
                />
              </a>
            </div>
          ) : (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              No photo was attached to this report.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Held up (D8) ───────────────────────────────────────────────────── */}
      {isBlocked && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-start gap-3">
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="min-w-0">
                <p className="font-medium text-amber-900">This job is held up</p>
                <p className="text-sm text-amber-900/80">
                  {ticket.blocked?.reasonCode
                    ? (REASON_LABEL[ticket.blocked.reasonCode] ?? 'Held up')
                    : 'Held up'}
                  {ticket.blocked?.reason ? ` — ${ticket.blocked.reason}` : ''}
                </p>
                <p className="mt-1 text-xs text-amber-900/70">
                  The deadline is stopped. This is not counted against you.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="h-12 w-full"
              onClick={() => void submitUnblock()}
              disabled={blockBusy}
            >
              {blockBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              I can start now
            </Button>
            {blockError && <p className="text-sm text-red-700">{blockError}</p>}
          </CardContent>
        </Card>
      )}

      {/* ── Closed ─────────────────────────────────────────────────────────── */}
      {isClosed && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="flex items-start gap-3 pt-6">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
            <div>
              <p className="font-medium text-green-900">Approved and closed</p>
              <p className="text-sm text-green-900/80">
                {ticket.fix?.decidedAt
                  ? `Signed off on ${formatMoment(ticket.fix.decidedAt)}.`
                  : 'This job has been signed off.'}
              </p>
              {ticket.fix?.approvalNote && (
                <p className="mt-1 text-sm text-green-900/80">“{ticket.fix.approvalNote}”</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Waiting for approval (D4) ──────────────────────────────────────── */}
      {isAwaiting && (
        <Card className="border-blue-300 bg-blue-50">
          <CardContent className="flex items-start gap-3 pt-6">
            <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            <div>
              <p className="font-medium text-blue-900">Waiting for approval</p>
              <p className="text-sm text-blue-900/80">
                Your photo was sent
                {ticket.fix?.submittedAt && !submittedNow
                  ? ` on ${formatMoment(ticket.fix.submittedAt)}`
                  : ''}
                . The job closes once a manager has looked at it.
              </p>
              {ticket.fix?.note && (
                <p className="mt-1 text-sm text-blue-900/80">“{ticket.fix.note}”</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Sent back ──────────────────────────────────────────────────────── */}
      {changesRequested && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="flex items-start gap-3 pt-6">
            <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
            <div>
              <p className="font-medium text-red-900">Sent back — more work needed</p>
              {ticket.fix?.approvalNote ? (
                <p className="text-sm text-red-900/80">“{ticket.fix.approvalNote}”</p>
              ) : (
                <p className="text-sm text-red-900/80">
                  The photo was not enough to close the job. Please take another one.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── The fix photo already on file ──────────────────────────────────── */}
      {ticket.fixPhotoUrl && !preview && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Photo you sent
            </p>
            <a href={ticket.fixPhotoUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ticket.fixPhotoUrl}
                alt="The finished work"
                className="w-full rounded-md border object-cover"
              />
            </a>
          </CardContent>
        </Card>
      )}

      {/* ── Upload ─────────────────────────────────────────────────────────── */}
      {showUploadForm && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <h3 className="font-semibold">
                {ticket.fixPhotoUrl || isAwaiting ? 'Send a different photo' : 'Photo of the finished work'}
              </h3>
              <p className="text-sm text-muted-foreground">
                Stand where the first photo was taken and shoot the same spot.
              </p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void onPick(e)}
            />

            {preview ? (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="The photo you just took"
                  className="w-full rounded-md border object-cover"
                />
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => fileRef.current?.click()}
                  disabled={preparing || sending}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Take it again
                </Button>
              </div>
            ) : (
              <Button
                className="h-14 w-full text-base"
                onClick={() => fileRef.current?.click()}
                disabled={preparing}
              >
                {preparing ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="mr-2 h-5 w-5" />
                )}
                {preparing ? 'Getting the photo ready…' : 'Take the photo'}
              </Button>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="fix-note">Anything to add? (optional)</Label>
              <Textarea
                id="fix-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Replaced the tube light and cleaned the fitting."
                rows={3}
                maxLength={2000}
              />
            </div>

            {sendError && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{sendError}</span>
              </div>
            )}

            <Button
              className="h-14 w-full text-base"
              onClick={() => void send()}
              disabled={!photo || sending || preparing}
            >
              {sending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Send className="mr-2 h-5 w-5" />
              )}
              {sending ? 'Sending…' : 'Send for approval'}
            </Button>

            {/* D4, stated plainly. The fixer must never think this closed the job. */}
            <p className="text-center text-xs text-muted-foreground">
              This does not close the job yet. A manager checks the photo first.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── "I can't fix this yet" (D8) ────────────────────────────────────── */}
      {!isClosed && !isBlocked && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            {!blockOpen ? (
              <>
                <Button
                  variant="outline"
                  className="h-12 w-full"
                  onClick={() => setBlockOpen(true)}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  I can&rsquo;t fix this yet
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Use this if you are waiting on money, materials or access. The deadline stops and
                  it is not counted against you.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">What is holding this up?</p>
                <div className="grid gap-2">
                  {BLOCK_REASONS.map((r) => (
                    <button
                      key={r.code}
                      type="button"
                      onClick={() => setBlockReason(r.code)}
                      className={
                        'w-full rounded-md border px-3 py-3 text-left text-sm transition-colors ' +
                        (blockReason === r.code
                          ? 'border-primary bg-primary/10 font-medium'
                          : 'border-input hover:bg-accent')
                      }
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="block-note">Tell the office what is needed</Label>
                  <Textarea
                    id="block-note"
                    value={blockNote}
                    onChange={(e) => setBlockNote(e.target.value)}
                    placeholder="e.g. Need two 20W LED tubes; store says none in stock."
                    rows={3}
                    maxLength={1000}
                  />
                </div>

                {blockError && (
                  <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{blockError}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="h-12 flex-1"
                    onClick={() => {
                      setBlockOpen(false);
                      setBlockError(null);
                    }}
                    disabled={blockBusy}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-12 flex-1"
                    onClick={() => void submitBlock()}
                    disabled={blockBusy}
                  >
                    {blockBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Report it
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
