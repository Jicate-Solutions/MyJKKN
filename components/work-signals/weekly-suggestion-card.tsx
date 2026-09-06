'use client';

// =====================================================================
// Weekly suggestion — the verdict card (rides inside WorkSignalsCard)
// =====================================================================
// Shows the subject's OWN latest AI-drafted weekly suggestion (RLS: only
// they can read their rows) with the SCF verdict vocabulary. The verdict is
// the learning signal for next week's prompt — without it, the loop is
// write-only. Never a score, never ranked, never auto-applied.
//
// Renders nothing when the caller has no suggestion — the card is a guest
// inside WorkSignalsCard, not a fixed-height section, so absence is silent
// by design (a genuine "nothing yet", same doctrine as the signals grid).

import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Row = {
  id: string;
  week_start: string;
  suggestion: string;
  human_verdict: 'tried_helped' | 'tried_no_change' | 'not_tried' | null;
};

const VERDICTS: Array<{ value: NonNullable<Row['human_verdict']>; label: string }> = [
  { value: 'tried_helped', label: 'Tried — helped' },
  { value: 'tried_no_change', label: 'Tried — no change' },
  { value: 'not_tried', label: 'Not tried' },
];

const VERDICT_LABEL: Record<NonNullable<Row['human_verdict']>, string> = {
  tried_helped: 'you marked this: tried — helped',
  tried_no_change: 'you marked this: tried — no change',
  not_tried: 'you marked this: not tried',
};

export function WeeklySuggestionCard() {
  const [row, setRow] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClientSupabaseClient();
    void (async () => {
      const { data } = await supabase
        .from('work_signal_suggestions')
        .select('id, week_start, suggestion, human_verdict')
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setRow(data as Row);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!row) return null;

  async function handleVerdict(verdict: NonNullable<Row['human_verdict']>) {
    if (!row || saving) return;
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc('fn_work_signal_suggestion_verdict', {
        p_id: row.id,
        p_verdict: verdict,
      });
      if (!error && data === true) {
        setRow({ ...row, human_verdict: verdict });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="mt-3 rounded-md border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/40"
      data-testid="weekly-suggestion-card"
    >
      <div className="flex items-start gap-2">
        <Lightbulb className="h-4 w-4 flex-shrink-0 text-violet-600 mt-0.5" aria-hidden />
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-medium text-violet-900 dark:text-violet-200">
            This week&apos;s suggestion{' '}
            <span className="font-normal text-muted-foreground">
              (drawn from your own signals — visible only to you, never a score)
            </span>
          </p>
          <p className="text-sm">{row.suggestion}</p>
          {row.human_verdict ? (
            <p className="text-[11px] text-muted-foreground">
              {VERDICT_LABEL[row.human_verdict]} — thank you; next week&apos;s
              suggestion learns from this.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {VERDICTS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  disabled={saving}
                  onClick={() => void handleVerdict(v.value)}
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[11px] font-medium transition',
                    'border-violet-300 text-violet-800 hover:bg-violet-100',
                    'dark:border-violet-800 dark:text-violet-200 dark:hover:bg-violet-900',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
