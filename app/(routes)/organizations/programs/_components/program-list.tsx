'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  BookOpen,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Program } from '@/types/organizations';
import { ProgramService } from '@/lib/services/program-service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

interface ProgramListProps {
  programs: Program[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function ProgramList({
  programs,
  metadata,
  onPageChange,
  onRefresh
}: ProgramListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [programToDelete, setProgramToDelete] = useState<Program | null>(null);

  const handleDelete = async () => {
    if (!programToDelete) return;

    try {
      setIsLoading(true);
      await ProgramService.deleteProgram(programToDelete.id);
      onRefresh();
    } catch (error) {
      console.error('Error deleting program:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete program'
      );
    } finally {
      setIsLoading(false);
      setProgramToDelete(null);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className='ml-auto'
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Program ID</TableHead>
              <TableHead>Program Name</TableHead>
              <TableHead>Degree</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {programs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className='text-center text-muted-foreground h-24'
                >
                  No programs found
                </TableCell>
              </TableRow>
            ) : (
              programs.map((program) => (
                <TableRow key={program.id}>
                  <TableCell className='font-medium'>
                    <Link
                      href={`/organizations/programs/${program.id}`}
                      className='hover:text-primary'
                    >
                      {program.program_id}
                    </Link>
                  </TableCell>
                  <TableCell>{program.program_name}</TableCell>
                  <TableCell>{program.degree?.degree_name || 'N/A'}</TableCell>
                  <TableCell>
                    {program.department?.department_name || 'N/A'}
                  </TableCell>
                  <TableCell>{program.institution?.name || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={program.is_active ? 'default' : 'secondary'}
                    >
                      {program.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(program.created_at)}</TableCell>
                  <TableCell className='text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' className='h-8 w-8 p-0'>
                          <span className='sr-only'>Open menu</span>
                          <MoreVertical className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/organizations/programs/${program.id}`}
                            className='cursor-pointer'
                          >
                            <BookOpen className='mr-2 h-4 w-4' />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/organizations/programs/${program.id}/edit`}
                            className='cursor-pointer'
                          >
                            <Edit className='mr-2 h-4 w-4' />
                            Edit Program
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setProgramToDelete(program)}
                          className='text-destructive focus:text-destructive cursor-pointer'
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete Program
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {metadata.totalPages > 1 && (
        <div className='flex items-center justify-between px-2'>
          <div className='text-sm text-muted-foreground'>
            Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
            {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
            {metadata.total} entries
          </div>

          <div className='flex items-center space-x-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page - 1)}
              disabled={metadata.page <= 1}
            >
              <ChevronLeft className='h-4 w-4' />
              Previous
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page + 1)}
              disabled={metadata.page >= metadata.totalPages}
            >
              Next
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!programToDelete}
        onOpenChange={(open) => !open && setProgramToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Program</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {programToDelete?.program_name}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete Program'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
