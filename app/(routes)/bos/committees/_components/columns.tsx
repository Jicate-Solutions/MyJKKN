'use client';

import { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { BosCommittee } from '@/types/bos';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { DataTableRowActions } from './row-actions';

// Same shape /api/bos/institutions returns — CAS siblings pre-grouped.
interface BosInstitutionOption {
  id: string;
  name: string;
  myjkkn_institution_ids: string[];
}

// Resolves institutions_id → display name. Super-admins get the cached COE
// list (shared queryKey with the filters); everyone else falls back to their
// own institution context (their rows can only be their own institution).
function InstitutionCell({ institutionsId }: { institutionsId: string }) {
  const { isSuperAdmin } = usePermissions();
  const { data: ownCtx } = useInstitutionContext();
  const { data: allInstitutions = [] } = useQuery<BosInstitutionOption[]>({
    queryKey: ['bos', 'institutions'],
    queryFn: async () => {
      const r = await fetch('/api/bos/institutions');
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!isSuperAdmin,
    staleTime: 5 * 60 * 1000,
  });

  let name: string | undefined;
  for (const inst of allInstitutions) {
    if (inst.id === institutionsId || inst.myjkkn_institution_ids?.includes(institutionsId)) {
      name = inst.name;
      break;
    }
  }
  if (!name && !isSuperAdmin) name = ownCtx?.name;

  return <div className='text-sm text-muted-foreground'>{name ?? '—'}</div>;
}

// Composition label for the master page's "All" view. Template rows (no
// composition) render a muted "Template" badge so the two kinds stay
// visually distinct in one flat list.
function CompositionCell({ committee }: { committee: BosCommittee }) {
  if (!committee.composition_id) {
    return (
      <Badge variant='outline' className='text-muted-foreground'>
        Template
      </Badge>
    );
  }
  return (
    <div className='text-sm'>{committee.composition_title ?? '—'}</div>
  );
}

const compositionColumn: ColumnDef<BosCommittee> = {
  id: 'composition',
  header: ({ column }) => <DataTableColumnHeader column={column} title='Composition' />,
  size: 220,
  enableSorting: false,
  cell: ({ row }) => <CompositionCell committee={row.original} />,
};

const baseColumns: ColumnDef<BosCommittee>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
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
    accessorKey: 'sort_order',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Order' />,
    size: 80,
    cell: ({ row }) => (
      <div className='text-muted-foreground'>{row.getValue('sort_order')}</div>
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
    size: 240,
    cell: ({ row }) => <div className='font-medium'>{row.getValue('name')}</div>,
  },
  {
    accessorKey: 'short_code',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Short Code' />,
    size: 120,
    cell: ({ row }) => {
      const shortCode = row.getValue('short_code') as string | null;
      return shortCode ? (
        <Badge variant='outline'>{shortCode}</Badge>
      ) : (
        <span className='text-muted-foreground'>—</span>
      );
    },
  },
  {
    accessorKey: 'institutions_id',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Institution' />,
    size: 260,
    enableSorting: false,
    cell: ({ row }) => (
      <InstitutionCell institutionsId={row.getValue('institutions_id')} />
    ),
  },
  {
    accessorKey: 'is_active',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Status' />,
    size: 90,
    cell: ({ row }) => {
      const isActive = row.getValue('is_active') as boolean;
      return (
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      );
    },
  },
];

export const getColumns = (options: {
  canManage: boolean;
  showComposition?: boolean;
  onEdit: (committee: BosCommittee) => void;
  onChanged: () => void;
}): ColumnDef<BosCommittee>[] => {
  // In the "All" view, append the Composition column (users can reorder/hide
  // via column visibility) so instances across compositions are
  // distinguishable at a glance.
  const cols = options.showComposition
    ? [...baseColumns, compositionColumn]
    : baseColumns;
  if (!options.canManage) return cols;
  return [
    ...cols,
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <DataTableRowActions
          row={row}
          onEdit={options.onEdit}
          onChanged={options.onChanged}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 60,
      minSize: 60,
      maxSize: 80,
    },
  ];
};
