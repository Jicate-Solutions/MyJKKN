'use client';

import { BosCourseSyllabus } from '@/types/bos';
import { SyllabusForm } from '@/components/bos/syllabus-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CloneDialogProps {
  open: boolean;
  syllabus: BosCourseSyllabus | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Clone popup. Shows ONLY the Course Information (Basic Info) cascade in compact
 * mode; on submit it posts Basic Info to /api/bos/syllabus/[id]/clone, which
 * copies every content section (objectives, COs, content, textbooks, web
 * resources, pedagogy, PO mappings) from the source server-side and inserts a
 * fresh v1 row. `modal` is required so the cascade's SearchableSelect popovers
 * work inside the Radix Dialog.
 */
export function CloneDialog({ open, syllabus, onOpenChange, onSuccess }: CloneDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Clone Syllabus</DialogTitle>
          <DialogDescription>
            {syllabus
              ? <>Copy <span className="font-mono font-semibold">{syllabus.course_code}</span> — {syllabus.course_name}. All content is carried over; pick a new course code below.</>
              : 'Loading…'}
          </DialogDescription>
        </DialogHeader>

        {/* key forces a fresh form instance per source so reopening on a
            different row reseeds cleanly. */}
        {syllabus && (
          <SyllabusForm
            key={syllabus.id}
            duplicateFrom={syllabus}
            compact
            modal
            onSuccess={() => onSuccess?.()}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
