'use client';

// ============================================================================
// AI Routines control panel (client). Renders the static registry grouped by
// category, with a permission-gated "Run now" for the crons that are safe to
// fire on demand. Routines that message humans or need a request body show WHY
// they can't be one-click-run here (the trigger API enforces the same rule).
// ============================================================================

import { useState } from 'react';
import {
  Bot,
  Clock,
  Play,
  Loader2,
  Sparkles,
  ChevronDown,
  CheckCircle2,
  XCircle,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AI_ROUTINES, routinesByCategory, triggerableCount } from '@/lib/ai-routines/registry';
import { ROUTINE_CATEGORIES, type AIRoutine } from '@/lib/ai-routines/types';

const BRAND = '#0b6d41';

type RunState = { ok: boolean; summary: string } | undefined;

function summarize(result: unknown): string {
  if (result == null) return 'done';
  if (typeof result === 'string') return result.slice(0, 240);
  try {
    const o = result as Record<string, unknown>;
    // Pull the most useful cron response fields if present
    const keys = ['generated', 'candidates', 'eligible', 'skipped', 'notes', 'flags', 'sent', 'inserted', 'ok', 'week_of', 'elapsed_ms'];
    const parts = keys.filter((k) => k in o).map((k) => `${k}=${JSON.stringify(o[k])}`);
    return parts.length ? parts.join(' · ') : JSON.stringify(o).slice(0, 240);
  } catch {
    return 'done';
  }
}

function TypeBadge({ type }: { type: AIRoutine['type'] }) {
  const map: Record<AIRoutine['type'], string> = {
    cron: 'Scheduled',
    endpoint: 'Endpoint',
    interactive: 'On-demand',
    service: 'Service',
  };
  return <Badge variant="outline" className="font-normal">{map[type]}</Badge>;
}

function RoutineRow({ r }: { r: AIRoutine }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<RunState>(undefined);

  const runnable = r.type === 'cron' && r.safeToManualTrigger;

  async function runNow() {
    setRunning(true);
    setLast(undefined);
    try {
      const resp = await fetch('/api/admin/ai-routines/trigger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ routineId: r.id }),
      });
      const data = await resp.json();
      if (data.ok) {
        toast.success(`${r.name} ran — HTTP ${data.status} in ${data.elapsed_ms}ms`);
        setLast({ ok: true, summary: summarize(data.result) });
      } else {
        toast.error(`${r.name}: ${data.error ?? 'failed'}`);
        setLast({ ok: false, summary: data.error ?? `HTTP ${data.status ?? '?'}` });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'request failed';
      toast.error(`${r.name}: ${msg}`);
      setLast({ ok: false, summary: msg });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.name}</span>
              <TypeBadge type={r.type} />
              {r.callsClaude ? (
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" /> AI
                </Badge>
              ) : (
                <Badge variant="outline" className="font-normal text-muted-foreground">rules-based</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{r.whatItDoes}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {r.schedule}
              </span>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1 hover:text-foreground"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                {open ? 'Hide details' : 'Details'}
              </button>
            </div>
          </div>

          <div className="shrink-0 text-right">
            {runnable ? (
              <Button size="sm" onClick={runNow} disabled={running} style={{ backgroundColor: BRAND }}>
                {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                Run now
              </Button>
            ) : r.type === 'cron' ? (
              <span className="flex items-center justify-end gap-1 text-xs text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-3.5 w-3.5" /> messages people
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">runs on its own screen</span>
            )}
          </div>
        </div>

        {last && (
          <div
            className={`mt-3 flex items-start gap-1.5 rounded-md border p-2 text-xs ${
              last.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
            }`}
          >
            {last.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span className="break-words font-mono">{last.summary}</span>
          </div>
        )}

        {open && (
          <div className="mt-3 space-y-2 rounded-md bg-muted/40 p-3 text-xs">
            <DetailRow label="Trigger path" value={r.triggerPath || '—'} mono />
            <DetailRow label="Config knobs" value={r.configKnobs} mono />
            <DetailRow label="Side effects" value={r.sideEffects} />
            {r.notes ? <DetailRow label="Operator notes" value={r.notes} /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className={`break-words text-foreground/80 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export function AiRoutinesControl() {
  const total = AI_ROUTINES.length;
  const runnable = triggerableCount();
  const aiCount = AI_ROUTINES.filter((r) => r.callsClaude).length;

  return (
    <div className="space-y-8">
      {/* Summary header */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" style={{ color: BRAND }} />
          <span className="text-sm">
            <span className="font-semibold text-foreground">{total}</span> AI routines
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" /> {aiCount} call Claude
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Play className="h-4 w-4" /> {runnable} safe to run on demand
        </div>
        <p className="w-full text-xs text-muted-foreground">
          Green <strong>Run now</strong> fires a routine immediately (server-side, secret-protected). Routines that
          message students or staff show <span className="text-amber-600 dark:text-amber-400">messages people</span>{' '}
          and must be run from their own screen — that guard is enforced on the server, not just here. Editing
          schedules and thresholds from this page is the next phase.
        </p>
      </div>

      {ROUTINE_CATEGORIES.map((cat) => {
        const rows = routinesByCategory(cat.id);
        if (rows.length === 0) return null;
        return (
          <section key={cat.id} className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">{cat.label}</h2>
              <p className="text-sm text-muted-foreground">{cat.blurb}</p>
            </div>
            <div className="space-y-2">
              {rows.map((r) => (
                <RoutineRow key={r.id} r={r} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
