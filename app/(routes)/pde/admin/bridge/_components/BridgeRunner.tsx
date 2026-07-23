'use client';

// =====================================================================
// BridgeRunner — client form for /pde/admin/bridge (T4.1)
// =====================================================================
// Triggers POST /api/pde/bridge. Dry-run default; admin must uncheck to
// actually apply. Confirms with strong wording before non-dry-run runs.
// =====================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Scope = 'all' | 'learner';

interface RunResult {
  run_id: string;
  bridged: number;
  failed: number;
  skipped: number;
  dry_run: boolean;
  per_source: Record<string, number>;
  errors: { source_row_id: string; message: string }[];
  started_at: string;
  completed_at: string;
}

export function BridgeRunner() {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('all');
  const [learnerId, setLearnerId] = useState('');
  const [applyMode, setApplyMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRun() {
    setError(null);
    setResult(null);

    if (applyMode) {
      const ok = confirm(
        'You are about to write to pde_demonstrations.\n\n' +
          'This will create real demonstration rows for every passing legacy ' +
          'capability, certificate, and quest enrollment. Only proceed if you ' +
          'have reviewed a dry-run output first.\n\nContinue?'
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      const params = new URLSearchParams();
      params.set('scope', scope);
      if (scope === 'learner') params.set('learner_id', learnerId.trim());
      params.set('dry_run', applyMode ? 'false' : 'true');
      const res = await fetch(`/api/pde/bridge?${params.toString()}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json.data as RunResult);
      // Refresh the recent-runs table.
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <h3 className="mb-3 text-base font-semibold">Run bridge</h3>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground">Scope</label>
          <select
            className="mt-1 rounded border border-input bg-background px-2 py-1 text-sm"
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            disabled={busy}
          >
            <option value="all">All learners</option>
            <option value="learner">Single learner</option>
          </select>
        </div>
        {scope === 'learner' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Learner ID (uuid)</label>
            <input
              className="mt-1 w-72 rounded border border-input bg-background px-2 py-1 text-sm font-mono"
              value={learnerId}
              onChange={(e) => setLearnerId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              disabled={busy}
            />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={applyMode}
            onChange={(e) => setApplyMode(e.target.checked)}
            disabled={busy}
          />
          <span>
            <strong>Apply</strong> (uncheck for dry-run — recommended first)
          </span>
        </label>
        <button
          type="button"
          onClick={onRun}
          disabled={busy || (scope === 'learner' && !learnerId.trim())}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Running…' : applyMode ? 'Apply bridge' : 'Dry-run'}
        </button>
      </div>

      {applyMode && (
        <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Apply mode is destructive (in the sense that it writes new rows to{' '}
          <code>pde_demonstrations</code>). Review a dry-run output first.
        </p>
      )}

      {error && (
        <div className="mt-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded border border-border bg-muted/30 p-3 text-sm">
          <div className="mb-2 font-medium">
            Run {result.run_id.slice(0, 8)}… ({result.dry_run ? 'dry-run' : 'applied'})
          </div>
          <ul className="space-y-1">
            <li>Bridged: <strong>{result.bridged}</strong></li>
            <li>Skipped (already applied): <strong>{result.skipped}</strong></li>
            <li>Failed: <strong>{result.failed}</strong></li>
            <li>
              Per source:{' '}
              {Object.entries(result.per_source)
                .map(([k, v]) => `${k.replace('pde_', '')}=${v}`)
                .join(' · ')}
            </li>
          </ul>
          {result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Errors ({result.errors.length})
              </summary>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    <code>{e.source_row_id}</code>: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
