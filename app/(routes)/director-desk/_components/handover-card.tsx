'use client';

// ============================================================================
// One row on the Director's board.
//
// The row's colour and headline come from the SQL-computed primary reason. Any
// OTHER rules the item also breaks are listed underneath as secondary chips —
// they are shown but not counted, so the counts at the top of the page still add
// up exactly to the not-green total.
//
// Two actions, both spine RPCs:
//   nudge      fn_director_handover_progress(id, note)  — records a message on
//              the item. It does NOT clear "gone quiet", and the copy here must
//              never say it does.
//   take back  fn_director_handover_revoke(id, reason)  — ends access.
//
// WHY THE NUDGE NO LONGER CLEARS THE FLAG
// ---------------------------------------
// It used to. fn_director_handover_progress stamps last_activity_at, and the
// board's quiet rule read that column — so posting a nudge turned the row green
// with the receiver still having done nothing. Proven on Postgres 16: nudging
// every 8th day kept a 60-day handover green for 52 of them, then it flipped
// straight to overdue with no escalation in between. The board now reads only
// the GRANTEE's own audit rows (migration 20260811130000), so a nudge is a
// message and nothing more. Saying otherwise on this button would put the lie
// back in the interface after taking it out of the database.
//
// Both refuse a row whose status is already expired or orphaned, so the buttons
// are disabled there with the reason stated rather than left clickable to fail.
// ============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Undo2, MessageSquarePlus, CalendarDays, Clock } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { cn } from '@/lib/utils';

import {
  ACCESS_LEVEL_LABEL,
  RULE_BY_REASON,
  isActionable,
  type HandoverBoardRow
} from '../_lib/not-green';

type PendingAction = 'nudge' | 'revoke' | null;

interface HandoverCardProps {
  row: HandoverBoardRow;
  onChanged: () => void;
}

export function HandoverCard({ row, onChanged }: HandoverCardProps) {
  const [openAction, setOpenAction] = useState<PendingAction>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const primary = row.not_green_reason ? RULE_BY_REASON[row.not_green_reason] : null;
  const secondary = row.not_green_reasons
    .filter((r) => r !== row.not_green_reason)
    .map((r) => RULE_BY_REASON[r])
    .filter(Boolean);

  const actionable = isActionable(row);

  async function run(action: Exclude<PendingAction, null>) {
    const body = text.trim();
    if (action === 'nudge' && !body) {
      toast.error('A nudge needs something in it.');
      return;
    }

    setBusy(true);
    try {
      const supabase = createClientSupabaseClient();
      const { error } =
        action === 'nudge'
          ? await (supabase as any).rpc('fn_director_handover_progress', {
              p_handover_id: row.id,
              p_note: body
            })
          : await (supabase as any).rpc('fn_director_handover_revoke', {
              p_handover_id: row.id,
              p_reason: body || null
            });

      if (error) throw error;

      toast.success(
        action === 'nudge'
          ? 'Nudge posted. It stays flagged until they reply on it.'
          : 'Taken back. Access has ended.'
      );
      setText('');
      setOpenAction(null);
      onChanged();
    } catch (err: any) {
      logger.error('director-desk', `handover ${action} failed`, err);
      toast.error(err?.message || 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cn('overflow-hidden', primary ? primary.cardClass : 'border-l-4 border-l-emerald-500')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold">{row.title}</h3>
              <Badge variant="outline" className="shrink-0 text-xs font-normal">
                {ACCESS_LEVEL_LABEL[row.access_level]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              With <span className="font-medium text-foreground">{row.grantee_name}</span>
              {row.grantee_email ? <span className="text-xs"> · {row.grantee_email}</span> : null}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {primary ? (
              <Badge variant="outline" className={cn('gap-1.5', primary.chipClass)}>
                <span className={cn('h-2 w-2 rounded-full', primary.dotClass)} aria-hidden />
                {primary.label}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1.5 border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                On track
              </Badge>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href={row.route}>
                Open <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {primary ? (
          <div className="space-y-1.5 rounded-md bg-muted/50 p-3 text-sm">
            <p>
              <span className="font-medium">{primary.action}.</span>{' '}
              {primary.describe(row)}
            </p>
            {secondary.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Also breaking:{' '}
                {secondary.map((rule, i) => (
                  <span key={rule.reason}>
                    {i > 0 ? ', ' : ''}
                    <span className="font-medium">{rule.label.toLowerCase()}</span> — {rule.describe(row)}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {row.days_remaining >= 0
              ? `${row.days_remaining} ${row.days_remaining === 1 ? 'day' : 'days'} left`
              : `${Math.abs(row.days_remaining)} ${Math.abs(row.days_remaining) === 1 ? 'day' : 'days'} over`}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {/* Counted from the GRANTEE's last action only — see not-green.ts. */}
            {row.days_quiet === 0
              ? 'They updated it today'
              : `Last heard from them ${row.days_quiet}d ago`}
          </span>
          <span className="font-mono">{row.route}</span>
          {!row.is_live ? (
            <span className="font-medium text-foreground">
              {row.not_green_reason === 'no_access'
                ? 'This never opened for them'
                : 'Access already closed'}
            </span>
          ) : null}
        </div>

        {row.last_note ? (
          <p className="border-l-2 pl-3 text-sm italic text-muted-foreground">
            Last update: {row.last_note}
          </p>
        ) : null}

        {actionable ? (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={openAction === 'nudge' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => {
                  setOpenAction(openAction === 'nudge' ? null : 'nudge');
                  setText('');
                }}
              >
                <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
                Post a nudge
              </Button>
              <Button
                variant={openAction === 'revoke' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => {
                  setOpenAction(openAction === 'revoke' ? null : 'revoke');
                  setText('');
                }}
              >
                <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                Take it back
              </Button>
            </div>

            {openAction ? (
              <div className="space-y-2 rounded-md border p-3">
                <label className="text-xs font-medium" htmlFor={`note-${row.id}-${openAction}`}>
                  {openAction === 'nudge'
                    ? 'What do you want to say? This is recorded on the item. It will stay flagged as quiet until they answer on it — your own message does not clear that.'
                    : 'Why are you taking it back? Optional, and recorded.'}
                </label>
                <Textarea
                  id={`note-${row.id}-${openAction}`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  disabled={busy}
                  placeholder={
                    openAction === 'nudge'
                      ? 'Where has this got to?'
                      : 'Picking this back up myself'
                  }
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={openAction === 'revoke' ? 'destructive' : 'default'}
                    disabled={busy}
                    onClick={() => run(openAction)}
                  >
                    {busy
                      ? 'Working…'
                      : openAction === 'nudge'
                        ? 'Post nudge'
                        : 'Take it back'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpenAction(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="pt-1 text-xs text-muted-foreground">
            {row.status === 'orphaned'
              ? 'Closed automatically because the owner left. Hand it to someone else to restart it.'
              : 'Closed automatically when the date passed. Hand it over again to restart it.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
