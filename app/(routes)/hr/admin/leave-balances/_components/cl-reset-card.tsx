'use client';

/**
 * ONE-OFF Casual Leave reset for HR year 2026-2027 — v2, migration
 * 20260922130000 (v1 was 20260907140000).
 *
 * Super admin ONLY, mirroring the server exactly: fn_hr_cl_reset_2026_27 gates
 * on public.is_super_admin(), which reads profiles.is_super_admin and does NOT
 * accept role = 'super_admin'. Same reasoning as LeaveMonthlyLedger — deriving
 * access from a permission key here would offer a button the RPC then refuses.
 *
 * Dry run is mandatory before Apply. Not a nicety: a real run rewrites ~790
 * balances and replaces every CL month entry for the year — including the
 * 16 Sep payroll-sheet figures. Approved requests are never touched (August is
 * a locked attendance month almost everywhere, so they could not be anyway);
 * only still-pending June–August requests are rejected, because the balance
 * trigger is not override-aware and a later approval would double-count. The
 * two runs return the same shape, so what is on screen is what will happen.
 */

import { useState } from 'react';
import { AlertTriangle, Loader2, Play, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { useResetCasualLeave2026_27 } from '@/hooks/hr/use-hr-leave-types';
import { getErrorMessage } from '@/lib/utils';

interface ResetSummary {
  dry_run?: boolean;
  balances?: { rows?: number; unchanged?: number; increased?: number; decreased?: number;
               used_before?: number; used_after?: number };
  month_entries?: { cleared?: number; payroll_verified_cleared?: number; written?: number };
  rejections?: { pending?: number; blocked_by_locked_period?: number };
  august?: { approved_requests_absorbed?: number; approved_days_absorbed?: number };
}

function num(v: unknown): string {
  return v === null || v === undefined ? '—' : String(v);
}

export function ClResetCard() {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.is_super_admin === true;

  const reset = useResetCasualLeave2026_27();
  const [preview, setPreview] = useState<ResetSummary | null>(null);
  const [applied, setApplied] = useState<ResetSummary | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!isSuperAdmin) return null;

  const run = async (dryRun: boolean) => {
    try {
      const result = (await reset.mutateAsync({ dryRun })) as ResetSummary;
      if (dryRun) {
        setPreview(result);
        setApplied(null);
      } else {
        setApplied(result);
        setConfirmOpen(false);
        toast.success('Casual Leave balances reset.');
      }
    } catch (err) {
      // Supabase errors are plain objects — getErrorMessage surfaces the real
      // code and message instead of "[object Object]".
      toast.error(getErrorMessage(err));
    }
  };

  const shown = applied ?? preview;

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          Casual Leave reset — 2026-2027
        </CardTitle>
        <CardDescription>
          Sets June, July and August 2026 to one Casual Leave day each for every eligible staff
          member and replaces every existing month record — including the 16 Sep payroll-sheet
          figures. Approved August requests are absorbed, not rejected. Entitlement is never
          changed. Correct individual staff afterwards from the Taken-by-month editor. Super
          admins only.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => run(true)}
            disabled={reset.isPending}
          >
            {reset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Dry run
          </Button>
          <Button
            size="sm"
            variant="destructive"
            // Apply stays shut until a dry run has been read. The numbers on
            // screen ARE the change; approving blind is the failure mode this
            // whole card exists to prevent.
            disabled={!preview || reset.isPending || Boolean(applied)}
            onClick={() => setConfirmOpen(true)}
          >
            <Play className="mr-2 h-4 w-4" />
            Apply
          </Button>
        </div>

        {shown && (
          <div className="space-y-3">
            <Badge variant={applied ? 'default' : 'secondary'}>
              {applied ? 'Applied' : 'Dry run — nothing written'}
            </Badge>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Balance rows" value={num(shown.balances?.rows)} />
              <Stat
                label="Used days"
                value={`${num(shown.balances?.used_before)} → ${num(shown.balances?.used_after)}`}
              />
              <Stat label="Balances raised" value={num(shown.balances?.increased)} />
              <Stat label="Balances lowered" value={num(shown.balances?.decreased)} />
              <Stat label="Month entries cleared" value={num(shown.month_entries?.cleared)} />
              <Stat
                label="Payroll-sheet entries replaced"
                value={num(shown.month_entries?.payroll_verified_cleared ?? 0)}
              />
              <Stat label="Month entries written" value={num(shown.month_entries?.written)} />
              <Stat
                label="Pending requests rejected"
                value={num(shown.rejections?.pending ?? 0)}
                sub="Jun–Aug"
              />
              <Stat
                label="August requests absorbed"
                value={num(shown.august?.approved_requests_absorbed ?? 0)}
                sub={`${num(shown.august?.approved_days_absorbed ?? 0)} days`}
              />
            </div>

            {Number(shown.rejections?.blocked_by_locked_period ?? 0) > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {shown.rejections?.blocked_by_locked_period} pending request(s) sit in a locked
                  attendance month and cannot be rejected. They are skipped, not failed — if one
                  is approved later it will add to Used on top of the month&apos;s one day and show
                  as unexplained in the ledger. Reopen the period and reject it, or withdraw it.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply the Casual Leave reset?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This rewrites {num(preview?.balances?.rows)} balance rows (used{' '}
                  {num(preview?.balances?.used_before)} → {num(preview?.balances?.used_after)}),
                  replaces all {num(preview?.month_entries?.cleared)} Casual Leave month entries
                  for 2026-2027 with {num(preview?.month_entries?.written)} one-day entries, and
                  rejects {num(preview?.rejections?.pending ?? 0)} still-pending June–August
                  request(s). Approved requests are not touched.
                </p>
                <p>
                  Every change is written to the balance adjustment log, but the replaced
                  payroll-sheet figures are not restored by re-running this.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={reset.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => run(false)} disabled={reset.isPending}>
              {reset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply the reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">
        {label}
        {sub && <span className="ml-1 opacity-70">({sub})</span>}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
