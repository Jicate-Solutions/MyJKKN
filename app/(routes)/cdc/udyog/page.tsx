'use client';

// UNNATI → UDYOG apply-tracker (BUG-004075) — CDC-staff surface.
// Learners enrolled in an UNNATI programme are auto-tracked here (a DB trigger
// raises a 'required' row on enrollment). Staff direct them to the external UDYOG
// site and record the student's self-reported application/reference number, which
// is REQUIRED to mark the requirement 'applied'.
//
// Note: there is no student-facing CDC portal in MyJKKN today, so v1 records the
// student's reference number through this staff surface. A learner self-service
// surface is a follow-up once a learner CDC portal exists (the RLS already lets a
// learner read their own requirement).

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useUdyogRequirements, useUpdateUdyogRequirement, useSetUdyogPortalUrl,
} from '@/hooks/cdc/use-cdc-udyog';
import {
  ExternalLink, CheckCircle2, Loader2, Link2, Save, ShieldQuestion, GraduationCap,
} from 'lucide-react';
import type { UdyogRequirementRow, UdyogStatus } from '@/types/cdc/udyog';

const STATUS_META: Record<UdyogStatus, { label: string; cls: string }> = {
  required:  { label: 'Required',  cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  directed:  { label: 'Directed',  cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  applied:   { label: 'Applied',   cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  waived:    { label: 'Waived',    cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function learnerName(r: UdyogRequirementRow): string {
  const n = [r.learner?.first_name, r.learner?.last_name].filter(Boolean).join(' ').trim();
  return n || 'Unknown learner';
}

function CdcUdyogContent() {
  const { can } = usePermissions();
  const canManage = can('cdc.udyog.manage');
  const { data, isLoading } = useUdyogRequirements();
  const update = useUpdateUdyogRequirement();
  const setPortalUrl = useSetUdyogPortalUrl();

  const requirements = data?.requirements ?? [];
  const portalUrl = data?.portalUrl ?? '';

  const [urlDraft, setUrlDraft] = useState<string | null>(null); // null = not editing
  const [applyFor, setApplyFor] = useState<UdyogRequirementRow | null>(null);
  const [reference, setReference] = useState('');
  const [waiveFor, setWaiveFor] = useState<UdyogRequirementRow | null>(null);
  const [waiveReason, setWaiveReason] = useState('');

  function handleDirect(r: UdyogRequirementRow) {
    if (portalUrl) window.open(portalUrl, '_blank', 'noopener,noreferrer');
    update.mutate({ id: r.id, action: 'direct' });
  }
  async function submitApply() {
    if (!applyFor || !reference.trim()) return;
    await update.mutateAsync({ id: applyFor.id, action: 'apply', udyog_reference: reference.trim() });
    setApplyFor(null); setReference('');
  }
  async function submitWaive() {
    if (!waiveFor) return;
    await update.mutateAsync({ id: waiveFor.id, action: 'waive', waived_reason: waiveReason.trim() });
    setWaiveFor(null); setWaiveReason('');
  }

  const counts = requirements.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
  }, {});

  return (
    <ContentLayout title="UDYOG Application Tracker">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'CDC', href: '/cdc' },
        { label: 'UDYOG Tracker' },
      ]} />

      <div className="max-w-5xl space-y-4 mt-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" /> UDYOG Application Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Learners enrolled in an <strong>UNNATI</strong> training programme must apply on the external
            UDYOG portal. They appear here automatically. Direct them to the portal, then record the
            application reference number they report — the number is required to mark a learner as applied.
          </p>
        </div>

        {/* Portal URL config */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Link2 className="w-4 h-4" /> UDYOG portal link</CardTitle>
            <CardDescription>The external website UNNATI learners are sent to. Set by CDC; no code change needed.</CardDescription>
          </CardHeader>
          <CardContent>
            {urlDraft === null ? (
              <div className="flex items-center gap-3 flex-wrap">
                {portalUrl ? (
                  <a href={portalUrl} target="_blank" rel="noopener noreferrer"
                     className="text-sm text-primary underline inline-flex items-center gap-1 break-all">
                    {portalUrl} <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-sm text-amber-700">Not set yet — learners can&apos;t be directed until a URL is saved.</span>
                )}
                {canManage && (
                  <Button size="sm" variant="outline" onClick={() => setUrlDraft(portalUrl)}>Edit</Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://udyog.example.gov.in"
                  className="max-w-md"
                />
                <Button size="sm" disabled={setPortalUrl.isPending}
                  onClick={async () => { await setPortalUrl.mutateAsync(urlDraft.trim()); setUrlDraft(null); }}>
                  {setPortalUrl.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setUrlDraft(null)}>Cancel</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary chips */}
        {requirements.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(['required', 'directed', 'applied', 'waived', 'cancelled'] as UdyogStatus[]).map((s) =>
              counts[s] ? (
                <Badge key={s} variant="outline" className={STATUS_META[s].cls}>
                  {STATUS_META[s].label}: {counts[s]}
                </Badge>
              ) : null,
            )}
          </div>
        )}

        {/* Requirements */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              UNNATI learners {!isLoading && `(${requirements.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
              </div>
            ) : requirements.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No UDYOG requirements yet. They are created automatically when learners enrol in an UNNATI programme.
              </div>
            ) : (
              <div className="divide-y">
                {requirements.map((r) => {
                  const meta = STATUS_META[r.status];
                  const open = r.status === 'required' || r.status === 'directed';
                  return (
                    <div key={r.id} className="flex items-start justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{learnerName(r)}</span>
                          <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.learner?.register_number && `${r.learner.register_number} · `}
                          {r.programme?.name ?? 'UNNATI programme'}
                        </p>
                        {r.status === 'applied' && r.udyog_reference && (
                          <p className="text-xs text-emerald-700 mt-0.5 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Ref: <span className="font-mono">{r.udyog_reference}</span>
                          </p>
                        )}
                        {r.status === 'waived' && (
                          <p className="text-xs text-muted-foreground mt-0.5">Waived{r.waived_reason ? ` — ${r.waived_reason}` : ''}</p>
                        )}
                      </div>
                      {canManage && open && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button size="sm" variant="outline" disabled={!portalUrl || update.isPending}
                            title={portalUrl ? 'Open the UDYOG portal and mark as directed' : 'Set the UDYOG portal URL first'}
                            onClick={() => handleDirect(r)}>
                            <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open portal
                          </Button>
                          <Button size="sm" disabled={update.isPending}
                            onClick={() => { setApplyFor(r); setReference(''); }}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark applied
                          </Button>
                          <Button size="sm" variant="ghost" disabled={update.isPending}
                            onClick={() => { setWaiveFor(r); setWaiveReason(''); }}>
                            Waive
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mark-applied dialog — reference number REQUIRED */}
      <Dialog open={!!applyFor} onOpenChange={(o) => { if (!o) { setApplyFor(null); setReference(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record UDYOG application</DialogTitle>
            <DialogDescription>
              Enter the application / reference number {applyFor ? learnerName(applyFor) : 'the learner'} received from UDYOG.
              This is required to mark the learner as applied (it is self-reported and not auto-verified).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="udyog-ref">UDYOG reference number</Label>
            <Input id="udyog-ref" value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. UDY-2026-000123" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setApplyFor(null); setReference(''); }}>Cancel</Button>
            <Button disabled={!reference.trim() || update.isPending} onClick={submitApply}>
              {update.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Mark applied
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Waive dialog */}
      <Dialog open={!!waiveFor} onOpenChange={(o) => { if (!o) { setWaiveFor(null); setWaiveReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldQuestion className="w-4 h-4" /> Waive UDYOG requirement</DialogTitle>
            <DialogDescription>
              Waive this requirement for {waiveFor ? learnerName(waiveFor) : 'the learner'} (e.g. already placed, medical).
              This does not count as non-compliance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="waive-reason">Reason (optional)</Label>
            <Input id="waive-reason" value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)}
              placeholder="Reason for waiving" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setWaiveFor(null); setWaiveReason(''); }}>Cancel</Button>
            <Button variant="outline" disabled={update.isPending} onClick={submitWaive}>
              {update.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Waive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}

export default function CdcUdyogPage() {
  return (
    <PermissionGuard module="cdc.udyog" action="view">
      <CdcUdyogContent />
    </PermissionGuard>
  );
}
