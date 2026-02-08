'use client';

// ============================================================================
// Partner Table Component
// Data table for listing and managing industry partners
// ============================================================================

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  getFilteredRowModel,
  ColumnFiltersState
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useIndustryPartners, useArchivePartner, useRestorePartner } from '@/hooks/industry';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useToast } from '@/hooks/use-toast';
import type { IndustryPartner, PartnershipType } from '@/types/industry';
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Archive,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Building2,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';

const PARTNERSHIP_TYPES: { value: PartnershipType; label: string }[] = [
  { value: 'mou', label: 'MOU' },
  { value: 'placement', label: 'Placement' },
  { value: 'project', label: 'Project' },
  { value: 'mentorship', label: 'Mentorship' },
  { value: 'sponsorship', label: 'Sponsorship' }
];

export function PartnerTable() {
  const router = useRouter();
  const { toast } = useToast();
  const { institutions } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [partnershipType, setPartnershipType] = useState<PartnershipType | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const { data, isLoading, refetch } = useIndustryPartners({
    institution_id: institutionId,
    search: search || undefined,
    partnership_type: partnershipType !== 'all' ? partnershipType : undefined,
    is_active: showArchived ? false : true,
    page,
    limit: 10
  });

  const archiveMutation = useArchivePartner();
  const restoreMutation = useRestorePartner();

  const handleArchive = async (id: string) => {
    try {
      await archiveMutation.mutateAsync(id);
      toast({
        title: 'Partner archived',
        description: 'The partner has been archived successfully.'
      });
      refetch();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to archive partner.',
        variant: 'destructive'
      });
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreMutation.mutateAsync(id);
      toast({
        title: 'Partner restored',
        description: 'The partner has been restored successfully.'
      });
      refetch();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to restore partner.',
        variant: 'destructive'
      });
    }
  };

  const columns: ColumnDef<IndustryPartner>[] = useMemo(
    () => [
      {
        accessorKey: 'company_name',
        header: 'Company',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{row.original.company_name}</p>
              {row.original.industry_sector && (
                <p className="text-sm text-muted-foreground">{row.original.industry_sector}</p>
              )}
            </div>
          </div>
        )
      },
      {
        accessorKey: 'partnership_type',
        header: 'Type',
        cell: ({ row }) => (
          row.original.partnership_type ? (
            <Badge variant="outline" className="capitalize">
              {row.original.partnership_type.replace('_', ' ')}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
        )
      },
      {
        accessorKey: 'contact_person',
        header: 'Contact',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.contact_person || '-'}</p>
            {row.original.contact_email && (
              <p className="text-sm text-muted-foreground">{row.original.contact_email}</p>
            )}
          </div>
        )
      },
      {
        accessorKey: 'partnership_start_date',
        header: 'Partnership Period',
        cell: ({ row }) => {
          const start = row.original.partnership_start_date;
          const end = row.original.partnership_end_date;
          if (!start) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="text-sm">
              <p>{new Date(start).toLocaleDateString()}</p>
              {end && (
                <p className="text-muted-foreground">to {new Date(end).toLocaleDateString()}</p>
              )}
            </div>
          );
        }
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (
          <Badge className={row.original.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
            {row.original.is_active ? 'Active' : 'Archived'}
          </Badge>
        )
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push(`/industry/partners/${row.original.id}`)}>
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/industry/partners/${row.original.id}/edit`)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              {row.original.company_website && (
                <DropdownMenuItem asChild>
                  <a href={row.original.company_website} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Visit Website
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {row.original.is_active ? (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirm(`Archive "${row.original.company_name}"? This will mark it as inactive.`)) {
                      handleArchive(row.original.id);
                    }
                  }}
                  className="text-destructive"
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirm(`Restore "${row.original.company_name}"? This will mark it as active.`)) {
                      handleRestore(row.original.id);
                    }
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    ],
    [router]
  );

  const table = useReactTable({
    data: data?.data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters
    }
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Industry Partners</CardTitle>
        <Button asChild>
          <Link href="/industry/partners/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Partner
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search partners..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10"
            />
          </div>
          <Select
            value={partnershipType}
            onValueChange={(value) => {
              setPartnershipType(value as PartnershipType | 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Partnership Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {PARTNERSHIP_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={showArchived ? 'secondary' : 'outline'}
            onClick={() => {
              setShowArchived(!showArchived);
              setPage(1);
            }}
          >
            {showArchived ? 'Show Active' : 'Show Archived'}
          </Button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : data?.data && data.data.length > 0 ? (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, data.metadata.total)} of{' '}
                {data.metadata.total} partners
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {page} of {data.metadata.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= data.metadata.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">
              {search || partnershipType !== 'all'
                ? 'No partners match your filters'
                : showArchived
                ? 'No archived partners'
                : 'No industry partners yet'}
            </p>
            {!search && partnershipType === 'all' && !showArchived && (
              <Button className="mt-4" asChild>
                <Link href="/industry/partners/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Partner
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
