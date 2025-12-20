// ============================================
// SEMESTER PROMOTION FORM
// ============================================
// Created: 2025-01-20
// Purpose: Bulk promote learners to new semester/section
// ============================================

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { usePromoteLearners } from '@/hooks/use-learner-profiles';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useSemesters } from '@/hooks/use-semesters';
import { useSections } from '@/hooks/use-sections';
import toast from 'react-hot-toast';
import { Loader2, CheckCircle2, XCircle, Users } from 'lucide-react';

interface SemesterPromotionFormProps {
  selectedLearnerIds: string[];
  onSuccess?: () => void;
}

export function SemesterPromotionForm({
  selectedLearnerIds,
  onSuccess,
}: SemesterPromotionFormProps) {
  const [semesterId, setSemesterId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [progress, setProgress] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [failedLearners, setFailedLearners] = useState<{ id: string; error: string }[]>([]);

  const promoteMutation = usePromoteLearners();
  const { data: academicYears } = useAcademicYears();
  const { data: semesters } = useSemesters();
  const { data: sections } = useSections();

  const handlePromote = () => {
    if (!semesterId || !sectionId) {
      toast.error('Please select semester and section');
      return;
    }
    setShowConfirmDialog(true);
  };

  const executePromotion = async () => {
    setShowConfirmDialog(false);
    setShowProgressDialog(true);
    setProgress(0);
    setSuccessCount(0);
    setFailedCount(0);
    setFailedLearners([]);

    try {
      const result = await promoteMutation.mutateAsync({
        learnerIds: selectedLearnerIds,
        semesterId,
        sectionId,
        academicYearId: academicYearId || undefined,
        onProgress: (current, total, success, failed) => {
          setProgress((current / total) * 100);
          setSuccessCount(success.length);
          setFailedCount(failed.length);
          setFailedLearners(failed);
        },
      });

      if (result.failed.length === 0) {
        toast.success(`Successfully promoted ${result.success.length} learner(s)`);
        setTimeout(() => {
          setShowProgressDialog(false);
          onSuccess?.();
        }, 2000);
      } else {
        toast.error(`Promotion completed with ${result.failed.length} failure(s)`);
      }
    } catch (error) {
      toast.error('Promotion failed');
      setShowProgressDialog(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Form Fields */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Semester Selection */}
        <div className="space-y-2">
          <Label htmlFor="semester">
            Semester <span className="text-destructive">*</span>
          </Label>
          <Select value={semesterId} onValueChange={setSemesterId}>
            <SelectTrigger id="semester">
              <SelectValue placeholder="Select semester" />
            </SelectTrigger>
            <SelectContent>
              {semesters?.data?.map((semester) => (
                <SelectItem key={semester.id} value={semester.id}>
                  {semester.semester_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Section Selection */}
        <div className="space-y-2">
          <Label htmlFor="section">
            Section <span className="text-destructive">*</span>
          </Label>
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger id="section">
              <SelectValue placeholder="Select section" />
            </SelectTrigger>
            <SelectContent>
              {sections?.data?.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.section_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Academic Year Selection (Optional) */}
        <div className="space-y-2">
          <Label htmlFor="academicYear">Academic Year (Optional)</Label>
          <Select value={academicYearId} onValueChange={setAcademicYearId}>
            <SelectTrigger id="academicYear">
              <SelectValue placeholder="Keep current year" />
            </SelectTrigger>
            <SelectContent>
              {academicYears?.data?.map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.academic_year_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Selected Learners Info */}
      <Alert>
        <Users className="h-4 w-4" />
        <AlertDescription>
          <strong>{selectedLearnerIds.length}</strong> learner(s) selected for promotion
        </AlertDescription>
      </Alert>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          onClick={handlePromote}
          disabled={!semesterId || !sectionId || promoteMutation.isPending}
        >
          {promoteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Promote Learners
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Semester Promotion</DialogTitle>
            <DialogDescription>
              You are about to promote {selectedLearnerIds.length} learner(s) to:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Semester:</span>
              <Badge>{semesters?.data?.find((s) => s.id === semesterId)?.semester_name}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Section:</span>
              <Badge>{sections?.data?.find((s) => s.id === sectionId)?.section_name}</Badge>
            </div>
            {academicYearId && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Academic Year:</span>
                <Badge>
                  {academicYears?.data?.find((y) => y.id === academicYearId)?.academic_year_name}
                </Badge>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button onClick={executePromotion}>Confirm Promotion</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress Dialog */}
      <Dialog open={showProgressDialog} onOpenChange={setShowProgressDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Promotion in Progress</DialogTitle>
            <DialogDescription>
              Please wait while we promote the selected learners...
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Progress value={progress} />
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Success: {successCount}</span>
              </div>
              {failedCount > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span>Failed: {failedCount}</span>
                </div>
              )}
            </div>
            {failedLearners.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-2">
                {failedLearners.map((failed) => (
                  <div key={failed.id} className="text-xs text-destructive">
                    {failed.id}: {failed.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
