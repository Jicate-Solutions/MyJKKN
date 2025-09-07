'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { TimetableTemplate } from '@/types/academics';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteTemplate } from '@/hooks/use-templates';
import toast from 'react-hot-toast';
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Copy,
  Download,
  Share,
  Star
} from 'lucide-react';
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
import { TemplatePreviewModal } from './template-preview-modal';

interface TemplateRowActionsProps {
  template: TimetableTemplate;
}

export function TemplateRowActions({ template }: TemplateRowActionsProps) {
  const router = useRouter();
  const { isSuperAdmin, canAccess } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const deleteTemplate = useDeleteTemplate();

  // Permission checks
  const canEdit = isSuperAdmin || canAccess('academic.timetables', 'edit');
  const canDelete = isSuperAdmin || canAccess('academic.timetables', 'delete');
  const canCreate = isSuperAdmin || canAccess('academic.timetables', 'create');

  const handlePreview = () => {
    setShowPreviewModal(true);
  };

  const handleEdit = () => {
    router.push(`/academic/timetables/${template.id}/edit?is_template=true`);
  };

  const handleDuplicate = () => {
    router.push(
      `/academic/timetables/new?template_id=${template.id}&action=duplicate`
    );
  };

  const handleUseTemplate = () => {
    router.push(`/academic/timetables/new?template_id=${template.id}`);
  };

  const handleDelete = async () => {
    try {
      await deleteTemplate.mutateAsync(template.id);
      toast.success('Template deleted successfully');
    } catch (error) {
      toast.error('Failed to delete template');
    } finally {
      setShowDeleteDialog(false);
    }
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/academic/timetables/templates/${template.id}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success('Template link copied to clipboard');
  };

  const handleExport = () => {
    // TODO: Implement template export functionality
    toast.success('Export functionality coming soon');
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          >
            <MoreHorizontal className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[180px]'>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handlePreview}>
            <Eye className='mr-2 h-4 w-4' />
            Preview
          </DropdownMenuItem>

          {canCreate && (
            <DropdownMenuItem onClick={handleUseTemplate}>
              <Copy className='mr-2 h-4 w-4' />
              Use Template
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={handleShare}>
            <Share className='mr-2 h-4 w-4' />
            Share Link
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleExport}>
            <Download className='mr-2 h-4 w-4' />
            Export
          </DropdownMenuItem>

          {canCreate && (
            <DropdownMenuItem onClick={handleDuplicate}>
              <Copy className='mr-2 h-4 w-4' />
              Duplicate
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {canEdit && (
            <DropdownMenuItem onClick={handleEdit}>
              <Edit className='mr-2 h-4 w-4' />
              Edit Template
            </DropdownMenuItem>
          )}

          {canDelete && (
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className='text-destructive focus:text-destructive'
            >
              <Trash2 className='mr-2 h-4 w-4' />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the template &quot;
              {template.template_name}&quot;.
              {template.usage_count && template.usage_count > 0 && (
                <>
                  <br />
                  <strong>Warning:</strong> This template has been used{' '}
                  {template.usage_count} time
                  {template.usage_count !== 1 ? 's' : ''}. Existing timetables
                  created from this template will not be affected.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={deleteTemplate.isPending}
            >
              {deleteTemplate.isPending ? 'Deleting...' : 'Delete Template'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template Preview Modal */}
      <TemplatePreviewModal
        template={template}
        open={showPreviewModal}
        onOpenChange={setShowPreviewModal}
      />
    </>
  );
}
