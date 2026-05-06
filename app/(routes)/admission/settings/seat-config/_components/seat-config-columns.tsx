'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, Save, Loader2, Pencil, SlidersHorizontal } from 'lucide-react';

// One row = one admission year record (per-program-per-cohort).
// Seat count lives directly on admission_years.sanctioned_intake.
export interface AdmissionYearRow {
  id: string;                      // admission_years.id
  admission_year_name: string;
  program_name: string;
  program_code: string;            // programs.program_id (business code)
  program_start_year: number;
  program_end_year: number;
  is_active: boolean;
  sanctioned_intake: number;
  originalSanctionedIntake: number; // for dirty check
  dirty: boolean;
  saving: boolean;
  // Per-quota seat breakdown (only entries with sanctioned_intake > 0).
  // Empty array when no quota allocations have been configured yet.
  quota_breakdown: Array<{
    quota_id: string;
    quota_code: string;
    quota_name: string;
    sanctioned_intake: number;
  }>;
}

interface ColumnFactoryOptions {
  onUpdate: (admissionYearId: string, value: number) => void;
  onSave: (row: AdmissionYearRow) => void;
  onEdit: (row: AdmissionYearRow) => void;
  onConfigureQuotas: (row: AdmissionYearRow) => void;
}

function StatusBadge({ row }: { row: AdmissionYearRow }) {
  if (row.dirty) {
    return (
      <Badge className='bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs'>
        Unsaved
      </Badge>
    );
  }
  if (row.sanctioned_intake > 0) {
    return (
      <Badge className='bg-green-100 text-green-800 hover:bg-green-100 text-xs flex items-center gap-1 w-fit'>
        <CheckCircle className='h-3 w-3' />
        Configured
      </Badge>
    );
  }
  return (
    <Badge variant='outline' className='text-xs text-muted-foreground'>
      Not set
    </Badge>
  );
}

export function createSeatConfigColumns({
  onUpdate,
  onSave,
  onEdit,
  onConfigureQuotas
}: ColumnFactoryOptions): ColumnDef<AdmissionYearRow>[] {
  return [
    {
      accessorKey: 'admission_year_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Admission Year' />
      ),
      cell: ({ row }) => (
        <span className='text-xs font-medium'>
          {row.getValue('admission_year_name')}
        </span>
      )
    },
    {
      accessorKey: 'program_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Program' />
      ),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className='flex flex-col'>
            <span className='text-xs'>{r.program_name}</span>
            <span className='text-[10px] text-muted-foreground'>
              {r.program_code}
            </span>
          </div>
        );
      }
    },
    {
      id: 'year_range',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Cohort Years' />
      ),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className='text-xs text-muted-foreground'>
            {r.program_start_year} → {r.program_end_year}
          </span>
        );
      }
    },
    {
      accessorKey: 'sanctioned_intake',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Sanctioned Seats' />
      ),
      size: 280,
      cell: ({ row }) => {
        const data = row.original;
        const breakdown = data.quota_breakdown.filter(
          (q) => q.sanctioned_intake > 0
        );
        const allocatedSum = breakdown.reduce(
          (s, q) => s + q.sanctioned_intake,
          0
        );
        const remaining = data.sanctioned_intake - allocatedSum;

        return (
          <div className='flex flex-col items-end gap-1'>
            {/* Cohort total — editable */}
            <div className='flex items-center gap-1'>
              <Input
                type='number'
                min={0}
                max={9999}
                value={data.sanctioned_intake}
                onChange={(e) => onUpdate(data.id, Number(e.target.value) || 0)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSave(data);
                }}
                className='h-7 w-20 text-right text-xs'
                disabled={data.saving}
              />
              {data.dirty && (
                <Button
                  size='sm'
                  variant='outline'
                  className='h-7 w-7 p-0'
                  onClick={() => onSave(data)}
                  disabled={data.saving}
                  title='Save this row'
                >
                  {data.saving ? (
                    <Loader2 className='h-3 w-3 animate-spin' />
                  ) : (
                    <Save className='h-3 w-3' />
                  )}
                </Button>
              )}
            </div>

            {/* Per-quota breakdown summary */}
            {breakdown.length > 0 ? (
              <div className='flex flex-wrap justify-end gap-1 text-[10px] max-w-[260px]'>
                {breakdown.map((q) => (
                  <Badge
                    key={q.quota_id}
                    variant='outline'
                    className='font-normal text-[10px] px-1.5 py-0 h-4 leading-none'
                    title={q.quota_name}
                  >
                    {q.quota_name}:{' '}
                    <span className='tabular-nums font-semibold ml-0.5'>
                      {q.sanctioned_intake}
                    </span>
                  </Badge>
                ))}
                {remaining !== 0 && (
                  <Badge
                    variant='outline'
                    className={`font-normal text-[10px] px-1.5 py-0 h-4 leading-none ${
                      remaining < 0
                        ? 'border-destructive/50 text-destructive'
                        : 'border-amber-300 text-amber-700'
                    }`}
                    title={
                      remaining < 0
                        ? 'Quota allocations exceed cohort total'
                        : 'Unallocated capacity'
                    }
                  >
                    {remaining < 0 ? 'over' : 'free'}:{' '}
                    <span className='tabular-nums font-semibold ml-0.5'>
                      {Math.abs(remaining)}
                    </span>
                  </Badge>
                )}
              </div>
            ) : (
              <div className='text-[10px] text-muted-foreground italic'>
                No quota split — click ⚙ to configure
              </div>
            )}
          </div>
        );
      }
    },
    {
      id: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => <StatusBadge row={row.original} />
    },
    {
      id: 'actions',
      header: () => <span className='sr-only'>Actions</span>,
      cell: ({ row }) => (
        <div className='flex items-center gap-1 justify-end'>
          <Button
            size='sm'
            variant='ghost'
            className='h-7 w-7 p-0'
            onClick={() => onConfigureQuotas(row.original)}
            title='Configure quota allocations'
          >
            <SlidersHorizontal className='h-3.5 w-3.5' />
          </Button>
          <Button
            size='sm'
            variant='ghost'
            className='h-7 w-7 p-0'
            onClick={() => onEdit(row.original)}
            title='Edit seats'
          >
            <Pencil className='h-3.5 w-3.5' />
          </Button>
        </div>
      )
    }
  ];
}
