'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, CalendarClock, Clock, Loader2, ArrowUpCircle, Sparkles } from 'lucide-react';
import {
  useUpgradeRoomCategories,
  useJoinUpgradeWaitlist,
  useLeaveUpgradeWaitlist,
  useMyUpgradeWaitlist,
} from '@/hooks/campus-living/use-category-upgrade';
import { RoomUpgradeDialog } from './room-upgrade-dialog';
import type { UpgradeRoomCategoryOption } from '@/types/campus-living/category-upgrade';

interface Props {
  currentCategoryName: string | null;
  /** 'book' = learner has no allocation yet (first booking); 'upgrade' = move. */
  mode?: 'book' | 'upgrade';
}

export function RoomCategoryUpgradeCard({ currentCategoryName, mode = 'upgrade' }: Props) {
  const isBook = mode === 'book';
  const { data: options = [], isLoading } = useUpgradeRoomCategories();
  const { data: myWaitlist = [] } = useMyUpgradeWaitlist();
  const joinWaitlist = useJoinUpgradeWaitlist();
  const leaveWaitlist = useLeaveUpgradeWaitlist();
  const [picked, setPicked] = useState<UpgradeRoomCategoryOption | null>(null);

  const waitlistFor = (categoryId: string) =>
    myWaitlist.find((w) => w.target_category_id === categoryId) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-primary" /> {isBook ? 'Book a Room' : 'Upgrade Room Category'}
        </CardTitle>
        <CardDescription>
          {isBook
            ? 'Pick a room to move into. It books once your academic-year fee payment meets the required level — otherwise the room is reserved for you while you pay.'
            : 'Move up to a higher room category. The room is reserved and an upgrade bill is generated — the upgrade confirms once the bill is fully paid.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground py-4">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading {isBook ? 'rooms' : 'upgrade options'}…
          </div>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            {isBook
              ? 'No rooms available to you right now — please contact the hostel office.'
              : 'No higher room categories available to you right now.'}
          </p>
        ) : (
          options.map((opt) => {
            // Book mode participates too: a below-threshold first booking also
            // hard-reserves the bed on the waitlist.
            const waitlisted = waitlistFor(opt.category_id);
            // A reservation: bed is hard-held until confirmed (paid) or expiry.
            const held = waitlisted?.held_room_number ? waitlisted : null;
            // Pay-to-confirm: threshold met, upgrade bill generated — show
            // payment progress instead of the threshold message.
            const pendingBill = held?.upgrade_bill_id ? held : null;
            const hasRooms = opt.available_beds > 0;
            return (
              <div
                key={opt.category_id}
                className={`rounded-md border p-3 space-y-2 ${
                  held
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
                    : waitlisted && hasRooms
                      ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
                      : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {!isBook && currentCategoryName ? `${currentCategoryName} → ` : ''}{opt.name}
                    </p>
                  </div>
                  {isBook && !held ? (
                    hasRooms ? (
                      <Button size="sm" onClick={() => setPicked(opt)}>
                        <ArrowUpCircle className="mr-1.5 h-4 w-4" /> Book now
                      </Button>
                    ) : (
                      <Badge variant="outline">No room free</Badge>
                    )
                  ) : held ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">
                        <CalendarClock className="mr-1 h-3 w-3" /> Room reserved
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={leaveWaitlist.isPending}
                        onClick={() => { if (!leaveWaitlist.isPending) leaveWaitlist.mutate(opt.category_id); }}
                      >
                        {leaveWaitlist.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                        Cancel
                      </Button>
                    </div>
                  ) : hasRooms ? (
                    <Button size="sm" onClick={() => setPicked(opt)}>
                      <ArrowUpCircle className="mr-1.5 h-4 w-4" />
                      {opt.meets_threshold
                        ? opt.upgrade_fee > 0 ? 'Reserve & pay' : 'Upgrade now'
                        : 'Reserve room'}
                    </Button>
                  ) : waitlisted ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">
                        <Clock className="mr-1 h-3 w-3" /> On waitlist
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={leaveWaitlist.isPending}
                        onClick={() => { if (!leaveWaitlist.isPending) leaveWaitlist.mutate(opt.category_id); }}
                      >
                        {leaveWaitlist.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                        Leave
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">No room free</Badge>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={joinWaitlist.isPending}
                        onClick={() => { if (!joinWaitlist.isPending) joinWaitlist.mutate(opt.category_id); }}
                      >
                        {joinWaitlist.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                        Join waitlist
                      </Button>
                    </div>
                  )}
                </div>
                {pendingBill && (
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Room {pendingBill.held_room_number}
                    {pendingBill.held_block_name ? ` (${pendingBill.held_block_name})` : ''} is held for you
                    {pendingBill.hold_expires_at
                      ? ` until ${new Date(pendingBill.hold_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                      : ''}
                    . Pay the upgrade fee of{' '}
                    <span className="font-semibold">
                      ₹{(pendingBill.upgrade_fee_amount ?? 0).toLocaleString('en-IN')}
                    </span>
                    {(pendingBill.upgrade_fee_paid ?? 0) > 0
                      ? ` (₹${(pendingBill.upgrade_fee_paid ?? 0).toLocaleString('en-IN')} paid so far)`
                      : ''}{' '}
                    to confirm — the reservation is cancelled after the deadline.
                  </p>
                )}
                {held && !pendingBill && (
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Room {held.held_room_number}
                    {held.held_block_name ? ` (${held.held_block_name})` : ''} is held for you
                    {held.hold_expires_at
                      ? ` until ${new Date(held.hold_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                      : ''}
                    . You&apos;ve paid {held.paid_pct ?? 0}% of this year&apos;s fees — it moves ahead
                    automatically at {held.threshold_pct}%
                    {isBook ? '' : ' (the upgrade fee is then billed and must be fully paid to confirm)'};
                    the reservation is cancelled after the deadline.
                  </p>
                )}
                {!isBook && !held && hasRooms && !opt.meets_threshold && (
                  <p className="text-xs text-muted-foreground">
                    You&apos;ve paid {opt.paid_pct ?? 0}% of this year&apos;s fees; {opt.threshold_pct}% is
                    needed for an instant upgrade — you can still reserve a room for {opt.hold_days} day
                    {opt.hold_days === 1 ? '' : 's'} while you pay.
                  </p>
                )}
                {!held && waitlisted && hasRooms && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    A room is now available — upgrade now to claim it.
                  </p>
                )}
                {!held && waitlisted && !hasRooms && (
                  <p className="text-xs text-muted-foreground">
                    Joined {new Date(waitlisted.created_at).toLocaleDateString('en-IN')} — we&apos;ll show the
                    rooms here as soon as one frees up.
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>

      {picked && (
        <RoomUpgradeDialog
          open={!!picked}
          onOpenChange={(o) => { if (!o) setPicked(null); }}
          categoryId={picked.category_id}
          categoryName={picked.name}
          currentCategoryName={currentCategoryName}
          upgradeFee={picked.upgrade_fee}
          thresholdPct={picked.threshold_pct}
          paidPct={picked.paid_pct}
          meetsThreshold={picked.meets_threshold}
          holdDays={picked.hold_days}
          mode={mode}
        />
      )}
    </Card>
  );
}
