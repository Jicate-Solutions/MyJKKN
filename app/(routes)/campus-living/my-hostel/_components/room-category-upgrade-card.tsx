'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Clock, Loader2, ArrowUpCircle, Sparkles } from 'lucide-react';
import {
  useUpgradeRoomCategories,
  useJoinUpgradeWaitlist,
  useLeaveUpgradeWaitlist,
  useMyUpgradeWaitlist,
} from '@/hooks/campus-living/use-category-upgrade';
import { RoomUpgradeDialog } from './room-upgrade-dialog';
import type { UpgradeRoomCategoryOption } from '@/types/campus-living/category-upgrade';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

interface Props {
  currentCategoryName: string | null;
  currentFee: number;
}

export function RoomCategoryUpgradeCard({ currentCategoryName, currentFee }: Props) {
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
          <Building2 className="h-5 w-5 text-primary" /> Upgrade Room Category
        </CardTitle>
        <CardDescription>
          Move up to a higher room category. If a room is free you move instantly and a new bill is
          generated; otherwise you can join the waitlist (your current stay & bill stay as-is).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground py-4">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading upgrade options…
          </div>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No higher room categories available to you right now.
          </p>
        ) : (
          options.map((opt) => {
            const waitlisted = waitlistFor(opt.category_id);
            const hasRooms = opt.available_beds > 0;
            return (
              <div
                key={opt.category_id}
                className={`rounded-md border p-3 space-y-2 ${
                  waitlisted && hasRooms ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {currentCategoryName ? `${currentCategoryName} → ` : ''}{opt.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {currentCategoryName ? `${inr(currentFee)} → ` : ''}{inr(opt.current_year_fee)}
                      {' · '}<span className="font-medium text-foreground">Pay {inr(opt.upgrade_fee)}</span>
                    </p>
                  </div>
                  {hasRooms ? (
                    <Button size="sm" onClick={() => setPicked(opt)}>
                      <ArrowUpCircle className="mr-1.5 h-4 w-4" /> Upgrade now
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
                {waitlisted && hasRooms && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    A room is now available — upgrade now to claim it.
                  </p>
                )}
                {waitlisted && !hasRooms && (
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
          currentFee={currentFee}
          newFee={picked.current_year_fee}
          upgradeFee={picked.upgrade_fee}
        />
      )}
    </Card>
  );
}
