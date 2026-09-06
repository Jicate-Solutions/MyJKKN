'use client';

/**
 * Column definitions for Common Holidays & Events.
 *
 * EVERY COLUMN CARRIES AN EXPLICIT `size`. The DataTable renders cells as
 * `px-4 py-2 truncate max-w-0`, so a column that falls back to the 150px
 * default clips its content off the edge rather than wrapping — which is how an
 * action button in this codebase once became invisible instead of merely
 * cramped.
 *
 * The Scope cell NAMES the institutions. It used to read "3 institution(s)",
 * which told an admin nothing about whether the entry covered the college they
 * were actually looking at.
 */

import type { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import { MoreHorizontal, PencilLine, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import type { CalendarCategory, CalendarEntry } from '@/types/calendar';

import { dayCount, isCommonScope, isMultiDay } from './holiday-filters';

/** All-day boundaries are stored in UTC; reading them locally shifts IST dates. */
const fmt = (iso: string) => moment.utc(iso).format('DD MMM YYYY');

export function getHolidayColumns({
  categories,
  institutionNames,
  canManage,
  onViewDetails,
  onEdit,
  onDelete,
}: {
  categories: CalendarCategory[];
  /** id → display name, for the Scope cell. */
  institutionNames: Map<string, string>;
  canManage: boolean;
  /** Opens the read-only detail panel — available to viewers, not just managers. */
  onViewDetails: (e: CalendarEntry) => void;
  onEdit: (e: CalendarEntry) => void;
  onDelete: (e: CalendarEntry) => void;
}): ColumnDef<CalendarEntry>[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const columns: ColumnDef<CalendarEntry>[] = [];

  if (canManage) {
    columns.push({
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
      size: 44,
      minSize: 44,
      maxSize: 44,
      enableSorting: false,
      enableHiding: false,
    });
  }

  columns.push(
    {
      accessorKey: 'title',
      id: 'title',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Title' />,
      size: 280,
      cell: ({ row }) => {
        const e = row.original;
        return (
          <div className='min-w-0'>
            {/* A real <button>, not a clickable <div> — the title is the row's
                primary affordance, so it has to be keyboard-reachable and
                announced as an action. */}
            <button
              type='button'
              onClick={() => onViewDetails(e)}
              className='block w-full truncate text-left font-medium text-primary hover:underline'
              title={e.title}
            >
              {e.title}
            </button>
            {e.description && (
              <p className='truncate text-xs text-muted-foreground'>{e.description}</p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'kind',
      id: 'kind',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Kind' />,
      size: 110,
      cell: ({ row }) => (
        <Badge variant='outline' className='font-normal capitalize'>
          {row.original.kind}
        </Badge>
      ),
    },
    {
      accessorKey: 'category_id',
      id: 'category',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Category' />,
      size: 170,
      cell: ({ row }) => {
        const c = row.original.category_id ? categoryById.get(row.original.category_id) : undefined;
        if (!c) return <span className='text-xs text-muted-foreground'>—</span>;
        return (
          <Badge
            variant='outline'
            className='font-normal'
            // Tinted from the category's own colour so the table matches the
            // chips on /calendar rather than inventing a second palette.
            style={{ borderColor: c.color_code, color: c.color_code }}
          >
            {c.name}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'start_at',
      id: 'dates',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Dates' />,
      size: 230,
      cell: ({ row }) => {
        const e = row.original;
        const multi = isMultiDay(e);
        return (
          <div className='min-w-0'>
            <p className='truncate text-sm'>
              {multi ? `${fmt(e.start_at)} – ${fmt(e.end_at)}` : fmt(e.start_at)}
            </p>
            {multi && (
              <p className='text-xs text-muted-foreground'>{dayCount(e)} days</p>
            )}
          </div>
        );
      },
    },
    {
      id: 'scope',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Scope' />,
      size: 260,
      enableSorting: false,
      cell: ({ row }) => {
        const e = row.original;
        if (isCommonScope(e)) {
          return (
            <Badge variant='secondary' className='font-normal'>
              All institutions
            </Badge>
          );
        }
        const ids = e.scope_institution_ids ?? [];
        const shown = ids.slice(0, 2);
        return (
          <div className='flex flex-wrap gap-1'>
            {shown.map((id) => (
              <Badge key={id} variant='outline' className='font-normal'>
                {institutionNames.get(id) ?? 'Unknown institution'}
              </Badge>
            ))}
            {ids.length > shown.length && (
              <Badge variant='outline' className='font-normal text-muted-foreground'>
                +{ids.length - shown.length} more
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'blocks_attendance',
      id: 'blocks',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Blocks attendance' />,
      size: 150,
      cell: ({ row }) => {
        const e = row.original;
        // Only a holiday suppresses marking; an event's stored flag is inert.
        if (e.kind !== 'holiday') return <span className='text-xs text-muted-foreground'>—</span>;
        return e.blocks_attendance ? (
          <Badge
            variant='outline'
            className='border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400'
          >
            Yes
          </Badge>
        ) : (
          <Badge variant='outline' className='font-normal text-muted-foreground'>
            No
          </Badge>
        );
      },
    },
    {
      accessorKey: 'is_active',
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Status' />,
      size: 110,
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant='outline' className='font-normal'>
            Active
          </Badge>
        ) : (
          <Badge variant='secondary' className='font-normal'>
            Inactive
          </Badge>
        ),
    }
  );

  if (canManage) {
    columns.push({
      id: 'actions',
      header: 'Actions',
      size: 80,
      minSize: 80,
      maxSize: 80,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const e = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' className='h-8 w-8'>
                <MoreHorizontal className='h-4 w-4' />
                <span className='sr-only'>Open actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => onEdit(e)}>
                <PencilLine className='mr-2 h-4 w-4' />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(e)}
                className='text-destructive focus:text-destructive'
              >
                <Trash2 className='mr-2 h-4 w-4' />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });
  }

  return columns;
}
