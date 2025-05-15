'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Section } from '@/types/organizations';
import { SectionService } from '@/lib/services/organization/section-service';
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

interface SectionListProps {
  sections: Section[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function SectionList({
  sections,
  metadata,
  onPageChange,
  onRefresh,
  canEdit = false,
  canDelete = false
}: SectionListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<Section | null>(null);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const handleDelete = async () => {
    if (!sectionToDelete) return;

    try {
      setIsLoading(true);
      await SectionService.deleteSection(sectionToDelete.id);
      onRefresh();
      toast.success('Section deleted successfully');
    } catch (error) {
      console.error('Error deleting section:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete section'
      );
    } finally {
      setIsLoading(false);
      setSectionToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSections.length === 0) return;

    try {
      setIsLoading(true);

      // Process deletions sequentially
      for (const id of selectedSections) {
        await SectionService.deleteSection(id);
      }

      toast.success(`${selectedSections.length} sections deleted successfully`);
      setSelectedSections([]);
      onRefresh();
    } catch (error) {
      console.error('Error deleting sections:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete sections'
      );
    } finally {
      setIsLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedSections.length === sections.length) {
      setSelectedSections([]);
    } else {
      setSelectedSections(sections.map((section) => section.id));
    }
  };

  const toggleSelectSection = (id: string) => {
    if (selectedSections.includes(id)) {
      setSelectedSections(selectedSections.filter((itemId) => itemId !== id));
    } else {
      setSelectedSections([...selectedSections, id]);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        {selectedSections.length > 0 && canDelete && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedSections.length})
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className={selectedSections.length > 0 ? 'ml-auto' : 'ml-auto'}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDelete && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedSections.length === sections.length &&
                    sections.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Semester</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDelete ? 9 : 8}
                  className='text-center text-muted-foreground h-24'
                >
                  No sections found
                </TableCell>
              </TableRow>
            ) : (
              sections.map((section) => (
                <TableRow
                  key={section.id}
                  className={
                    selectedSections.includes(section.id) ? 'bg-muted/50' : ''
                  }
                >
                  {canDelete && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectSection(section.id)}
                      >
                        {selectedSections.includes(section.id) ? (
                          <CheckSquare className='h-4 w-4 cursor-pointer' />
                        ) : (
                          <Square className='h-4 w-4 cursor-pointer' />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className='font-medium'>
                    <Link
                      href={`/organizations/sections/${section.id}`}
                      className='hover:text-primary'
                    >
                      {section.section_code}
                    </Link>
                  </TableCell>
                  <TableCell>{section.section_name}</TableCell>
                  <TableCell>{section.course?.course_name}</TableCell>
                  <TableCell>{section.semester?.semester_name}</TableCell>
                  <TableCell>{section.program?.program_name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={section.is_active ? 'default' : 'secondary'}
                    >
                      {section.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(section.created_at)}</TableCell>
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
                            href={`/organizations/sections/${section.id}`}
                            className='cursor-pointer'
                          >
                            <FileText className='mr-2 h-4 w-4' />
                            View
                          </Link>
                        </DropdownMenuItem>

                        {canEdit ? (
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/organizations/sections/${section.id}/edit`}
                              className='cursor-pointer'
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem disabled className='opacity-50'>
                            <Edit className='mr-2 h-4 w-4' />
                            Edit
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />

                        {canDelete ? (
                          <DropdownMenuItem
                            onClick={() => setSectionToDelete(section)}
                            className='text-destructive focus:text-destructive cursor-pointer'
                          >
                            <Trash2 className='mr-2 h-4 w-4' />
                            Delete
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            disabled
                            className='text-destructive opacity-50'
                          >
                            <Trash2 className='mr-2 h-4 w-4' />
                            Delete Section
                          </DropdownMenuItem>
                        )}
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

      {/* Single Delete Dialog */}
      <AlertDialog
        open={!!sectionToDelete}
        onOpenChange={(open) => !open && setSectionToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Section</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {sectionToDelete?.section_name}?
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
              {isLoading ? 'Deleting...' : 'Delete Section'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Sections</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedSections.length}{' '}
              sections? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading
                ? 'Deleting...'
                : `Delete ${selectedSections.length} Sections`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
