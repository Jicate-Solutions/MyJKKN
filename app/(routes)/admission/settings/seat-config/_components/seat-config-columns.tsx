'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, Save, Loader2, Pencil } from 'lucide-react';

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
}

interface ColumnFactoryOptions {
  onUpdate: (admissionYearId: string, value: number) => void;
  onSave: (row: AdmissionYearRow) => void;
  onEdit: (row: AdmissionYearRow) => void;
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
  onEdit
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
      cell: ({ row }) => {
        const data = row.original;
        return (
          <div className='flex items-center gap-1 justify-end'>
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
        <Button
          size='sm'
          variant='ghost'
          className='h-7 w-7 p-0'
          onClick={() => onEdit(row.original)}
          title='Edit seats'
        >
          <Pencil className='h-3.5 w-3.5' />
        </Button>
      )
    }
  ];
}
