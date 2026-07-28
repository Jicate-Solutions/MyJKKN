'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Settings2,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Loader2,
  Building2,
  CircleDot,
  CircleOff,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import {
  useLaundryConfigs,
  useDeleteLaundryConfig,
} from '@/hooks/campus-living/use-hostel-laundry';
import type { HostelLaundryConfig } from '@/lib/services/campus-living/laundry-service';
import { ConfigEditorDialog } from './_components/config-editor-dialog';

/**
 * navMeta — invoked from the parent laundry page. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/campus-living/laundry',
} as const;

// ISO weekday labels — matches the int[] values stored in
// hostel_laundry_configs.collection_days / .delivery_days
// (prod default: collection={1,4}=Mon/Thu, delivery={3,6}=Wed/Sat).
const WEEKDAY_SHORT: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

function formatDays(days: number[] | null | undefined): string {
  if (!days || days.length === 0) return '—';
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d] ?? String(d))
    .join(', ');
}

function formatCost(cost: number | string | null | undefined): string {
  if (cost == null || cost === '') return '—';
  const n = typeof cost === 'string' ? Number(cost) : cost;
  if (Number.isNaN(n)) return '—';
  return `₹${n.toFixed(2)}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

export default function LaundrySettingsPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const { data: blocksData } = useHostelBlocks(institutionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: Array<any> = blocksData?.data ?? [];

  const blockNameById = (id: string | null | undefined): string => {
    if (!id) return 'All blocks (default)';
    const b = blocks.find((x) => x.id === id);
    return b?.name ?? id.slice(0, 8) + '…';
  };

  const { data, isLoading } = useLaundryConfigs(institutionId);
  const configs = data?.data ?? [];

  const deleteMutation = useDeleteLaundryConfig();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingConfig, setEditingConfig] =
    useState<HostelLaundryConfig | null>(null);

  const openNew = () => {
    setEditingConfig(null);
    setEditorOpen(true);
  };

  const openEdit = (cfg: HostelLaundryConfig) => {
    setEditingConfig(cfg);
    setEditorOpen(true);
  };

  const handleDelete = async (cfg: HostelLaundryConfig) => {
    const ok = window.confirm(
      `Delete laundry configuration for "${blockNameById(cfg.block_id)}"? This cannot be undone.`
    );
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(cfg.id);
    } catch {
      // toast handled in hook
    }
  };

  const activeCount = configs.filter((c) => c.is_active).length;
  const vendorCount = configs.filter((c) => c.service_type === 'vendor').length;
  const inHouseCount = configs.filter((c) => c.service_type === 'in_house').length;

  return (
    <ContentLayout title="Laundry Settings">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Laundry', href: '/campus-living/laundry' },
          { label: 'Settings' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings2 className="h-6 w-6 text-primary" />
              Laundry Settings
            </h1>
            <p className="text-muted-foreground">
              Configure service models, pricing, weekly cadence and vendor
              contracts for each hostel block.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/laundry">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Laundry
              </Link>
            </Button>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              New configuration
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Configurations</p>
              <p className="text-2xl font-bold">{configs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">{activeCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Vendor</p>
              <p className="text-2xl font-bold">{vendorCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">In-house</p>
              <p className="text-2xl font-bold">{inHouseCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Configurations table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : configs.length === 0 ? (
              <div className="py-16 text-center">
                <Settings2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No laundry configurations yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add a configuration to define vendor contracts, pricing and
                  weekly cadence per block.
                </p>
                <Button onClick={openNew}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create first configuration
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Block</TableHead>
                    <TableHead>Service model</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Collection days</TableHead>
                    <TableHead>Delivery days</TableHead>
                    <TableHead>Max items / cycle</TableHead>
                    <TableHead>Cost / item</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.map((cfg) => (
                    <TableRow key={cfg.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {blockNameById(cfg.block_id)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {cfg.service_type === 'vendor' ? (
                          <Badge variant="outline">Vendor</Badge>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                            In-house
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {cfg.vendor_name ? (
                          <div>
                            <div className="font-medium text-sm">
                              {cfg.vendor_name}
                            </div>
                            {cfg.vendor_phone ? (
                              <div className="text-xs text-muted-foreground">
                                {cfg.vendor_phone}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDays(cfg.collection_days)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDays(cfg.delivery_days)}
                      </TableCell>
                      <TableCell>{cfg.max_items_per_student ?? '—'}</TableCell>
                      <TableCell>
                        {cfg.is_included_in_fees ? (
                          <Badge variant="secondary">In fees</Badge>
                        ) : (
                          formatCost(cfg.cost_per_item)
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {cfg.vendor_contract_start || cfg.vendor_contract_end ? (
                          <>
                            {formatDate(cfg.vendor_contract_start)} →{' '}
                            {formatDate(cfg.vendor_contract_end)}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {cfg.is_active ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            <CircleDot className="mr-1 h-3 w-3" /> Active
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <CircleOff className="mr-1 h-3 w-3" /> Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(cfg)}
                            aria-label="Edit configuration"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(cfg)}
                            disabled={deleteMutation.isPending}
                            aria-label="Delete configuration"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfigEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        institutionId={institutionId}
        config={editingConfig}
      />
    </ContentLayout>
  );
}
