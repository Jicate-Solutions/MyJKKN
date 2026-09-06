'use client';

/**
 * Column definitions for the payroll-organisation directory.
 *
 * The "Paid by" cell is a CONTROLLED Select bound to the row's current payer,
 * not an empty picker. The screen used to list only unassigned people, so a
 * blank control was accurate; now that it lists everyone, a blank control on a
 * row that HAS a payer would read as "nobody pays this person" and invite an
 * operator to re-record something already correct.
 */

import type { ColumnDef } from '@tanstack/react-table';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  PayrollOrganization,
  StaffPayerRow,
} from '@/lib/services/hr/payroll/staff-payroll-service';

export interface PayerDirectoryColumnActions {
  organizations: PayrollOrganization[];
  /** Whether the viewer holds hr.payroll.institution.manage. */
  canManage: boolean;
  /** staff_uuid currently mid-save, so only that row's controls disable. */
  savingStaffId: string | null;
  onAssign: (row: StaffPayerRow, hrOrganizationId: string) => void;
  /** Returns the person to the queue by deleting their hr_staff_payroll row. */
  onClear: (row: StaffPayerRow) => void;
}

export function getPayerDirectoryColumns(
  actions: PayerDirectoryColumnActions
): ColumnDef<StaffPayerRow>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label='Select all'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label='Select row'
        />
      ),
      size: 50,
      minSize: 50,
      maxSize: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'person_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Team member' />
      ),
      size: 210,
      cell: ({ row }) => (
        <span className='block truncate font-medium' title={row.original.person_name}>
          {row.original.person_name || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'staff_code',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Code' />
      ),
      size: 110,
      cell: ({ row }) => (
        <span className='font-mono text-xs text-muted-foreground'>
          {row.original.staff_code || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'role_title',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Role' />
      ),
      size: 180,
      cell: ({ row }) => (
        <span className='block truncate text-sm' title={row.original.role_title ?? ''}>
          {row.original.role_title || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'works_at_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Works at' />
      ),
      size: 200,
      cell: ({ row }) => (
        <span
          className='block truncate text-sm text-muted-foreground'
          title={row.original.works_at_name}
        >
          {row.original.works_at_name}
        </span>
      ),
    },
    {
      // Sorts on the payer NAME, which is what the user sees. Sorting the
      // column by its hidden uuid looks random.
      accessorKey: 'payer_org_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      size: 120,
      cell: ({ row }) =>
        row.original.payer_org_id ? (
          <Badge variant='outline' className='font-normal'>
            Recorded
          </Badge>
        ) : (
          <Badge
            variant='outline'
            className='border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400'
          >
            Awaiting
          </Badge>
        ),
    },
    {
      id: 'paid_by',
      header: 'Paid by',
      size: 280,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const person = row.original;
        const isSaving = actions.savingStaffId === person.staff_uuid;

        // Read-only viewers hold .view but not .manage. Rendering a picker the
        // write policy will reject is worse than rendering the plain value.
        if (!actions.canManage) {
          return (
            <span className='block truncate text-sm'>
              {person.payer_org_name ?? (
                <span className='text-muted-foreground'>Not recorded</span>
              )}
            </span>
          );
        }

        return (
          // The row also owns selection; without this, opening the picker would
          // toggle the row's checkbox.
          <div className='flex items-center gap-1' onClick={(e) => e.stopPropagation()}>
            <Select
              // `?? undefined` and not `?? ''`: Radix treats '' as "no value" and
              // would warn about switching between controlled and uncontrolled.
              value={person.payer_org_id ?? undefined}
              disabled={isSaving}
              onValueChange={(v) => actions.onAssign(person, v)}
            >
              <SelectTrigger className='h-8 w-full'>
                <SelectValue placeholder='Not recorded — choose…' />
              </SelectTrigger>
              <SelectContent>
                {actions.organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {person.payer_org_id && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8 shrink-0'
                      disabled={isSaving}
                      onClick={() => actions.onClear(person)}
                      aria-label={`Clear the payroll organisation for ${person.person_name}`}
                    >
                      <X className='h-4 w-4' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Clear — returns them to the queue and out of every payroll run
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        );
      },
    },
  ];
}
