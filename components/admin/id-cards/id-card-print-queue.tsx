'use client';

// ============================================================================
// IdCardPrintQueue — live table of id_card_print_jobs.
// Created: 2026-05-07.
//
// Auto-refreshes every 5 seconds. Reads from GET /api/id-cards/jobs.
// Stubs with empty list on 404 (Agent C not live yet).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  RefreshCw,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  AlertCircle,
  Wifi,
  WifiOff,
  HelpCircle,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createClientSupabaseClient } from '@/lib/supabase/client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { IdCardPrintJob, IdCardPrintJobStatus } from '@/app/(routes)/admin/id-cards/_types';

// ──────────────────────────────────────────────────────────────────────────────
// Status badge config
// ──────────────────────────────────────────────────────────────────────────────
type StatusConfig = {
  label: string;
  icon: React.ReactNode;
  className: string;
};

const STATUS_CONFIG: Record<IdCardPrintJobStatus, StatusConfig> = {
  pending: {
    label: 'Pending',
    icon: <Clock className="h-3 w-3" />,
    className:
      'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  },
  rendering: {
    label: 'Rendering',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    className:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  },
  sent_to_agent: {
    label: 'Sent to printer',
    icon: <Send className="h-3 w-3" />,
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  },
  printed: {
    label: 'Printed',
    icon: <CheckCircle2 className="h-3 w-3" />,
    className:
      'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800',
  },
  failed: {
    label: 'Failed',
    icon: <XCircle className="h-3 w-3" />,
    className:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  },
};

function StatusBadge({ status }: { status: IdCardPrintJobStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Bridge heartbeat chip — is the on-prem print bridge alive?
//
// Reads id_card_agent_status.last_poll_at (singleton row id=1, written by the
// jobs API whenever the bridge polls with a valid agent token) every 30 s via
// the browser Supabase client — the table's SELECT policy covers queue viewers.
//   • last poll within 120 s  → green  "Print bridge online"
//   • older                   → red    "Print bridge silent since <relative>"
//   • row missing / any error → neutral "Bridge status unknown"
// ──────────────────────────────────────────────────────────────────────────────
const BRIDGE_ONLINE_WINDOW_MS = 120_000;
const BRIDGE_REFRESH_MS = 30_000;

type BridgeStatus =
  | { state: 'online' }
  | { state: 'silent'; lastPollAt: string }
  | { state: 'unknown' };

function BridgeStatusChip() {
  const [status, setStatus] = useState<BridgeStatus>({ state: 'unknown' });

  useEffect(() => {
    let cancelled = false;
    // id_card_agent_status is newer than the generated Database types — use the
    // untyped client view (established repo pattern for post-typegen tables).
    const supabase = createClientSupabaseClient() as unknown as SupabaseClient;

    const check = async () => {
      try {
        const { data, error } = await supabase
          .from('id_card_agent_status')
          .select('last_poll_at')
          .eq('id', 1)
          .maybeSingle();
        if (cancelled) return;
        const lastPollAt = (data as { last_poll_at?: string } | null)?.last_poll_at;
        if (error || !lastPollAt) {
          setStatus({ state: 'unknown' });
          return;
        }
        const ageMs = Date.now() - new Date(lastPollAt).getTime();
        setStatus(
          ageMs <= BRIDGE_ONLINE_WINDOW_MS
            ? { state: 'online' }
            : { state: 'silent', lastPollAt },
        );
      } catch {
        if (!cancelled) setStatus({ state: 'unknown' });
      }
    };

    check();
    const interval = setInterval(check, BRIDGE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (status.state === 'online') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300">
        <Wifi className="h-3 w-3" />
        Print bridge online
      </span>
    );
  }

  if (status.state === 'silent') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
        <WifiOff className="h-3 w-3" />
        Print bridge silent since{' '}
        {formatDistanceToNow(new Date(status.lastPollAt), { addSuffix: true })}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
      <HelpCircle className="h-3 w-3" />
      Bridge status unknown
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Stub data — used when Agent C's route is not live
// ──────────────────────────────────────────────────────────────────────────────
const STUB_JOBS: IdCardPrintJob[] = [
  {
    id: 'stub-1',
    student_name: 'Aarav Sharma',
    template_name: 'Default template',
    status: 'printed',
    enqueued_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    result_message: null,
  },
  {
    id: 'stub-2',
    student_name: 'Priya Nair',
    template_name: 'Default template',
    status: 'pending',
    enqueued_at: new Date(Date.now() - 1000 * 30).toISOString(),
    result_message: null,
  },
  {
    id: 'stub-3',
    student_name: 'Ravi Kumar',
    template_name: 'Default template',
    status: 'failed',
    enqueued_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    result_message: 'Print station unreachable — connection refused at http://192.168.1.50:8080',
  },
  {
    id: 'stub-4',
    student_name: 'Divya Krishnamurthy',
    template_name: 'Default template',
    status: 'rendering',
    enqueued_at: new Date(Date.now() - 1000 * 10).toISOString(),
    result_message: null,
  },
  {
    id: 'stub-5',
    student_name: 'Senthil Murugan',
    template_name: 'Default template',
    status: 'sent_to_agent',
    enqueued_at: new Date(Date.now() - 1000 * 45).toISOString(),
    result_message: null,
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Fetch helper
// ──────────────────────────────────────────────────────────────────────────────
async function fetchJobs(): Promise<IdCardPrintJob[]> {
  try {
    const res = await fetch('/api/id-cards/jobs');
    if (res.ok) {
      const json = await res.json();
      // Tolerant unwrap — Agent C may return { data: [...] } or plain [...]
      return Array.isArray(json) ? json : (json?.data ?? STUB_JOBS);
    }
    return STUB_JOBS;
  } catch {
    return STUB_JOBS;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
export function IdCardPrintQueue() {
  const [jobs, setJobs] = useState<IdCardPrintJob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJobs();
      setJobs(data);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + 5-second auto-refresh
  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  const handleRetry = async (job: IdCardPrintJob) => {
    setActionInFlight(job.id);
    try {
      await fetch(`/api/id-cards/jobs/${job.id}/retry`, { method: 'POST' });
      await load();
    } finally {
      setActionInFlight(null);
    }
  };

  const handleCancel = async (job: IdCardPrintJob) => {
    setActionInFlight(job.id);
    try {
      await fetch(`/api/id-cards/jobs/${job.id}`, { method: 'DELETE' });
      await load();
    } finally {
      setActionInFlight(null);
    }
  };

  const activeCount = jobs?.filter(
    (j) => j.status === 'pending' || j.status === 'rendering' || j.status === 'sent_to_agent',
  ).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <BridgeStatusChip />
          <span className="text-sm text-muted-foreground">
            {jobs ? `${jobs.length} job${jobs.length !== 1 ? 's' : ''}` : '—'}
            {activeCount > 0 && (
              <span className="ml-2 text-blue-600 dark:text-blue-400">
                · {activeCount} in progress
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground opacity-60">
            Auto-refreshing every 5 s
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh now
        </Button>
      </div>

      {/* Table */}
      {loading && jobs === null ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : jobs?.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          No print jobs yet. Jobs appear here when someone requests an ID card.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead className="w-44">Template</TableHead>
                <TableHead className="w-36">Status</TableHead>
                <TableHead className="w-44">Enqueued</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="w-28 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(jobs ?? []).map((job) => {
                const inFlight = actionInFlight === job.id;
                return (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.student_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {job.template_name}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(job.enqueued_at), 'dd MMM yyyy, HH:mm')}
                    </TableCell>
                    <TableCell>
                      {job.result_message ? (
                        <span className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                          {job.result_message}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {job.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={inFlight}
                            onClick={() => handleRetry(job)}
                            className="h-7 gap-1 px-2 text-xs"
                          >
                            {inFlight ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            Retry
                          </Button>
                        )}
                        {(job.status === 'pending') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={inFlight}
                            onClick={() => handleCancel(job)}
                            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                          >
                            {inFlight ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
