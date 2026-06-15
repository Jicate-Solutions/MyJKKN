'use client';

// =============================================================================
// Part A — Read & Record voice recorder (Phase 4b)
// =============================================================================
// The most delicate piece of the module: in-browser audio capture for a child,
// then the 3-step upload handshake to the private rcltp-audio bucket.
//
//   1. RcltpAssessmentsService.createRecordingUploadUrl(assessmentId, contentType)
//        → mints a server-controlled signed upload URL { path, token }
//   2. supabase.storage.from('rcltp-audio').uploadToSignedUrl(path, token, blob)
//        → uploads the audio blob DIRECTLY to Storage (never through Next.js)
//   3. RcltpAssessmentsService.uploadRecording(assessmentId, path)
//        → persists the rcltp_part_a_recordings row and advances the sitting
//          to 'recorded'
//
// The student NEVER chooses the storage path — the server scopes it to
// institution/learner/assessment, so a child can only ever write their own
// recording (children's voice is sensitive data; the bucket is private with no
// public object policies).
//
// Graceful degradation is a hard requirement: a missing mic, a denied
// permission, an insecure context, or a browser without MediaRecorder must NOT
// block the assessment — the student can skip Part A and still answer Part B.
// We NEVER fabricate a recording or a score.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  Mic,
  Square,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  UploadCloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { RcltpAssessmentsService } from '@/lib/services/rcltp/assessments-service';

type RecState =
  | 'unsupported' // no MediaRecorder / no getUserMedia / insecure context
  | 'idle' // ready to record, nothing captured yet
  | 'requesting' // asking for mic permission
  | 'recording' // actively capturing
  | 'captured' // have a blob, not yet uploaded
  | 'uploading' // running the 3-step handshake
  | 'uploaded' // recording row created
  | 'error'; // capture or upload failed (recoverable)

interface VoiceRecorderProps {
  assessmentId: string;
  /** Disable capture once the sitting is terminal/submitted. */
  disabled?: boolean;
  /** Fired after a recording row is successfully created (advances sitting → recorded). */
  onRecorded?: (audioPath: string) => void;
}

/** Pick the best-supported recording MIME the upload-url route accepts. */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4', // Safari/iOS
    'audio/ogg;codecs=opus',
    'audio/mpeg',
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* isTypeSupported can throw on some engines — treat as unsupported */
    }
  }
  return null;
}

/** Map the recorder MIME to one of the route's ALLOWED_AUDIO content types. */
function contentTypeFor(mime: string): string {
  if (mime.startsWith('audio/webm')) return 'audio/webm';
  if (mime.startsWith('audio/mp4')) return 'audio/mp4';
  if (mime.startsWith('audio/ogg')) return 'audio/ogg';
  if (mime.startsWith('audio/mpeg')) return 'audio/mpeg';
  if (mime.startsWith('audio/wav')) return 'audio/wav';
  return 'audio/webm';
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceRecorder({ assessmentId, disabled, onRecorded }: VoiceRecorderProps) {
  // Detect capability once on mount (MediaRecorder + a secure context).
  const [state, setState] = useState<RecState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef<string>('audio/webm');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirrors previewUrl so the unmount cleanup (which closes over the INITIAL
  // previewUrl) can revoke the URL that is actually live at unmount time.
  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  // Capability probe — runs client-side only.
  useEffect(() => {
    const hasRecorder = typeof MediaRecorder !== 'undefined';
    const hasGUM =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function';
    if (!hasRecorder || !hasGUM || pickMimeType() === null) {
      setState('unsupported');
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount: stop mic, clear timer, revoke any preview URL.
  useEffect(() => {
    return () => {
      clearTimer();
      stopTracks();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setErrorMsg(null);
    const mime = pickMimeType();
    if (!mime) {
      setState('unsupported');
      return;
    }
    mimeRef.current = mime;
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        blobRef.current = blob;
        // Revoke a previous preview before making a new one.
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        stopTracks();
        setState('captured');
      };
      recorder.start();
      recorderRef.current = recorder;
      setElapsed(0);
      clearTimer();
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setState('recording');
    } catch (err) {
      stopTracks();
      const name = (err as { name?: string })?.name;
      let msg = 'We could not start the microphone.';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        msg = 'Microphone permission was blocked. You can still answer the questions below.';
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        msg = 'No microphone was found on this device. You can still answer the questions below.';
      } else if (name === 'NotReadableError') {
        msg = 'The microphone is already in use by another app. You can still answer the questions below.';
      }
      setErrorMsg(msg);
      setState('error');
    }
  }

  function stopRecording() {
    clearTimer();
    try {
      recorderRef.current?.stop();
    } catch {
      // stop() threw → onstop will not fire, so there is NO blob. Surface an
      // honest error rather than a 'captured' state that implies a usable take.
      stopTracks();
      setErrorMsg('Recording stopped unexpectedly. Please try again.');
      setState('error');
    }
  }

  function resetCapture() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    blobRef.current = null;
    chunksRef.current = [];
    setElapsed(0);
    setErrorMsg(null);
    setState('idle');
  }

  async function uploadRecording() {
    const blob = blobRef.current;
    if (!blob) {
      toast.error('Nothing to upload yet — record first.');
      return;
    }
    setState('uploading');
    setErrorMsg(null);
    try {
      const contentType = contentTypeFor(mimeRef.current);
      // STEP 1 — mint the server-scoped signed upload URL.
      const { path, token } = await RcltpAssessmentsService.createRecordingUploadUrl(
        assessmentId,
        contentType
      );
      // STEP 2 — upload the blob DIRECTLY to Storage (bypasses Next.js).
      const supabase = createClientSupabaseClient();
      const { error: upErr } = await supabase.storage
        .from('rcltp-audio')
        .uploadToSignedUrl(path, token, blob, { contentType });
      if (upErr) throw upErr;
      // STEP 3 — persist the recording row (advances the sitting → 'recorded').
      await RcltpAssessmentsService.uploadRecording(assessmentId, path);
      setState('uploaded');
      toast.success('Recording saved.');
      onRecorded?.(path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setErrorMsg(msg);
      setState('error');
      toast.error('Could not save the recording.');
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (state === 'unsupported') {
    return (
      <Alert>
        <AlertTriangle className='h-4 w-4' aria-hidden='true' />
        <AlertTitle>Voice recording isn&apos;t available here</AlertTitle>
        <AlertDescription>
          This browser or device doesn&apos;t support in-page voice recording. You can still read
          the passage and answer the questions below — your teacher can record Part A separately.
        </AlertDescription>
      </Alert>
    );
  }

  const isBusy = state === 'requesting' || state === 'uploading';

  return (
    <div className='space-y-3'>
      {state === 'uploaded' ? (
        <Alert className='border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100'>
          <CheckCircle2 className='h-4 w-4 text-emerald-600 dark:text-emerald-400' aria-hidden='true' />
          <AlertTitle>Recording saved</AlertTitle>
          <AlertDescription>
            Your reading was uploaded. You can re-record if you&apos;d like a fresh take, then
            continue to the questions.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className='flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4'>
        {state === 'recording' ? (
          <>
            <span className='flex items-center gap-2 text-sm font-medium text-red-600'>
              <span className='h-2.5 w-2.5 animate-pulse rounded-full bg-red-600' aria-hidden='true' />
              Recording… {formatSeconds(elapsed)}
            </span>
            <Button type='button' variant='destructive' size='sm' onClick={stopRecording}>
              <Square className='mr-2 h-4 w-4' /> Stop
            </Button>
          </>
        ) : (
          <Button
            type='button'
            size='sm'
            onClick={startRecording}
            disabled={disabled || isBusy}
          >
            {state === 'requesting' ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Mic className='mr-2 h-4 w-4' />
            )}
            {state === 'captured' || state === 'uploaded' || state === 'error'
              ? 'Re-record'
              : 'Start recording'}
          </Button>
        )}

        {previewUrl && state !== 'recording' && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio controls src={previewUrl} className='h-9 max-w-full' />
        )}

        {(state === 'captured' || state === 'error') && blobRef.current && (
          <Button
            type='button'
            size='sm'
            variant='secondary'
            onClick={uploadRecording}
            disabled={disabled || isBusy}
          >
            {state === 'uploading' ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <UploadCloud className='mr-2 h-4 w-4' />
            )}
            Save recording
          </Button>
        )}

        {state === 'uploading' && (
          <span className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' /> Saving…
          </span>
        )}

        {(state === 'captured' || state === 'uploaded') && (
          <Button type='button' size='sm' variant='ghost' onClick={resetCapture} disabled={isBusy}>
            <RotateCcw className='mr-2 h-4 w-4' /> Discard
          </Button>
        )}
      </div>

      {errorMsg && (
        <Alert>
          <AlertTriangle className='h-4 w-4' aria-hidden='true' />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      <p className='text-xs text-muted-foreground'>
        Read the passage aloud clearly, then tap <strong>Save recording</strong>. Recording Part A is
        optional — you can skip it and still answer the questions.
      </p>
    </div>
  );
}
