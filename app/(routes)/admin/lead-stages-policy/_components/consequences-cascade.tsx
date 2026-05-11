'use client';

// ============================================================================
// ConsequencesCascade — real-time impact preview panel
// Created: 2026-05-07
//
// Shows a yellow/amber preview pane before the user confirms a terminal-flag
// toggle. Explains in plain English what will happen to counselor workloads
// if the change is saved.
//
// Design principle (Director feedback PR #748): "any tom dick and harry should
// be able to understand." No engineering terms — only human outcomes.
// ============================================================================

import { AlertTriangle, Info } from 'lucide-react';
import { LeadStagePolicyService } from '@/lib/services/admission/lead-stage-policy-service';

interface ConsequencesCascadeProps {
  /** The stage whose terminal flag is being previewed */
  stageName: string;
  /** Current value — what it IS right now */
  currentIsTerminal: boolean;
  /** The value the user just toggled TO (pending, not saved yet) */
  pendingIsTerminal: boolean;
  /** Live lead count for this stage — pass 0 if counts not yet loaded */
  leadsInStage: number;
  /** Whether the lead-count endpoint is still loading */
  countsLoading?: boolean;
}

/**
 * ConsequencesCascade renders a dismissible amber/yellow preview pane that
 * shows the real-world impact of a pending terminal-flag change before the
 * user confirms via the form dialog.
 *
 * It is purely presentational — it does NOT call any API. The parent feeds
 * it the counts and toggles its visibility.
 */
export function ConsequencesCascade({
  stageName,
  currentIsTerminal,
  pendingIsTerminal,
  leadsInStage,
  countsLoading = false,
}: ConsequencesCascadeProps) {
  // Nothing to show if the value hasn't actually changed
  if (currentIsTerminal === pendingIsTerminal) return null;

  const stageLabel = LeadStagePolicyService.formatStage(stageName);
  const consequence = LeadStagePolicyService.consequencesIfToggle(
    currentIsTerminal,
    leadsInStage,
  );

  const isUpgrade = currentIsTerminal && !pendingIsTerminal; // terminal → active (more work for counselors)
  const isRelief = !currentIsTerminal && pendingIsTerminal;  // active → terminal (frees counselors)

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        isUpgrade
          ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30'
          : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
      }`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {isUpgrade ? (
            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          ) : (
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        <div className="flex-1 space-y-1">
          <p
            className={`text-sm font-semibold ${
              isUpgrade
                ? 'text-orange-800 dark:text-orange-200'
                : 'text-amber-800 dark:text-amber-200'
            }`}
          >
            Preview: what happens if you save this change to &quot;{stageLabel}&quot;
          </p>

          {countsLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading lead counts...
            </p>
          ) : (
            <p
              className={`text-sm ${
                isUpgrade
                  ? 'text-orange-700 dark:text-orange-300'
                  : 'text-amber-700 dark:text-amber-300'
              }`}
            >
              {consequence}
            </p>
          )}

          {/* Contextual footnote for each direction */}
          {!countsLoading && (
            <p
              className={`text-xs ${
                isUpgrade
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {isRelief
                ? 'This takes effect on the next counselor assignment run.'
                : 'This takes effect immediately on the next assignment run. Counselors already at their cap will receive no new leads until their count drops.'}
            </p>
          )}
        </div>

        {/* Direction badge */}
        <div
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            isRelief
              ? 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200'
              : 'bg-orange-200 text-orange-800 dark:bg-orange-800 dark:text-orange-200'
          }`}
        >
          {isRelief ? 'Frees counselors' : 'Adds to workload'}
        </div>
      </div>
    </div>
  );
}
