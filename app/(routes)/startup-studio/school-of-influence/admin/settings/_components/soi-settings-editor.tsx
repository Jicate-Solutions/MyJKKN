'use client';

// ===========================================================================
// SoiSettingsEditor — the School of Influence settings screen (spec §7, S2).
//
// Two things this screen has to get right that a plain config table does not:
//
//   1. SCOPE. Every setting exists twice over: once programme-wide (the value
//      every batch inherits) and, optionally, once per batch. The picker at the
//      top switches between them, and each card says in words whether it is
//      following the default or has been set for this batch alone. That mirrors
//      the resolution ladder S1 taught `fn_get_policy`
//      (user > cohort(scope_id) > institution > role > cohort(default) > global),
//      so what is edited here is what the runtime will read.
//
//   2. CONSEQUENCES BEFORE SAVING. Handled inside each card via the shared
//      <CascadePreview> panel — see soi-policy-card.tsx.
//
// The 15 keys are NOT enumerated anywhere in this module. Cards, controls,
// groupings and copy are all derived from each row's own columns, so S1 (or a
// later Director decision) can add a 16th policy row in SQL and it appears here
// with no code change.
// ===========================================================================

import { useMemo, useState } from 'react';
import { AlertTriangle, Database, Layers, Users } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

import {
  countOverrides,
  projectViews,
  useSoiBatches,
  useSoiPolicyRows,
  type SoiScope,
} from '../_lib/soi-policies-service';
import { soiDisplayName } from '@/lib/services/school-of-influence/constants';
import { SoiPolicyCard } from './soi-policy-card';

/** Sentinel for the programme-wide entry in the scope picker. */
const PROGRAMME_SCOPE_VALUE = '__programme__';

export function SoiSettingsEditor() {
  const [scopeValue, setScopeValue] = useState<string>(PROGRAMME_SCOPE_VALUE);

  const rowsQuery = useSoiPolicyRows();
  const batchesQuery = useSoiBatches();

  const batches = batchesQuery.data ?? [];

  // A batch that disappears (archived by S3 while this page is open) must not
  // strand the editor on a scope that no longer exists.
  const selectedBatch = batches.find((b) => b.id === scopeValue) ?? null;
  const scope: SoiScope = selectedBatch
    ? { kind: 'batch', cohortId: selectedBatch.id }
    : { kind: 'programme' };

  const views = useMemo(
    () => projectViews(rowsQuery.data ?? [], scope),
    // `scope` is derived from scopeValue + the loaded batches; depending on the
    // primitives keeps this stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowsQuery.data, scope.kind, selectedBatch?.id]
  );

  const overrideCount = countOverrides(views);

  if (rowsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (rowsQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load the School of Influencer settings</AlertTitle>
        <AlertDescription>
          {rowsQuery.error instanceof Error ? rowsQuery.error.message : 'Unknown error.'}{' '}
          Reload the page to try again.
        </AlertDescription>
      </Alert>
    );
  }

  // Explicit, never a blank screen: an empty table means the config rows have
  // not been seeded, which is a different problem from "you cannot see them".
  if (views.length === 0) {
    return (
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>The settings have not been set up yet</AlertTitle>
        <AlertDescription>
          No School of Influencer settings were found. They are created by the
          config-substrate migrations{' '}
          <code>20260731180000_platform_policies_cohort_scope.sql</code>,{' '}
          <code>20260731180100_soi_policy_threshold_guard.sql</code> and{' '}
          <code>20260731180200_seed_school_of_influence_policies.sql</code>, which a
          Director has to approve before they are applied. Once they are applied this
          page fills itself in — nothing else needs to be deployed.
        </AlertDescription>
      </Alert>
    );
  }

  const groups = new Map<string, typeof views>();
  for (const view of views) {
    const category = view.defaultRow.ui_category ?? 'Other settings';
    const bucket = groups.get(category) ?? [];
    bucket.push(view);
    groups.set(category, bucket);
  }

  return (
    <div className="space-y-6">
      {/* Scope picker */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <Label htmlFor="soi-scope" className="text-sm font-semibold">
            Which settings am I editing?
          </Label>
          <Select value={scopeValue} onValueChange={setScopeValue}>
            <SelectTrigger id="soi-scope" className="w-full sm:w-[360px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PROGRAMME_SCOPE_VALUE}>
                Programme-wide — applies to every batch
              </SelectItem>
              {batches.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {soiDisplayName(batch.name)}
                  {batch.status ? ` — ${batch.status}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {scope.kind === 'programme'
              ? batches.length === 0
                ? 'These are the values every batch will start from. No batches exist yet.'
                : `These are the values all ${batches.length} batch(es) follow unless a batch has been given its own.`
              : `Anything changed here applies to ${
                  selectedBatch?.name ? soiDisplayName(selectedBatch.name) : 'this batch'
                } only. Everything else keeps following the programme-wide value.`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1">
            <Layers className="h-3 w-3" />
            {views.length} settings
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3 w-3" />
            {batches.length} batch(es)
          </Badge>
          {scope.kind === 'batch' && (
            <Badge variant={overrideCount > 0 ? 'default' : 'outline'}>
              {overrideCount} set for this batch
            </Badge>
          )}
        </div>
      </div>

      {batches.length === 0 && (
        <Alert>
          <Users className="h-4 w-4" />
          <AlertTitle>No batches to tune yet</AlertTitle>
          <AlertDescription>
            Batches are created elsewhere in the programme setup. Until then only the
            programme-wide values below exist — and they are what every batch created
            later will start from, so setting them now is the right order of work.
          </AlertDescription>
        </Alert>
      )}

      {[...groups.entries()].map(([category, bucket]) => (
        <section key={category} className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">{category}</h2>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {bucket.map((view) => (
              <SoiPolicyCard
                // Remount on scope change so each card's working copy starts
                // from the value in force at the newly-selected scope.
                key={`${scopeValue}-${view.policyKey}`}
                view={view}
                scope={scope}
                batchName={selectedBatch?.name ? soiDisplayName(selectedBatch.name) : undefined}
                batchCount={batches.length}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
