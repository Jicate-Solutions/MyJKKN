'use client';

// app/(routes)/meetings/record/_components/meeting-recorder.tsx
//
// Record a meeting that is happening in a ROOM. 29 of the Director's last 50
// meetings were in one, and no notetaker that joins calls can hear a table.
//
// THE THREE THINGS THIS FILE EXISTS TO SURVIVE
//
// 1. The screen locking. iOS stops a recording the moment the screen sleeps, so
//    the page takes a Screen Wake Lock and RE-TAKES it whenever the tab comes
//    back (iOS drops the lock on every hide). Without this, a 90-minute meeting
//    records for as long as the phone's auto-lock timer and then stops, silently.
//    Wake Lock needs iOS 16.4+; on an older phone we say so rather than pretend.
//
// 2. A crash losing everything. The recorder emits a chunk every 30 seconds and
//    each one is uploaded as it appears. A tab crash costs the last few seconds
//    instead of the morning. Chunks are numbered, and finish counts what truly
//    landed rather than what we hoped we sent.
//
// 3. A bad network eating a chunk in silence. Uploads retry with backoff, and a
//    chunk that still fails is REPORTED on screen and counted — it is never
//    dropped quietly. The recording keeps going; losing 30 seconds is survivable,
//    believing a gapped recording is whole is not.
//
// What it deliberately does NOT do: ask anyone to tick a consent box. The
// Director announces the recording out loud (his decision, 15 Sep). The page
// records that he confirmed it, and says plainly on screen that recording is on.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

type Phase = 'idle' | 'starting' | 'recording' | 'finishing' | 'done' | 'unsupported';

/** One chunk per 30 s: small enough to lose, large enough not to thrash the network. */
const CHUNK_MS = 30_000;
const UPLOAD_ATTEMPTS = 3;

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

/** The bucket only accepts the base type, not the codec suffix. */
function baseMime(mime: string): string {
  return mime.startsWith('audio/mp4') ? 'audio/mp4' : 'audio/webm';
}

function hhmmss(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** The meeting this recording belongs to, when the page was opened from one. */
export interface AttachedMeeting {
  /** meeting_bookings.id — the server re-checks that it is the caller's. */
  id: string;
  label: string;
  whenText: string;
}

export function MeetingRecorder({
  canRecord,
  attachedTo = null,
}: {
  canRecord: boolean;
  attachedTo?: AttachedMeeting | null;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  // Prefilled from the meeting, and still editable: the booking is called
  // "One to One Meeting with X" and the person in the room may want to say what
  // it was actually about.
  const [title, setTitle] = useState(attachedTo?.label ?? '');
  const [announced, setAnnounced] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploaded, setUploaded] = useState(0);
  const [failed, setFailed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [wakeLockHeld, setWakeLockHeld] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const indexRef = useRef(0);
  const inFlightRef = useRef(0);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const secure = window.isSecureContext;
    const hasRecorder = typeof MediaRecorder !== 'undefined';
    const hasMic =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function';
    if (!secure || !hasRecorder || !hasMic || !pickMimeType()) setPhase('unsupported');
  }, []);

  // Ticking clock while recording.
  useEffect(() => {
    if (phase !== 'recording') return;
    const t = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  const takeWakeLock = useCallback(async () => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) {
      setWakeLockHeld(false);
      return;
    }
    try {
      wakeLockRef.current = await nav.wakeLock.request('screen');
      setWakeLockHeld(true);
    } catch {
      // Low battery, or the OS simply refused. Recording continues; the screen
      // may sleep, so the banner tells the user to keep the phone awake.
      setWakeLockHeld(false);
    }
  }, []);

  // iOS releases the lock every time the tab hides. Re-take it on return, or a
  // recording that survived one glance at a notification dies at the next.
  useEffect(() => {
    if (phase !== 'recording') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void takeWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [phase, takeWakeLock]);

  const uploadChunk = useCallback(async (recordingId: string, index: number, blob: Blob) => {
    inFlightRef.current += 1;
    try {
      for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
        try {
          const res = await fetch(`/api/meetings/recordings/${recordingId}/chunk-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index }),
          });
          if (!res.ok) throw new Error(`chunk-url ${res.status}`);
          const { data } = (await res.json()) as {
            data: { path: string; token: string };
          };

          const supabase = createClientSupabaseClient();
          const { error } = await supabase.storage
            .from('meeting-audio')
            .uploadToSignedUrl(data.path, data.token, blob);
          if (error) throw error;

          setUploaded((n) => n + 1);
          return;
        } catch (err) {
          if (attempt === UPLOAD_ATTEMPTS) {
            // Counted and shown. A lost chunk is a hole in the meeting, and the
            // person in the room is the only one who can decide what to do.
            setFailed((n) => n + 1);
            console.error('[meeting-recorder] chunk lost', index, err);
            return;
          }
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    } finally {
      inFlightRef.current -= 1;
    }
  }, []);

  const start = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setMessage('Give this meeting a title first.');
      return;
    }
    setMessage(null);
    setPhase('starting');

    const mime = pickMimeType();
    if (!mime) {
      setPhase('unsupported');
      return;
    }

    try {
      const res = await fetch('/api/meetings/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmed,
          announced,
          mime_type: baseMime(mime),
          booking_id: attachedTo?.id ?? null,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? 'Could not start recording.');
        setPhase('idle');
        return;
      }
      const { data } = (await res.json()) as { data: { id: string } };
      recordingIdRef.current = data.id;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (!e.data || e.data.size === 0) return;
        const id = recordingIdRef.current;
        if (!id) return;
        const index = indexRef.current;
        indexRef.current += 1;
        void uploadChunk(id, index, e.data);
      };
      recorderRef.current = recorder;
      indexRef.current = 0;
      setUploaded(0);
      setFailed(0);
      startedAtRef.current = Date.now();
      setElapsed(0);
      recorder.start(CHUNK_MS);
      await takeWakeLock();
      setPhase('recording');
    } catch (err) {
      console.error('[meeting-recorder] start failed', err);
      setMessage(
        'Could not reach the microphone. Allow microphone access for this site and try again.',
      );
      setPhase('idle');
    }
  }, [announced, attachedTo, takeWakeLock, title, uploadChunk]);

  const finish = useCallback(async () => {
    setPhase('finishing');
    const recorder = recorderRef.current;
    const id = recordingIdRef.current;

    if (recorder && recorder.state !== 'inactive') {
      // requestData flushes the partial chunk that would otherwise be lost —
      // the last 29 seconds of a meeting are often the decision.
      try {
        recorder.requestData();
      } catch {
        /* some browsers refuse; stop() still flushes */
      }
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      await wakeLockRef.current?.release();
    } catch {
      /* already gone */
    }
    wakeLockRef.current = null;
    setWakeLockHeld(false);

    // Let uploads already in the air land before we count them.
    const deadline = Date.now() + 20_000;
    while (inFlightRef.current > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
    }

    if (!id) {
      setPhase('done');
      return;
    }

    try {
      const res = await fetch(`/api/meetings/recordings/${id}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunks_sent: indexRef.current,
          duration_seconds: Math.floor((Date.now() - startedAtRef.current) / 1000),
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { data?: { chunk_count?: number; error?: string | null } }
        | null;
      // res.ok, checked (16 Sep 2026, blind review). Without it a 403, a 500 or
      // an HTML error page all fell through to the success sentence with a zero
      // in it — "Saved. 0 pieces of audio stored" — and the word people read
      // first is Saved. The audio itself is already in storage at this point;
      // what failed is the record of the meeting ending, so say exactly that.
      if (!res.ok || !payload?.data) {
        setMessage(
          'The audio is stored, but the server did not confirm the meeting ended. ' +
            'Open this page again when you have signal.',
        );
        setPhase('done');
        return;
      }
      const saved = payload.data.chunk_count ?? 0;
      const problem = payload.data.error ?? null;
      setMessage(
        problem
          ? `Saved ${saved} pieces of audio. ${problem}`
          : `Saved. ${saved} pieces of audio stored for "${title.trim()}".`,
      );
    } catch (err) {
      console.error('[meeting-recorder] finish failed', err);
      setMessage(
        'The audio is stored, but this device could not tell the server the meeting ended. Open this page again when you have signal.',
      );
    }
    setPhase('done');
  }, [title]);

  // Never leave a hot microphone or a held screen behind.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  if (!canRecord) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm">
        <p className="font-medium">You are not set up to record meetings.</p>
        <p className="mt-1 text-muted-foreground">
          Recording a room of colleagues is granted to named people. Ask an administrator
          to add you if you need it.
        </p>
      </div>
    );
  }

  if (phase === 'unsupported') {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm">
        <p className="font-medium">This browser cannot record.</p>
        <p className="mt-1 text-muted-foreground">
          Open this page in Safari or Chrome on the phone, over https. On iPhone you need
          iOS 16.4 or newer.
        </p>
      </div>
    );
  }

  const busy = phase === 'starting' || phase === 'finishing';

  return (
    <div className="space-y-4">
      {(phase === 'idle' || phase === 'done' || phase === 'starting') && (
        <div className="space-y-3">
          {attachedTo ? (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Saving to this meeting
              </p>
              <p className="font-medium">{attachedTo.label}</p>
              {attachedTo.whenText ? (
                <p className="text-muted-foreground">{attachedTo.whenText}</p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label htmlFor="mr-title" className="text-sm font-medium">
              What is this meeting?
            </label>
            <input
              id="mr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Monthly IQAC meeting — Dental"
              maxLength={200}
              className="w-full rounded-md border bg-background px-3 py-2 text-base"
            />
          </div>

          <label className="flex items-start gap-2.5 text-sm" htmlFor="mr-announced">
            <input
              id="mr-announced"
              type="checkbox"
              checked={announced}
              onChange={(e) => setAnnounced(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-muted-foreground">
              I have told the room this meeting is being recorded.
            </span>
          </label>

          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="w-full rounded-md bg-red-600 px-4 py-4 text-base font-semibold text-white disabled:opacity-60"
          >
            {phase === 'starting' ? 'Starting…' : 'Start recording'}
          </button>
        </div>
      )}

      {phase === 'recording' && (
        <div className="space-y-4">
          <div className="rounded-md border border-red-600/40 bg-red-600/10 p-4 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
              Recording
            </p>
            <p className="mt-1 font-mono text-3xl tabular-nums">{hhmmss(elapsed)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {uploaded} saved{failed > 0 ? ` · ${failed} could not be sent` : ''}
            </p>
          </div>

          {!wakeLockHeld && (
            <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              This phone will not keep its screen awake on its own. Keep the screen on and
              the phone plugged in, or the recording stops when the screen locks.
            </p>
          )}

          <button
            type="button"
            onClick={finish}
            className="w-full rounded-md border px-4 py-4 text-base font-semibold"
          >
            Stop and save
          </button>
        </div>
      )}

      {phase === 'finishing' && (
        <p className="rounded-md border bg-muted/30 p-4 text-sm">
          Saving the last pieces of audio. Keep this page open.
        </p>
      )}

      {message && (
        <p
          className={`rounded-md border p-3 text-sm ${
            failed > 0 ? 'border-amber-500/40 bg-amber-500/10' : 'bg-muted/30'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
