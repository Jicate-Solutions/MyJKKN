'use client';

import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { Check, Filter, X } from 'lucide-react';
import { DownloadIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';

import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { DataTableViewOptions } from '@/components/data-table/view-options';
import { DataTablePagination } from '@/components/data-table/pagination';
import {
  exportToCSV, exportToExcel,
} from '@/components/data-table/utils/export-utils';
import { cn } from '@/lib/utils';

import type { SeatAnalyticsRow } from '@/types/admission-workflow-config';

function FillBadge({ pct }: { pct: number }) {
  if (pct >= 90) return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{pct}%</Badge>;
  if (pct >= 70) return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{pct}%</Badge>;
  if (pct >= 50) return <Badge variant="outline">{pct}%</Badge>;
  return <Badge variant="destructive">{pct}%</Badge>;
}

interface FacetedFilterProps {
  title: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function FacetedFilter({ title, options, selected, onChange }: FacetedFilterProps) {
  const selectedSet = new Set(selected);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <Filter className="mr-2 h-3.5 w-3.5" />
          {title}
          {selectedSet.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                {selectedSet.size}
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isSelected = selectedSet.has(opt);
                return (
                  <CommandItem
                    key={opt}
                    onSelect={() => {
                      const next = new Set(selectedSet);
                      if (isSelected) next.delete(opt);
                      else next.add(opt);
                      onChange([...next]);
                    }}
                  >
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="truncate">{opt}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedSet.size > 0 && (
              <>
                <Separator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => onChange([])}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const COLUMN_LABEL: Record<string, string> = {
  institution_name: 'Institution',
  degree_name: 'Degree',
  department_name: 'Department',
  program_name: 'Program',
  admission_year_name: 'Admission Year',
  program_start_year: 'Start Year',
  program_end_year: 'End Year',
  total_seats: 'Seats',
  filled_seats: 'Filled',
  balance_seats: 'Balance',
  fill_percentage: 'Fill %',
  last_filled_at: 'Last Filled',
};

export function SeatDetailsTable({ rows }: { rows: SeatAnalyticsRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'fill_percentage', desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    degree_name: false,
    program_start_year: false,
    program_end_year: false,
    last_filled_at: false,
  });
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<SeatAnalyticsRow>[]>(() => [
    {
      accessorKey: 'institution_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
      cell: ({ row }) => (
        <span className="text-xs font-medium" title={row.original.institution_name}>
          {row.original.institution_name}
        </span>
      ),
      filterFn: (row, _id, value: string[]) =>
        !value?.length || value.includes(row.original.institution_name),
      meta: { label: 'Institution' },
    },
    {
      accessorKey: 'degree_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Degree" />,
      cell: ({ row }) => <span className="text-xs">{row.original.degree_name}</span>,
      filterFn: (row, _id, value: string[]) =>
        !value?.length || value.includes(row.original.degree_name),
      meta: { label: 'Degree' },
    },
    {
      accessorKey: 'department_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Degree / Department" />,
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5 leading-tight">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {row.original.degree_name}
          </span>
          <span className="text-xs font-medium">{row.original.department_name}</span>
        </div>
      ),
      filterFn: (row, _id, value: string[]) =>
        !value?.length || value.includes(row.original.department_name),
      meta: { label: 'Degree / Department' },
    },
    {
      accessorKey: 'program_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Program" />,
      cell: ({ row }) => (
        <span className="text-xs font-medium" title={row.original.program_name}>
          {row.original.program_name}
        </span>
      ),
      meta: { label: 'Program' },
    },
    {
      accessorKey: 'admission_year_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Year" />,
      cell: ({ row }) => (
        <span className="text-xs whitespace-nowrap">{row.original.admission_year_name}</span>
      ),
      filterFn: (row, _id, value: string[]) =>
        !value?.length || value.includes(row.original.admission_year_name),
      meta: { label: 'Admission Year', width: 96 },
    },
    {
      accessorKey: 'program_start_year',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Start Year" />,
      cell: ({ row }) => <span className="text-xs">{row.original.program_start_year}</span>,
      meta: { label: 'Start Year' },
    },
    {
      accessorKey: 'program_end_year',
      header: ({ column }) => <DataTableColumnHeader column={column} title="End Year" />,
      cell: ({ row }) => <span className="text-xs">{row.original.program_end_year}</span>,
      meta: { label: 'End Year' },
    },
    {
      accessorKey: 'total_seats',
      header: ({ column }) => (
        <div className="flex justify-end"><DataTableColumnHeader column={column} title="Seats" /></div>
      ),
      cell: ({ row }) => (
        <div className="text-right text-xs tabular-nums">{row.original.total_seats}</div>
      ),
      meta: { label: 'Seats' },
    },
    {
      accessorKey: 'filled_seats',
      header: ({ column }) => (
        <div className="flex justify-end"><DataTableColumnHeader column={column} title="Filled" /></div>
      ),
      cell: ({ row }) => (
        <div className="text-right text-xs tabular-nums">{Number(row.original.filled_seats)}</div>
      ),
      sortingFn: (a, b) => Number(a.original.filled_seats) - Number(b.original.filled_seats),
      meta: { label: 'Filled' },
    },
    {
      accessorKey: 'balance_seats',
      header: ({ column }) => (
        <div className="flex justify-end"><DataTableColumnHeader column={column} title="Balance" /></div>
      ),
      cell: ({ row }) => (
        <div className="text-right text-xs tabular-nums">{row.original.balance_seats}</div>
      ),
      meta: { label: 'Balance' },
    },
    {
      accessorKey: 'fill_percentage',
      header: ({ column }) => (
        <div className="flex justify-end"><DataTableColumnHeader column={column} title="Fill %" /></div>
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <FillBadge pct={Number(row.original.fill_percentage)} />
        </div>
      ),
      sortingFn: (a, b) => Number(a.original.fill_percentage) - Number(b.original.fill_percentage),
      meta: { label: 'Fill %' },
    },
    {
      accessorKey: 'last_filled_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last Filled" />,
      cell: ({ row }) => {
        const v = row.original.last_filled_at;
        return (
          <span className="text-xs whitespace-nowrap">
            {v ? new Date(v).toLocaleDateString() : '—'}
          </span>
        );
      },
      meta: { label: 'Last Filled' },
    },
  ], []);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _id, filterValue: string) => {
      if (!filterValue) return true;
      const q = String(filterValue).toLowerCase();
      const r = row.original;
      return [
        r.institution_name, r.degree_name, r.department_name,
        r.program_name, r.admission_year_name,
      ].some((v) => v?.toLowerCase().includes(q));
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const filteredRows = table.getFilteredRowModel().rows;
  const totals = useMemo(() => {
    const seats = filteredRows.reduce((s, r) => s + r.original.total_seats, 0);
    const filled = filteredRows.reduce((s, r) => s + Number(r.original.filled_seats), 0);
    const balance = filteredRows.reduce((s, r) => s + r.original.balance_seats, 0);
    const pct = seats > 0 ? Math.round((filled / seats) * 100) : 0;
    return { seats, filled, balance, pct };
  }, [filteredRows]);

  const uniqueValues = useMemo(() => ({
    institution: [...new Set(rows.map((r) => r.institution_name))].sort(),
    degree: [...new Set(rows.map((r) => r.degree_name))].sort(),
    department: [...new Set(rows.map((r) => r.department_name))].sort(),
    admissionYear: [...new Set(rows.map((r) => r.admission_year_name))].sort(),
  }), [rows]);

  const isFiltered = columnFilters.length > 0 || globalFilter.length > 0;

  const exportRows = () => filteredRows.map((r) => ({
    institution_name: r.original.institution_name,
    degree_name: r.original.degree_name,
    department_name: r.original.department_name,
    program_name: r.original.program_name,
    admission_year_name: r.original.admission_year_name,
    program_start_year: r.original.program_start_year,
    program_end_year: r.original.program_end_year,
    total_seats: r.original.total_seats,
    filled_seats: Number(r.original.filled_seats),
    balance_seats: r.original.balance_seats,
    fill_percentage: Number(r.original.fill_percentage),
    last_filled_at: r.original.last_filled_at ?? '',
  }));

  const handleExport = (type: 'csv' | 'excel') => {
    const data = exportRows();
    if (data.length === 0) return;
    const visibleIds = table
      .getAllColumns()
      .filter((c) => c.getIsVisible())
      .map((c) => c.id);
    const headers = visibleIds.filter((id) => id in COLUMN_LABEL);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `seat-details-${stamp}`;
    if (type === 'csv') {
      exportToCSV(data, filename, headers, COLUMN_LABEL);
    } else {
      exportToExcel(data, filename, COLUMN_LABEL, headers.map(() => ({ wch: 22 })), headers);
    }
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search institution, degree, department, program…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 w-full sm:w-[260px] lg:w-[320px]"
          />
          <FacetedFilter
            title="Institution"
            options={uniqueValues.institution}
            selected={(table.getColumn('institution_name')?.getFilterValue() as string[]) ?? []}
            onChange={(v) => table.getColumn('institution_name')?.setFilterValue(v.length ? v : undefined)}
          />
          <FacetedFilter
            title="Degree"
            options={uniqueValues.degree}
            selected={(table.getColumn('degree_name')?.getFilterValue() as string[]) ?? []}
            onChange={(v) => table.getColumn('degree_name')?.setFilterValue(v.length ? v : undefined)}
          />
          <FacetedFilter
            title="Department"
            options={uniqueValues.department}
            selected={(table.getColumn('department_name')?.getFilterValue() as string[]) ?? []}
            onChange={(v) => table.getColumn('department_name')?.setFilterValue(v.length ? v : undefined)}
          />
          <FacetedFilter
            title="Admission Year"
            options={uniqueValues.admissionYear}
            selected={(table.getColumn('admission_year_name')?.getFilterValue() as string[]) ?? []}
            onChange={(v) => table.getColumn('admission_year_name')?.setFilterValue(v.length ? v : undefined)}
          />
          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => {
                setColumnFilters([]);
                setGlobalFilter('');
              }}
            >
              Reset
              <X className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <DownloadIcon className="mr-2 h-3.5 w-3.5" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                Export {filteredRows.length} row(s) — CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('excel')}>
                Export {filteredRows.length} row(s) — Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DataTableViewOptions table={table} columnMapping={COLUMN_LABEL} size="sm" />
        </div>
      </div>

      {/* Filtered summary */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Showing <span className="font-semibold text-foreground">{filteredRows.length}</span>{' '}
          of {rows.length} rows
        </span>
        <span>Seats: <span className="font-semibold text-foreground">{totals.seats.toLocaleString()}</span></span>
        <span>Filled: <span className="font-semibold text-foreground">{totals.filled.toLocaleString()}</span></span>
        <span>Balance: <span className="font-semibold text-foreground">{totals.balance.toLocaleString()}</span></span>
        <span>Fill %: <span className="font-semibold text-foreground">{totals.pct}%</span></span>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-auto max-h-[560px]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => {
                  const w = (h.column.columnDef.meta as { width?: number } | undefined)?.width;
                  return (
                    <TableHead
                      key={h.id}
                      className="px-3 py-2 align-middle"
                      style={w ? { width: w } : undefined}
                    >
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="align-top">
                  {row.getVisibleCells().map((cell) => {
                    const w = (cell.column.columnDef.meta as { width?: number } | undefined)?.width;
                    return (
                      <TableCell
                        key={cell.id}
                        className="px-3 py-2 align-top whitespace-normal break-words"
                        style={w ? { width: w } : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                  No matching rows.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {filteredRows.length > 0 && (
            <TableFooter className="bg-muted/40">
              <TableRow>
                <TableCell colSpan={Math.max(1, table.getVisibleLeafColumns().findIndex((c) => c.id === 'total_seats'))} className="px-3 py-2 text-xs font-medium">
                  Totals (filtered)
                </TableCell>
                {table.getColumn('total_seats')?.getIsVisible() && (
                  <TableCell className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
                    {totals.seats.toLocaleString()}
                  </TableCell>
                )}
                {table.getColumn('filled_seats')?.getIsVisible() && (
                  <TableCell className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
                    {totals.filled.toLocaleString()}
                  </TableCell>
                )}
                {table.getColumn('balance_seats')?.getIsVisible() && (
                  <TableCell className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
                    {totals.balance.toLocaleString()}
                  </TableCell>
                )}
                {table.getColumn('fill_percentage')?.getIsVisible() && (
                  <TableCell className="px-3 py-2 text-right">
                    <FillBadge pct={totals.pct} />
                  </TableCell>
                )}
                {table.getColumn('last_filled_at')?.getIsVisible() && (
                  <TableCell className="px-3 py-2" />
                )}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      <DataTablePagination
        table={table}
        totalItems={filteredRows.length}
        pageSizeOptions={[10, 25, 50, 100, 200]}
        size="sm"
      />
    </div>
  );
}
