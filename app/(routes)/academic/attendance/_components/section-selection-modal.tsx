'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: { id: string; name: string }[];
  onSectionSelect: (sectionId: string) => void;
  periodName: string;
  courseName: string;
  startTime?: string;
  endTime?: string;
}

export function SectionSelectionModal({
  open,
  onOpenChange,
  sections,
  onSectionSelect,
  periodName,
  courseName,
  startTime,
  endTime
}: SectionSelectionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[600px]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 text-xl'>
            <Users className='h-6 w-6 text-primary' />
            Select Section to Mark Attendance
          </DialogTitle>
          <DialogDescription className='space-y-2 pt-2'>
            <div className='flex items-center gap-2 text-sm'>
              <GraduationCap className='h-4 w-4' />
              <span className='font-medium'>{courseName}</span>
              <span className='text-muted-foreground'>•</span>
              <span className='font-medium'>{periodName}</span>
            </div>
            {startTime && endTime && (
              <div className='text-xs text-muted-foreground'>
                {startTime} - {endTime}
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 mt-4'>
          <div className='bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4'>
            <p className='text-sm text-blue-800 dark:text-blue-300'>
              <strong>Multi-Section Period:</strong> This period is scheduled
              for multiple sections. Please select which section you want to
              mark attendance for.
            </p>
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium text-muted-foreground uppercase tracking-wide'>
              Available Sections ({sections.length})
            </label>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'>
              {sections.map((section, index) => (
                <Button
                  key={section.id}
                  variant='outline'
                  className={cn(
                    'h-auto py-6 hover:bg-primary hover:text-primary-foreground transition-all duration-200 hover:scale-105 active:scale-95',
                    'border-2 hover:border-primary'
                  )}
                  onClick={() => {
                    onSectionSelect(section.id);
                    onOpenChange(false);
                  }}
                >
                  <div className='flex flex-col items-center gap-2'>
                    <Badge
                      variant='secondary'
                      className='text-xs font-semibold'
                    >
                      Section
                    </Badge>
                    <span className='text-2xl font-bold'>{section.name}</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          <div className='pt-4 border-t'>
            <Button
              variant='ghost'
              onClick={() => onOpenChange(false)}
              className='w-full'
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
