'use client';

// My Kit — learner/staff self-service view of their kit (CARRE Clarity pillar:
// what am I entitled to, what have I received, what am I still owed).
// Data comes from fn_kit_my_kit (self-scoped SECURITY DEFINER — returns only
// the caller's own rows).

import { ContentLayout } from '@/components/layout/content-layout';
import { ImsPageGuard } from '@/components/ims/ims-page-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PackageCheck, PackageOpen, Package } from 'lucide-react';
import { useMyKit } from '@/hooks/ims/use-ims-kits';

const STATUS_LABEL: Record<string, string> = {
  open: 'Ready to collect',
  reopened: 'Re-opened for you',
  expired: 'Expired (flagged to billing)',
  closed: 'Completed',
};

export default function MyKitPage() {
  // MED-2 (#2000): enforce the self-view permission — without this guard the
  // route was reachable by any authenticated user (the permission was cosmetic).
  return (
    <ImsPageGuard module="ims.kits.my" action="view">
      <MyKitInner />
    </ImsPageGuard>
  );
}

function MyKitInner() {
  const { data: kit = [], isLoading } = useMyKit();

  const totalOwed = kit.reduce((s, k) => s + (k.owed > 0 && (k.status === 'open' || k.status === 'reopened') ? k.owed : 0), 0);

  return (
    <ContentLayout title="My Kit">
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Items in your kit:</span>
              <span className="font-semibold">{kit.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <PackageOpen className="h-5 w-5 text-amber-600" />
              <span className="text-sm text-muted-foreground">Still to collect:</span>
              <span className="font-semibold">{totalOwed}</span>
            </div>
            <p className="text-sm text-muted-foreground w-full">
              Collect from the store during announced windows. Bring your own app QR to
              collect — it&apos;s scanned at the counter to confirm the handover.
            </p>
          </CardContent>
        </Card>

        {isLoading && <p className="text-sm text-muted-foreground">Loading your kit…</p>}
        {!isLoading && kit.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No kit items assigned to you yet. When your group&apos;s kit is announced, it appears here.
            </CardContent>
          </Card>
        )}

        {kit.map((k) => (
          <Card key={k.entitlement_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
                <span>
                  {k.item_name}
                  {k.anchor_year_level ? <span className="text-muted-foreground font-normal"> · Year {k.anchor_year_level}</span> : null}
                </span>
                <Badge variant={k.status === 'open' || k.status === 'reopened' ? 'default' : 'secondary'}>
                  {STATUS_LABEL[k.status] ?? k.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-4 text-sm">
                <span>Entitled: <span className="font-medium">{k.qty_entitled}</span></span>
                <span>Collected: <span className="font-medium">{k.qty_collected}</span></span>
                <span className={k.owed > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                  Owed: {k.owed}
                </span>
              </div>
              {k.collections.length > 0 && (
                <div className="border-t pt-2 space-y-1">
                  {k.collections.map((c, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs text-muted-foreground ${c.voided ? 'line-through opacity-60' : ''}`}>
                      <PackageCheck className="h-3 w-3" />
                      {new Date(c.collected_at).toLocaleDateString()} — ×{c.qty}
                      {c.kind !== 'normal' && ` (${c.kind.replace('_', ' ')})`}
                      {' · collected by '}{c.collector_name}
                      {c.voided && ' · voided'}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </ContentLayout>
  );
}
