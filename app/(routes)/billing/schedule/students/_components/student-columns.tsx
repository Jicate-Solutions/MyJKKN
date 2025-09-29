'use client';

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import {
  Eye,
  FileText,
  Phone,
  Mail,
  Building,
  GraduationCap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { StudentForBilling } from '@/types/billing-schedule';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { formatCurrency as utilFormatCurrency } from '@/lib/utils';

const formatCurrency = (amount: number) => {
  return utilFormatCurrency(amount, { showDecimals: true });
};

const getOutstandingBadge = (amount: number) => {
  if (amount === 0) {
    return (
      <Badge variant='outline' className='text-green-600 border-green-600'>
        No Dues
      </Badge>
    );
  } else if (amount > 0 && amount <= 10000) {
    return (
      <Badge variant='outline' className='text-yellow-600 border-yellow-600'>
        Low
      </Badge>
    );
  } else if (amount > 10000 && amount <= 50000) {
    return (
      <Badge variant='outline' className='text-orange-600 border-orange-600'>
        Medium
      </Badge>
    );
  } else {
    return (
      <Badge variant='outline' className='text-red-600 border-red-600'>
        High
      </Badge>
    );
  }
};

export const columns: ColumnDef<StudentForBilling>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
        className='translate-y-[2px]'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
        className='translate-y-[2px]'
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 100,
    minSize: 100,
    maxSize: 100
  },
  {
    accessorKey: 'roll_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Roll Number' />
    ),

    cell: ({ row }) => {
      const rollNumber = row.getValue('roll_number') as string;
      return <div className='font-medium'>{rollNumber || 'N/A'}</div>;
    },
    size: 100,
    minSize: 100,
    maxSize: 100
  },
  {
    accessorKey: 'student_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Student Name' />
    ),
    cell: ({ row }) => {
      const student = row.original;
      const fullName =
        [student.first_name, student.last_name].filter(Boolean).join(' ') ||
        'N/A';
      return (
        <div className='space-y-1'>
          <Link
            href={`/billing/schedule/students/${student.id}`}
            className='font-medium text-primary hover:text-primary/80 hover:underline cursor-pointer'
          >
            {fullName}
          </Link>
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <div className='flex items-center gap-1'>
                    <Phone className='h-3 w-3' />
                    {student.mobile_number}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Mobile: {student.mobile_number}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      );
    },
    size: 200,
    minSize: 200,
    maxSize: 250
  },

  {
    accessorKey: 'institution_department',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution & Department' />
    ),
    cell: ({ row }) => {
      const student = row.original;
      return (
        <div className='space-y-1'>
          <div className='flex items-center gap-1'>
            <Building className='h-3 w-3 text-muted-foreground' />
            <span className='text-sm font-medium'>
              {student.institution?.name || 'N/A'}
            </span>
          </div>
          <div className='text-xs text-muted-foreground'>
            {student.department?.department_name || 'N/A'}
          </div>
        </div>
      );
    },
    enableSorting: false,
    size: 600,
    minSize: 600,
    maxSize: 600
  },
  {
    accessorKey: 'program_semester',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Program & Semester' />
    ),
    cell: ({ row }) => {
      const student = row.original;
      return (
        <div className='space-y-1'>
          <div className='flex items-center gap-1'>
            <GraduationCap className='h-3 w-3 text-muted-foreground' />
            <span className='text-sm font-medium'>
              {student.program?.program_name || 'N/A'}
            </span>
          </div>
          <div className='text-xs text-muted-foreground'>
            {student.semester?.semester_name || 'N/A'}
          </div>
        </div>
      );
    },
    enableSorting: false,
    size: 300,
    minSize: 300,
    maxSize: 300
  },
  {
    accessorKey: 'outstanding_amount',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title='Outstanding Amount'
        className='text-right'
      />
    ),
    cell: ({ row }) => {
      const amount = row.getValue('outstanding_amount') as number;
      return (
        <div className='text-right space-y-1'>
          <div className='font-medium'>{formatCurrency(amount)}</div>
          <div>{getOutstandingBadge(amount)}</div>
        </div>
      );
    },
    size: 180,
    minSize: 180,
    maxSize: 180
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => {
      const student = row.original;

      return (
        <div className='flex items-center justify-center gap-1'>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant='ghost' size='sm' asChild>
                  <Link href={`/billing/schedule/students/${student.id}`}>
                    <Eye className='h-4 w-4' />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View Bill Details</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant='ghost' size='sm' asChild>
                  <Link href={`/billing/schedule/new?student_id=${student.id}`}>
                    <FileText className='h-4 w-4' />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create Bill</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
    size: 120
  }
];
