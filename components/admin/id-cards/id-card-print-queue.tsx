'use client';

// ============================================================================
// IdCardPrintQueue — live table of id_card_print_jobs.
// Created: 2026-05-07.
//
// Auto-refreshes every 5 seconds. Reads from GET /api/id-cards/jobs.
// Stubs with empty list on 404 (Agent C not live yet).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  RefreshCw,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  AlertCircle,
} from 'lucide-react';

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
        <div className="flex items-center gap-3">
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
                <TableHead>Student</TableHead>
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
