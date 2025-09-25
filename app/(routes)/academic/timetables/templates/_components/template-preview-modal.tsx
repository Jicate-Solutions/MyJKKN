'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TimetableTemplate } from '@/types/academics';
import { format } from 'date-fns';
import {
  Calendar,
  Clock,
  Users,
  Copy,
  Edit,
  Building,
  BookOpen,
  GraduationCap,
  Hash,
  Tag,
  Star,
  Activity
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';

interface TemplatePreviewModalProps {
  template: TimetableTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplatePreviewModal({
  template,
  open,
  onOpenChange
}: TemplatePreviewModalProps) {
  const router = useRouter();
  const { isSuperAdmin, canAccess } = usePermissions();

  const canCreate = isSuperAdmin || canAccess('academic.timetables', 'create');
  const canEdit = isSuperAdmin || canAccess('academic.timetables', 'edit');

  const handleUseTemplate = () => {
    router.push(`/academic/timetables/new?template_id=${template.id}`);
    onOpenChange(false);
  };

  const handleEditTemplate = () => {
    router.push(`/academic/timetables/${template.id}/edit?is_template=true`);
    onOpenChange(false);
  };

  const renderTimetableGrid = () => {
    if (!template.timetable_data) {
      return (
        <div className='flex items-center justify-center h-32 text-muted-foreground'>
          No timetable data available for preview
        </div>
      );
    }

    // This is a simplified preview - you might want to enhance this based on your timetable data structure
    return (
      <div className='border rounded-lg p-4'>
        <div className='text-sm text-muted-foreground mb-2'>
          Timetable Preview ({template.timetable_format || 'regular'} format)
        </div>
        {/* Add your actual timetable grid component here */}
        <div className='grid grid-cols-6 gap-2 text-sm'>
          <div className='font-medium p-2 bg-muted rounded'>Time</div>
          <div className='font-medium p-2 bg-muted rounded'>Mon</div>
          <div className='font-medium p-2 bg-muted rounded'>Tue</div>
          <div className='font-medium p-2 bg-muted rounded'>Wed</div>
          <div className='font-medium p-2 bg-muted rounded'>Thu</div>
          <div className='font-medium p-2 bg-muted rounded'>Fri</div>
          {/* Sample preview rows */}
          <div className='p-2 text-muted-foreground'>9:00 AM</div>
          <div className='p-2 border rounded'>Subject A</div>
          <div className='p-2 border rounded'>Subject B</div>
          <div className='p-2 border rounded'>Break</div>
          <div className='p-2 border rounded'>Subject C</div>
          <div className='p-2 border rounded'>Lab</div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-4xl max-h-[90vh]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Star className='h-5 w-5 text-yellow-500' />
            {template.template_name}
          </DialogTitle>
          <DialogDescription>
            {template.template_description || 'No description available'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className='max-h-[60vh]'>
          <div className='space-y-6 pr-6'>
            {/* Template Information */}
            <Card>
              <CardHeader>
                <CardTitle className='text-lg flex items-center gap-2'>
                  <Activity className='h-5 w-5' />
                  Template Information
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-3'>
                    <div className='flex items-center gap-2'>
                      <Building className='h-4 w-4 text-muted-foreground' />
                      <span className='text-sm font-medium'>Institution:</span>
                      <span className='text-sm'>
                        {template.institution?.name || 'N/A'}
                      </span>
                    </div>

                    <div className='flex items-center gap-2'>
                      <GraduationCap className='h-4 w-4 text-muted-foreground' />
                      <span className='text-sm font-medium'>Program:</span>
                      <span className='text-sm'>
                        {template.program?.program_name || 'N/A'}
                      </span>
                    </div>

                    <div className='flex items-center gap-2'>
                      <BookOpen className='h-4 w-4 text-muted-foreground' />
                      <span className='text-sm font-medium'>Department:</span>
                      <span className='text-sm'>
                        {template.department?.department_name || 'N/A'}
                      </span>
                    </div>

                    <div className='flex items-center gap-2'>
                      <Hash className='h-4 w-4 text-muted-foreground' />
                      <span className='text-sm font-medium'>Semester:</span>
                      <Badge variant='secondary'>
                        {template.semesters?.semester_name || 'Semester'}
                        {template.sections?.section_name && ` - ${template.sections.section_name}`}
                      </Badge>
                    </div>
                  </div>

                  <div className='space-y-3'>
                    <div className='flex items-center gap-2'>
                      <Tag className='h-4 w-4 text-muted-foreground' />
                      <span className='text-sm font-medium'>Category:</span>
                      {template.template_category ? (
                        <Badge variant='outline'>
                          {template.template_category}
                        </Badge>
                      ) : (
                        <span className='text-sm text-muted-foreground'>
                          None
                        </span>
                      )}
                    </div>

                    <div className='flex items-center gap-2'>
                      <Users className='h-4 w-4 text-muted-foreground' />
                      <span className='text-sm font-medium'>Usage:</span>
                      <span className='text-sm'>
                        {template.usage_count || 0} times
                      </span>
                    </div>

                    <div className='flex items-center gap-2'>
                      <Clock className='h-4 w-4 text-muted-foreground' />
                      <span className='text-sm font-medium'>Format:</span>
                      <Badge variant='outline' className='capitalize'>
                        {template.timetable_format || 'regular'}
                      </Badge>
                    </div>

                    <div className='flex items-center gap-2'>
                      <Calendar className='h-4 w-4 text-muted-foreground' />
                      <span className='text-sm font-medium'>Created:</span>
                      <span className='text-sm'>
                        {format(new Date(template.created_at), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                {template.template_tags &&
                  template.template_tags.length > 0 && (
                    <div>
                      <span className='text-sm font-medium mb-2 block'>
                        Tags:
                      </span>
                      <div className='flex flex-wrap gap-1'>
                        {template.template_tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant='secondary'
                            className='text-xs'
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Status */}
                <div className='flex items-center gap-2'>
                  <span className='text-sm font-medium'>Status:</span>
                  <Badge
                    variant={template.is_active ? 'default' : 'secondary'}
                    className={
                      template.is_active
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-gray-50 text-gray-700 border-gray-200'
                    }
                  >
                    {template.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Separator />

            {/* Timetable Preview */}
            <Card>
              <CardHeader>
                <CardTitle className='text-lg flex items-center gap-2'>
                  <Calendar className='h-5 w-5' />
                  Timetable Preview
                </CardTitle>
              </CardHeader>
              <CardContent>{renderTimetableGrid()}</CardContent>
            </Card>

            {/* Additional Metadata */}
            {(template.selected_days || template.periods) && (
              <Card>
                <CardHeader>
                  <CardTitle className='text-lg'>Schedule Details</CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {template.selected_days && (
                    <div>
                      <span className='text-sm font-medium mb-2 block'>
                        Active Days:
                      </span>
                      <div className='flex flex-wrap gap-1'>
                        {template.selected_days.map((day) => (
                          <Badge
                            key={day}
                            variant='outline'
                            className='text-xs'
                          >
                            {day}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {template.periods && (
                    <div>
                      <span className='text-sm font-medium mb-2 block'>
                        Periods:
                      </span>
                      <div className='text-sm text-muted-foreground'>
                        {Array.isArray(template.periods)
                          ? `${template.periods.length} periods configured`
                          : 'Period information available'}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className='flex gap-2'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Close
          </Button>

          {canEdit && (
            <Button variant='outline' onClick={handleEditTemplate}>
              <Edit className='h-4 w-4 mr-2' />
              Edit Template
            </Button>
          )}

          {canCreate && (
            <Button onClick={handleUseTemplate}>
              <Copy className='h-4 w-4 mr-2' />
              Use This Template
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
