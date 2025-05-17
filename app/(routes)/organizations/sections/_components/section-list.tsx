'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Edit,
  MoreHorizontal,
  Trash,
  RefreshCw,
  CheckSquare,
  Square,
  Eye
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { SectionService } from '@/lib/services/organization/section-service';
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
import type { Section } from '@/types/organizations';
import { toast } from 'react-hot-toast';

interface SectionListProps {
  sections: Section[];
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onRefresh?: () => void;
}

export function SectionList({
  sections,
  canView,
  canEdit,
  canDelete,
  onRefresh
}: SectionListProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<Section | null>(null);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleDeleteClick = (section: Section) => {
    setSectionToDelete(section);
    setIsDeleting(true);
  };

  const confirmDelete = async () => {
    if (!sectionToDelete) return;

    try {
      setIsLoading(true);
      await SectionService.deleteSection(sectionToDelete.id);
      toast.success('Section deleted successfully');
      if (onRefresh) onRefresh();
      else window.location.reload();
    } catch (error) {
      console.error('Error deleting section:', error);
      toast.error('Failed to delete section');
    } finally {
      setIsLoading(false);
      setIsDeleting(false);
      setSectionToDelete(null);
    }
  };

  const cancelDelete = () => {
    setIsDeleting(false);
    setSectionToDelete(null);
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
      setSelectedSections(selectedSections.filter((secId) => secId !== id));
    } else {
      setSelectedSections([...selectedSections, id]);
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

      if (onRefresh) onRefresh();
      else window.location.reload();
    } catch (error) {
      console.error('Error deleting sections:', error);
      toast.error('Failed to delete sections');
    } finally {
      setIsLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  return (
    <>
      {canDelete && selectedSections.length > 0 && (
        <div className='flex justify-between mb-4'>
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={isLoading}
          >
            <Trash className='mr-2 h-4 w-4' />
            Delete Selected ({selectedSections.length})
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className='mr-2 h-4 w-4' />
            Refresh
          </Button>
        </div>
      )}

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDelete && (
                <TableHead className='w-12'>
                  <div
                    className='flex items-center justify-center'
                    onClick={toggleSelectAll}
                  >
                    {selectedSections.length === sections.length &&
                    sections.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Section Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.map((section) => (
              <TableRow
                key={section.id}
                className={
                  selectedSections.includes(section.id) ? 'bg-muted/50' : ''
                }
              >
                {canDelete && (
                  <TableCell>
                    <div
                      className='flex items-center justify-center'
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
                  {section.section_name}
                </TableCell>
                <TableCell>
                  {section.is_active ? (
                    <Badge variant='success'>Active</Badge>
                  ) : (
                    <Badge variant='secondary'>Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className='text-right'>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' className='h-8 w-8 p-0'>
                        <span className='sr-only'>Open menu</span>
                        <MoreHorizontal className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      {canView && (
                        <DropdownMenuItem asChild>
                          <Link href={`/organizations/sections/${section.id}`}>
                            <Eye className='mr-2 h-4 w-4' />
                            View
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {canEdit && (
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/organizations/sections/${section.id}/edit`}
                          >
                            <Edit className='mr-2 h-4 w-4' />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {canDelete && (
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(section)}
                          className='text-destructive focus:text-destructive'
                        >
                          <Trash className='mr-2 h-4 w-4' />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Single Delete Dialog */}
      <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              section &quot;{sectionToDelete?.section_name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete} disabled={isLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete'}
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
    </>
  );
}
