'use client';

// Tournament In-charge panel (2026-07).
// In-charges are MyJKKN users granted FULL control of this one tournament —
// status transitions, divisions, entries, fixtures, results — without holding
// the sports.tournaments.manage role permission. Stored in events.config.incharges
// as [{member_id: <auth uid>, name}]; the DB reads the same list in
// fn_is_event_incharge(), which backs the RLS policies and every API gate.
//
// Only holders of sports.tournaments.manage may appoint/remove in-charges
// (canAssignIncharge) — an in-charge cannot appoint further in-charges.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, UserPlus, Loader2 } from 'lucide-react';
import { MemberPickerDialog, type PickedMember } from '@/components/events/shared/member-picker-dialog';
import { useUpdateTournament } from '@/hooks/events/use-tournaments';
import { getIncharges, type EventIncharge } from '@/hooks/events/use-tournament-access';
import type { Event } from '@/types/events';

export function InchargePanel({
  eventId,
  tournament,
  canAssign,
}: {
  eventId: string;
  tournament: Pick<Event, 'config'>;
  canAssign: boolean;
}) {
  const update = useUpdateTournament();
  const [pickerOpen, setPickerOpen] = useState(false);
  const incharges = getIncharges(tournament);

  const save = (next: EventIncharge[], onDone?: () => void) => {
    update.mutate(
      {
        id: eventId,
        dto: {
          config: {
            ...((tournament.config as Record<string, unknown>) ?? {}),
            incharges: next,
          },
        },
      },
      { onSuccess: () => onDone?.() }
    );
  };

  const add = (people: PickedMember[]) => {
    const existing = new Set(incharges.map((i) => i.member_id));
    const fresh = people.filter((p) => !existing.has(p.member_id));
    if (fresh.length === 0) {
      setPickerOpen(false);
      return;
    }
    save([...incharges, ...fresh.map((p) => ({ member_id: p.member_id, name: p.name }))], () =>
      setPickerOpen(false)
    );
  };

  const remove = (memberId: string) =>
    save(incharges.filter((i) => i.member_id !== memberId));

  // Non-assigners with no in-charges to show get nothing (keeps the page clean).
  if (!canAssign && incharges.length === 0) return null;

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="rounded-md bg-emerald-50 p-1.5 dark:bg-emerald-950/50">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </span>
            Tournament In-charge
            <Badge variant="secondary" className="text-[10px] font-normal tabular-nums">
              {incharges.length}
            </Badge>
          </CardTitle>
          {canAssign && (
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              <UserPlus className="mr-1 h-3.5 w-3.5" /> Add In-charge
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <p className="mb-2 text-xs text-muted-foreground">
            In-charges have full control of this tournament — status, divisions, entries,
            fixtures and results. Committee members can view everything but only update
            their tasks.
          </p>
          {incharges.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No in-charge assigned — only staff with the Sports Tournaments manage
              permission can operate this tournament.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {incharges.map((i) => (
                <Badge key={i.member_id} variant="outline" className="gap-1.5 py-1 text-xs">
                  <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  {i.name}
                  {canAssign && (
                    <button
                      type="button"
                      className="ml-0.5 text-muted-foreground hover:text-foreground"
                      onClick={() => remove(i.member_id)}
                      disabled={update.isPending}
                      aria-label={`Remove ${i.name} as in-charge`}
                    >
                      ×
                    </button>
                  )}
                </Badge>
              ))}
              {update.isPending && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <MemberPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        committeeName="Tournament In-charge"
        existingNames={incharges.map((i) => i.name)}
        isAdding={update.isPending}
        onAdd={add}
      />
    </>
  );
}
