'use client';

/**
 * Maintenance SLA — /campus-living/settings/maintenance-sla
 *
 * Wired 2026-04-24 (Agent D — settings real-save). Before today the
 * category x priority SLA grid had NO persistence; the Save button only
 * showed a warning toast. Chief wardens thought they were configuring
 * SLAs for 2+ months and maintenance tickets kept using whatever the DB
 * held. Now persists to `hostel_maintenance_sla_config` (one row per
 * category x priority) via batch upsert.
 *
 * Permission gate: `campus_living.settings.edit` (or super-admin).
 *
 * NOTE: The "Escalation Rules" card below still has a note because
 * `escalation_after_hours` / `escalation_to_role` exist on the table but
 * a *percent-of-SLA* trigger + multi-role notify list require either a
 * computed column or a new mapping table — deferred to the migrations
 * team. The per-row SLA hours ARE saved.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Save, Wrench, Loader2, Info } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useHostelSlaConfigs,
  useUpsertHostelSlaConfigs,
} from '@/hooks/campus-living/use-hostel-maintenance-sla';

type CategoryEnum =
  | 'electrical'
  | 'plumbing'
  | 'civil'
  | 'pest_control'
  | 'cleaning'
  | 'internet'
  | 'water_supply'
  | 'furniture'
  | 'safety'
  | 'other';

type PriorityEnum = 'critical' | 'high' | 'medium' | 'low';

const CATEGORIES: { key: CategoryEnum; label: string }[] = [
  { key: 'plumbing', label: 'Plumbing' },
  { key: 'electrical', label: 'Electrical' },
  { key: 'civil', label: 'Civil / Structural' },
  { key: 'furniture', label: 'Furniture / Carpentry' },
  { key: 'pest_control', label: 'Pest Control' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'internet', label: 'Internet / Network' },
  { key: 'water_supply', label: 'Water Supply' },
  { key: 'safety', label: 'Safety' },
  { key: 'other', label: 'Other' },
];

const PRIORITIES: PriorityEnum[] = ['critical', 'high', 'medium', 'low'];

/** Key used in dirty-grid map. */
const cellKey = (c: CategoryEnum, p: PriorityEnum) => `${c}::${p}`;

type GridValue = { id?: string; sla_hours: number | '' };
type Grid = Record<string, GridValue>;

const DEFAULT_HOURS: Record<PriorityEnum, number> = {
  critical: 4,
  high: 12,
  medium: 24,
  low: 72,
};

export default function MaintenanceSlaPage() {
  const { profile } = useAuth();
  const { permissions, isSuperAdmin } = usePermissions();
  const institutionId = profile?.institution_id ?? undefined;
  const canEdit =
    isSuperAdmin || permissions?.['campus_living.settings.edit'] === true;

  const { data: slaConfigs, isLoading, isError, error } = useHostelSlaConfigs(institutionId);
  const upsertMut = useUpsertHostelSlaConfigs();

  /** Seed the grid from DB rows, falling back to defaults for unset cells. */
  const initialGrid = useMemo<Grid>(() => {
    const g: Grid = {};
    for (const c of CATEGORIES) {
      for (const p of PRIORITIES) {
        g[cellKey(c.key, p)] = { sla_hours: DEFAULT_HOURS[p] };
      }
    }
    for (const row of slaConfigs ?? []) {
      g[cellKey(row.category as CategoryEnum, row.priority as PriorityEnum)] = {
        id: row.id,
        sla_hours: row.sla_hours,
      };
    }
    return g;
  }, [slaConfigs]);

  const [grid, setGrid] = useState<Grid>(initialGrid);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Refresh grid whenever DB payload changes and no local edits are pending.
    if (dirty.size === 0) setGrid(initialGrid);
  }, [initialGrid, dirty.size]);

  const handleCellChange = (c: CategoryEnum, p: PriorityEnum, value: string) => {
    const key = cellKey(c, p);
    const numeric = value === '' ? '' : Number(value);
    setGrid((g) => ({ ...g, [key]: { ...g[key], sla_hours: numeric } }));
    setDirty((d) => new Set(d).add(key));
  };

  const isDirty = dirty.size > 0;

  const handleSave = async () => {
    if (!institutionId) {
      toast.error('No institution context — select an institution before saving.');
      return;
    }
    const rows: Array<{
      id?: string;
      institution_id: string;
      category: CategoryEnum;
      priority: PriorityEnum;
      sla_hours: number;
    }> = [];
    for (const key of dirty) {
      const [category, priority] = key.split('::') as [CategoryEnum, PriorityEnum];
      const cell = grid[key];
      if (cell.sla_hours === '' || !Number.isFinite(cell.sla_hours) || cell.sla_hours < 0) {
        toast.error(`Invalid SLA hours for ${category} / ${priority}. Must be a non-negative number.`);
        return;
      }
      rows.push({
        id: cell.id,
        institution_id: institutionId,
        category,
        priority,
        sla_hours: cell.sla_hours as number,
      });
    }
    try {
      await upsertMut.mutateAsync(rows);
      setDirty(new Set()); // clear on success
    } catch {
      // onError toast handled in the hook
    }
  };

  return (
    <ContentLayout title="Maintenance SLA">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Maintenance SLA Configuration</h1>
            <p className="text-muted-foreground">
              Set resolution-time targets (hours) per category and priority. Saves directly to{' '}
              <code>hostel_maintenance_sla_config</code>.
            </p>
          </div>
          <Button onClick={handleSave} disabled={!canEdit || !isDirty || upsertMut.isPending}>
            {upsertMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isDirty ? `Save ${dirty.size} change${dirty.size === 1 ? '' : 's'}` : 'Save Changes'}
          </Button>
        </div>

        {!canEdit ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Read-only</AlertTitle>
            <AlertDescription>
              You can view SLA configurations but editing requires the{' '}
              <code>campus_living.settings.edit</code> permission.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              SLA Targets (Hours to Resolve)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading SLA configurations...
              </div>
            ) : isError ? (
              <Alert variant="destructive">
                <AlertTitle>Failed to load SLA configs</AlertTitle>
                <AlertDescription>{(error as Error)?.message ?? 'Unknown error'}</AlertDescription>
              </Alert>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    {PRIORITIES.map((p) => (
                      <TableHead key={p} className="text-center capitalize">
                        {p}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {CATEGORIES.map((c) => (
                    <TableRow key={c.key}>
                      <TableCell className="font-medium">{c.label}</TableCell>
                      {PRIORITIES.map((p) => {
                        const key = cellKey(c.key, p);
                        const cell = grid[key];
                        const isCellDirty = dirty.has(key);
                        return (
                          <TableCell key={p} className="text-center">
                            <Input
                              type="number"
                              min="0"
                              disabled={!canEdit}
                              value={cell?.sla_hours ?? ''}
                              onChange={(e) => handleCellChange(c.key, p, e.target.value)}
                              className={`w-20 mx-auto text-center ${
                                isCellDirty ? 'ring-2 ring-amber-400' : ''
                              }`}
                              aria-label={`${c.label} ${p} SLA hours`}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Escalation Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Per-cell escalation available; global rules deferred</AlertTitle>
              <AlertDescription>
                Per-row escalation fields (<code>escalation_after_hours</code>,{' '}
                <code>escalation_to_role</code>) exist on the schema and will be exposed in a
                follow-up PR. The "% of SLA" global threshold + multi-role notify list require a new
                mapping table and are tracked separately with the migrations team. Per-cell SLA
                hours above DO persist.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
