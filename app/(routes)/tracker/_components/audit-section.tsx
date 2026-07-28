'use client';

import { useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface Param {
  parameter: string;
  framework: Record<string, unknown> | null;
  verdict: string;
  open_findings: number;
  attested: boolean;
}
interface Summary {
  rollup: { total: number; pass: number; fail: number; unchecked: number };
  parameters: Param[];
}

const VERDICT_STYLE: Record<string, string> = {
  pass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  fail: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
  unchecked: 'bg-muted text-muted-foreground',
};

function frameworks(fm: Record<string, unknown> | null): string[] {
  if (!fm || typeof fm !== 'object') return [];
  return Object.entries(fm)
    .filter(([, v]) => v && v !== '-')
    .map(([k]) => k.toUpperCase());
}

export function AuditSection() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClientSupabaseClient();
    (supabase as any)
      .rpc('fn_open_audit_report_summary')
      .then(({ data, error }: { data: Summary | null; error: { message: string } | null }) => {
        if (error) setError(error.message);
        else setData(data as Summary);
      });
  }, []);

  if (error) return <p className="text-sm text-destructive">Couldn&apos;t load audit summary: {error}</p>;
  if (!data) return <Skeleton className="h-24 w-full" />;

  const { rollup, parameters } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Tile label="Checks tracked" value={rollup.total} tone="neutral" />
        <Tile label="Passing" value={rollup.pass} tone="ok" />
        <Tile label="Failing" value={rollup.fail} tone="bad" />
        <Tile label="Not yet measured" value={rollup.unchecked} tone="muted" />
      </div>

      {parameters.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No org-wide compliance parameters are configured yet in the standing institutional audit.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {parameters.map((p) => (
            <li key={p.parameter} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                  VERDICT_STYLE[p.verdict] ?? VERDICT_STYLE.unchecked
                }`}
              >
                {p.verdict === 'unchecked' ? 'not measured' : p.verdict}
              </span>
              <span className="flex-1 text-sm font-medium">{p.parameter}</span>
              {frameworks(p.framework).map((f) => (
                <span key={f} className="rounded border px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                  {f}
                </span>
              ))}
              {p.open_findings > 0 && (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  {p.open_findings} open finding{p.open_findings === 1 ? '' : 's'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'bad' | 'muted' | 'neutral' }) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'bad'
      ? 'text-red-700 dark:text-red-400'
      : tone === 'muted'
      ? 'text-muted-foreground'
      : 'text-foreground';
  return (
    <div className="min-w-[92px] rounded-lg border px-3 py-2">
      <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
