'use client';

// Store Kits — billing value report (decisions 11/15/21).
// Uncollected-expired kit value (refund math input) + collected value per
// person, all at cost-price snapshots. Read-only accounts surface.

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { ImsPageGuard } from '@/components/ims/ims-page-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useKitBillingFlags, useKitInstitutions } from '@/hooks/ims/use-ims-kits';

export default function KitBillingFlagsPage() {
  return (
    <ImsPageGuard module="ims.kits.billing_flags" action="view">
      <ContentLayout title="Store Kits — Billing Flags">
        <BillingInner />
      </ContentLayout>
    </ImsPageGuard>
  );
}

function BillingInner() {
  const { data: institutions = [] } = useKitInstitutions();
  const [institutionId, setInstitutionId] = useState('');
  const { data: rows = [], isLoading } = useKitBillingFlags(institutionId || undefined);

  const totalUncollected = rows.reduce((s, r) => s + Number(r.uncollected_value || 0), 0);
  const totalCollected = rows.reduce((s, r) => s + Number(r.collected_value || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label>College</Label>
          <Select value={institutionId} onValueChange={setInstitutionId}>
            <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Pick a college to load" /></SelectTrigger>
            <SelectContent>
              {institutions.map((i: { id: string; name: string }) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {institutionId && !isLoading && (
          <div className="text-sm text-muted-foreground">
            Uncollected (flagged) value: <span className="font-medium text-foreground">₹{totalUncollected.toFixed(2)}</span>
            {' · '}Collected value: <span className="font-medium text-foreground">₹{totalCollected.toFixed(2)}</span>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Collected value (₹)</TableHead>
                <TableHead className="text-right">Uncollected flagged (₹)</TableHead>
                <TableHead>Flagged at</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!institutionId && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Pick a college above.</TableCell></TableRow>
              )}
              {institutionId && isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {institutionId && !isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No kit value records for this college.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.entitlement_id}>
                  <TableCell className="font-medium">{r.item_name}</TableCell>
                  <TableCell className="font-mono text-xs">{r.learner_id ?? r.staff_id}</TableCell>
                  <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                  <TableCell className="text-right">{Number(r.collected_value).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {Number(r.uncollected_value) > 0
                      ? <span className="text-amber-600 font-medium">{Number(r.uncollected_value).toFixed(2)}</span>
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.flagged_at ? new Date(r.flagged_at).toLocaleDateString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
