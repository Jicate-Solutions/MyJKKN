'use client';

// ============================================
// CASCADE PREVIEW — Director-grade policy UX
// ============================================
// Purpose: Shows plain-English consequences of a policy edit BEFORE save.
//          Satisfies v1 "cascade-preview pane" requirement from internship-module-spec.md §5.
//
// Usage:
//   <CascadePreview
//     proposedChanges={[{ key: 'fee_threshold', label: 'Fee Threshold', currentValue: 70, proposedValue: 80, unit: '%' }]}
//     scope="platform"
//     previewData={data}           // from usePolicy.useCascadePreview() once Agent B ships
//     onConfirm={handleSave}
//     onCancel={handleCancel}
//     open={hasUnsavedChanges}
//   />
//
// Graceful empty state: renders nothing when open=false; no-data state when previewData is null.
// ============================================

import { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Info,
  XCircle,
  Users,
  GraduationCap,
  Building2,
  X,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type CascadePreviewData,
  type ProposedChange,
  type CascadeScope,
  type PolicyConsequence,
} from './types';

interface CascadePreviewProps {
  /** Whether the panel is visible (unsaved edit detected) */
  open: boolean;
  /** The proposed field changes */
  proposedChanges: ProposedChange[];
  /** Computed consequences from usePolicy.useCascadePreview() hook */
  previewData: CascadePreviewData | null;
  /** Policy scope */
  scope: CascadeScope;
  /** Called when the user clicks "Confirm and apply" */
  onConfirm: () => void;
  /** Called when the user clicks "Cancel" */
  onCancel: () => void;
  /** Whether the save mutation is in-flight */
  isSaving?: boolean;
}

function SeverityIcon({ severity }: { severity: PolicyConsequence['severity'] }) {
  if (severity === 'critical') return <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />;
  if (severity === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />;
  return <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />;
}

function SeverityBadge({ severity }: { severity: PolicyConsequence['severity'] }) {
  if (severity === 'critical')
    return <Badge variant="destructive" className="text-xs">Critical</Badge>;
  if (severity === 'warning')
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs">Warning</Badge>;
  return <Badge variant="secondary" className="text-xs">Info</Badge>;
}

function AudienceStat({ icon: Icon, label, count }: { icon: React.ElementType; label: string; count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span>
        <strong className="text-foreground">{count.toLocaleString()}</strong> {label}
      </span>
    </div>
  );
}

export function CascadePreview({
  open,
  proposedChanges,
  previewData,
  scope,
  onConfirm,
  onCancel,
  isSaving = false,
}: CascadePreviewProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus trap: move focus into panel when it opens
  useEffect(() => {
    if (open && panelRef.current) {
      const firstButton = panelRef.current.querySelector<HTMLButtonElement>('button');
      firstButton?.focus();
    }
  }, [open]);

  if (!open) return null;

  const scopeLabel =
    scope === 'platform' ? 'all colleges' : scope === 'college' ? 'this college' : 'this cycle';

  const hasCritical = previewData?.consequences.some((c) => c.severity === 'critical');
  const hasChanges = proposedChanges.length > 0;

  return (
    // Overlay backdrop
    <div
      className="fixed inset-0 z-50 bg-black/20 flex items-end sm:items-center justify-end"
      aria-modal="true"
      role="dialog"
      aria-label="Policy change preview"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* Side panel */}
      <div
        ref={panelRef}
        className={[
          'bg-background border-l border-t sm:border sm:rounded-lg shadow-2xl',
          'w-full sm:w-[480px] max-h-[90vh] flex flex-col',
          'transition-transform duration-300 ease-out',
          'sm:mr-4 sm:mb-4',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold">Policy change preview</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review the downstream effect across {scopeLabel} before saving.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0 -mt-1 -mr-1"
            onClick={onCancel}
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Proposed changes summary */}
        {hasChanges && (
          <div className="p-4 bg-muted/40 border-b flex-shrink-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Proposed changes
            </p>
            <div className="space-y-1.5">
              {proposedChanges.map((change) => (
                <div key={change.key} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground min-w-0 flex-1 truncate">{change.label}:</span>
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="line-through text-muted-foreground">
                      {String(change.currentValue)}{change.unit}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium text-foreground">
                      {String(change.proposedValue)}{change.unit}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Consequences list — scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {/* Loading state */}
          {previewData === null || previewData.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : previewData.error ? (
            /* Error state */
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 rounded-md p-3">
              <XCircle className="h-4 w-4 flex-shrink-0" />
              <span>Could not compute cascade preview: {previewData.error}</span>
            </div>
          ) : previewData.consequences.length === 0 ? (
            /* Empty / no-impact state */
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="text-sm font-medium">No downstream impact detected</p>
              <p className="text-xs text-muted-foreground max-w-[280px]">
                This change has no effect on in-flight cycles, learner statuses, or active assignments.
              </p>
            </div>
          ) : (
            /* Consequences list */
            <div className="space-y-3">
              {previewData.consequences.map((consequence, idx) => (
                <div
                  key={idx}
                  className={[
                    'rounded-md border p-3 space-y-2',
                    consequence.severity === 'critical' && 'border-destructive/30 bg-destructive/5',
                    consequence.severity === 'warning' && 'border-amber-200 bg-amber-50',
                    consequence.severity === 'info' && 'border-blue-100 bg-blue-50/50',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="flex items-start gap-2">
                    <SeverityIcon severity={consequence.severity} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <SeverityBadge severity={consequence.severity} />
                      </div>
                      <p className="text-sm leading-snug">{consequence.summary}</p>
                    </div>
                  </div>

                  {/* Affected cycles */}
                  {consequence.affectedCycles.length > 0 && (
                    <div className="ml-6 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Affected cycles:</p>
                      {consequence.affectedCycles.slice(0, 3).map((cycle) => (
                        <div key={cycle.cycleId} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate">
                            {cycle.collegeName} — {cycle.label}
                          </span>
                          <span className="flex-shrink-0 ml-2 font-medium">
                            {cycle.affectedLearners.toLocaleString()} learners
                          </span>
                        </div>
                      ))}
                      {consequence.affectedCycles.length > 3 && (
                        <p className="text-xs text-muted-foreground">
                          +{consequence.affectedCycles.length - 3} more cycles
                        </p>
                      )}
                    </div>
                  )}

                  {/* Notification audience */}
                  {(consequence.notificationAudience.hods > 0 ||
                    consequence.notificationAudience.coordinators > 0 ||
                    consequence.notificationAudience.learners > 0) && (
                    <div className="ml-6 border-t pt-2 mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">
                        Notification audience:
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <AudienceStat
                          icon={Building2}
                          label="college HoDs"
                          count={consequence.notificationAudience.hods}
                        />
                        <AudienceStat
                          icon={Users}
                          label="coordinators"
                          count={consequence.notificationAudience.coordinators}
                        />
                        <AudienceStat
                          icon={GraduationCap}
                          label="learners"
                          count={consequence.notificationAudience.learners}
                        />
                      </div>
                    </div>
                  )}

                  {/* Blocked learners callout */}
                  {consequence.blockedLearners && consequence.blockedLearners > 0 && (
                    <div className="ml-6 rounded bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive flex items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        <strong>{consequence.blockedLearners}</strong> learners currently pending will
                        be blocked from posting allocation under the new threshold.
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex-shrink-0 space-y-3">
          {previewData && !previewData.isLoading && !previewData.error && previewData.consequences.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Preview computed at{' '}
              {new Date(previewData.computedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
              . Re-open to refresh.
            </p>
          )}

          <Separator />

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              variant={hasCritical ? 'destructive' : 'default'}
              onClick={onConfirm}
              disabled={isSaving || (previewData?.isLoading ?? false)}
            >
              {isSaving ? 'Saving…' : hasCritical ? 'Apply anyway' : 'Confirm and apply'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
