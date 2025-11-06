'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Edit3, Download, Upload, Image, FileDown } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { StudentFilters } from '@/types/student';
import { ExportStudents } from './export-students';
import { ExportLearnersButton } from './export-learners-button';
import { BulkEditLearners } from './bulk-edit-learners';
import { DownloadNewStudentTemplateButton } from './download-new-student-template-button';
import { BulkCreateStudents } from './bulk-create-students';
import { BulkUploadStudentImages } from './bulk-upload-student-images';

interface LearnersActionsMenuProps {
  filters?: StudentFilters;
}

export function LearnersActionsMenu({ filters }: LearnersActionsMenuProps) {
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);

  // Check all permissions at once
  const { can, isSuperAdmin, isLoading } = usePermissions();

  // Permission checks
  const canExportStudents = isSuperAdmin || can('students.view'); // General export
  const canBulkEdit = isSuperAdmin || can('students.bulk_edit');
  const canExportForEdit = isSuperAdmin || can('students.bulk_edit.export');
  const canCreateStudents = isSuperAdmin || can('students.create');
  const canBulkCreate = isSuperAdmin || can('students.bulk_create');
  const canDownloadTemplate = isSuperAdmin || can('students.bulk_create.download_template');
  const canUploadImages = isSuperAdmin || can('students.bulk_upload_images');

  // Debug logging
  if (typeof window !== 'undefined') {
    console.log('[LearnersActionsMenu] Permission Debug:', {
      isSuperAdmin,
      canExportStudents,
      canBulkEdit,
      canExportForEdit,
      canCreateStudents,
      canBulkCreate,
      canDownloadTemplate,
      canUploadImages
    });
  }

  // Don't render anything while loading
  if (isLoading) {
    return (
      <div className='space-y-3'>
        <Card>
          <CardContent className='pt-6'>
            <div className='flex items-center justify-center py-4'>
              <div className='animate-pulse text-sm text-muted-foreground'>Loading actions...</div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if user has any bulk edit permissions
  const hasBulkEditPermissions = canExportStudents || canBulkEdit || canExportForEdit;

  // Check if user has any bulk create permissions
  const hasBulkCreatePermissions = canCreateStudents && (canBulkCreate || canDownloadTemplate || canUploadImages);

  return (
    <div className='space-y-3'>
      {/* Bulk Edit Operations - For editing existing learners */}
      {hasBulkEditPermissions && (
        <Collapsible open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
          <Card>
            <CardHeader className='pb-3'>
              <CollapsibleTrigger asChild>
                <Button
                  variant='ghost'
                  className='w-full justify-between p-0 hover:bg-transparent'
                >
                  <div className='flex items-center gap-2'>
                    <Edit3 className='h-4 w-4 text-green-600' />
                    <div className='text-left'>
                      <CardTitle className='text-sm font-semibold'>
                        Bulk Edit Operations
                      </CardTitle>
                      <CardDescription className='text-xs'>
                        Export, edit, and update existing learner data
                      </CardDescription>
                    </div>
                  </div>
                  {bulkEditOpen ? (
                    <ChevronUp className='h-4 w-4 text-muted-foreground' />
                  ) : (
                    <ChevronDown className='h-4 w-4 text-muted-foreground' />
                  )}
                </Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className='pt-0'>
                <div className='grid grid-cols-1 sm:grid-cols-3 gap-2'>
                  {canExportStudents && <ExportStudents currentFilters={filters} />}
                  {canExportForEdit && <ExportLearnersButton filters={filters} />}
                  {canBulkEdit && <BulkEditLearners />}
                  {!canExportStudents && !canExportForEdit && !canBulkEdit && (
                    <p className='col-span-3 text-sm text-muted-foreground text-center py-4'>
                      No actions available. Contact administrator for permissions.
                    </p>
                  )}
                </div>
                <p className='text-xs text-muted-foreground mt-3 p-2 bg-muted/50 rounded-md'>
                  <strong>How it works:</strong> Export data (view/download) → Export for editing → Edit in Excel → Upload → Apply updates
                </p>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Bulk Create Operations - For creating new students */}
      {hasBulkCreatePermissions && (
        <Collapsible open={bulkCreateOpen} onOpenChange={setBulkCreateOpen}>
          <Card>
            <CardHeader className='pb-3'>
              <CollapsibleTrigger asChild>
                <Button
                  variant='ghost'
                  className='w-full justify-between p-0 hover:bg-transparent'
                >
                  <div className='flex items-center gap-2'>
                    <Upload className='h-4 w-4 text-blue-600' />
                    <div className='text-left'>
                      <CardTitle className='text-sm font-semibold'>
                        Bulk Create Operations
                      </CardTitle>
                      <CardDescription className='text-xs'>
                        Add new students and upload profile photos in bulk
                      </CardDescription>
                    </div>
                  </div>
                  {bulkCreateOpen ? (
                    <ChevronUp className='h-4 w-4 text-muted-foreground' />
                  ) : (
                    <ChevronDown className='h-4 w-4 text-muted-foreground' />
                  )}
                </Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className='pt-0'>
                <div className='grid grid-cols-1 sm:grid-cols-3 gap-2'>
                  {canDownloadTemplate && <DownloadNewStudentTemplateButton />}
                  {canBulkCreate && <BulkCreateStudents />}
                  {canUploadImages && <BulkUploadStudentImages />}
                  {!canDownloadTemplate && !canBulkCreate && !canUploadImages && (
                    <p className='col-span-3 text-sm text-muted-foreground text-center py-4'>
                      No actions available. Contact administrator for permissions.
                    </p>
                  )}
                </div>
                <p className='text-xs text-muted-foreground mt-3 p-2 bg-muted/50 rounded-md'>
                  <strong>How it works:</strong> Download template → Fill student data → Upload file → Upload photos (optional)
                </p>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
