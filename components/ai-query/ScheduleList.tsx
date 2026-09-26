'use client';

/**
 * ScheduleList — the "Scheduled" tab of Your past chats.
 * The signed-in person's own scheduled questions (RLS: owner-only), each with
 * its plan in plain English, the next run, the last result, and
 * pause / resume / run now / delete. "Latest answer" shows the last reply
 * in place, read from the person's own ai_jobs row.
 */

import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { BarChart3, CalendarClock, ChevronDown, ChevronUp, Loader2, Pause, Play, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  deleteSchedule,
  getPreviousScheduleAnswer,
  getScheduleAnswer,
  listMySchedules,
  runNowMessage,
  runScheduleNow,
  setScheduleActive,
} from '@/lib/services/ai-query/schedules/schedule-service';
import { describeSchedule, formatIstDateTime } from '@/lib/services/ai-query/schedules/next-run';
import type { AIQuerySchedule, ScheduleStatus } from '@/lib/services/ai-query/schedules/types';
import { cn } from '@/lib/utils';
import type { ArtifactRef } from '@/types/ai-query';
import { markdownComponents } from './markdown-components';
import { ArtifactPanel } from './ArtifactPanel';

const STATUS_TEXT: Record<ScheduleStatus, string> = {
  scheduled: 'Not run yet',
  queued: 'Being answered',
  delivering: 'Being sent',
  delivered: 'Last answer sent',
  failed: 'Last run failed',
  skipped_limit: 'Skipped: daily limit reached',
  skipped_busy: 'Skipped: too many questions at once',
  skipped_offline: 'Skipped: AI Assistant was off',
  paused_failures: 'Paused after 3 failed runs',
  paused_no_access: 'Paused: no AI Assistant access',
};

function statusTone(s: AIQuerySchedule): string {
  if (!s.active) return 'text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10';
  if (s.last_status === 'delivered') return 'text-green-700 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (s.last_status === 'failed' || s.last_status.startsWith('skipped')) {
    return 'text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10';
  }
  return 'bg-muted text-muted-foreground border-border';
}

function channelText(s: AIQuerySchedule): string {
  const parts = [s.channels.includes('email') ? 'email' : null, s.channels.includes('in_app') ? 'MyJKKN' : null];
  return parts.filter(Boolean).join(' and ');
}

const IN_PROGRESS = ['pending', 'claimed', 'running'];

function LatestAnswer({ jobId, scheduleId }: { jobId: string; scheduleId: string }) {
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  /** true when `text` is the previous run's answer, shown while the new run is being answered */
  const [isPrevious, setIsPrevious] = useState(false);
  const [artifacts, setArtifacts] = useState<ArtifactRef[]>([]);
  const [openArtifact, setOpenArtifact] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await getScheduleAnswer(jobId);
      if (!alive) return;
      // A new run still being answered: show the previous answer instead of a blank.
      if (!r?.answer && r && IN_PROGRESS.includes(r.status)) {
        const prev = await getPreviousScheduleAnswer(scheduleId, jobId);
        if (!alive) return;
        if (prev) {
          setText(prev.answer);
          setArtifacts(prev.artifacts);
          setIsPrevious(true);
          setStatus(r.status);
          setLoading(false);
          return;
        }
      }
      setText(r?.answer ?? null);
      setStatus(r?.status ?? null);
      setArtifacts(r?.artifacts ?? []);
      setIsPrevious(false);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [jobId, scheduleId]);

  if (loading) {
    return (
      <div className="flex justify-center py-3 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (!text) {
    return (
      <p className="py-2 text-xs text-muted-foreground">
        {status && IN_PROGRESS.includes(status)
          ? 'Still being answered.'
          : 'No answer for the last run.'}
      </p>
    );
  }
  return (
    <div className="max-w-none break-words text-sm text-foreground">
      {isPrevious && (
        <p className="mb-1 text-xs text-muted-foreground">A new answer is on its way. Here is the previous one:</p>
      )}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
      {artifacts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {artifacts.map((a) => (
            <Button
              key={a.id}
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => setOpenArtifact(a.id)}
            >
              <BarChart3 className="mr-1 h-3 w-3" />
              {a.title || `Open ${a.type}`}
            </Button>
          ))}
        </div>
      )}
      <ArtifactPanel
        artifactId={openArtifact}
        open={openArtifact !== null}
        onOpenChange={(o) => {
          if (!o) setOpenArtifact(null);
        }}
      />
    </div>
  );
}

export function ScheduleList({
  refreshKey,
  focusId,
}: {
  /** Bump to reload (e.g. after a new schedule is saved). */
  refreshKey?: number;
  /** A schedule to open on arrival (from an email / notification link). */
  focusId?: string | null;
}) {
  const [rows, setRows] = useState<AIQuerySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(focusId ?? null);
  const [confirmDelete, setConfirmDelete] = useState<AIQuerySchedule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrored(false);
    try {
      setRows(await listMySchedules());
    } catch {
      setErrored(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (focusId) setExpanded(focusId);
  }, [focusId]);

  const act = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    setBusyId(id);
    try {
      const res = await fn();
      if (res.ok) toast.success(okText);
      else toast.error(res.error ?? 'That did not work. Please try again.');
      await load();
    } catch {
      toast.error('That did not work. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRunNow = async (s: AIQuerySchedule) => {
    setBusyId(s.id);
    try {
      const res = await runScheduleNow(s.id);
      if (res.ok) toast.success(runNowMessage(res));
      else toast.error(runNowMessage(res));
      await load();
    } catch {
      toast.error('Could not run it now. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (errored) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Couldn’t load your schedules. Please try again.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <CalendarClock className="mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm">No scheduled questions yet.</p>
        <p className="mt-1 max-w-xs text-xs">
          Open Past chats and press Repeat… on a question to have it answered for you every day,
          week or month.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {rows.map((s) => {
          const busy = busyId === s.id;
          const open = expanded === s.id;
          return (
            <div
              key={s.id}
              className={cn(
                'rounded-lg border border-border bg-card p-3 shadow-sm',
                focusId === s.id && 'border-primary/50',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground line-clamp-2">{s.title}</p>
                <Badge variant="outline" className={cn('flex-shrink-0 text-[10px] font-medium', statusTone(s))}>
                  {s.active ? STATUS_TEXT[s.last_status] ?? s.last_status : 'Paused'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{s.question}</p>
              <p className="mt-2 text-xs text-foreground/80">
                Sent {describeSchedule(s)} by {channelText(s)}.
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {s.active ? `Next: ${formatIstDateTime(s.next_run_at)}` : STATUS_TEXT[s.last_status] ?? 'Paused'}
                {s.last_run_at ? ` · Last run: ${formatIstDateTime(s.last_run_at)}` : ''}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {s.active ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={busy}
                    onClick={() => act(s.id, () => setScheduleActive(s.id, false), 'Paused.')}
                  >
                    <Pause className="mr-1 h-3 w-3" />
                    Pause
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={busy}
                    onClick={() => act(s.id, () => setScheduleActive(s.id, true), 'Resumed.')}
                  >
                    <Play className="mr-1 h-3 w-3" />
                    Resume
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={busy || s.last_status === 'queued' || s.last_status === 'delivering'}
                  onClick={() => handleRunNow(s)}
                >
                  <Zap className="mr-1 h-3 w-3" />
                  Run now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-red-600 hover:text-red-600 dark:text-red-400"
                  disabled={busy}
                  onClick={() => setConfirmDelete(s)}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Delete
                </Button>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {s.last_job_id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 px-2 text-xs"
                    onClick={() => setExpanded(open ? null : s.id)}
                  >
                    Latest answer
                    {open ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
                  </Button>
                )}
              </div>

              {open && s.last_job_id && (
                <div className="mt-2 border-t border-border pt-2">
                  <LatestAnswer jobId={s.last_job_id} scheduleId={s.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        {/* Inside the History sheet (z-[90]): lift the box above it so it can be clicked. */}
        <AlertDialogContent className="z-[100]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              “{confirmDelete?.title}” will stop running. Answers you already received are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                const target = confirmDelete;
                setConfirmDelete(null);
                if (target) void act(target.id, () => deleteSchedule(target.id), 'Deleted.');
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default ScheduleList;
