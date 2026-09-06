'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CalendarClock,
  ArrowLeft,
  Loader2,
  Truck,
  PackageCheck,
  Settings2,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { useLaundryConfigs } from '@/hooks/campus-living/use-hostel-laundry';
import type { HostelLaundryConfig } from '@/lib/services/campus-living/laundry-service';
import { ConfigEditorDialog } from '../settings/_components/config-editor-dialog';

/**
 * navMeta — invoked from the parent laundry page. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/campus-living/laundry',
} as const;

// ISO weekday values matching hostel_laundry_configs.collection_days /
// .delivery_days (int[] columns; 1 = Monday … 7 = Sunday on prod).
const WEEKDAYS = [
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
  { value: 7, short: 'Sun', label: 'Sunday' },
];

interface BlockRow {
  block_id: string | null;
  block_name: string;
  configs: HostelLaundryConfig[];
}

export default function LaundrySchedulePage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const { data: blocksData, isLoading: blocksLoading } =
    useHostelBlocks(institutionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: Array<any> = useMemo(() => blocksData?.data ?? [], [blocksData]);

  const { data: configsData, isLoading: configsLoading } = useLaundryConfigs(
    institutionId,
    { is_active: true }
  );
  const configs = useMemo<HostelLaundryConfig[]>(
    () => configsData?.data ?? [],
    [configsData]
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingConfig, setEditingConfig] =
    useState<HostelLaundryConfig | null>(null);

  // Group configs by block_id. A config with null block_id is a global default
  // shown at the top; per-block configs follow in block-name order.
  const rows: BlockRow[] = useMemo(() => {
    const byBlock = new Map<string | null, HostelLaundryConfig[]>();
    for (const cfg of configs) {
      const key = cfg.block_id ?? null;
      const list = byBlock.get(key) ?? [];
      list.push(cfg);
      byBlock.set(key, list);
    }

    const result: BlockRow[] = [];
    if (byBlock.has(null)) {
      result.push({
        block_id: null,
        block_name: 'All blocks (default)',
        configs: byBlock.get(null) ?? [],
      });
    }
    const blockRows: BlockRow[] = blocks
      .map((b) => ({
        block_id: b.id as string,
        block_name: (b.name as string) || 'Unnamed block',
        configs: byBlock.get(b.id) ?? [],
      }))
      .filter((r) => r.configs.length > 0)
      .sort((a, b) => a.block_name.localeCompare(b.block_name));
    result.push(...blockRows);
    return result;
  }, [blocks, configs]);

  const totals = useMemo(() => {
    let collectSlots = 0;
    let deliverSlots = 0;
    for (const cfg of configs) {
      collectSlots += (cfg.collection_days ?? []).length;
      deliverSlots += (cfg.delivery_days ?? []).length;
    }
    return {
      activeConfigs: configs.length,
      collectSlots,
      deliverSlots,
    };
  }, [configs]);

  const isLoading = blocksLoading || configsLoading;

  const openEditConfig = (cfg: HostelLaundryConfig) => {
    setEditingConfig(cfg);
    setEditorOpen(true);
  };

  const renderCell = (row: BlockRow, day: number) => {
    // For a given (block, weekday) intersect against each active config to
    // see whether collection, delivery, both or neither lands here. If more
    // than one config covers the same block (shouldn't happen but is allowed
    // by schema), all hits stack vertically.
    const hits = row.configs
      .map((cfg) => {
        const isCollect = (cfg.collection_days ?? []).includes(day);
        const isDeliver = (cfg.delivery_days ?? []).includes(day);
        return { cfg, isCollect, isDeliver };
      })
      .filter((h) => h.isCollect || h.isDeliver);

    if (hits.length === 0) {
      return <span className="text-muted-foreground/40 text-xs">—</span>;
    }

    return (
      <div className="flex flex-col gap-1">
        {hits.map(({ cfg, isCollect, isDeliver }) => (
          <button
            key={cfg.id}
            type="button"
            onClick={() => openEditConfig(cfg)}
            className="text-left rounded-md border bg-background hover:bg-muted px-2 py-1 transition-colors"
            title={cfg.vendor_name || (cfg.service_type === 'in_house' ? 'In-house' : 'Vendor')}
          >
            <div className="flex flex-wrap gap-1">
              {isCollect ? (
                <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 text-[10px] py-0">
                  <Truck className="mr-1 h-3 w-3" />
                  Collect
                </Badge>
              ) : null}
              {isDeliver ? (
                <Badge className="bg-green-100 text-green-900 hover:bg-green-100 text-[10px] py-0">
                  <PackageCheck className="mr-1 h-3 w-3" />
                  Deliver
                </Badge>
              ) : null}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 truncate">
              {cfg.vendor_name ||
                (cfg.service_type === 'in_house' ? 'In-house' : 'Vendor')}
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <ContentLayout title="Laundry Schedule">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Laundry', href: '/campus-living/laundry' },
          { label: 'Schedule' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarClock className="h-6 w-6 text-primary" />
              Laundry Schedule
            </h1>
            <p className="text-muted-foreground">
              Weekly view of collection and delivery days for every active
              configuration, grouped by hostel block.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/laundry">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Laundry
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/campus-living/laundry/settings">
                <Settings2 className="mr-2 h-4 w-4" />
                Manage configurations
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Active configurations</p>
              <p className="text-2xl font-bold">{totals.activeConfigs}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Weekly collection slots
              </p>
              <p className="text-2xl font-bold">{totals.collectSlots}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Weekly delivery slots
              </p>
              <p className="text-2xl font-bold">{totals.deliverSlots}</p>
            </CardContent>
          </Card>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="text-muted-foreground">Legend:</span>
          <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
            <Truck className="mr-1 h-3 w-3" /> Collect
          </Badge>
          <Badge className="bg-green-100 text-green-900 hover:bg-green-100">
            <PackageCheck className="mr-1 h-3 w-3" /> Deliver
          </Badge>
          <span className="text-muted-foreground ml-2">
            Tap a slot to edit the underlying configuration.
          </span>
        </div>

        {/* Weekly grid */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center">
                <CalendarClock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No active schedules yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add a laundry configuration with collection / delivery days to
                  see the weekly grid here.
                </p>
                <Button asChild>
                  <Link href="/campus-living/laundry/settings">
                    <Plus className="mr-2 h-4 w-4" />
                    Add configuration
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium w-48">Block</th>
                      {WEEKDAYS.map((d) => (
                        <th
                          key={d.value}
                          className="text-left p-3 font-medium min-w-[110px]"
                        >
                          {d.short}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.block_id ?? 'global'}
                        className="border-b last:border-0 align-top"
                      >
                        <td className="p-3 font-medium">{row.block_name}</td>
                        {WEEKDAYS.map((d) => (
                          <td
                            key={`${row.block_id ?? 'global'}-${d.value}`}
                            className="p-2"
                          >
                            {renderCell(row, d.value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
