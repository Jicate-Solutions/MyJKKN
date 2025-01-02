// app/(routes)/applications/_components/application-list.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MoreVertical,
  Edit,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Application } from '@/types/applications';
import { ApplicationService } from '@/lib/services/application/application-service';
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
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
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

interface ApplicationListProps {
  applications: Application[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function ApplicationList({
  applications,
  metadata,
  onPageChange,
  onRefresh
}: ApplicationListProps) {
  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      setIsDeleting(true);
      await ApplicationService.deleteApplication(deleteId);
      onRefresh();
    } catch (error) {
      console.error('Error deleting application:', error);
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className='hidden md:table-cell'>Status</TableHead>
            <TableHead className='hidden md:table-cell'>Integration</TableHead>
            <TableHead className='hidden md:table-cell'>Platform</TableHead>
            <TableHead className='text-right'>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className='text-center'>
                No applications found
              </TableCell>
            </TableRow>
          ) : (
            applications.map((app) => (
              <TableRow key={app.id}>
                <TableCell className='font-medium'>{app.name}</TableCell>
                <TableCell>{app.category?.name || 'Uncategorized'}</TableCell>
                <TableCell className='hidden md:table-cell'>
                  <Badge variant={app.is_active ? 'default' : 'secondary'}>
                    {app.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className='hidden md:table-cell'>
                  {app.integration_type}
                </TableCell>
                <TableCell className='hidden md:table-cell'>
                  {app.supported_platforms}
                </TableCell>
                <TableCell className='text-right'>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' className='h-8 w-8 p-0'>
                        <span className='sr-only'>Open menu</span>
                        <MoreVertical className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuItem
                        onClick={() =>
                          router.push(`/applications/${app.id}/edit`)
                        }
                      >
                        <Edit className='mr-2 h-4 w-4' />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className='text-destructive'
                        onClick={() => setDeleteId(app.id)}
                      >
                        <Trash2 className='mr-2 h-4 w-4' />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {metadata.totalPages > 1 && (
        <div className='flex items-center justify-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(metadata.page - 1)}
            disabled={metadata.page <= 1}
          >
            <ChevronLeft className='h-4 w-4' />
            Previous
          </Button>
          <span className='text-sm'>
            Page {metadata.page} of {metadata.totalPages}
          </span>
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
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              application and remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
