'use client';

// ============================================================================
// BulkPrintDialog — confirm + run bulk ID-card printing for selected learners.
// Created: 2026-07-24 — Phase 2 (one-click ID-card printing).
//
// Flow: pick a template → review the selected names → sequential POSTs to
// /api/id-cards/jobs → results summary (queued / already queued / skipped
// because no account / failed) with a link to the print queue.
//
// Identity mapping: rows are learners_profiles.id; accounts (profiles.id) are
// resolved in ONE batched query via profiles.learner_id before enqueueing.
// ============================================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, Printer } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  enqueuePrintJob,
  resolveProfileIdsForLearners
} from '@/lib/services/id-cards/print-jobs-client';
import {
  emptyTemplateMessage,
  TemplateSelect,
  useIdCardTemplates
} from './print-card-button';

export interface BulkPrintLearner {
  /** learners_profiles.id */
  learnerId: string;
  name: string;
  rollNumber?: string | null;
}

interface BulkPrintResults {
  queued: string[];
  alreadyQueued: string[];
  skippedNoAccount: string[];
  failed: Array<{ name: string; message: string }>;
}

const EMPTY_RESULTS: BulkPrintResults = {
  queued: [],
  alreadyQueued: [],
  skippedNoAccount: [],
  failed: []
};

// Confirm-step printing estimate: the Evolis bridge prints ~1 card / 15 s,
// and every card consumes one YMCKO ribbon panel (~300 per full ribbon).
const SECONDS_PER_CARD = 15;
const LARGE_BATCH_THRESHOLD = 50;

function formatPrintDuration(cards: number): string {
  const totalMinutes = Math.ceil((cards * SECONDS_PER_CARD) / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

interface BulkPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learners: BulkPrintLearner[];
}

export function BulkPrintDialog({
  open,
  onOpenChange,
  learners
}: BulkPrintDialogProps) {
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done'>('confirm');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<BulkPrintResults>(EMPTY_RESULTS);

  const { templates, selectedTemplateId, selectTemplate, inactiveOnly } =
    useIdCardTemplates(open);

  // Fresh confirm view every time the dialog opens.
  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setProgress({ current: 0, total: 0 });
      setResults(EMPTY_RESULTS);
    }
  }, [open]);

  const noTemplates = templates !== null && templates.length === 0;
  const emptyMessage = emptyTemplateMessage(templates, inactiveOnly);

  const runBulkPrint = async () => {
    if (!selectedTemplateId || learners.length === 0) return;
    setPhase('running');
    setProgress({ current: 0, total: learners.length });

    // ONE batched account lookup for all selected learners.
    let profileMap: Map<string, string>;
    try {
      profileMap = await resolveProfileIdsForLearners(
        learners.map((l) => l.learnerId)
      );
    } catch (err) {
      console.error('[id-cards] Bulk account lookup failed:', err);
      toast.error('Failed to look up learner accounts. Please try again.');
      setPhase('confirm');
      return;
    }

    const summary: BulkPrintResults = {
      queued: [],
      alreadyQueued: [],
      skippedNoAccount: [],
      failed: []
    };

    let done = 0;
    for (const learner of learners) {
      const profileId = profileMap.get(learner.learnerId);
      if (!profileId) {
        summary.skippedNoAccount.push(learner.name);
      } else {
        const outcome = await enqueuePrintJob(profileId, selectedTemplateId);
        if (outcome.status === 'queued') {
          summary.queued.push(learner.name);
        } else if (outcome.status === 'already_queued') {
          summary.alreadyQueued.push(learner.name);
        } else {
          summary.failed.push({ name: learner.name, message: outcome.message });
        }
      }
      done += 1;
      setProgress({ current: done, total: learners.length });
    }

    setResults(summary);
    setPhase('done');

    if (summary.queued.length > 0) {
      toast.success(
        `${summary.queued.length} ID card${summary.queued.length > 1 ? 's' : ''} queued for printing`
      );
    }
    if (summary.alreadyQueued.length > 0) {
      toast(
        `${summary.alreadyQueued.length} already in the print queue`
      );
    }
    if (summary.failed.length > 0) {
      toast.error(
        `Failed to queue ${summary.failed.length} ID card${summary.failed.length > 1 ? 's' : ''}`
      );
    }
  };

  const handleOpenChange = (next: boolean) => {
    // Don't allow closing mid-run — the sequential POSTs are in flight.
    if (phase === 'running') return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {phase !== 'done' ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {phase === 'running'
                  ? `Queueing ${progress.current} of ${progress.total}…`
                  : `Print ${learners.length} ID card${learners.length > 1 ? 's' : ''}?`}
              </DialogTitle>
              <DialogDescription>
                {phase === 'running'
                  ? 'Please wait while the print jobs are queued. Do not close this dialog.'
                  : 'Each learner below will get one print job in the ID-card queue.'}
              </DialogDescription>
            </DialogHeader>

            {phase === 'confirm' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Template</p>
                  <TemplateSelect
                    templates={templates}
                    value={selectedTemplateId}
                    onChange={selectTemplate}
                    className="h-9 w-full"
                  />
                  {emptyMessage && (
                    <p className="text-sm text-destructive">{emptyMessage}</p>
                  )}
                </div>

                <div className="max-h-56 overflow-y-auto rounded-md border p-2">
                  <ul className="space-y-1 text-sm">
                    {learners.map((l) => (
                      <li
                        key={l.learnerId}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{l.name}</span>
                        {l.rollNumber && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {l.rollNumber}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-xs text-muted-foreground">
                  Uses {learners.length} ribbon panel
                  {learners.length > 1 ? 's' : ''} · about{' '}
                  {formatPrintDuration(learners.length)} of printing at ~15 s
                  per card.
                </p>
                {learners.length >= LARGE_BATCH_THRESHOLD && (
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
                    Large batch: a full YMCKO ribbon prints about 300 cards.
                    Check the ribbon has enough panels left before starting.
                  </p>
                )}
              </div>
            )}

            {phase === 'running' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Progress</span>
                  <span>
                    {progress.current} / {progress.total}
                  </span>
                </div>
                <Progress
                  value={
                    progress.total > 0
                      ? (progress.current / progress.total) * 100
                      : 0
                  }
                  className="h-2"
                />
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={phase === 'running'}
              >
                Cancel
              </Button>
              <Button
                onClick={runBulkPrint}
                disabled={
                  phase === 'running' ||
                  templates === null ||
                  noTemplates ||
                  !selectedTemplateId ||
                  learners.length === 0
                }
              >
                {phase === 'running' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="mr-2 h-4 w-4" />
                )}
                Print ID Cards ({learners.length})
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Print jobs queued</DialogTitle>
              <DialogDescription>
                Results for {progress.total} selected learner
                {progress.total > 1 ? 's' : ''}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              <ResultRow
                label="Queued for printing"
                names={results.queued}
                tone="success"
              />
              <ResultRow
                label="Already in the print queue"
                names={results.alreadyQueued}
                tone="muted"
              />
              <ResultRow
                label="Skipped — no account yet"
                names={results.skippedNoAccount}
                tone="muted"
              />
              {results.failed.length > 0 && (
                <div>
                  <p className="font-medium text-destructive">
                    Failed ({results.failed.length})
                  </p>
                  <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-muted-foreground">
                    {results.failed.map((f, i) => (
                      <li key={i} className="truncate">
                        {f.name} — {f.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter className="sm:justify-between">
              <Button variant="outline" asChild>
                <Link href="/admin/id-cards/print-queue">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View print queue
                </Link>
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResultRow({
  label,
  names,
  tone
}: {
  label: string;
  names: string[];
  tone: 'success' | 'muted';
}) {
  if (names.length === 0) return null;
  return (
    <div>
      <p
        className={
          tone === 'success' ? 'font-medium text-[#0b6d41]' : 'font-medium'
        }
      >
        {label} ({names.length})
      </p>
      <p className="mt-0.5 max-h-24 overflow-y-auto text-muted-foreground">
        {names.join(', ')}
      </p>
    </div>
  );
}
