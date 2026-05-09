'use client';

/**
 * VoiceMemoRecorder — 30-second English voice memo capture for call logs.
 *
 * Flow:
 *   1. User clicks record → MediaRecorder captures audio/webm;codecs=opus
 *   2. Visual amplitude bar via AnalyserNode + countdown to 30s hard cap
 *   3. After stop → playback + retake controls; memo Blob held in state
 *   4. Parent calls `uploadMemo(callLogId)` after the call log row is created;
 *      we upload to `call-memos/{institutionId}/{callLogId}.webm` and resolve
 *      `{ url, durationSec }`. Parent then PATCHes the row with those fields.
 *
 * English-only mandate: hint copy explicitly asks for English. Whisper +
 * language-detect guardrail downstream (Agent O's cron) will reject non-EN.
 *
 * Permission errors (mic blocked / not found / browser unsupported) are
 * surfaced inline; the component degrades gracefully — call log form still
 * works without a memo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Play, Pause, RotateCcw, Loader2, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createClientSupabaseClient } from '@/lib/supabase/client';

const MAX_DURATION_SEC = 30;
const MIME_TYPE = 'audio/webm;codecs=opus';
const STORAGE_BUCKET = 'call-memos';
const AMPLITUDE_BARS = 24;

type RecorderState = 'idle' | 'recording' | 'recorded' | 'uploading' | 'uploaded' | 'error';

export interface VoiceMemoRecorderHandle {
  /** Upload the recorded blob (if any) — call after parent has the call_log_id */
  uploadMemo: (callLogId: string) => Promise<{ url: string; durationSec: number } | null>;
  /** Whether a memo blob is ready to be uploaded */
  hasMemo: () => boolean;
}

export interface VoiceMemoRecorderProps {
  institutionId: string;
  /** Called after successful upload — gives parent the storage URL + duration */
  onMemoUploaded?: (url: string, durationSec: number) => void;
  /** Called on capture/upload errors — parent can surface in form-wide toast */
  onError?: (msg: string) => void;
  /** Disable controls while parent form is submitting */
  disabled?: boolean;
}

/**
 * Forwarded-ref recorder. Parent gets `uploadMemo()` to call after the API
 * round-trip that creates the call_log row.
 */
import { forwardRef, useImperativeHandle } from 'react';

export const VoiceMemoRecorder = forwardRef<VoiceMemoRecorderHandle, VoiceMemoRecorderProps>(
  function VoiceMemoRecorder({ institutionId, onMemoUploaded, onError, disabled }, ref) {
    const [state, setState] = useState<RecorderState>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [elapsedSec, setElapsedSec] = useState(0);
    const [amplitudes, setAmplitudes] = useState<number[]>(() => new Array(AMPLITUDE_BARS).fill(0));
    const [isPlaying, setIsPlaying] = useState(false);

    // Refs (live across renders without triggering rerenders)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const blobRef = useRef<Blob | null>(null);
    const durationRef = useRef<number>(0);
    const audioElRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);
    const startTimeRef = useRef<number>(0);
    const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // ────────────────────────────────────────────────────────────────────
    // Cleanup helpers
    // ────────────────────────────────────────────────────────────────────

    const stopAmplitudeLoop = useCallback(() => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }, []);

    const stopTickLoop = useCallback(() => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    }, []);

    const releaseStream = useCallback(() => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
      analyserRef.current = null;
    }, []);

    const releaseAudioPreview = useCallback(() => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        stopAmplitudeLoop();
        stopTickLoop();
        releaseStream();
        releaseAudioPreview();
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          try {
            mediaRecorderRef.current.stop();
          } catch {
            /* swallow — already stopped */
          }
        }
      };
    }, [stopAmplitudeLoop, stopTickLoop, releaseStream, releaseAudioPreview]);

    // ────────────────────────────────────────────────────────────────────
    // Recording
    // ────────────────────────────────────────────────────────────────────

    const startAmplitudeLoop = useCallback(() => {
      const analyser = analyserRef.current;
      if (!analyser) return;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(dataArray);
        // Compute RMS amplitude (0..1)
        let sumSq = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / dataArray.length);
        const scaled = Math.min(1, rms * 3); // amplify a bit so quiet voices show
        setAmplitudes((prev) => {
          // Slide left, push new value
          const next = prev.slice(1);
          next.push(scaled);
          return next;
        });
        animationFrameRef.current = requestAnimationFrame(tick);
      };
      animationFrameRef.current = requestAnimationFrame(tick);
    }, []);

    const handleStartRecording = useCallback(async () => {
      setErrorMsg(null);
      releaseAudioPreview();
      blobRef.current = null;
      chunksRef.current = [];
      durationRef.current = 0;
      setElapsedSec(0);
      setAmplitudes(new Array(AMPLITUDE_BARS).fill(0));

      // Browser support check
      if (typeof window === 'undefined' || !('MediaRecorder' in window)) {
        const msg = 'Voice recording is not supported in this browser. Try Chrome, Edge, or Safari.';
        setErrorMsg(msg);
        setState('error');
        onError?.(msg);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        const msg = 'Microphone access is not available in this browser.';
        setErrorMsg(msg);
        setState('error');
        onError?.(msg);
        return;
      }
      if (!MediaRecorder.isTypeSupported(MIME_TYPE)) {
        const msg = 'This browser does not support the required audio format (Opus). Try a recent Chrome or Edge.';
        setErrorMsg(msg);
        setState('error');
        onError?.(msg);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        // AnalyserNode for waveform
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext: AudioContext = new AudioCtx();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;

        // MediaRecorder
        const recorder = new MediaRecorder(stream, { mimeType: MIME_TYPE });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          stopAmplitudeLoop();
          stopTickLoop();
          const blob = new Blob(chunksRef.current, { type: MIME_TYPE });
          blobRef.current = blob;
          const elapsed = Math.min(MAX_DURATION_SEC, Math.round((Date.now() - startTimeRef.current) / 1000));
          durationRef.current = elapsed;
          setElapsedSec(elapsed);
          // Build preview URL
          releaseAudioPreview();
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;
          // Stop tracks (releases mic indicator)
          releaseStream();
          setState('recorded');
        };
        recorder.onerror = (ev: any) => {
          const msg = `Recording error: ${ev?.error?.message || 'unknown'}`;
          setErrorMsg(msg);
          setState('error');
          onError?.(msg);
          stopAmplitudeLoop();
          stopTickLoop();
          releaseStream();
        };

        recorder.start();
        startTimeRef.current = Date.now();
        setState('recording');
        startAmplitudeLoop();

        // Tick once per 250ms to update countdown + auto-stop at 30s
        tickIntervalRef.current = setInterval(() => {
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          setElapsedSec(Math.min(MAX_DURATION_SEC, elapsed));
          if (elapsed >= MAX_DURATION_SEC) {
            // Hard cap reached — auto-stop
            try {
              recorder.stop();
            } catch {
              /* swallow */
            }
          }
        }, 250);
      } catch (err: any) {
        const isPermission = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
        const isNotFound = err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError';
        const msg = isPermission
          ? 'Microphone access was blocked. Allow mic access in your browser settings to record a memo.'
          : isNotFound
            ? 'No microphone found. Connect a mic and try again.'
            : `Could not start recording: ${err?.message || 'unknown error'}`;
        setErrorMsg(msg);
        setState('error');
        onError?.(msg);
        releaseStream();
      }
    }, [onError, releaseAudioPreview, releaseStream, startAmplitudeLoop, stopAmplitudeLoop, stopTickLoop]);

    const handleStopRecording = useCallback(() => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch (err: any) {
          const msg = `Stop failed: ${err?.message || 'unknown'}`;
          setErrorMsg(msg);
          setState('error');
          onError?.(msg);
        }
      }
    }, [onError]);

    // ────────────────────────────────────────────────────────────────────
    // Playback
    // ────────────────────────────────────────────────────────────────────

    const handleTogglePlay = useCallback(() => {
      const el = audioElRef.current;
      if (!el || !audioUrlRef.current) return;
      if (isPlaying) {
        el.pause();
      } else {
        el.currentTime = 0;
        el.play().catch(() => undefined);
      }
    }, [isPlaying]);

    // ────────────────────────────────────────────────────────────────────
    // Retake
    // ────────────────────────────────────────────────────────────────────

    const handleRetake = useCallback(() => {
      blobRef.current = null;
      durationRef.current = 0;
      setElapsedSec(0);
      setAmplitudes(new Array(AMPLITUDE_BARS).fill(0));
      releaseAudioPreview();
      setState('idle');
      setErrorMsg(null);
    }, [releaseAudioPreview]);

    // ────────────────────────────────────────────────────────────────────
    // Imperative upload (called by parent after call_log_id is known)
    // ────────────────────────────────────────────────────────────────────

    useImperativeHandle(
      ref,
      () => ({
        hasMemo: () => blobRef.current !== null,
        uploadMemo: async (callLogId: string) => {
          const blob = blobRef.current;
          if (!blob) return null;
          if (!institutionId) {
            const msg = 'Cannot upload memo — institution is not set.';
            setErrorMsg(msg);
            onError?.(msg);
            return null;
          }
          setState('uploading');
          try {
            const supabase = createClientSupabaseClient();
            const path = `${institutionId}/${callLogId}.webm`;
            const { error: uploadErr } = await supabase.storage
              .from(STORAGE_BUCKET)
              .upload(path, blob, {
                contentType: MIME_TYPE,
                upsert: true,
              });
            if (uploadErr) throw uploadErr;
            const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
            // Note: bucket may be private — getPublicUrl still returns a URL string that
            // signed-URL flow downstream can re-sign. Storing the canonical path-based URL
            // is fine; cron resolves via service role.
            const url = pub?.publicUrl ?? `${STORAGE_BUCKET}/${path}`;
            const durationSec = durationRef.current;
            setState('uploaded');
            onMemoUploaded?.(url, durationSec);
            return { url, durationSec };
          } catch (err: any) {
            const msg = `Memo upload failed: ${err?.message || 'unknown error'}`;
            setErrorMsg(msg);
            setState('error');
            onError?.(msg);
            return null;
          }
        },
      }),
      [institutionId, onError, onMemoUploaded],
    );

    // ────────────────────────────────────────────────────────────────────
    // Render
    // ────────────────────────────────────────────────────────────────────

    const isBusy = state === 'recording' || state === 'uploading';
    const remainingSec = Math.max(0, MAX_DURATION_SEC - elapsedSec);
    const pctRemaining = (remainingSec / MAX_DURATION_SEC) * 100;
    const countdownColor =
      remainingSec <= 5 ? 'text-red-600' : remainingSec <= 10 ? 'text-orange-600' : 'text-muted-foreground';

    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <Mic className="h-3.5 w-3.5" />
            Voice memo <span className="text-muted-foreground font-normal">(optional, 30s max)</span>
          </div>
          {state === 'uploaded' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
              <Check className="h-3 w-3" />
              Memo attached ({durationRef.current}s)
            </span>
          )}
        </div>

        {/* Hint copy — English-only mandate */}
        <p className="text-xs text-muted-foreground leading-snug">
          Speak in English — describe the call, the lead&apos;s mood, and follow-up needs in 30 seconds.
        </p>

        {/* Error banner */}
        {state === 'error' && errorMsg && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {/* Idle / Error → big record button */}
        {(state === 'idle' || state === 'error') && (
          <div className="flex flex-col items-center gap-2 py-2">
            <button
              type="button"
              disabled={disabled}
              onClick={handleStartRecording}
              className={cn(
                'h-14 w-14 rounded-full flex items-center justify-center transition-all',
                'bg-red-500 text-white shadow-md hover:bg-red-600 hover:shadow-lg active:scale-95',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-500',
              )}
              aria-label="Start recording"
            >
              <Mic className="h-6 w-6" />
            </button>
            <span className="text-xs text-muted-foreground">Tap to record</span>
          </div>
        )}

        {/* Recording → waveform + countdown + stop */}
        {state === 'recording' && (
          <div className="space-y-2">
            <div className="flex items-end justify-center gap-0.5 h-10">
              {amplitudes.map((a, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-red-500 transition-all"
                  style={{ height: `${Math.max(2, a * 100)}%` }}
                />
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-red-600 font-medium">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  Recording
                </span>
                <span className={cn('font-mono', countdownColor)}>
                  {Math.ceil(remainingSec)}s left
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all',
                    remainingSec <= 5 ? 'bg-red-500' : remainingSec <= 10 ? 'bg-orange-500' : 'bg-red-400',
                  )}
                  style={{ width: `${pctRemaining}%` }}
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleStopRecording}
              className="w-full gap-1.5"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop
            </Button>
          </div>
        )}

        {/* Recorded → playback + retake */}
        {(state === 'recorded' || state === 'uploaded') && audioUrlRef.current && (
          <div className="space-y-2">
            <audio
              ref={audioElRef}
              src={audioUrlRef.current}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              preload="metadata"
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleTogglePlay}
                disabled={isBusy}
                className="gap-1.5 flex-1"
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {isPlaying ? 'Pause' : 'Play'} memo ({durationRef.current}s)
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleRetake}
                disabled={isBusy || state === 'uploaded'}
                className="gap-1.5"
                title={state === 'uploaded' ? 'Memo already uploaded' : 'Re-record'}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retake
              </Button>
            </div>
          </div>
        )}

        {/* Uploading state */}
        {state === 'uploading' && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading memo...
          </div>
        )}
      </div>
    );
  },
);

VoiceMemoRecorder.displayName = 'VoiceMemoRecorder';
