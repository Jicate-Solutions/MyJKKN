'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  getFilteredRowModel,
  ColumnFiltersState,
  VisibilityState,
  getPaginationRowModel
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { DataTablePagination } from '@/components/data-table/pagination';
import { useTemplates } from '@/hooks/use-templates';
import { TimetableTemplate } from '@/types/academics';
import { format } from 'date-fns';
import {
  Settings2,
  Eye,
  Edit,
  Trash2,
  Copy,
  Calendar,
  Clock,
  Star,
  Users
} from 'lucide-react';
import { TemplateRowActions } from './template-row-actions';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TemplateLibraryDataTableProps {
  search: Record<string, string>;
}

export function TemplateLibraryDataTable({
  search
}: TemplateLibraryDataTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  // Build filters from search params
  const filters = useMemo(() => {
    const params: any = {
      page: parseInt(search.page || '1'),
      limit: parseInt(search.pageSize || '10')
    };

    if (search.search) params.search = search.search;
    if (search.category) params.template_category = search.category;
    if (search.institution_id) params.institution_id = search.institution_id;
    if (search.department_id) params.department_id = search.department_id;
    if (search.program_id) params.program_id = search.program_id;

    return params;
  }, [search]);

  const { data, isLoading, error } = useTemplates(filters);

  const columns: ColumnDef<TimetableTemplate>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false
    },
    {
      accessorKey: 'template_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Template Name" />
      ),
      cell: ({ row }) => {
        const template = row.original;
        return (
          <div className="space-y-1">
            <div className="font-medium text-sm">{template.template_name}</div>
            {template.template_description && (
              <div className="text-xs text-muted-foreground line-clamp-2">
                {template.template_description}
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Created {format(new Date(template.created_at), 'MMM dd, yyyy')}
            </div>
          </div>
        );
      }
    },
    {
      accessorKey: 'template_category',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Category" />
      ),
      cell: ({ row }) => {
        const category = row.getValue('template_category') as string;
        return category ? (
          <Badge variant="outline">{category}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      }
    },
    {
      accessorKey: 'program.program_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Program" />
      ),
      cell: ({ row }) => {
        const template = row.original;
        return (
          <div className="space-y-1 text-sm">
            <div>{template.program?.program_name || '-'}</div>
            <div className="text-xs text-muted-foreground">
              {template.department?.department_name || '-'}
            </div>
          </div>
        );
      }
    },
    {
      accessorKey: 'semester',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Semester" />
      ),
      cell: ({ row }) => {
        const template = row.original;
        return (
          <div className="space-y-1">
            <Badge variant="secondary">
              Sem {template.semester}
              {template.section && ` - ${template.section}`}
            </Badge>
          </div>
        );
      }
    },
    {
      accessorKey: 'template_tags',
      header: 'Tags',
      cell: ({ row }) => {
        const tags = row.getValue('template_tags') as string[];
        return tags && tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tags.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{tags.length - 2}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      }
    },
    {
      accessorKey: 'usage_count',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Usage" />
      ),
      cell: ({ row }) => {
        const count = row.getValue('usage_count') as number;
        return (
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-medium">
              {count || 0} times
            </span>
          </div>
        );
      }
    },
    {
      accessorKey: 'timetable_format',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Format" />
      ),
      cell: ({ row }) => {
        const format = row.getValue('timetable_format') as string;
        return (
          <Badge variant="outline" className="capitalize">
            <Clock className="h-3 w-3 mr-1" />
            {format || 'regular'}
          </Badge>
        );
      }
    },
    {
      accessorKey: 'institution.name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Institution" />
      ),
      cell: ({ row }) => {
        const template = row.original;
        return template.institution?.name || '-';
      }
    },
    {
      accessorKey: 'is_active',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const isActive = row.getValue('is_active') as boolean;
        return (
          <Badge
            variant={isActive ? 'default' : 'secondary'}
            className={
              isActive
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-50 text-gray-700 border-gray-200'
            }
          >
            {isActive ? 'Active' : 'Inactive'}
          </Badge>
        );
      }
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => <TemplateRowActions template={row.original} />,
      enableSorting: false,
      enableHiding: false
    }
  ];

  const table = useReactTable({
    data: data?.data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection
    }
  });

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load templates. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search templates..."
            value={(table.getColumn('template_name')?.getFilterValue() as string) ?? ''}
            onChange={(event) =>
              table.getColumn('template_name')?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Settings2 className="h-4 w-4" />
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[150px]">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="px-4">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className="hover:bg-muted/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No templates found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <DataTablePagination table={table} />
    </div>
  );
}