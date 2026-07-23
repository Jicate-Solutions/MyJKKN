'use client';

import React, { useState } from 'react';
import { useReviseBosSyllabus } from '@/hooks/bos/use-bos-revision';
import { BosCourseSyllabus } from '@/types/bos';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ReviseDialogProps {
  open: boolean;
  syllabus: BosCourseSyllabus | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (newRevision: BosCourseSyllabus) => void;
}

export function ReviseDialog({
  open,
  syllabus,
  onOpenChange,
  onSuccess,
}: ReviseDialogProps) {
  const revision = useReviseBosSyllabus(syllabus?.id || '');
  const [revisionNotes, setRevisionNotes] = useState('');
  const [selectedChanges, setSelectedChanges] = useState<string[]>([]);
  const [updatedContent, setUpdatedContent] = useState<Record<string, unknown>>({});

  const handleRevise = async () => {
    try {
      const result = await revision.mutateAsync({
        updated_content: updatedContent,
        revision_notes: revisionNotes,
      });
      onSuccess?.(result);
      setRevisionNotes('');
      setSelectedChanges([]);
      setUpdatedContent({});
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to revise:', error);
    }
  };

  const markChanged = (field: string) => {
    setSelectedChanges((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
    if (!updatedContent[field]) {
      setUpdatedContent((prev) => ({
        ...prev,
        [field]: (syllabus as any)?.[field] || '',
      }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Revision</DialogTitle>
          <DialogDescription>
            Creating v{(syllabus?.version_number || 0) + 1} of {syllabus?.course_code}:{' '}
            {syllabus?.course_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertDescription>
              A new version will be created and marked as the latest. The current version will be
              archived.
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="changes" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="changes">Changes</TabsTrigger>
              <TabsTrigger value="notes">Revision Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="changes" className="space-y-3 mt-4">
              <div className="text-sm font-medium">Which sections are being revised?</div>
              <div className="space-y-2">
                {[
                  { id: 'course_objectives', label: 'Course Objectives' },
                  { id: 'course_learning_outcomes', label: 'Learning Outcomes' },
                  { id: 'course_content', label: 'Course Content' },
                  { id: 'textbooks', label: 'Textbooks' },
                  { id: 'web_resources', label: 'Web Resources' },
                  { id: 'pedagogy', label: 'Pedagogy' },
                  { id: 'po_mappings', label: 'PO Mappings' },
                ].map((section) => (
                  <label
                    key={section.id}
                    className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-100 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedChanges.includes(section.id)}
                      onChange={() => markChanged(section.id)}
                      className="rounded"
                    />
                    <span className="text-sm">{section.label}</span>
                  </label>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="notes" className="space-y-3 mt-4">
              <div>
                <label className="text-sm font-medium block mb-2">Revision Notes</label>
                <Textarea
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder="Describe what changed in this revision (e.g., 'Updated learning outcomes per board feedback')"
                  rows={4}
                />
              </div>
            </TabsContent>
          </Tabs>

          {revision.error && (
            <Alert variant="destructive">
              <AlertDescription>{revision.error.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleRevise}
            disabled={revision.isPending || selectedChanges.length === 0}
          >
            {revision.isPending ? 'Creating Revision...' : 'Create Revision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
