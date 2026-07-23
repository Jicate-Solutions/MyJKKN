'use client';

// ============================================================================
// AI Job Run card — generic runner for one selected job type.
// Created: 2026-07-13.
//
// Draws a form from the job type's input_schema, POSTs to /api/ai-jobs/enqueue,
// then polls GET /api/ai-jobs/status?id= until the job is done/errored/canceled.
// Mirrors the chat hook's polling cadence (2.5s). Shows an expected-time
// countdown (from expected_seconds, else "a little while") and a "last ran"
// stamp (from the row's last_run if the backend supplies it, else the newest
// job it ran this session).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Play, Clock, CheckCircle2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  extractAnswer,
  type AiJobStatus,
  type AiJobType,
} from './ai-job-types';

// Mirror the chat route/hook cadence so both feel identical.
const POLL_MS = 2_500;
// Client-side ceiling; the server route already bounds the real job wait.
const RUN_DEADLINE_MS = 300_000;

interface AiJobRunCardProps {
  jobType: AiJobType;
}

type RunState =
  | { phase: 'idle' }
  | { phase: 'running'; jobId: string; startedAt: number }
  | { phase: 'done'; answer: string; completedAt: string | null }
  | { phase: 'error'; message: string };

function fmtStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'HH:mm');
}

export function AiJobRunCard({ jobType }: AiJobRunCardProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [run, setRun] = useState<RunState>({ phase: 'idle' });
  // Countdown seconds remaining (from expected_seconds). null = no estimate.
  const [remaining, setRemaining] = useState<number | null>(null);
  // Session-tracked last-run fallback when the row carries no last_run.
  const [sessionLastRun, setSessionLastRun] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  // Reset the form + any in-flight run whenever the selected job type changes.
  useEffect(() => {
    cancelledRef.current = true;
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    setValues({});
    setRun({ phase: 'idle' });
    setRemaining(null);
    setSessionLastRun(null);
  }, [jobType.job_type]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const setValue = (key: string, v: string) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const stopTimers = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  }, []);

  const handleRun = useCallback(async () => {
    // Validate required fields.
    for (const f of jobType.input_schema) {
      if (f.required && !(values[f.key] ?? '').trim()) {
        setRun({ phase: 'error', message: `"${f.label}" is required.` });
        return;
      }
    }

    // Build payload — coerce number fields, drop empty optionals.
    const payload: Record<string, unknown> = {};
    for (const f of jobType.input_schema) {
      const raw = (values[f.key] ?? '').trim();
      if (raw === '') continue;
      payload[f.key] = f.type === 'number' ? Number(raw) : raw;
    }

    cancelledRef.current = false;
    setRun({ phase: 'running', jobId: '', startedAt: Date.now() });
    setRemaining(
      typeof jobType.expected_seconds === 'number' && jobType.expected_seconds > 0
        ? jobType.expected_seconds
        : null,
    );

    let jobId: string;
    try {
      const res = await fetch('/api/ai-jobs/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_type: jobType.job_type, payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.job_id) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      jobId = data.job_id as string;
    } catch (err) {
      setRun({ phase: 'error', message: err instanceof Error ? err.message : 'Could not start the job.' });
      return;
    }

    if (cancelledRef.current) return;
    const startedAt = Date.now();
    setRun({ phase: 'running', jobId, startedAt });

    // Countdown ticker (visual only).
    tickRef.current = setInterval(() => {
      setRemaining((r) => (r === null ? null : Math.max(0, r - 1)));
    }, 1_000);

    // Status poll.
    pollRef.current = setInterval(async () => {
      if (cancelledRef.current) {
        stopTimers();
        return;
      }
      if (Date.now() - startedAt > RUN_DEADLINE_MS) {
        stopTimers();
        setRun({ phase: 'error', message: 'The job is taking longer than expected — check back shortly.' });
        return;
      }
      try {
        const res = await fetch(`/api/ai-jobs/status?id=${encodeURIComponent(jobId)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return; // transient — keep polling
        const data = (await res.json()) as {
          status: AiJobStatus;
          result: unknown;
          completed_at: string | null;
        };
        if (data.status === 'done') {
          stopTimers();
          const answer = extractAnswer(data.result) || 'The job finished with no text output.';
          const completedAt = data.completed_at ?? new Date().toISOString();
          setRun({ phase: 'done', answer, completedAt });
          setSessionLastRun(completedAt);
        } else if (data.status === 'error' || data.status === 'canceled' || data.status === 'not_found') {
          stopTimers();
          setRun({
            phase: 'error',
            message:
              data.status === 'canceled'
                ? 'The job was canceled.'
                : data.status === 'not_found'
                  ? 'The job could not be found.'
                  : 'The job hit an error. Please try again.',
          });
        }
        // pending/claimed/running → keep polling
      } catch {
        // network blip — keep polling
      }
    }, POLL_MS);
  }, [jobType, values, stopTimers]);

  const isRunning = run.phase === 'running';
  const lastRunStamp = fmtStamp(jobType.last_run ?? sessionLastRun);

  // Countdown label.
  let countdownLabel: string | null = null;
  if (isRunning) {
    if (remaining === null) {
      countdownLabel = 'This usually takes a little while…';
    } else if (remaining > 0) {
      countdownLabel = `Expected ~${remaining}s remaining…`;
    } else {
      countdownLabel = 'Taking a little longer than expected…';
    }
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="font-medium">Run: {jobType.title}</div>
          {jobType.description && (
            <p className="text-xs text-muted-foreground">{jobType.description}</p>
          )}
          <p className="font-mono text-xs text-muted-foreground/70">{jobType.job_type}</p>
        </div>
        {lastRunStamp && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Last ran {lastRunStamp}
          </div>
        )}
      </div>

      {/* Auto-drawn form */}
      {jobType.input_schema.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          This job takes no inputs — just press Run.
        </p>
      ) : (
        <div className="space-y-3">
          {jobType.input_schema.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`run-${f.key}`}>
                {f.label}
                {f.required && <span className="ml-0.5 text-destructive">*</span>}
              </Label>
              {f.type === 'textarea' ? (
                <Textarea
                  id={`run-${f.key}`}
                  rows={3}
                  value={values[f.key] ?? ''}
                  disabled={isRunning}
                  onChange={(e) => setValue(f.key, e.target.value)}
                />
              ) : f.type === 'select' ? (
                <Select
                  value={values[f.key] ?? ''}
                  onValueChange={(v) => setValue(f.key, v)}
                  disabled={isRunning}
                >
                  <SelectTrigger id={`run-${f.key}`}>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(f.options ?? []).map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`run-${f.key}`}
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={values[f.key] ?? ''}
                  disabled={isRunning}
                  onChange={(e) => setValue(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleRun} disabled={isRunning}>
          {isRunning ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          {isRunning ? 'Running…' : 'Run'}
        </Button>
        {countdownLabel && (
          <span className="text-xs text-muted-foreground">{countdownLabel}</span>
        )}
      </div>

      {/* Result */}
      {run.phase === 'done' && (
        <div className="space-y-1.5 rounded-md border border-[#0b6d41]/30 bg-[#0b6d41]/5 p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-[#0b6d41]">
            <CheckCircle2 className="h-4 w-4" /> Done
            {fmtStamp(run.completedAt) && (
              <span className="font-normal text-muted-foreground">· {fmtStamp(run.completedAt)}</span>
            )}
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">
            {run.answer}
          </pre>
        </div>
      )}
      {run.phase === 'error' && (
        <div className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{run.message}</span>
        </div>
      )}
    </div>
  );
}
