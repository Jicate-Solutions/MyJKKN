'use client';

// ============================================================================
// /admin/hr/assets — Director's HR Assets configuration + inventory UI
// ============================================================================
// Wave 1 — Workisy gap #6 (HR Assets cluster, Agent δ substrate).
//
// Two sections on one page:
//   (a) Category editor — reads/writes policy `hr.assets.category_definitions`
//       (JSONB shape: { categories: CategoryDef[] }). Director can add/remove
//       categories without a migration.
//   (b) Asset inventory — list of `hr_assets` rows with 5 KPI cards on top
//       (Total / Assigned / Not Assigned / Requested / Maintenance). "Add
//       Asset" modal writes to `hr_assets` table (Wave 1 substrate).
//
// Backed by:
//   - Table:    public.hr_assets               (Wave 1 migration)
//   - Table:    public.hr_asset_assignments    (Wave 1 migration)
//   - Policy:   hr.assets.category_definitions (seeded by Agent α)
//
// Permission: super_admin / admin only (PermissionGuard).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Database,
  Plus,
  Save,
  X,
  RotateCcw,
  Boxes,
  Package,
  PackageOpen,
  PackageSearch,
  Wrench,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
// Policy + types
// ---------------------------------------------------------------------------
// Note: not added to lib/policies/keys.ts yet — Agent α owns the seed and the
// canonical export. We reference the key as a string literal here per the
// substrate-first plan.
const HR_ASSETS_CATEGORY_POLICY_KEY = 'hr.assets.category_definitions';

// Built-in defaults rendered when the policy row is missing or empty.
// Mirrors what Agent α is seeding so the UI is functional even before the
// policy lands.
const DEFAULT_CATEGORIES: CategoryDef[] = [
  { key: 'laptop', label: 'Laptop', default_purchase_value: 80000, depreciation_months: 36, active: true },
  { key: 'mouse', label: 'Mouse', default_purchase_value: 800, depreciation_months: 24, active: true },
  { key: 'keyboard', label: 'Keyboard', default_purchase_value: 1500, depreciation_months: 24, active: true },
  { key: 'monitor', label: 'Monitor', default_purchase_value: 15000, depreciation_months: 48, active: true },
  { key: 'phone', label: 'Phone', default_purchase_value: 25000, depreciation_months: 24, active: true },
  { key: 'lab_equipment', label: 'Lab Equipment', default_purchase_value: 50000, depreciation_months: 60, active: true },
  { key: 'vehicle', label: 'Vehicle', default_purchase_value: 1500000, depreciation_months: 96, active: true },
];

interface CategoryDef {
  key: string;
  label: string;
  default_purchase_value: number;
  depreciation_months: number;
  active: boolean;
}

interface PolicyRow {
  id: string | null;
  policy_key: string;
  categories: CategoryDef[];
  updated_at: string | null;
}

interface AssetRow {
  id: string;
  asset_code: string;
  asset_name: string;
  category: string;
  purchase_date: string | null;
  purchase_value: number | null;
  current_status: 'available' | 'requested' | 'assigned' | 'in_use' | 'maintenance' | 'retired';
  institution_id: string;
  vendor: string | null;
  warranty_until: string | null;
  created_at: string;
}

interface InstitutionOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Page wrapper — gated by PermissionGuard.
// ---------------------------------------------------------------------------
export default function AdminHRAssetsPage() {
  return (
    <PermissionGuard module="users" action="manage">
      <ContentLayout title="HR Assets">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Assets' },
          ]}
        />
        <AssetsAdminContent />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------
function AssetsAdminContent() {
  const { isSuperAdmin } = usePermissions();
  const [policy, setPolicy] = useState<PolicyRow | null>(null);
  const [draftCategories, setDraftCategories] = useState<CategoryDef[] | null>(null);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [addAssetOpen, setAddAssetOpen] = useState(false);

  // ----- Initial load: policy + assets + institutions in parallel -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createClientSupabaseClient();

      // Policy load
      setPolicyLoading(true);
      try {
        const { data, error: pErr } = await sb
          .from('platform_policies')
          .select('id, policy_key, value, updated_at')
          .eq('policy_key', HR_ASSETS_CATEGORY_POLICY_KEY)
          .eq('scope_type', 'global')
          .is('scope_id', null)
          .maybeSingle();
        if (pErr) throw pErr;
        if (cancelled) return;

        const value = (data?.value || {}) as { categories?: CategoryDef[] };
        const cats = Array.isArray(value.categories) && value.categories.length > 0
          ? value.categories
          : DEFAULT_CATEGORIES;
        setPolicy({
          id: data?.id ?? null,
          policy_key: HR_ASSETS_CATEGORY_POLICY_KEY,
          categories: cats,
          updated_at: data?.updated_at ?? null,
        });
      } catch (e) {
        if (!cancelled) setPolicyError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setPolicyLoading(false);
      }

      // Assets load
      setAssetsLoading(true);
      try {
        const { data, error: aErr } = await sb
          .from('hr_assets')
          .select('id, asset_code, asset_name, category, purchase_date, purchase_value, current_status, institution_id, vendor, warranty_until, created_at')
          .order('created_at', { ascending: false })
          .limit(200);
        if (aErr) throw aErr;
        if (cancelled) return;
        setAssets((data ?? []) as AssetRow[]);
      } catch (e) {
        if (!cancelled) setAssetsError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }

      // Institutions
      try {
        const { data } = await sb.from('institutions').select('id, name').order('name');
        if (!cancelled) {
          setInstitutions((data ?? []) as InstitutionOption[]);
        }
      } catch {
        // silent — only used by Add Asset modal
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const categories = draftCategories ?? policy?.categories ?? DEFAULT_CATEGORIES;

  const policyDirty = useMemo(() => {
    if (!policy || !draftCategories) return false;
    return JSON.stringify(draftCategories) !== JSON.stringify(policy.categories);
  }, [policy, draftCategories]);

  // ----- KPIs -----
  const kpis = useMemo(() => {
    const counts = { total: assets.length, assigned: 0, available: 0, requested: 0, maintenance: 0 };
    for (const a of assets) {
      if (a.current_status === 'assigned' || a.current_status === 'in_use') counts.assigned++;
      else if (a.current_status === 'available') counts.available++;
      else if (a.current_status === 'requested') counts.requested++;
      else if (a.current_status === 'maintenance') counts.maintenance++;
    }
    return counts;
  }, [assets]);

  // ----- Category helpers -----
  function updateCategory(idx: number, patch: Partial<CategoryDef>) {
    const next = [...categories];
    next[idx] = { ...next[idx], ...patch };
    setDraftCategories(next);
  }

  function removeCategory(idx: number) {
    setDraftCategories(categories.filter((_, i) => i !== idx));
  }

  function appendCategory(c: CategoryDef) {
    setDraftCategories([...categories, c]);
  }

  function revertPolicy() {
    setDraftCategories(null);
  }

  async function savePolicy() {
    if (!policy) return;
    setSavingPolicy(true);
    try {
      const sb = createClientSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      const newValue = { categories };

      if (policy.id) {
        const { data, error: upErr } = await sb
          .from('platform_policies')
          .update({
            value: newValue,
            updated_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', policy.id)
          .select('id, policy_key, value, updated_at')
          .single();
        if (upErr) throw upErr;
        if (data) {
          const value = (data.value || {}) as { categories?: CategoryDef[] };
          setPolicy({
            id: data.id,
            policy_key: data.policy_key,
            categories: Array.isArray(value.categories) ? value.categories : [],
            updated_at: data.updated_at,
          });
        }
      } else {
        // Policy row doesn't exist yet — insert it.
        const { data, error: inErr } = await sb
          .from('platform_policies')
          .insert({
            policy_key: HR_ASSETS_CATEGORY_POLICY_KEY,
            scope_type: 'global',
            scope_id: null,
            value: newValue,
            description: 'HR Asset category definitions (Workisy gap #6). Director-editable via /admin/hr/assets.',
            data_type: 'object',
            is_system: false,
            updated_by: user?.id ?? null,
          })
          .select('id, policy_key, value, updated_at')
          .single();
        if (inErr) throw inErr;
        if (data) {
          const value = (data.value || {}) as { categories?: CategoryDef[] };
          setPolicy({
            id: data.id,
            policy_key: data.policy_key,
            categories: Array.isArray(value.categories) ? value.categories : [],
            updated_at: data.updated_at,
          });
        }
      }
      setDraftCategories(null);
      toast.success('Asset categories saved.');
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingPolicy(false);
    }
  }

  async function reloadAssets() {
    const sb = createClientSupabaseClient();
    const { data, error: aErr } = await sb
      .from('hr_assets')
      .select('id, asset_code, asset_name, category, purchase_date, purchase_value, current_status, institution_id, vendor, warranty_until, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (aErr) {
      toast.error(`Could not refresh assets: ${aErr.message}`);
      return;
    }
    setAssets((data ?? []) as AssetRow[]);
  }

  if (policyLoading && assetsLoading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      {/* Director banner */}
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>Director-edit zone</AlertTitle>
        <AlertDescription>
          Define the asset categories your HR officers will use, then maintain
          the institution-level inventory below. Categories live in a policy row
          (no deploy required); inventory rows live in <code>hr_assets</code>.
        </AlertDescription>
      </Alert>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard icon={<Boxes className="h-4 w-4" />} label="Total" value={kpis.total} />
        <KpiCard icon={<Package className="h-4 w-4" />} label="Assigned" value={kpis.assigned} />
        <KpiCard icon={<PackageOpen className="h-4 w-4" />} label="Not Assigned" value={kpis.available} />
        <KpiCard icon={<PackageSearch className="h-4 w-4" />} label="Requested" value={kpis.requested} />
        <KpiCard icon={<Wrench className="h-4 w-4" />} label="Maintenance" value={kpis.maintenance} />
      </div>

      {/* SECTION (a) — Category editor */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Asset Categories</CardTitle>
            <CardDescription>
              Policy key: <code className="text-xs">{HR_ASSETS_CATEGORY_POLICY_KEY}</code>{' '}
              &middot; Last updated:{' '}
              {policy?.updated_at ? format(new Date(policy.updated_at), 'MMM d, HH:mm') : '— (defaults)'}
            </CardDescription>
          </div>
          {isSuperAdmin && (
            <Button size="sm" variant="outline" onClick={() => setAddCatOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Category
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {policyError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{policyError}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((c, idx) => (
              <div key={`${c.key}-${idx}`} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.label}</div>
                    <div className="text-xs font-mono text-muted-foreground">{c.key}</div>
                  </div>
                  <Badge variant={c.active ? 'default' : 'secondary'} className="shrink-0">
                    {c.active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <Label className="text-xs">Default ₹</Label>
                    <Input
                      type="number"
                      value={c.default_purchase_value}
                      onChange={(e) => updateCategory(idx, { default_purchase_value: Number(e.target.value) })}
                      disabled={!isSuperAdmin || savingPolicy}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Depreciation (mo)</Label>
                    <Input
                      type="number"
                      value={c.depreciation_months}
                      onChange={(e) => updateCategory(idx, { depreciation_months: Number(e.target.value) })}
                      disabled={!isSuperAdmin || savingPolicy}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={c.active}
                      onCheckedChange={(v) => updateCategory(idx, { active: Boolean(v) })}
                      disabled={!isSuperAdmin || savingPolicy}
                    />
                    Active
                  </label>
                  {isSuperAdmin && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeCategory(idx)}
                      disabled={savingPolicy}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!policyDirty || savingPolicy}
              onClick={revertPolicy}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Revert
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!policyDirty || savingPolicy || !isSuperAdmin}
              onClick={savePolicy}
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {savingPolicy ? 'Saving…' : 'Save Categories'}
            </Button>
          </div>

          {!isSuperAdmin && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You can view asset categories but only <strong>super_admin</strong> can edit them.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* SECTION (b) — Asset inventory table */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Asset Inventory</CardTitle>
            <CardDescription>
              All asset records across institutions. Recent first; first 200 rows.
            </CardDescription>
          </div>
          {isSuperAdmin && (
            <Button size="sm" onClick={() => setAddAssetOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Asset
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {assetsError && (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{assetsError}</AlertDescription>
            </Alert>
          )}

          {assets.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              <Boxes className="mx-auto h-8 w-8 mb-2 opacity-60" />
              <p>No assets yet.</p>
              <p className="text-xs mt-1">
                Seed your categories above, then click <strong>Add Asset</strong> to create your first inventory row.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Value (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.asset_code}</TableCell>
                    <TableCell>{a.asset_name}</TableCell>
                    <TableCell>{a.category}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(a.current_status)}>{a.current_status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{a.vendor || '—'}</TableCell>
                    <TableCell className="text-right text-xs">
                      {a.purchase_value != null ? a.purchase_value.toLocaleString('en-IN') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Category dialog */}
      <AddCategoryDialog
        open={addCatOpen}
        onClose={() => setAddCatOpen(false)}
        onAdd={(c) => {
          appendCategory(c);
          setAddCatOpen(false);
        }}
      />

      {/* Add Asset dialog */}
      <AddAssetDialog
        open={addAssetOpen}
        onClose={() => setAddAssetOpen(false)}
        categories={categories.filter((c) => c.active)}
        institutions={institutions}
        onCreated={async () => {
          setAddAssetOpen(false);
          await reloadAssets();
          toast.success('Asset added.');
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
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
// Add Category dialog
// ---------------------------------------------------------------------------
function AddCategoryDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (c: CategoryDef) => void;
}) {
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [value, setValue] = useState(0);
  const [months, setMonths] = useState(36);

  useEffect(() => {
    if (!open) {
      setLabel(''); setKey(''); setValue(0); setMonths(36);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add asset category</DialogTitle>
          <DialogDescription>
            Director-defined category for HR officers to assign to assets.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="cat-label">Label</Label>
            <Input
              id="cat-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!key) setKey(e.target.value.trim().toLowerCase().replace(/\s+/g, '_'));
              }}
              placeholder="Lab Equipment"
            />
          </div>
          <div>
            <Label htmlFor="cat-key">Key (lower_snake_case)</Label>
            <Input
              id="cat-key"
              value={key}
              onChange={(e) => setKey(e.target.value.trim().toLowerCase().replace(/\s+/g, '_'))}
              placeholder="lab_equipment"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="cat-value">Default ₹</Label>
              <Input id="cat-value" type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="cat-months">Depreciation (mo)</Label>
              <Input id="cat-months" type="number" value={months} onChange={(e) => setMonths(Number(e.target.value))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!label.trim() || !key.trim()}
            onClick={() => {
              onAdd({
                key: key.trim(),
                label: label.trim(),
                default_purchase_value: value,
                depreciation_months: months,
                active: true,
              });
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Add Asset dialog
// ---------------------------------------------------------------------------
function AddAssetDialog({
  open,
  onClose,
  categories,
  institutions,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryDef[];
  institutions: InstitutionOption[];
  onCreated: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('');
  const [institutionId, setInstitutionId] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>('');
  const [purchaseValue, setPurchaseValue] = useState<number>(0);
  const [vendor, setVendor] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setCode(''); setName(''); setCategory(''); setInstitutionId('');
      setPurchaseDate(''); setPurchaseValue(0); setVendor(''); setSaving(false);
    }
  }, [open]);

  // When category picked, pre-fill default purchase value
  useEffect(() => {
    const c = categories.find((x) => x.key === category);
    if (c) setPurchaseValue(c.default_purchase_value);
  }, [category, categories]);

  async function create() {
    if (!code.trim() || !name.trim() || !category || !institutionId) {
      toast.error('Code, name, category, and institution are required.');
      return;
    }
    setSaving(true);
    try {
      const sb = createClientSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      const { error: insErr } = await sb.from('hr_assets').insert({
        asset_code: code.trim(),
        asset_name: name.trim(),
        category,
        purchase_date: purchaseDate || null,
        purchase_value: purchaseValue || null,
        vendor: vendor.trim() || null,
        institution_id: institutionId,
        current_status: 'available',
        created_by: user?.id ?? null,
      });
      if (insErr) throw insErr;
      onCreated();
    } catch (e) {
      toast.error(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add asset</DialogTitle>
          <DialogDescription>
            Inventory row in <code>hr_assets</code>. Lands as <strong>available</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="a-code">Code</Label>
              <Input id="a-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="LAP-001" />
            </div>
            <div>
              <Label htmlFor="a-name">Name</Label>
              <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} placeholder='MacBook Pro 14"' />
            </div>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Institution</Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger><SelectValue placeholder="Choose institution" /></SelectTrigger>
              <SelectContent>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="a-date">Purchase date</Label>
              <Input id="a-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="a-value">Purchase ₹</Label>
              <Input id="a-value" type="number" value={purchaseValue} onChange={(e) => setPurchaseValue(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label htmlFor="a-vendor">Vendor</Label>
            <Input id="a-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Apple India" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={create} disabled={saving}>
            {saving ? 'Adding…' : 'Add Asset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
