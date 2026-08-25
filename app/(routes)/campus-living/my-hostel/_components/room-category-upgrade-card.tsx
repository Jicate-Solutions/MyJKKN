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
  /**
   * No room allocated yet: upgrade the CATEGORY only, never a room. Picking a room
   * without an allocation runs _cl_execute_first_booking, which seats the learner with
   * NO upgrade bill and NO category change; _cl_upgrade_category_only bills the ladder
   * fee and lets the hostel office allocate the room in the new category afterwards.
   */
  categoryOnly?: boolean;
}

export function RoomCategoryUpgradeCard({
  currentCategoryName,
  mode = 'upgrade',
  categoryOnly = false,
}: Props) {
  const isBook = mode === 'book';
  const { data: options = [], isLoading } = useUpgradeRoomCategories();
  const { data: myWaitlist = [] } = useMyUpgradeWaitlist();
  const joinWaitlist = useJoinUpgradeWaitlist();
  const leaveWaitlist = useLeaveUpgradeWaitlist();
  const [picked, setPicked] = useState<UpgradeRoomCategoryOption | null>(null);

  const waitlistFor = (categoryId: string) =>
    myWaitlist.find((w) => w.target_category_id === categoryId) ?? null;

  // A pending upgrade target locks LOWER-category upgrades (no downgrades): once the learner
  // has chosen e.g. Premium, the Deluxe row is disabled; choosing Deluxe instead still leaves
  // the higher Premium row selectable as the next level up.
  const pendingTarget = options.find((o) => waitlistFor(o.category_id)) ?? null;
  const pendingTargetFee = pendingTarget?.current_year_fee ?? null;
  const pendingTargetName = pendingTarget?.name ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-primary" /> {isBook ? 'Book a Room' : 'Upgrade Room Category'}
        </CardTitle>
        <CardDescription>
          {isBook
            ? 'Pick a room to move into. It books instantly once your academic-year fee payment meets the required level — reserve earlier and the room is still yours while you pay; any unpaid amount joins your fee dues.'
            : 'Move up to a higher room category. The room is yours from reservation — the upgrade amount is billed, and any unpaid amount joins your fee dues under the institution’s overdue-fee policy.'}
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
            // Category-only upgrade (auto category): a bill exists but NO room is held —
            // awaiting payment; the category changes on full payment, room assigned later.
            const categoryPending = !held && waitlisted?.upgrade_bill_id ? waitlisted : null;
            const hasRooms = opt.available_beds > 0;
            // Locked: a higher upgrade is already pending → this lower option is a downgrade.
            const locked = pendingTargetFee != null && opt.current_year_fee < pendingTargetFee;
            return (
              <div
                key={opt.category_id}
                className={`rounded-md border p-3 space-y-2 ${
                  held
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
                    : waitlisted && hasRooms
                      ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
                      : ''
                } ${locked ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {!isBook && currentCategoryName && (
                        <span className="text-muted-foreground">{currentCategoryName} → </span>
                      )}
                      <span className="text-base">{opt.name}</span>
                    </p>
                    {!isBook && (
                      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-sm">
                        {(opt.upgrade_discount ?? 0) > 0 && (
                          <span className="text-xs text-muted-foreground line-through">
                            ₹{(opt.upgrade_fee_original ?? 0).toLocaleString('en-IN')}
                          </span>
                        )}
                        <span className="font-semibold">
                          {opt.upgrade_fee <= 0
                            ? 'Free upgrade'
                            : `₹${opt.upgrade_fee.toLocaleString('en-IN')}`}
                        </span>
                        {(opt.upgrade_discount ?? 0) > 0 && (
                          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            ₹{(opt.upgrade_discount ?? 0).toLocaleString('en-IN')} off
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  {locked ? (
                    <Badge variant="outline" className="w-fit text-muted-foreground">
                      Lower than your pending {pendingTargetName} upgrade
                    </Badge>
                  ) : isBook && !held ? (
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
                        <CalendarClock className="mr-1 h-3 w-3" /> Room booked
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
                  ) : categoryPending ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">
                        <CalendarClock className="mr-1 h-3 w-3" /> Pending payment
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
                      {opt.allocation_mode === 'auto' || categoryOnly
                        ? 'Upgrade'
                        : opt.meets_threshold
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
                {locked && (
                  <p className="text-xs text-muted-foreground">
                    You&apos;ve already chosen the higher {pendingTargetName} upgrade — cancel it
                    first to pick this instead.
                  </p>
                )}
                {pendingBill && (
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Room {pendingBill.held_room_number}
                    {pendingBill.held_block_name ? ` (${pendingBill.held_block_name})` : ''} is yours.
                    Pay the upgrade fee of{' '}
                    <span className="font-semibold">
                      ₹{(pendingBill.upgrade_fee_amount ?? 0).toLocaleString('en-IN')}
                    </span>
                    {(pendingBill.upgrade_fee_paid ?? 0) > 0
                      ? ` (₹${(pendingBill.upgrade_fee_paid ?? 0).toLocaleString('en-IN')} paid so far)`
                      : ''}
                    {pendingBill.hold_expires_at
                      ? ` by ${new Date(pendingBill.hold_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                      : ''}{' '}
                    — any unpaid amount joins your fee dues and follows the institution&apos;s
                    overdue-fee policy.
                  </p>
                )}
                {held && !pendingBill && (
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Room {held.held_room_number}
                    {held.held_block_name ? ` (${held.held_block_name})` : ''} is yours.
                    You&apos;ve paid {held.paid_pct ?? 0}% of this year&apos;s fees — it moves ahead
                    automatically at {held.threshold_pct}%
                    {isBook ? '' : ' (the upgrade fee is then billed)'}.
                    {held.hold_expires_at
                      ? ` Pay by ${new Date(held.hold_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`
                      : ''}{' '}
                    Any unpaid amount joins your fee dues under the institution&apos;s overdue-fee
                    policy.
                  </p>
                )}
                {!isBook && !categoryOnly && !locked && !held && hasRooms && !opt.meets_threshold && (
                  <p className="text-xs text-muted-foreground">
                    You&apos;ve paid {opt.paid_pct ?? 0}% of this year&apos;s fees; {opt.threshold_pct}% is
                    needed for an instant upgrade — you can still reserve a room now (it&apos;s yours
                    from reservation) with {opt.hold_days} day{opt.hold_days === 1 ? '' : 's'} to pay.
                  </p>
                )}
                {categoryOnly && !locked && !held && !categoryPending && (
                  <p className="text-xs text-muted-foreground">
                    You don&apos;t have a room yet — this upgrades your category, so the hostel
                    office allocates you a {opt.name} directly. The upgrade fee is billed now.
                  </p>
                )}
                {categoryPending && (
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Upgrade to {opt.name} billed — pay{' '}
                    <span className="font-semibold">
                      ₹{(categoryPending.upgrade_fee_amount ?? 0).toLocaleString('en-IN')}
                    </span>
                    {(categoryPending.upgrade_fee_paid ?? 0) > 0
                      ? ` (₹${(categoryPending.upgrade_fee_paid ?? 0).toLocaleString('en-IN')} paid so far)`
                      : ''}{' '}
                    to confirm. Your category changes to {opt.name} once the bill is fully paid; the room is
                    then assigned by the hostel office.
                  </p>
                )}
                {!held && !categoryPending && waitlisted && hasRooms && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    A room is now available — upgrade now to claim it.
                  </p>
                )}
                {!held && !categoryPending && waitlisted && !hasRooms && (
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
          upgradeFeeOriginal={picked.upgrade_fee_original}
          upgradeDiscount={picked.upgrade_discount}
          thresholdPct={picked.threshold_pct}
          paidPct={picked.paid_pct}
          meetsThreshold={picked.meets_threshold}
          holdDays={picked.hold_days}
          mode={mode}
          autoPick={categoryOnly || picked.allocation_mode === 'auto'}
        />
      )}
    </Card>
  );
}
