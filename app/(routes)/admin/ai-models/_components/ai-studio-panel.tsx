'use client';

// ============================================================================
// AI Studio panel — the "AI Studio" tab body on /admin/ai-models.
// Created: 2026-07-13.
//
// Ties together:
//   - the registry list (AiJobTypeList)
//   - a create/edit dialog (AiJobTypeEditDialog)
//   - a generic Run card (AiJobRunCard) for the selected job type
//
// Data source: GET /api/admin/ai-job-types -> { jobTypes: AiJobType[] }.
// All writes go through the admin API routes the Registry-backend stream owns.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, RefreshCw, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AiJobTypeList } from './ai-job-type-list';
import { AiJobTypeEditDialog } from './ai-job-type-edit-dialog';
import { AiJobRunCard } from './ai-job-run-card';
import type { AiJobType, InputSchemaField } from './ai-job-types';

/** Defensive normaliser — the registry table stores input_schema as jsonb,
 *  which can arrive as an object, a string, or null. The run form + list both
 *  assume an array, so coerce here once at the boundary. */
function normalizeJobType(raw: unknown): AiJobType | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.job_type !== 'string') return null;

  let schema: InputSchemaField[] = [];
  const rawSchema = r.input_schema;
  if (Array.isArray(rawSchema)) {
    schema = rawSchema.filter(
      (f): f is InputSchemaField =>
        !!f && typeof f === 'object' && typeof (f as InputSchemaField).key === 'string',
    );
  } else if (typeof rawSchema === 'string') {
    try {
      const parsed = JSON.parse(rawSchema);
      if (Array.isArray(parsed)) schema = parsed;
    } catch {
      schema = [];
    }
  }

  return {
    job_type: r.job_type,
    title: typeof r.title === 'string' ? r.title : r.job_type,
    description: typeof r.description === 'string' ? r.description : null,
    prompt_template: typeof r.prompt_template === 'string' ? r.prompt_template : null,
    tool_set: typeof r.tool_set === 'string' ? r.tool_set : 'all',
    output_target: typeof r.output_target === 'string' ? r.output_target : 'job.result',
    interactive: !!r.interactive,
    lane: typeof r.lane === 'string' ? r.lane : 'max',
    allow_rule: typeof r.allow_rule === 'string' ? r.allow_rule : 'seat_owner',
    max_inflight: typeof r.max_inflight === 'number' ? r.max_inflight : 3,
    schedulable: !!r.schedulable,
    enabled: r.enabled !== false,
    input_schema: schema,
    expected_seconds:
      typeof r.expected_seconds === 'number' ? r.expected_seconds : null,
    last_run: typeof r.last_run === 'string' ? r.last_run : null,
    created_at: typeof r.created_at === 'string' ? r.created_at : undefined,
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : undefined,
  };
}

export function AiStudioPanel() {
  const [jobTypes, setJobTypes] = useState<AiJobType[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AiJobType | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedRunKey, setSelectedRunKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ai-job-types', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows: unknown[] = Array.isArray(json?.jobTypes)
        ? json.jobTypes
        : Array.isArray(json?.data)
          ? json.data
          : [];
      const normalized = rows
        .map(normalizeJobType)
        .filter((x): x is AiJobType => x !== null);
      setJobTypes(normalized);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't load the AI job registry.",
      );
      setJobTypes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedForRun = useMemo(
    () => jobTypes?.find((jt) => jt.job_type === selectedRunKey) ?? null,
    [jobTypes, selectedRunKey],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            One row per AI job type. A job type is self-describing — it carries its own
            prompt, tools, and inputs, so the runner needs no per-job code.
          </p>
          <p className="text-xs text-muted-foreground">
            Toggle a type on/off, edit its recipe, or press Run to try it with your own inputs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New job type
          </Button>
        </div>
      </div>

      {loading && !jobTypes ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !jobTypes || jobTypes.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No AI job types registered yet. Press{' '}
          <span className="font-medium text-foreground">New job type</span> to create one.
        </div>
      ) : (
        <AiJobTypeList
          jobTypes={jobTypes}
          selectedForRun={selectedRunKey}
          onRun={(jt) => setSelectedRunKey(jt.job_type)}
          onEdit={(jt) => setEditing(jt)}
          onChanged={load}
        />
      )}

      {/* Generic Run card for the selected job type */}
      {selectedForRun && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Run
          </h3>
          <AiJobRunCard key={selectedForRun.job_type} jobType={selectedForRun} />
        </div>
      )}

      {/* Create dialog */}
      <AiJobTypeEditDialog
        open={creating}
        onOpenChange={setCreating}
        jobType={null}
        onSaved={() => {
          setCreating(false);
          load();
        }}
      />

      {/* Edit dialog */}
      <AiJobTypeEditDialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        jobType={editing}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}
