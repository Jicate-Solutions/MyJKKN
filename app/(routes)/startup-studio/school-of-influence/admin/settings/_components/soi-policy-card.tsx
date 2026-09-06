'use client';

// ===========================================================================
// SoiPolicyCard — one School of Influence setting, edited the Director's way.
//
// The requirement (spec §7, S2) is not "an input that writes a column". It is:
// BEFORE saving, show the plain-English consequence and the cascade of what
// else changes. So the Save button never writes. It opens the shared
// <CascadePreview> panel — the same one every other Director-grade policy
// screen uses — carrying:
//
//   * the before -> after value,
//   * the row's own `ui_consequence` as the first, always-present statement of
//     what this setting does,
//   * every `ui_cascade` entry as its own severity-ranked consequence,
//   * and, at batch scope, an extra statement spelling out whether this edit
//     creates a batch-only override or moves the programme-wide default that
//     every other batch inherits.
//
// Only "Confirm and apply" writes. Cancel leaves the working value in the
// control so nothing typed is lost.
//
// Everything on this card comes from the row's own columns. No `soi.*` key is
// named here.
// ===========================================================================

import { useState } from 'react';
import toast from 'react-hot-toast';
import { GitBranch, Loader2, RotateCcw, Save, Undo2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CascadePreview } from '@/components/shared/cascade-preview/CascadePreview';
import type {
  CascadePreviewData,
  PolicyConsequence,
  ProposedChange,
} from '@/components/shared/cascade-preview/types';

import {
  useDiscardSoiDraft,
  usePublishSoiDraft,
  useRemoveSoiOverride,
  useSaveSoiPolicy,
  widgetEmitsJsonText,
  type SoiPolicyView,
  type SoiScope,
  type SoiSeverity,
} from '../_lib/soi-policies-service';
import { SoiWidgetDispatcher } from './soi-widget-dispatcher';

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** ui_cascade severity -> the CascadePreview severity vocabulary. */
function toPreviewSeverity(severity: SoiSeverity): PolicyConsequence['severity'] {
  if (severity === 'high') return 'critical';
  if (severity === 'medium') return 'warning';
  return 'info';
}

/** CascadePreview requires these collections; policy metadata carries none. */
const NO_AUDIENCE = { hods: 0, coordinators: 0, learners: 0, faculties: 0 };

function consequence(
  summary: string,
  severity: PolicyConsequence['severity']
): PolicyConsequence {
  return {
    summary,
    severity,
    affectedCycles: [],
    notificationAudience: NO_AUDIENCE,
  };
}

/** Render any stored JSONB value as something a Director can read in one line. */
function describeValue(value: unknown): string {
  if (value === null || value === undefined) return 'not set';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (Array.isArray(value)) return value.length === 0 ? 'none' : value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The label a Director reads for a setting: its description, never its key. */
function policyLabel(view: SoiPolicyView): string {
  return view.defaultRow.description ?? view.policyKey;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface Props {
  view: SoiPolicyView;
  scope: SoiScope;
  /** Display name of the batch being edited; absent at programme scope. */
  batchName?: string;
  /** How many batches exist, to say truthfully who a default change reaches. */
  batchCount: number;
}

export function SoiPolicyCard({ view, scope, batchName, batchCount }: Props) {
  const baseValue = view.hasPendingDraft ? view.pendingDraftValue : view.effectiveValue;
  const [working, setWorking] = useState<unknown>(baseValue);
  const [previewOpen, setPreviewOpen] = useState(false);

  const save = useSaveSoiPolicy();
  const publish = usePublishSoiDraft();
  const discard = useDiscardSoiDraft();
  const removeOverride = useRemoveSoiOverride();

  const busy =
    save.isPending || publish.isPending || discard.isPending || removeOverride.isPending;

  const row = view.editableRow ?? view.defaultRow;
  const expectsJsonText = widgetEmitsJsonText(row);
  const isMajor = (view.defaultRow.classification ?? 'operational') === 'major';
  const dirty = JSON.stringify(baseValue) !== JSON.stringify(working);

  /** Parse the widget's output back into the JSONB shape the column expects. */
  function normalisedWorking(): { ok: true; value: unknown } | { ok: false } {
    if (expectsJsonText && typeof working === 'string') {
      try {
        return { ok: true, value: JSON.parse(working) };
      } catch {
        return { ok: false };
      }
    }
    return { ok: true, value: working };
  }

  // -- the Director's view -------------------------------------------------

  const parsedWorking = normalisedWorking();

  const proposedChanges: ProposedChange[] = [
    {
      key: view.policyKey,
      label: policyLabel(view),
      // Always compare against the value in force right now, even when an
      // unpublished draft is sitting on top of it — that is the number the
      // Director is actually moving away from.
      currentValue: describeValue(view.effectiveValue),
      proposedValue: describeValue(parsedWorking.ok ? parsedWorking.value : working),
    },
  ];

  function buildConsequences(): PolicyConsequence[] {
    const out: PolicyConsequence[] = [];

    // 1. What this setting does, in the Director's own words (from the row).
    if (view.defaultRow.ui_consequence) {
      out.push(consequence(view.defaultRow.ui_consequence, 'info'));
    }

    // 2. Who this edit reaches — the part a per-batch editor must never leave
    //    implicit.
    if (scope.kind === 'programme') {
      out.push(
        consequence(
          batchCount === 0
            ? 'This is the programme-wide default. Every batch created later starts from this value.'
            : `This is the programme-wide default. It applies to all ${batchCount} batch(es) except any that already carry their own override for this setting.`,
          'warning'
        )
      );
    } else if (view.isOverridden) {
      out.push(
        consequence(
          `Only ${batchName ?? 'this batch'} changes. Every other batch keeps the programme-wide value of ${describeValue(view.defaultRow.value)}.`,
          'info'
        )
      );
    } else {
      out.push(
        consequence(
          `This creates a setting that belongs to ${batchName ?? 'this batch'} alone. From now on it stops following the programme-wide value (${describeValue(view.defaultRow.value)}) — later changes to the default will not reach this batch until the override is removed.`,
          'warning'
        )
      );
    }

    // 3. The row's declared cascade — what else moves as a result.
    for (const entry of view.defaultRow.ui_cascade ?? []) {
      out.push(consequence(entry.effect, toPreviewSeverity(entry.severity)));
    }

    // 4. Whether the change is live on confirm, or parked for publication.
    out.push(
      consequence(
        isMajor
          ? 'This setting is classified as a major change: confirming saves a draft. Nothing changes for anyone until you publish it.'
          : 'This takes effect immediately on confirm. No deploy, no developer.',
        'info'
      )
    );

    return out;
  }

  const previewData: CascadePreviewData = {
    consequences: buildConsequences(),
    computedAt: new Date().toISOString(),
    isLoading: false,
  };

  // -- actions -------------------------------------------------------------

  function handleReviewClick() {
    if (!dirty || busy) return;
    if (!parsedWorking.ok) {
      toast.error(
        `${policyLabel(view)}: the value is not valid JSON. Fix it and try again.`
      );
      return;
    }
    setPreviewOpen(true);
  }

  async function handleConfirm() {
    if (!parsedWorking.ok) {
      toast.error(`${policyLabel(view)}: the value is not valid JSON. Fix it and try again.`);
      return;
    }
    try {
      await save.mutateAsync({ view, scope, nextValue: parsedWorking.value });
      setPreviewOpen(false);
      toast.success(
        isMajor
          ? `Draft saved for ${policyLabel(view)}. Publish it to make it live.`
          : `Saved: ${policyLabel(view)}. In force now.`
      );
    } catch (e) {
      // Surface the database's own wording — S1's threshold guard writes its
      // messages for a human to read ("must be larger than…").
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handlePublish() {
    if (!view.editableRow) return;
    try {
      await publish.mutateAsync({
        rowId: view.editableRow.id,
        draftValue: view.pendingDraftValue,
      });
      toast.success(`Published: ${policyLabel(view)}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDiscard() {
    if (!view.editableRow) return;
    try {
      await discard.mutateAsync(view.editableRow.id);
      setWorking(view.effectiveValue);
      toast.success(`Draft discarded for ${policyLabel(view)}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRemoveOverride() {
    if (!view.overrideRow) return;
    try {
      await removeOverride.mutateAsync(view.overrideRow.id);
      setWorking(view.defaultRow.value);
      toast.success(
        `${batchName ?? 'This batch'} now follows the programme-wide value for ${policyLabel(view)}.`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  // -- render --------------------------------------------------------------

  return (
    <>
      <Card className={view.isOverridden ? 'border-primary/50' : undefined}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold">{policyLabel(view)}</CardTitle>
              <CardDescription>
                <code className="text-xs">{view.policyKey}</code>
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              {view.isOverridden && (
                <Badge variant="default" className="gap-1 text-[10px]">
                  <GitBranch className="h-3 w-3" />
                  Set for this batch
                </Badge>
              )}
              {scope.kind === 'batch' && !view.isOverridden && (
                <Badge variant="secondary" className="text-[10px]">
                  Following the default
                </Badge>
              )}
              {isMajor && (
                <Badge variant="outline" className="text-[10px]">
                  Needs publishing
                </Badge>
              )}
              {view.hasPendingDraft && (
                <Badge
                  variant="outline"
                  className="border-amber-500 text-[10px] text-amber-700 dark:text-amber-400"
                >
                  Unpublished draft
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <SoiWidgetDispatcher
            row={row}
            value={working}
            onChange={setWorking}
            disabled={busy}
          />

          {scope.kind === 'batch' && view.isOverridden && (
            <p className="text-xs text-muted-foreground">
              Programme-wide value:{' '}
              <strong className="text-foreground">
                {describeValue(view.defaultRow.value)}
              </strong>
            </p>
          )}

          {view.defaultRow.ui_consequence && (
            <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-100">
              <strong className="block font-semibold">What this does</strong>
              <span>{view.defaultRow.ui_consequence}</span>
            </div>
          )}

          {(view.defaultRow.ui_cascade ?? []).length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                What else changes
              </div>
              <ul className="space-y-1">
                {(view.defaultRow.ui_cascade ?? []).map((entry, i) => (
                  <li
                    key={`${view.policyKey}-cascade-${i}`}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <Badge
                      variant={
                        entry.severity === 'high'
                          ? 'destructive'
                          : entry.severity === 'medium'
                            ? 'default'
                            : 'secondary'
                      }
                      className="mt-0.5 shrink-0 text-[10px] capitalize"
                    >
                      {entry.severity}
                    </Badge>
                    <span>{entry.effect}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view.hasPendingDraft && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <span>
                Waiting to be published:{' '}
                <strong>{describeValue(view.pendingDraftValue)}</strong> (live value is
                still {describeValue(view.effectiveValue)}).
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={handleDiscard} disabled={busy}>
                  Discard
                </Button>
                <Button size="sm" onClick={handlePublish} disabled={busy}>
                  Publish
                </Button>
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            {scope.kind === 'batch' && view.isOverridden && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mr-auto gap-1"
                onClick={handleRemoveOverride}
                disabled={busy}
              >
                <Undo2 className="h-3.5 w-3.5" />
                Follow the default again
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => setWorking(baseValue)}
              disabled={!dirty || busy}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Undo
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1"
              onClick={handleReviewClick}
              disabled={!dirty || busy}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Review and save
            </Button>
          </div>
        </CardContent>
      </Card>

      <CascadePreview
        open={previewOpen}
        proposedChanges={proposedChanges}
        previewData={previewData}
        scope="platform"
        scopeLabel={
          scope.kind === 'programme'
            ? 'every School of Influencer batch'
            : `the ${batchName ?? 'selected'} batch`
        }
        onConfirm={handleConfirm}
        onCancel={() => setPreviewOpen(false)}
        isSaving={save.isPending}
      />
    </>
  );
}
