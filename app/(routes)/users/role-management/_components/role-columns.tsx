'use client';

import { ColumnDef } from '@tanstack/react-table';
import { CustomRole } from '@/types/auth';
import { format } from 'date-fns';
import {
  Shield,
  MoreHorizontal,
  Pencil,
  Copy,
  Check,
  Trash2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { cn } from '@/lib/utils';

export interface RoleColumnActions {
  onEdit: (role: CustomRole) => void;
  onClone: (role: CustomRole) => void;
  onDelete: (role: CustomRole) => void;
}

const countPermissions = (permissions: Record<string, boolean>) =>
  Object.values(permissions).filter(Boolean).length;

function CopyableRoleKey({ roleKey }: { roleKey: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(roleKey);
      setCopied(true);
      toast.success(`Copied "${roleKey}"`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <div className="group flex items-center gap-1.5">
      <span className="font-mono text-xs text-muted-foreground">{roleKey}</span>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Copy role key ${roleKey}`}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {copied ? 'Copied!' : 'Copy role key'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

const permissionTierClass = (count: number) => {
  if (count === 0) return 'bg-muted text-muted-foreground';
  if (count > 50)
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
  if (count > 10)
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400';
};

export function getRoleColumns(
  actions: RoleColumnActions
): ColumnDef<CustomRole>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => {
        const isSystem = row.original.is_system_role;
        return (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="translate-y-[2px]"
            disabled={isSystem}
            title={isSystem ? 'System roles cannot be bulk-modified' : undefined}
          />
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'role_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Role Name" />
      ),
      cell: ({ row }) => {
        const role = row.original;
        return (
          <button
            type="button"
            onClick={() => actions.onEdit(role)}
            className="group flex items-center gap-2 text-left"
          >
            <Shield
              className={cn(
                'h-4 w-4 flex-shrink-0',
                role.is_system_role ? 'text-primary' : 'text-muted-foreground'
              )}
            />
            <span className="font-medium text-primary underline-offset-4 group-hover:underline">
              {role.role_name}
            </span>
          </button>
        );
      },
      filterFn: (row, id, value: string) => {
        const role = row.original;
        const q = String(value).toLowerCase();
        return (
          role.role_name.toLowerCase().includes(q) ||
          role.role_key.toLowerCase().includes(q) ||
          (role.description || '').toLowerCase().includes(q)
        );
      },
      meta: { label: 'Role Name' },
    },
    {
      accessorKey: 'role_key',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Role Key" />
      ),
      cell: ({ row }) => <CopyableRoleKey roleKey={row.original.role_key} />,
      meta: { label: 'Role Key' },
    },
    {
      id: 'permissions_count',
      accessorFn: (row) => countPermissions(row.permissions),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Permissions" />
      ),
      cell: ({ getValue }) => {
        const count = getValue<number>();
        return (
          <Badge variant="secondary" className={cn(permissionTierClass(count))}>
            {count}
          </Badge>
        );
      },
      meta: { label: 'Permissions' },
    },
    {
      accessorKey: 'institution_scope',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Scope" />
      ),
      cell: ({ row }) => {
        const scope = row.original.institution_scope;
        return (
          <Badge
            variant="secondary"
            className={cn(
              scope === 'all'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            )}
          >
            {scope === 'all' ? 'All Institutions' : 'Own Institution'}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => {
        if (!value?.length) return true;
        return value.includes(row.original.institution_scope);
      },
      meta: { label: 'Scope' },
    },
    {
      id: 'type',
      accessorFn: (row) => (row.is_system_role ? 'system' : 'custom'),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) =>
        row.original.is_system_role ? (
          <Badge variant="outline">System</Badge>
        ) : (
          <Badge variant="secondary">Custom</Badge>
        ),
      filterFn: (row, id, value: string[]) => {
        if (!value?.length) return true;
        const v = row.original.is_system_role ? 'system' : 'custom';
        return value.includes(v);
      },
      meta: { label: 'Type' },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {format(new Date(row.original.created_at), 'MMM d, yyyy')}
        </span>
      ),
      meta: { label: 'Created' },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const role = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 data-[state=open]:bg-muted"
                aria-label="Open row actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px]">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => actions.onEdit(role)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.onClone(role)}>
                <Copy className="mr-2 h-4 w-4" />
                Clone
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => actions.onDelete(role)}
                disabled={role.is_system_role}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

// Faceted filter option sets
export const scopeFilterOptions = [
  { label: 'All Institutions', value: 'all', icon: CheckCircle2 },
  { label: 'Own Institution', value: 'own', icon: XCircle },
];

export const typeFilterOptions = [
  { label: 'System', value: 'system', icon: Shield },
  { label: 'Custom', value: 'custom' },
];
