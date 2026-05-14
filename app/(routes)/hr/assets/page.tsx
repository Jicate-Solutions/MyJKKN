'use client';

// ============================================================================
// /hr/assets — Operational HR Assets surface
// ============================================================================
// Wave 1 — Workisy gap #6 (Agent δ).
//
// Two views on one page, role-adapted:
//   * Staff view:        "My Assets" — assignments where staff_id = me
//                        AND status='assigned' AND returned_at IS NULL.
//                        Plus "Request Asset" button → opens modal to request
//                        from the institution's available pool.
//   * HR officer view:   Institution-wide asset table + same 5 KPI cards as
//                        the admin page (Total / Assigned / Not Assigned /
//                        Requested / Maintenance). Pending requests inline.
//
// Both views read from the same `hr_assets` + `hr_asset_assignments` tables.
// RLS filters rows server-side (super_admin/admin global, HR officer
// institution-scoped, staff own-only).
//
// Empty state: when no assets visible AND no assignments — render guidance
// pointing at /admin/hr/assets for the director.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Package,
  PackageOpen,
  PackageSearch,
  Wrench,
  Plus,
  Send,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';

// ---------------------------------------------------------------------------
// Types (shape mirrors /admin/hr/assets but only what this page consumes)
// ---------------------------------------------------------------------------
interface AssetRow {
  id: string;
  asset_code: string;
  asset_name: string;
  category: string;
  current_status: 'available' | 'requested' | 'assigned' | 'in_use' | 'maintenance' | 'retired';
  institution_id: string;
  vendor: string | null;
  purchase_value: number | null;
}

interface AssignmentRow {
  id: string;
  asset_id: string;
  staff_id: string;
  status: 'requested' | 'approved' | 'assigned' | 'returned' | 'rejected';
  requested_at: string;
  assigned_at: string | null;
  returned_at: string | null;
  notes: string | null;
  asset?: AssetRow;
}

interface StaffRow {
  id: string;
  full_name: string | null;
  profile_id: string | null;
  institution_id: string | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function HRAssetsPage() {
  return (
    <ContentLayout title="My Assets">
      <PageBreadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'HR', href: '/hr' },
          { label: 'Assets' },
        ]}
      />
      <HRAssetsContent />
    </ContentLayout>
  );
}

function HRAssetsContent() {
  const { isSuperAdmin, permissions } = usePermissions();
  const isHROfficer = isSuperAdmin || Boolean(permissions?.['hr.employees.view']);

  const [me, setMe] = useState<StaffRow | null>(null);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [myAssignments, setMyAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sb = createClientSupabaseClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) throw new Error('Not signed in.');

        // Resolve me → staff row
        const { data: staffRow } = await sb
          .from('staff')
          .select('id, full_name, profile_id, institution_id')
          .eq('profile_id', user.id)
          .maybeSingle();

        if (cancelled) return;
        setMe((staffRow ?? null) as StaffRow | null);

        // Load assets (RLS filters to institution-scope or own-staff)
        const { data: assetRows, error: aErr } = await sb
          .from('hr_assets')
          .select('id, asset_code, asset_name, category, current_status, institution_id, vendor, purchase_value')
          .order('created_at', { ascending: false })
          .limit(200);
        if (aErr) throw aErr;
        if (cancelled) return;
        setAssets((assetRows ?? []) as AssetRow[]);

        // Load my assignments (RLS allows own staff_id)
        if (staffRow?.id) {
          const { data: aRows, error: assignErr } = await sb
            .from('hr_asset_assignments')
            .select('id, asset_id, staff_id, status, requested_at, assigned_at, returned_at, notes')
            .eq('staff_id', staffRow.id)
            .order('requested_at', { ascending: false })
            .limit(50);
          if (assignErr) throw assignErr;
          if (cancelled) return;

          const enriched: AssignmentRow[] = (aRows ?? []).map((r: any) => ({
            ...r,
            asset: (assetRows ?? []).find((a: any) => a.id === r.asset_id),
          }));
          setMyAssignments(enriched);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // KPIs (institution-wide subset visible per RLS)
  const kpis = useMemo(() => {
    const c = { total: assets.length, assigned: 0, available: 0, requested: 0, maintenance: 0 };
    for (const a of assets) {
      if (a.current_status === 'assigned' || a.current_status === 'in_use') c.assigned++;
      else if (a.current_status === 'available') c.available++;
      else if (a.current_status === 'requested') c.requested++;
      else if (a.current_status === 'maintenance') c.maintenance++;
    }
    return c;
  }, [assets]);

  const myActiveAssignments = myAssignments.filter(
    (r) => r.status === 'assigned' && !r.returned_at,
  );
  const myPendingRequests = myAssignments.filter(
    (r) => r.status === 'requested' || r.status === 'approved',
  );

  const availablePool = assets.filter((a) => a.current_status === 'available');

  async function reload() {
    const sb = createClientSupabaseClient();
    const { data: assetRows } = await sb
      .from('hr_assets')
      .select('id, asset_code, asset_name, category, current_status, institution_id, vendor, purchase_value')
      .order('created_at', { ascending: false })
      .limit(200);
    setAssets((assetRows ?? []) as AssetRow[]);
    if (me?.id) {
      const { data: aRows } = await sb
        .from('hr_asset_assignments')
        .select('id, asset_id, staff_id, status, requested_at, assigned_at, returned_at, notes')
        .eq('staff_id', me.id)
        .order('requested_at', { ascending: false })
        .limit(50);
      const enriched: AssignmentRow[] = (aRows ?? []).map((r: any) => ({
        ...r,
        asset: (assetRows ?? []).find((a: any) => a.id === r.asset_id),
      }));
      setMyAssignments(enriched);
    }
  }

  if (loading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-5 gap-3"><Skeleton className="h-20 col-span-5" /></div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load assets</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // Empty state — no assets visible AND no assignments
  if (assets.length === 0 && myAssignments.length === 0) {
    return (
      <div className="mt-6">
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Boxes className="mx-auto h-10 w-10 mb-3 opacity-60" />
            <p className="font-medium text-foreground">No assets assigned.</p>
            <p className="mt-2">
              Director seeds categories at{' '}
              <code className="text-xs">/admin/hr/assets</code>, then HR officer
              adds asset records. Once available, you can request from this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      {/* Staff section: My Assets */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>My Assets</CardTitle>
            <CardDescription>
              Assets currently assigned to you. Pending requests show below.
            </CardDescription>
          </div>
          {me?.id && availablePool.length > 0 && (
            <Button size="sm" onClick={() => setRequestOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Request Asset
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {myActiveAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              You have no active asset assignments.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Assigned on</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myActiveAssignments.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.asset?.asset_code ?? '—'}</TableCell>
                    <TableCell>{r.asset?.asset_name ?? '—'}</TableCell>
                    <TableCell>{r.asset?.category ?? '—'}</TableCell>
                    <TableCell className="text-xs">
                      {r.assigned_at ? format(new Date(r.assigned_at), 'MMM d, yyyy') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {myPendingRequests.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                Pending requests
              </h4>
              <div className="flex flex-wrap gap-2">
                {myPendingRequests.map((r) => (
                  <Badge key={r.id} variant="outline" className="text-xs">
                    {r.asset?.asset_name ?? r.asset_id} · {r.status}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* HR officer section — only if user has hr.employees.view */}
      {isHROfficer && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiCard icon={<Boxes className="h-4 w-4" />} label="Total" value={kpis.total} />
            <KpiCard icon={<Package className="h-4 w-4" />} label="Assigned" value={kpis.assigned} />
            <KpiCard icon={<PackageOpen className="h-4 w-4" />} label="Not Assigned" value={kpis.available} />
            <KpiCard icon={<PackageSearch className="h-4 w-4" />} label="Requested" value={kpis.requested} />
            <KpiCard icon={<Wrench className="h-4 w-4" />} label="Maintenance" value={kpis.maintenance} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Institution Asset Inventory</CardTitle>
              <CardDescription>
                Assets in your institution scope. RLS filters to what you can see.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assets.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No assets in your institution. Add via{' '}
                  <code className="text-xs">/admin/hr/assets</code>.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Vendor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assets.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-xs">{a.asset_code}</TableCell>
                        <TableCell>{a.asset_name}</TableCell>
                        <TableCell>{a.category}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(a.current_status)}>
                            {a.current_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{a.vendor || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Request Asset dialog */}
      <RequestAssetDialog
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        availablePool={availablePool}
        staffId={me?.id ?? null}
        onCreated={async () => {
          setRequestOpen(false);
          await reload();
          toast.success('Asset request submitted.');
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------
function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function statusVariant(s: AssetRow['current_status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (s) {
    case 'assigned':
    case 'in_use':
      return 'default';
    case 'available':
      return 'secondary';
    case 'requested':
      return 'outline';
    case 'maintenance':
    case 'retired':
      return 'destructive';
    default:
      return 'secondary';
  }
}

// ---------------------------------------------------------------------------
// Request Asset dialog (staff-side)
// ---------------------------------------------------------------------------
function RequestAssetDialog({
  open,
  onClose,
  availablePool,
  staffId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  availablePool: AssetRow[];
  staffId: string | null;
  onCreated: () => void;
}) {
  const [assetId, setAssetId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setAssetId(''); setNotes(''); setSaving(false);
    }
  }, [open]);

  async function submit() {
    if (!staffId) {
      toast.error('Could not resolve your staff record. Contact HR.');
      return;
    }
    if (!assetId) {
      toast.error('Choose an asset to request.');
      return;
    }
    setSaving(true);
    try {
      const sb = createClientSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      const { error: insErr } = await sb.from('hr_asset_assignments').insert({
        asset_id: assetId,
        staff_id: staffId,
        status: 'requested',
        requested_at: new Date().toISOString(),
        requested_by: user?.id ?? null,
        notes: notes.trim() || null,
      });
      if (insErr) throw insErr;
      onCreated();
    } catch (e) {
      toast.error(`Request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request asset</DialogTitle>
          <DialogDescription>
            HR officer will review and approve. You will see status updates here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Available asset</Label>
            <Select value={assetId} onValueChange={setAssetId}>
              <SelectTrigger><SelectValue placeholder="Choose from available pool" /></SelectTrigger>
              <SelectContent>
                {availablePool.length === 0 ? (
                  <SelectItem value="__none__" disabled>No assets available</SelectItem>
                ) : (
                  availablePool.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.asset_code} — {a.asset_name} ({a.category})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="req-notes">Notes (optional)</Label>
            <Textarea
              id="req-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason or context for the request"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !assetId}>
            <Send className="h-3.5 w-3.5 mr-1" />
            {saving ? 'Submitting…' : 'Submit request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
