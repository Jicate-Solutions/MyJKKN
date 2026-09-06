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

interface Props {
  currentMessName: string | null;
}

export function MessCategoryUpgradeCard({ currentMessName }: Props) {
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
              Your mess category changes to{' '}
              <span className="font-medium text-foreground">{picked?.name}</span> immediately and a
              new mess bill is issued.
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
