// ============================================
// SEMESTER PROMOTION FORM
// ============================================
// Created: 2025-01-20
// Purpose: Bulk promote learners to new semester/section
// ============================================

'use client';

import { useState, useEffect, useMemo } from 'react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { usePromoteLearners, useLearnerProfiles } from '@/hooks/use-learner-profiles';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useSemesters } from '@/hooks/use-semesters';
import { useSections } from '@/hooks/use-sections';
import toast from 'react-hot-toast';
import { Loader2, CheckCircle2, XCircle, Users, AlertTriangle, X } from 'lucide-react';

interface SemesterPromotionFormProps {
  selectedLearnerIds: string[];
  onSuccess?: () => void;
  onDeselectLearner?: (learnerId: string) => void;
}

export function SemesterPromotionForm({
  selectedLearnerIds,
  onSuccess,
  onDeselectLearner,
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

  // Fetch selected learners data by IDs
  const { data: learnersData, isLoading: isLoadingLearners } = useLearnerProfiles({
    ids: selectedLearnerIds,
    limit: selectedLearnerIds.length,
  });

  // Extract and validate program_id and institution_id from selected learners
  const validationResult = useMemo(() => {
    if (!learnersData?.data) {
      return { isValid: false, error: 'Loading learners data...', programId: null, institutionId: null, degreeId: null, departmentId: null };
    }

    // All returned learners are the selected ones (filtered by IDs)
    const selectedLearners = learnersData.data;

    if (selectedLearners.length === 0) {
      return { isValid: false, error: 'No learners found with the selected IDs', programId: null, institutionId: null, degreeId: null, departmentId: null };
    }

    // Get unique IDs for institution, degree, department, program
    const uniqueInstitutionIds = [...new Set(selectedLearners.map(l => l.institution_id).filter(Boolean))];
    const uniqueDegreeIds = [...new Set(selectedLearners.map(l => l.degree_id).filter(Boolean))];
    const uniqueDepartmentIds = [...new Set(selectedLearners.map(l => l.department_id).filter(Boolean))];
    const uniqueProgramIds = [...new Set(selectedLearners.map(l => l.program_id).filter(Boolean))];

    // Validation: All must be from same institution
    if (uniqueInstitutionIds.length === 0) {
      return { isValid: false, error: 'No valid institution found for selected learners', programId: null, institutionId: null, degreeId: null, departmentId: null };
    }
    if (uniqueInstitutionIds.length > 1) {
      return { isValid: false, error: 'Cannot promote learners from different institutions', programId: null, institutionId: null, degreeId: null, departmentId: null };
    }

    // Validation: All must be from same degree
    if (uniqueDegreeIds.length === 0) {
      return { isValid: false, error: 'No valid degree found for selected learners', programId: null, institutionId: null, degreeId: null, departmentId: null };
    }
    if (uniqueDegreeIds.length > 1) {
      return { isValid: false, error: 'Cannot promote learners from different degrees', programId: null, institutionId: null, degreeId: null, departmentId: null };
    }

    // Validation: All must be from same department
    if (uniqueDepartmentIds.length === 0) {
      return { isValid: false, error: 'No valid department found for selected learners', programId: null, institutionId: null, degreeId: null, departmentId: null };
    }
    if (uniqueDepartmentIds.length > 1) {
      return { isValid: false, error: 'Cannot promote learners from different departments', programId: null, institutionId: null, degreeId: null, departmentId: null };
    }

    // Validation: All must be from same program
    if (uniqueProgramIds.length === 0) {
      return { isValid: false, error: 'No valid program found for selected learners', programId: null, institutionId: null, degreeId: null, departmentId: null };
    }
    if (uniqueProgramIds.length > 1) {
      return { isValid: false, error: 'Cannot promote learners from different programs', programId: null, institutionId: null, degreeId: null, departmentId: null };
    }

    return {
      isValid: true,
      error: null,
      institutionId: uniqueInstitutionIds[0],
      degreeId: uniqueDegreeIds[0],
      departmentId: uniqueDepartmentIds[0],
      programId: uniqueProgramIds[0],
      selectedLearners,
    };
  }, [learnersData, selectedLearnerIds]);

  // Load filtered data based on validated program/institution
  const { data: semesters, isLoading: isLoadingSemesters } = useSemesters(
    validationResult.isValid ? { program_id: validationResult.programId! } : undefined
  );
  const { data: sections, isLoading: isLoadingSections } = useSections(
    validationResult.isValid && semesterId
      ? { semester_id: semesterId, institution_id: validationResult.institutionId! }
      : undefined
  );
  const { data: academicYears, isLoading: isLoadingAcademicYears } = useAcademicYears(
    validationResult.isValid ? validationResult.institutionId! : undefined
  );

  // Reset section when semester changes
  useEffect(() => {
    setSectionId('');
  }, [semesterId]);

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

  // Loading state
  if (isLoadingLearners) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading learners data...</span>
      </div>
    );
  }

  // Validation error state
  if (!validationResult.isValid) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Validation Error:</strong> {validationResult.error}
        </AlertDescription>
      </Alert>
    );
  }

  // Get current assignment info for comparison
  const currentInstitution = validationResult.selectedLearners?.[0]?.institution?.name || 'N/A';
  const currentDegree = validationResult.selectedLearners?.[0]?.degree?.degree_name || 'N/A';
  const currentDepartment = validationResult.selectedLearners?.[0]?.department?.department_name || 'N/A';
  const currentProgram = validationResult.selectedLearners?.[0]?.program?.program_name || 'N/A';

  const currentSemesters = validationResult.selectedLearners
    ? [...new Set(validationResult.selectedLearners.map(l => l.semester?.semester_name).filter(Boolean))]
    : [];
  const currentSections = validationResult.selectedLearners
    ? [...new Set(validationResult.selectedLearners.map(l => l.section?.section_name).filter(Boolean))]
    : [];
  const currentAcademicYears = validationResult.selectedLearners
    ? [...new Set(validationResult.selectedLearners.map(l => l.academic_year?.academic_year_name).filter(Boolean))]
    : [];

  return (
    <div className="space-y-6">
      {/* Selected Learners Table */}
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Selected Learners ({selectedLearnerIds.length})
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Review the learners selected for promotion
          </p>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12">#</TableHead>
                <TableHead>Application ID / Roll No.</TableHead>
                <TableHead>Learner Name</TableHead>
                <TableHead>Institution / Program</TableHead>
                <TableHead>Current Semester</TableHead>
                <TableHead>Current Section</TableHead>
                <TableHead>Academic Year</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {validationResult.selectedLearners?.map((learner, index) => (
                <TableRow key={learner.id}>
                  <TableCell className="font-medium text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      {learner.application_id && (
                        <span className="text-sm font-medium">{learner.application_id}</span>
                      )}
                      {learner.roll_number && (
                        <span className="text-xs text-muted-foreground">{learner.roll_number}</span>
                      )}
                      {!learner.application_id && !learner.roll_number && (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {learner.first_name} {learner.last_name || ''}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {learner.student_email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {learner.institution?.name || 'N/A'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {learner.program?.program_name || 'No Program'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {learner.semester?.semester_name || (
                      <span className="text-muted-foreground italic">Not Assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {learner.section?.section_name || (
                      <span className="text-muted-foreground italic">Not Assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {learner.academic_year?.academic_year_name || (
                      <span className="text-muted-foreground italic">Not Assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {onDeselectLearner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => onDeselectLearner(learner.id)}
                        title="Remove from selection"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Form Fields */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Semester Selection */}
        <div className="space-y-2">
          <Label htmlFor="semester">
            Semester <span className="text-destructive">*</span>
          </Label>
          <Select
            value={semesterId}
            onValueChange={setSemesterId}
            disabled={isLoadingSemesters}
          >
            <SelectTrigger id="semester">
              <SelectValue placeholder={isLoadingSemesters ? "Loading..." : "Select semester"} />
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
          <Select
            value={sectionId}
            onValueChange={setSectionId}
            disabled={!semesterId || isLoadingSections}
          >
            <SelectTrigger id="section">
              <SelectValue placeholder={
                !semesterId ? "Select semester first" :
                isLoadingSections ? "Loading..." :
                "Select section"
              } />
            </SelectTrigger>
            <SelectContent>
              {sections?.data?.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.section_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!semesterId && (
            <p className="text-xs text-muted-foreground">
              Select a semester first to load available sections
            </p>
          )}
        </div>

        {/* Academic Year Selection (Optional) */}
        <div className="space-y-2">
          <Label htmlFor="academicYear">Academic Year (Optional)</Label>
          <Select
            value={academicYearId}
            onValueChange={setAcademicYearId}
            disabled={isLoadingAcademicYears}
          >
            <SelectTrigger id="academicYear">
              <SelectValue placeholder={isLoadingAcademicYears ? "Loading..." : "Keep current year"} />
            </SelectTrigger>
            <SelectContent>
              {academicYears?.data?.map((year: any) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.academic_year_name || 'N/A'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Learner Promotion
            </DialogTitle>
            <DialogDescription>
              You are about to promote <strong>{selectedLearnerIds.length}</strong> learner(s) to a new semester and section
            </DialogDescription>
          </DialogHeader>

          {/* Before/After Comparison */}
          <div className="bg-muted p-4 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-foreground mb-2">Current Assignment:</h4>
                <div className="space-y-1 text-muted-foreground">
                  <div>
                    <span className="font-medium">Institution:</span>{' '}
                    {currentInstitution}
                  </div>
                  <div>
                    <span className="font-medium">Degree:</span>{' '}
                    {currentDegree}
                  </div>
                  <div>
                    <span className="font-medium">Department:</span>{' '}
                    {currentDepartment}
                  </div>
                  <div>
                    <span className="font-medium">Program:</span>{' '}
                    {currentProgram}
                  </div>
                  <div>
                    <span className="font-medium">Semester:</span>{' '}
                    {currentSemesters.length > 1
                      ? `Multiple (${currentSemesters.length})`
                      : currentSemesters[0] || 'N/A'}
                  </div>
                  <div>
                    <span className="font-medium">Section:</span>{' '}
                    {currentSections.length > 1
                      ? `Multiple (${currentSections.length})`
                      : currentSections[0] || 'N/A'}
                  </div>
                  <div>
                    <span className="font-medium">Academic Year:</span>{' '}
                    {currentAcademicYears.length > 1
                      ? `Multiple (${currentAcademicYears.length})`
                      : currentAcademicYears[0] || 'N/A'}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-foreground mb-2">New Assignment:</h4>
                <div className="space-y-1">
                  <div>
                    <span className="font-medium text-muted-foreground">Institution:</span>{' '}
                    <span className="text-muted-foreground italic">Unchanged</span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Degree:</span>{' '}
                    <span className="text-muted-foreground italic">Unchanged</span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Department:</span>{' '}
                    <span className="text-muted-foreground italic">Unchanged</span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Program:</span>{' '}
                    <span className="text-muted-foreground italic">Unchanged</span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Semester:</span>{' '}
                    <span className="text-green-600 font-medium">
                      {semesters?.data?.find((s) => s.id === semesterId)?.semester_name}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Section:</span>{' '}
                    <span className="text-green-600 font-medium">
                      {sections?.data?.find((s) => s.id === sectionId)?.section_name}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Academic Year:</span>{' '}
                    {academicYearId ? (
                      <span className="text-green-600 font-medium">
                        {(academicYears?.data?.find((y: any) => y.id === academicYearId) as any)?.academic_year_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">Unchanged</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Important:</p>
              <p>
                This action will update the academic records for all selected learners.
                Make sure all assignments are correct before proceeding.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Go Back
            </Button>
            <Button onClick={executePromotion} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirm Promotion
            </Button>
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
