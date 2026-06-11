'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UtensilsCrossed, Loader2, ArrowUpCircle } from 'lucide-react';
import { useUpgradeMessCategories, useUpgradeMess } from '@/hooks/campus-living/use-category-upgrade';
import type { UpgradeMessCategoryOption } from '@/types/campus-living/category-upgrade';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

interface Props {
  currentMessName: string | null;
  currentFee: number;
}

export function MessCategoryUpgradeCard({ currentMessName, currentFee }: Props) {
  const { data: options = [], isLoading } = useUpgradeMessCategories();
  const upgrade = useUpgradeMess();
  const [picked, setPicked] = useState<UpgradeMessCategoryOption | null>(null);

  const confirm = async () => {
    if (!picked || upgrade.isPending) return;
    await upgrade.mutateAsync(picked.mess_category_id);
    setPicked(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UtensilsCrossed className="h-5 w-5 text-primary" /> Upgrade Mess Category
        </CardTitle>
        <CardDescription>
          Switch to a higher mess plan. Applied instantly — your mess bill is re-issued at the new
          amount (no room change).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground py-4">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading mess options…
          </div>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No higher mess categories available to you right now.
          </p>
        ) : (
          options.map((opt) => (
            <div key={opt.mess_category_id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {currentMessName ? `${currentMessName} → ` : ''}{opt.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {currentMessName ? `${inr(currentFee)} → ` : ''}{inr(opt.current_year_fee)}
                  {' · '}<span className="font-medium text-foreground">Pay {inr(opt.upgrade_fee)}</span>
                </p>
              </div>
              <Button size="sm" onClick={() => setPicked(opt)}>
                <ArrowUpCircle className="mr-1.5 h-4 w-4" /> Upgrade
              </Button>
            </div>
          ))
        )}
      </CardContent>

      <AlertDialog open={!!picked} onOpenChange={(o) => { if (!o && !upgrade.isPending) setPicked(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upgrade mess to {picked?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll be billed{' '}
              <span className="font-medium text-foreground">{inr(picked?.upgrade_fee ?? 0)}</span> to
              upgrade ({inr(currentFee)} → {inr(picked?.current_year_fee ?? 0)}). This applies
              immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={upgrade.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirm(); }} disabled={upgrade.isPending}>
              {upgrade.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Upgrading…</>) : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
