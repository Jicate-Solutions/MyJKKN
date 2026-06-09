'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Loader2, ArrowUpCircle } from 'lucide-react';
import { useUpgradeRoomCategories, useJoinUpgradeWaitlist } from '@/hooks/campus-living/use-category-upgrade';
import { RoomUpgradeBedDialog } from './room-upgrade-bed-dialog';
import type { UpgradeRoomCategoryOption } from '@/types/campus-living/category-upgrade';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

interface Props {
  currentCategoryName: string | null;
  currentFee: number;
}

export function RoomCategoryUpgradeCard({ currentCategoryName, currentFee }: Props) {
  const { data: options = [], isLoading } = useUpgradeRoomCategories();
  const joinWaitlist = useJoinUpgradeWaitlist();
  const [picked, setPicked] = useState<UpgradeRoomCategoryOption | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-primary" /> Upgrade Room Category
        </CardTitle>
        <CardDescription>
          Move up to a higher room category. If a bed is free you move instantly and a new bill is
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
          options.map((opt) => (
            <div key={opt.category_id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{opt.name}</p>
                <p className="text-xs text-muted-foreground">
                  {inr(opt.current_year_fee)}
                  {currentCategoryName ? ` · from ${currentCategoryName} (${inr(currentFee)})` : ''}
                </p>
              </div>
              {opt.available_beds > 0 ? (
                <Button size="sm" onClick={() => setPicked(opt)}>
                  <ArrowUpCircle className="mr-1.5 h-4 w-4" /> Upgrade now
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">No bed free</Badge>
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
          ))
        )}
      </CardContent>

      {picked && (
        <RoomUpgradeBedDialog
          open={!!picked}
          onOpenChange={(o) => { if (!o) setPicked(null); }}
          categoryId={picked.category_id}
          categoryName={picked.name}
          currentFee={currentFee}
          newFee={picked.current_year_fee}
        />
      )}
    </Card>
  );
}
