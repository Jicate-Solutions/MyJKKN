'use client';

/**
 * "People waiting for a call" — who opened the interview booking link when no
 * time was free and left a name, post and phone for the office (#14).
 *
 * Open requests first, oldest first. The office marks one as called (with an
 * optional note) or reopens a handled one. Hidden entirely when the viewer
 * cannot read the table; RLS decides that, not this component.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronRight, Loader2, Phone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  loadCallbackRequests,
  markCallbackRequestCalled,
  reopenCallbackRequest,
  type CallbackRequestRow,
} from '../interview-booking-hr-actions';

export const CALLBACK_REQUESTS_QUERY_KEY = ['hr', 'interview-booking', 'callback-requests'] as const;

function formatIST(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function OpenRow({ row, onChanged }: { row: CallbackRequestRow; onChanged: () => void }) {
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await markCallbackRequestCalled(row.id, note);
    setSaving(false);
    if (res.success === false) {
      setError(res.error);
      return;
    }
    setNoting(false);
    setNote('');
    onChanged();
  };

  return (
    <li className="py-3 space-y-2" data-testid="callback-open-row">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium text-foreground break-words">{row.name}</p>
          <p className="text-sm text-muted-foreground break-words">{row.post_title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
            <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
              <Phone className="h-3.5 w-3.5" />
              {row.phone}
            </a>
            {row.email && <span className="text-muted-foreground break-all">{row.email}</span>}
          </div>
          <p className="text-xs text-muted-foreground" title={formatIST(row.created_at)}>
            asked {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
          </p>
        </div>
        {!noting && (
          <Button variant="outline" size="sm" className="shrink-0 self-start" onClick={() => setNoting(true)}>
            Mark as called
          </Button>
        )}
      </div>
      {noting && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional), e.g. Booked for Tue 11am"
            aria-label="Note about the call"
            className="rounded-md sm:flex-1"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setNoting(false); setError(null); }} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}

function DoneRow({ row, onChanged }: { row: CallbackRequestRow; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reopen = async () => {
    setSaving(true);
    setError(null);
    const res = await reopenCallbackRequest(row.id);
    setSaving(false);
    if (res.success === false) {
      setError(res.error);
      return;
    }
    onChanged();
  };

  return (
    <li className="py-3 space-y-1" data-testid="callback-done-row">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium text-foreground break-words">{row.name}</p>
          <p className="text-sm text-muted-foreground break-words">{row.post_title}</p>
          {row.closed_by_booking_id ? (
            <p className="text-sm text-green-700 dark:text-emerald-400">Booked an interview themselves</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Called{row.handler_name ? ` by ${row.handler_name}` : ''}
              {row.handled_at ? ` · ${formatIST(row.handled_at)}` : ''}
            </p>
          )}
          {row.outcome_note && <p className="text-sm text-foreground break-words">“{row.outcome_note}”</p>}
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 self-start" onClick={reopen} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Reopen
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}

export function CallbackRequestsCard() {
  const queryClient = useQueryClient();
  const [showDone, setShowDone] = useState(false);
  const { data } = useQuery({
    queryKey: CALLBACK_REQUESTS_QUERY_KEY,
    queryFn: () => loadCallbackRequests(),
  });

  // Loading, or a read RLS refused: render nothing rather than a card the
  // viewer cannot use. The loader logs the refusal.
  if (!data || data.success === false) return null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: CALLBACK_REQUESTS_QUERY_KEY });

  return (
    <Card data-testid="callback-requests-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">People waiting for a call</CardTitle>
        <CardDescription>
          They opened the interview booking link when no time was free. Ring them and mark each one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.open.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one is waiting for a call.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.open.map((row) => (
              <OpenRow key={row.id} row={row} onChanged={refresh} />
            ))}
          </ul>
        )}

        {data.done.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground"
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
            >
              {showDone ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
              Recently handled ({data.done.length})
            </Button>
            {showDone && (
              <ul className="divide-y divide-border">
                {data.done.map((row) => (
                  <DoneRow key={row.id} row={row} onChanged={refresh} />
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
