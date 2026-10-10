'use client';

// "Call back now" — missed admission calls waiting for a callback.
// Tap the number to call from your own phone, then mark it done.

import { useState } from 'react';
import { PhoneCall, PhoneMissed, Sparkles, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCallbacksForMe,
  useCompleteCallback,
  type CallbackRow,
} from '@/hooks/admission/use-callbacks-for-me';
import { draftCallbackScript } from '../_actions/callback-script';

function waitedFor(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ${mins % 60} min ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function urgencyLabel(row: CallbackRow): { text: string; className: string } | null {
  if (row.escalation_level >= 2) return { text: 'Escalated', className: 'text-xs font-medium text-red-600 dark:text-red-400' };
  if (row.escalation_level >= 1) return { text: 'Overdue', className: 'text-xs font-medium text-amber-700 dark:text-amber-400' };
  return null;
}

function CallbackItem({
  row,
  showOwner,
  onDone,
  isDoing,
}: {
  row: CallbackRow;
  showOwner: boolean;
  onDone: (id: string, note: string) => void;
  isDoing: boolean;
}) {
  const [script, setScript] = useState<string | null>(null);
  const [scriptSource, setScriptSource] = useState<'ai' | 'template' | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [note, setNote] = useState('');
  const urgency = urgencyLabel(row);
  const calls = row.missed_count_7d ?? 1;

  const loadScript = async () => {
    setLoadingScript(true);
    setScriptError(null);
    try {
      const res = await draftCallbackScript(row.id);
      if ('error' in res) throw new Error(res.error);
      setScript(res.script);
      setScriptSource(res.source);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setScriptError(msg && !/fetch|network|unexpected response/i.test(msg) ? msg : 'Could not draft a script right now. Try again.');
    } finally {
      setLoadingScript(false);
    }
  };

  return (
    <li className="py-3 space-y-2" data-testid="callback-item">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">
              {row.lead_name || 'Unknown caller'}
            </span>
            {urgency && <span className={urgency.className}>{urgency.text}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Called {waitedFor(row.created_at)}
            {calls > 1 ? ` · ${calls} missed calls this week` : ''}
            {row.ever_connected ? '' : ' · never reached us'}
            {showOwner ? ` · ${row.assigned_name ?? 'not yet assigned'}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild size="sm" className="h-10 sm:h-8">
            <a href={`tel:${row.caller_number}`} aria-label={`Call ${row.caller_number}`}>
              <PhoneCall className="h-4 w-4 mr-1" />
              {row.caller_number}
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-10 sm:h-8"
            onClick={loadScript}
            disabled={loadingScript}
          >
            {loadingScript ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Script
          </Button>
        </div>
      </div>

      {scriptError && <p className="text-xs text-red-600 dark:text-red-400">{scriptError}</p>}
      {script && (
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground mb-1">
            {scriptSource === 'ai' ? 'Suggested script (AI draft, check before you say it)' : 'Suggested script'}
          </p>
          <p className="text-sm text-foreground whitespace-pre-line">{script}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What happened on the call? (optional)"
          className="h-10 sm:h-8 text-sm"
          maxLength={500}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-10 sm:h-8"
          onClick={() => onDone(row.id, note)}
          disabled={isDoing}
        >
          {isDoing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
          Called back
        </Button>
      </div>
    </li>
  );
}

export function CallbackNowPanel({
  institutionId,
  viewAsUserId,
}: {
  institutionId?: string;
  viewAsUserId?: string;
}) {
  const { data, isLoading, error } = useCallbacksForMe(institutionId, viewAsUserId);
  const complete = useCompleteCallback(institutionId, viewAsUserId);

  if (!institutionId) return null;
  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm dark:shadow-none text-sm text-muted-foreground">
        Loading missed calls…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm dark:shadow-none flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
        <AlertTriangle className="h-4 w-4" />
        Could not load missed calls. {(error as Error).message}
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  if (total === 0) return null;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm dark:shadow-none" aria-labelledby="callback-now-heading">
      <div className="flex items-center gap-2">
        <PhoneMissed className="h-4 w-4 text-red-600 dark:text-red-400" />
        <h3 id="callback-now-heading" className="text-sm font-semibold text-foreground">
          Call back now ({total})
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        These people called and nobody answered. Tap the number to call from your phone, then press Called back.
      </p>
      <ul className="divide-y divide-border mt-2">
        {rows.map((row) => (
          <CallbackItem
            key={row.id}
            row={row}
            showOwner={!!data?.is_manager}
            onDone={(id, note) => complete.mutate({ id, note })}
            isDoing={complete.isPending && complete.variables?.id === row.id}
          />
        ))}
      </ul>
      {total > rows.length && (
        <p className="text-xs text-muted-foreground mt-2">Showing the first {rows.length} of {total}.</p>
      )}
    </section>
  );
}
