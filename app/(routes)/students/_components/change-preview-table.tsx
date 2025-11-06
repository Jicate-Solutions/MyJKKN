'use client';

import { StudentChanges } from '@/types/student';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Plus, Minus } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface ChangePreviewTableProps {
  studentChanges: StudentChanges;
}

export function ChangePreviewTable({ studentChanges }: ChangePreviewTableProps) {
  const getChangeIcon = (changeType: 'update' | 'add' | 'remove') => {
    switch (changeType) {
      case 'add':
        return <Plus className='h-3 w-3' />;
      case 'remove':
        return <Minus className='h-3 w-3' />;
      default:
        return <ArrowRight className='h-3 w-3' />;
    }
  };

  const getChangeColor = (changeType: 'update' | 'add' | 'remove') => {
    switch (changeType) {
      case 'add':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'remove':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    }
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined || value === '') {
      return <span className='text-muted-foreground italic'>[empty]</span>;
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  return (
    <div className='space-y-4'>
      {/* Student Header */}
      <div className='flex items-center gap-3 p-4 bg-muted/50 rounded-lg'>
        <Avatar className='h-12 w-12'>
          {studentChanges.photoUrl ? (
            <AvatarImage src={studentChanges.photoUrl} alt={studentChanges.studentName} />
          ) : (
            <AvatarFallback>
              {studentChanges.studentName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        <div>
          <h4 className='font-semibold'>{studentChanges.studentName}</h4>
          {studentChanges.rollNumber && (
            <p className='text-sm text-muted-foreground'>
              Roll No: {studentChanges.rollNumber}
            </p>
          )}
        </div>
        <Badge variant='secondary' className='ml-auto'>
          {studentChanges.changes.length} change{studentChanges.changes.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Changes Table */}
      <div className='border rounded-lg'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-[200px]'>Field</TableHead>
              <TableHead>Old Value</TableHead>
              <TableHead className='w-[50px]'></TableHead>
              <TableHead>New Value</TableHead>
              <TableHead className='w-[100px]'>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {studentChanges.changes.map((change, index) => (
              <TableRow key={index}>
                <TableCell className='font-medium'>{change.fieldLabel}</TableCell>
                <TableCell>
                  <div className='max-w-xs truncate'>{formatValue(change.oldValue)}</div>
                </TableCell>
                <TableCell className='text-center'>
                  {getChangeIcon(change.changeType)}
                </TableCell>
                <TableCell>
                  <div className='max-w-xs truncate font-medium'>
                    {formatValue(change.newValue)}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant='secondary'
                    className={getChangeColor(change.changeType)}
                  >
                    {change.changeType}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
