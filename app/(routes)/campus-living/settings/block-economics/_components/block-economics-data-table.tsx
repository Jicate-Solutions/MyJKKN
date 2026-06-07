'use client';

import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, RefreshCw } from 'lucide-react';
import {
  useBlockEconomics,
  useHostelBlockOptions,
  useHostelYearOptions,
} from '@/hooks/campus-living/use-block-economics';
import type {
  BlockEconomicsFilters,
  CostKind,
} from '@/lib/services/campus-living/block-economics-service';
import { createColumns } from './columns';
import { BlockEconomicsFormDialog } from './block-economics-form-dialog';

const ALL = '__all__';
const ONE_TIME = '__one_time__'; // capex (no year)

interface BlockEconomicsDataTableProps {
  blockId: string; // ALL or a block id
  costKind: CostKind;
  yearValue: string; // ALL | ONE_TIME | <year id>
  onBlockChange: (v: string) => void;
  onCostKindChange: (v: CostKind) => void;
  onYearChange: (v: string) => void;
}

export function BlockEconomicsDataTable({
  blockId,
  costKind,
  yearValue,
  onBlockChange,
  onCostKindChange,
  onYearChange,
}: BlockEconomicsDataTableProps) {
  const { blocks, loading: blocksLoading } = useHostelBlockOptions();
  const { years, loading: yearsLoading } = useHostelYearOptions();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const filters: BlockEconomicsFilters = useMemo(() => {
    const f: BlockEconomicsFilters = {
      cost_kind: costKind,
      include_inactive: includeInactive,
    };
    if (blockId !== ALL) f.block_id = blockId;
    if (yearValue === ONE_TIME) f.hostel_year_id = null;
    else if (yearValue !== ALL) f.hostel_year_id = yearValue;
    return f;
  }, [blockId, costKind, yearValue, includeInactive]);

  const { entries, loading, error, refetch } = useBlockEconomics(filters);
  const columns = useMemo(() => createColumns(), []);

  const table = useReactTable({
    data: entries,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  // Seed the create dialog from the active filters where they are concrete.
  const seedBlockId = blockId !== ALL ? blockId : undefined;
  const seedYearId =
    costKind === 'opex' && yearValue !== ALL && yearValue !== ONE_TIME
      ? yearValue
      : null;

  return (
    <div className='space-y-4'>
      {/* Cost-kind tabs */}
      <Tabs
        value={costKind}
        onValueChange={(v) => onCostKindChange(v as CostKind)}
      >
        <TabsList>
          <TabsTrigger value='opex'>Operating costs</TabsTrigger>
          <TabsTrigger value='capex'>Capital costs</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters row */}
      <div className='flex flex-wrap items-end gap-3'>
        <div className='space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Block</Label>
          <Select
            value={blockId}
            onValueChange={onBlockChange}
            disabled={blocksLoading}
          >
            <SelectTrigger className='w-[200px]'>
              <SelectValue placeholder='All blocks' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All blocks</SelectItem>
              {blocks.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {costKind === 'opex' && (
          <div className='space-y-1.5'>
            <Label className='text-xs text-muted-foreground'>Hostel year</Label>
            <Select
              value={yearValue === ONE_TIME ? ALL : yearValue}
              onValueChange={onYearChange}
              disabled={yearsLoading}
            >
              <SelectTrigger className='w-[200px]'>
                <SelectValue placeholder='All years' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All years</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                    {y.is_current ? ' (current)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className='flex items-center gap-2 pb-1.5'>
          <Switch
            id='include-inactive'
            checked={includeInactive}
            onCheckedChange={setIncludeInactive}
          />
          <Label htmlFor='include-inactive' className='text-sm'>
            Show disabled
          </Label>
        </div>

        <div className='ml-auto flex items-center gap-2 pb-0.5'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => refetch()}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Button size='sm' onClick={() => setShowCreate(true)}>
            <Plus className='h-4 w-4 mr-2' />
            Add cost
          </Button>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button variant='outline' onClick={() => refetch()} className='mt-4'>
            <RefreshCw className='h-4 w-4 mr-2' />
            Retry
          </Button>
        </div>
      ) : (
        <div className='rounded-md border overflow-x-auto'>
          <Table className='min-w-[760px]'>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead key={header.id}>
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
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className='h-8 w-full' />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
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
                    className='h-24 text-center text-muted-foreground'
                  >
                    {costKind === 'opex'
                      ? 'No operating costs entered for this filter. Use “Add cost” to record one.'
                      : 'No capital costs entered for this filter. Use “Add cost” to record one.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {entries.length > 0 && (
        <div className='text-sm text-muted-foreground text-right'>
          {entries.length}{' '}
          {costKind === 'opex' ? 'operating' : 'capital'}-cost entr
          {entries.length === 1 ? 'y' : 'ies'}
        </div>
      )}

      <BlockEconomicsFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        mode='create'
        defaultBlockId={seedBlockId}
        defaultYearId={seedYearId}
        defaultCostKind={costKind}
      />
    </div>
  );
}
