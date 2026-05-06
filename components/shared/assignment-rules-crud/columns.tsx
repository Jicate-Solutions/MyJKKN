'use client';

import { ColumnDef } from '@tanstack/react-table';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Pause,
  Shuffle,
  GraduationCap,
  MapPin,
  Target,
  Building,
  Activity,
  Settings,
} from 'lucide-react';
import type { AssignmentRule } from '@/lib/services/admission/assignment-rules-service';
import { DataTableRowActions } from './row-actions';

// Per-key Tailwind colour token. Keys mirror the seed in
// supabase/migrations/20260506181402_create_assignment_rule_type_registry.sql.
// Custom registry rows (added later via /admin/counselors/rule-types) fall
// through to the muted default — admins can pick any lucide icon name and the
// form-dialog will render it; colour is intentionally not surfaced as config
// to keep the registry surface lean.
const RULE_TYPE_COLOR: Record<string, string> = {
  program: 'text-blue-500',
  round_robin: 'text-purple-500',
  location: 'text-green-500',
  score: 'text-red-500',
  source: 'text-orange-500',
  workload: 'text-yellow-500',
};

// Hardcoded fallback used when callers pass only a key (no registry row).
// Drop-in equivalent of the previous switch — keeps existing call-sites working
// while consumers migrate to the (key, iconName) form.
const FALLBACK_ICON_BY_KEY: Record<string, LucideIcon> = {
  program: GraduationCap,
  round_robin: Shuffle,
  location: MapPin,
  score: Target,
  source: Building,
  workload: Activity,
};

function resolveLucideIcon(iconName: string | null | undefined): LucideIcon | null {
  if (!iconName) return null;
  // Map kebab-case (DB convention) to PascalCase (lucide export name).
  const pascal = iconName
    .split(/[-_]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  const candidate = (Icons as unknown as Record<string, unknown>)[pascal];
  return typeof candidate === 'function' ? (candidate as LucideIcon) : null;
}

/**
 * Render the lucide icon for a rule type.
 *
 * @param type     The rule_type_key (e.g. 'program', 'round_robin', or a
 *                 custom key from the registry).
 * @param iconName Optional explicit icon name from the registry row
 *                 (assignment_rule_type_registry.icon_name). When provided,
 *                 takes precedence over the hardcoded fallback — this is the
 *                 path used by table cells that have a registry row available.
 */
export function getRuleTypeIcon(type?: string, iconName?: string | null) {
  const colorClass = (type && RULE_TYPE_COLOR[type]) || 'text-gray-500';

  // 1) Registry-supplied icon name wins (decoupled from code).
  const registryIcon = resolveLucideIcon(iconName);
  if (registryIcon) {
    const Icon = registryIcon;
    return <Icon className={`h-4 w-4 ${colorClass}`} />;
  }

  // 2) Backward-compat fallback for the seeded keys.
  const fallback = type ? FALLBACK_ICON_BY_KEY[type] : null;
  if (fallback) {
    const Icon = fallback;
    return <Icon className={`h-4 w-4 ${colorClass}`} />;
  }

  // 3) Unknown key — neutral marker.
  return <Settings className="h-4 w-4 text-gray-500" />;
}

export function getColumns(
  handleRowDeselection: ((rowId: string) => void) | null | undefined,
  onRefetch?: () => void
): ColumnDef<AssignmentRule>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value: boolean) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      maxSize: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'priority',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Priority" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono">
          #{row.getValue('priority')}
        </Badge>
      ),
      size: 90,
      minSize: 70,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Rule Name" />
      ),
      cell: ({ row }) => {
        const rule = row.original;
        return (
          <div>
            <p className="font-medium">{rule.name}</p>
            {rule.description && (
              <p className="text-sm text-muted-foreground">{rule.description}</p>
            )}
          </div>
        );
      },
      size: 280,
      minSize: 200,
    },
    {
      id: 'type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => {
        const rule = row.original;
        const type = rule.type;
        return (
          <div className="flex items-center gap-2">
            {getRuleTypeIcon(type)}
            <span className="capitalize text-sm">
              {(type || 'custom').replace(/_/g, ' ')}
            </span>
          </div>
        );
      },
      enableSorting: false,
      size: 150,
      minSize: 120,
    },
    {
      accessorKey: 'is_active',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const isActive = row.getValue('is_active') as boolean;
        return (
          <Badge variant={isActive ? 'default' : 'secondary'}>
            {isActive ? (
              <Play className="h-3 w-3 mr-1" />
            ) : (
              <Pause className="h-3 w-3 mr-1" />
            )}
            {isActive ? 'Active' : 'Paused'}
          </Badge>
        );
      },
      size: 110,
      minSize: 90,
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => {
        const date = row.getValue('created_at') as string;
        return (
          <span className="text-sm text-muted-foreground">
            {date ? new Date(date).toLocaleDateString() : '-'}
          </span>
        );
      },
      size: 120,
      minSize: 100,
    },
    {
      id: 'actions',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Actions" />
      ),
      cell: ({ row }) => (
        <DataTableRowActions row={row} onRefetch={onRefetch} />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 80,
      minSize: 60,
    },
  ];
}
