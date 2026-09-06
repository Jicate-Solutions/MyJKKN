'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type {
  HostelResidentWithProfile,
  HostelResidentWithInstitutions,
  HostelResidentType,
} from '@/types/hostel-residents';
import { HostelResidentRowActions } from './row-actions';

const typeVariant: Record<
  HostelResidentType,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success'
> = {
  learner: 'default',
  staff: 'secondary',
  international: 'outline',
  married: 'outline',
  visitor: 'outline',
  other: 'outline',
};

interface ColumnArgs {
  institutionMap: Map<string, string>;
  isSuperAdmin: boolean;
}

// hostel-rooms-v2 PR 3 (2026-05-26): rows now carry derived_institution_ids
// via getResidentsWithInstitutions(). Columns type widens accordingly.
export function createColumns({
  institutionMap,
  isSuperAdmin,
}: ColumnArgs): ColumnDef<HostelResidentWithInstitutions>[] {
  const cols: ColumnDef<HostelResidentWithInstitutions>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
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
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'profile',
      header: 'Name',
      cell: ({ row }) => {
        const profile = row.original.profile;
        return (
          <div className='flex flex-col'>
            <span className='font-medium'>
              {profile?.full_name ?? <span className='text-muted-foreground'>—</span>}
            </span>
            {profile?.email && (
              <span className='text-xs text-muted-foreground'>{profile.email}</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'resident_type',
      header: 'Type',
      cell: ({ row }) => {
        const t = row.original.resident_type;
        return (
          <Badge variant={typeVariant[t]} className='capitalize'>
            {t}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'id_proof_type',
      header: 'ID Proof',
      cell: ({ row }) => {
        const type = row.original.id_proof_type;
        const num = row.original.id_proof_number;
        if (!type && !num) return <span className='text-muted-foreground'>—</span>;
        return (
          <div className='flex flex-col'>
            {type && <span className='text-xs'>{type}</span>}
            {num && <span className='font-mono text-xs'>{num}</span>}
          </div>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => <HostelResidentRowActions resident={row.original} />,
      enableSorting: false,
      enableHiding: false,
    },
  ];

  // hostel-rooms-v2 PR 3 (2026-05-26): Institution column restored.
  // Source switched from the dropped hostel_residents.institution_id to the
  // resident's active hostel_allocations → block → hostel_block_institutions
  // (the new derived_institution_ids array). Renders:
  //   - 0 ids   → "Not allocated" muted badge
  //   - 1 id    → institution name
  //   - 2+ ids  → "Name1 + N more"
  // Visible only for super_admin (cross-institution view).
  if (isSuperAdmin) {
    cols.splice(4, 0, {
      id: 'derived_institutions',
      header: 'Institution',
      cell: ({ row }) => {
        const ids = row.original.derived_institution_ids ?? [];
        if (ids.length === 0) {
          return (
            <Badge variant='outline' className='text-xs text-muted-foreground'>
              Not allocated
            </Badge>
          );
        }
        const first = institutionMap.get(ids[0]) ?? ids[0];
        if (ids.length === 1) {
          return <span className='text-xs text-muted-foreground'>{first}</span>;
        }
        return (
          <span className='text-xs text-muted-foreground'>
            {first} <span className='ml-1 text-[10px] uppercase tracking-wide'>+{ids.length - 1} more</span>
          </span>
        );
      },
    });
  }

  return cols;
}
