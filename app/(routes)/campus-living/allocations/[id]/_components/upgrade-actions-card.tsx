'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, ArrowUpCircle, BedDouble, Info, ReceiptText } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAdminUpgradeContext } from '@/hooks/campus-living/use-admin-category-upgrade';
import { AdminRoomUpgradeDialog } from '../../../residents/_components/admin-room-upgrade-dialog';
import { CategoryOnlyUpgradeDialog } from './category-only-upgrade-dialog';
import { GenerateUpgradeBillDialog } from './generate-upgrade-bill-dialog';
import type { AdminUpgradeBillState } from '@/types/campus-living/upgrade-admin';

const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;

const BILL_STATE: Record<AdminUpgradeBillState, { label: string; variant: 'success' | 'destructive' | 'outline' | 'secondary' }> = {
  paid: { label: 'Paid', variant: 'success' },
  partial: { label: 'Part paid', variant: 'outline' },
  unpaid: { label: 'Unpaid', variant: 'outline' },
  cancelled_only: { label: 'All cancelled', variant: 'destructive' },
  none: { label: 'Never billed', variant: 'secondary' },
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value ?? '—'}</span>
    </div>
  );
}

/**
 * Office-side upgrade actions for one allocation.
 *
 * Deliberately OUTSIDE the Allocation Audit card. That card is gated on
 * `campus_living.allocations.audit`, a key granted to no role — it is
 * super-admin only, and its RPC refuses everyone else. The six roles who
 * actually do this work (ceo, chief_warden, executive_admin_officer,
 * hostel_office, managing_director, warden) hold
 * `campus_living.upgrades.manage` instead, so this card and its own narrow
 * context RPC are gated on that.
 */
export function UpgradeActionsCard({
  allocationId,
  learnerName,
}: {
  allocationId: string;
  learnerName?: string | null;
}) {
  const { isSuperAdmin, permissions } = usePermissions();
  const canManage = isSuperAdmin || !!permissions?.['campus_living.upgrades.manage'];

  const { data, isLoading, error, refetch } = useAdminUpgradeContext(allocationId, canManage);
  const [roomOpen, setRoomOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);

  if (!canManage) return null;

  const billState = data?.upgrade_bill_state ?? 'none';
  const cfg = BILL_STATE[billState];
  // Assigned above occupied is NORMAL: Deluxe Plus owns no rooms and sells from
  // Deluxe stock, so 64 residents legitimately look "mismatched". Explain it
  // rather than letting the two lines read as a fault.
  const sellsFromOtherStock =
    !!data?.assigned_category_id &&
    !!data?.occupied_category_id &&
    data.assigned_category_id !== data.occupied_category_id;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex flex-wrap items-center gap-2">
            <ArrowUpCircle className="h-5 w-5" />
            Room category &amp; upgrade billing
            {!isLoading && <Badge variant={cfg.variant}>{cfg.label}</Badge>}
          </CardTitle>
          <CardDescription>
            What this learner is entitled to, what they are billed as, and the
            room they actually occupy.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : error ? (
            // Say WHY. A bare "unavailable" hides a permission refusal, a
            // missing hostel year and a network failure behind one sentence,
            // which is how a fixable problem gets reported as "it doesn't work".
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {error instanceof Error ? error.message : 'Could not load upgrade details.'}
              </AlertDescription>
            </Alert>
          ) : !data?.ok ? (
            <p className="text-sm text-muted-foreground">
              Upgrade details are unavailable for this allocation
              {data?.reason ? ` (${data.reason.replace(/_/g, ' ')})` : ''}.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 rounded-lg border p-3 sm:grid-cols-4">
                <Field label="Entitled (fee band)" value={data.entitled_category} />
                <Field label="Assigned (billed as)" value={data.assigned_category} />
                <Field label="Occupied room" value={data.occupied_category} />
                <Field
                  label="Upgrade billed"
                  value={
                    data.upgrade_bill_count > 0
                      ? `${inr(data.upgrade_bill_total)} · ${inr(data.upgrade_bill_balance)} due`
                      : '—'
                  }
                />
              </div>

              {sellsFromOtherStock && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    The assigned category differs from the room&apos;s own category.
                    That is normal for tiers that hold no rooms of their own and
                    are sold from another tier&apos;s stock — it is not a
                    misplacement.
                  </AlertDescription>
                </Alert>
              )}

              {data.above_band && billState === 'none' && (
                <Alert variant="destructive">
                  <ReceiptText className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    This learner holds a category above their fee band and has
                    never been billed for it. {inr(data.billable_amount)} would be
                    due from {data.entitled_category} to {data.assigned_category}.
                  </AlertDescription>
                </Alert>
              )}

              {data.above_band && billState === 'cancelled_only' && (
                <Alert variant="destructive">
                  <ReceiptText className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Every upgrade bill for this learner was cancelled, but they
                    still hold the upgraded category.{' '}
                    {data.cancelled_bill_count} cancelled bill
                    {data.cancelled_bill_count === 1 ? '' : 's'} on record.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setRoomOpen(true)}>
                  <BedDouble className="mr-2 h-4 w-4" />
                  Upgrade category &amp; room
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCatOpen(true)}>
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  Upgrade category only
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBillOpen(true)}>
                  <ReceiptText className="mr-2 h-4 w-4" />
                  Generate upgrade bill
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AdminRoomUpgradeDialog
        open={roomOpen}
        onOpenChange={setRoomOpen}
        learner={
          data?.learner_profile_id
            ? {
                id: data.learner_profile_id,
                hostel_category_name: data.assigned_category,
                // This page carries a full_name, not name parts — the display
                // name goes through learnerName below instead.
                first_name: null,
                last_name: null,
              }
            : null
        }
        learnerName={learnerName}
        onCommitted={() => refetch()}
      />

      {/* Remounted per open so the dialogs start clean without a reset effect. */}
      <CategoryOnlyUpgradeDialog
        key={catOpen ? 'cat-open' : 'cat-closed'}
        open={catOpen}
        onOpenChange={setCatOpen}
        learnerProfileId={data?.learner_profile_id ?? null}
        currentCategory={data?.assigned_category ?? null}
        onCommitted={() => refetch()}
      />

      <GenerateUpgradeBillDialog
        open={billOpen}
        onOpenChange={setBillOpen}
        learnerProfileId={data?.learner_profile_id ?? null}
        onCommitted={() => refetch()}
      />
    </>
  );
}
