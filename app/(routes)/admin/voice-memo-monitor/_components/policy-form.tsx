'use client';

// ============================================================================
// PolicyForm — Director-friendly editor for the 8 voice-memo-monitor policies.
// ============================================================================
// One card per policy row. Number rows show a number input + Save button.
// The director_digest_categories row shows a JSON textarea (validated client-
// side before save). Plain-English labels and consequences come from the
// HUMAN_LABELS map below — Director should never see policy-key dot notation.
//
// Save flow:
//   1. Click Save → parse draft → validate → PATCH /[key] → reload list.
//   2. Errors surface via sonner toast.
// ============================================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

interface PolicyRow {
  policy_key: string;
  value: unknown;
  description: string | null;
  data_type: 'number' | 'object' | string;
  updated_at: string | null;
  updated_by: string | null;
}

const HUMAN_LABELS: Record<string, { title: string; consequence: string }> = {
  'voice_memo_monitor.window_hours': {
    title: 'Live counter window (hours)',
    consequence:
      'Counters on the monitor page show only memos uploaded in the last N hours. Bigger window = more historical context, smaller window = more "what is happening right now".'
  },
  'voice_memo_monitor.stuck_threshold_minutes': {
    title: 'Stuck-memo alert threshold (minutes)',
    consequence:
      'If a memo has been pending or transcribing for longer than this, the monitor shows a STUCK warning. Use this to catch a wedged cron sweeper.'
  },
  'voice_memo_monitor.failure_rate_red_pct': {
    title: 'Failure-rate RED threshold (%)',
    consequence: "Status badge turns RED if today's failure rate exceeds this percent."
  },
  'voice_memo_monitor.failure_rate_amber_pct': {
    title: 'Failure-rate AMBER threshold (%)',
    consequence:
      "Status badge turns AMBER if today's failure rate exceeds this percent (and is below the RED threshold)."
  },
  'voice_memo_monitor.recent_rows_limit': {
    title: 'Recent rows shown',
    consequence:
      'How many recent failures and recent completions to list on the monitor page.'
  },
  'voice_memo_monitor.refresh_interval_seconds': {
    title: 'Auto-refresh cadence (seconds)',
    consequence:
      'How often the monitor page re-fetches the snapshot. Set to 0 to disable auto-refresh.'
  },
  'voice_memo_monitor.cost_alert_daily_inr': {
    title: 'Daily cost alert (rupees)',
    consequence:
      'Show a cost alert on the monitor page if total Whisper + Gemini spend on voice-memo analysis exceeds this many rupees in a single calendar day.'
  },
  'voice_memo_monitor.director_digest_categories': {
    title: 'Director digest sentiment buckets',
    consequence:
      'Maps memo sentiment values to the buckets you see on the digest. Keys are bucket names; values are arrays of sentiment strings that count toward that bucket.'
  }
};

export function PolicyForm() {
  const [rows, setRows] = useState<PolicyRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/voice-memo-monitor-config', {
        credentials: 'include',
        cache: 'no-store'
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j?.error ?? `Failed to load policy values (${res.status})`;
        toast.error(msg);
        setLoadError(msg);
        setRows([]);
        return;
      }
      const json = await res.json();
      const data: PolicyRow[] = json.data ?? [];
      setRows(data);
      const initialDrafts: Record<string, string> = {};
      for (const r of data) {
        initialDrafts[r.policy_key] =
          r.data_type === 'number' ? String(r.value) : JSON.stringify(r.value, null, 2);
      }
      setDrafts(initialDrafts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      toast.error(msg);
      setLoadError(msg);
      setRows([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(row: PolicyRow) {
    setSavingKey(row.policy_key);
    let parsed: unknown;
    try {
      if (row.data_type === 'number') {
        const n = Number(drafts[row.policy_key]);
        if (!Number.isFinite(n) || n < 0) throw new Error('Must be a non-negative number');
        parsed = n;
      } else {
        parsed = JSON.parse(drafts[row.policy_key] ?? '');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid value';
      toast.error(`Invalid value: ${msg}`);
      setSavingKey(null);
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/voice-memo-monitor-config/${encodeURIComponent(row.policy_key)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: parsed })
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error ?? `Save failed (${res.status})`);
        return;
      }
      toast.success('Saved');
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      toast.error(msg);
    } finally {
      setSavingKey(null);
    }
  }

  if (rows === null) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {loadError ? (
            <>Could not load policies: {loadError}</>
          ) : (
            <>
              No policy rows found. Has the migration{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                20260513120000_voice_memo_monitor_policies.sql
              </code>{' '}
              been applied?
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const meta = HUMAN_LABELS[row.policy_key] ?? {
          title: row.policy_key,
          consequence: row.description ?? ''
        };
        const isObject = row.data_type !== 'number';
        return (
          <Card key={row.policy_key}>
            <CardHeader>
              <CardTitle className="text-base">{meta.title}</CardTitle>
              <CardDescription>{meta.consequence}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className={isObject ? 'space-y-3' : 'flex items-end gap-3'}>
                {isObject ? (
                  <Textarea
                    value={drafts[row.policy_key] ?? ''}
                    onChange={(e) =>
                      setDrafts({ ...drafts, [row.policy_key]: e.target.value })
                    }
                    className="min-h-[140px] font-mono text-xs"
                    spellCheck={false}
                  />
                ) : (
                  <Input
                    type="number"
                    min={0}
                    value={drafts[row.policy_key] ?? ''}
                    onChange={(e) =>
                      setDrafts({ ...drafts, [row.policy_key]: e.target.value })
                    }
                    className="max-w-[180px]"
                  />
                )}
                <Button
                  onClick={() => save(row)}
                  disabled={savingKey === row.policy_key}
                  size="sm"
                  className={isObject ? 'self-start' : undefined}
                >
                  {savingKey === row.policy_key ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
              {row.updated_at && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Last changed {new Date(row.updated_at).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
