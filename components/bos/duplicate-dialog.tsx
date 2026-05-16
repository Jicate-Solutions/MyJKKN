'use client';

import React, { useState } from 'react';
import { useBatchDuplicate } from '@/hooks/bos/use-bos-revision';
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
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DuplicateDialogProps {
  open: boolean;
  syllabus: BosCourseSyllabus | null;
  institutionsId: string;
  sourceRegulationId: string;
  regulations: Array<{ id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DuplicateDialog({
  open,
  syllabus,
  institutionsId,
  sourceRegulationId,
  regulations,
  onOpenChange,
  onSuccess,
}: DuplicateDialogProps) {
  const duplicate = useBatchDuplicate();
  const [targetRegulationId, setTargetRegulationId] = useState('');
  const [courseMapping, setCourseMapping] = useState<
    Array<{ source: string; target: string }>
  >([]);

  React.useEffect(() => {
    if (syllabus) {
      setCourseMapping([
        {
          source: syllabus.course_code,
          target: generateTargetCode(syllabus.course_code),
        },
      ]);
    }
  }, [syllabus]);

  const generateTargetCode = (sourceCode: string) => {
    // Example: 24UGTA01 -> 25UGTA01 (increment year)
    const match = sourceCode.match(/^(\d{2})(.*)$/);
    if (match) {
      const year = parseInt(match[1]);
      const rest = match[2];
      return `${year + 1}${rest}`;
    }
    return sourceCode;
  };

  const handleDuplicate = async () => {
    if (!targetRegulationId || courseMapping.length === 0) {
      alert('Please select target regulation and map course codes');
      return;
    }

    try {
      await duplicate.mutateAsync({
        institutions_id: institutionsId,
        source_regulation_id: sourceRegulationId,
        target_regulation_id: targetRegulationId,
        courses: courseMapping.map((m) => ({
          source_course_code: m.source,
          target_course_code: m.target,
        })),
      });

      onSuccess?.();
      setTargetRegulationId('');
      setCourseMapping([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to duplicate:', error);
    }
  };

  const updateMapping = (idx: number, field: 'source' | 'target', value: string) => {
    setCourseMapping((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m))
    );
  };

  const targetRegName = regulations.find((r) => r.id === targetRegulationId)?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Duplicate to New Regulation</DialogTitle>
          <DialogDescription>
            Copy this course and related syllabi to a new regulation with updated course codes.
            Example: R-2024 courses → R-2025 with code prefix updated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertDescription>
              The new courses will be created as v1 (first version) in the target regulation and
              marked as latest.
            </AlertDescription>
          </Alert>

          <div>
            <label className="text-sm font-medium block mb-2">Target Regulation</label>
            <Select value={targetRegulationId} onValueChange={setTargetRegulationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select target regulation" />
              </SelectTrigger>
              <SelectContent>
                {regulations
                  .filter((r) => r.id !== sourceRegulationId)
                  .map((reg) => (
                    <SelectItem key={reg.id} value={reg.id}>
                      {reg.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {targetRegName && (
            <div>
              <label className="text-sm font-medium block mb-2">Course Code Mapping</label>
              <div className="space-y-2">
                {courseMapping.map((mapping, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input
                      placeholder="Source course code"
                      value={mapping.source}
                      onChange={(e) => updateMapping(idx, 'source', e.target.value)}
                      disabled
                      className="flex-1"
                    />
                    <span className="text-sm font-medium">→</span>
                    <Input
                      placeholder="Target course code"
                      value={mapping.target}
                      onChange={(e) => updateMapping(idx, 'target', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Copying {courseMapping.length} course(s) from current regulation to{' '}
                <strong>{targetRegName}</strong>
              </div>
            </div>
          )}

          {duplicate.error && (
            <Alert variant="destructive">
              <AlertDescription>{duplicate.error.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleDuplicate}
            disabled={duplicate.isPending || !targetRegulationId || courseMapping.length === 0}
          >
            {duplicate.isPending ? 'Duplicating...' : 'Duplicate Courses'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
