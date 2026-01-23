'use client';

/**
 * Bulk Learner Image Upload Component
 *
 * Advanced bulk upload feature that matches images to learners by roll number
 * extracted from filenames. Includes comprehensive preview, validation, and
 * confirmation steps before upload.
 *
 * Features:
 * - 5-step wizard flow (Select → Preview → Confirm → Upload → Results)
 * - Roll number extraction from filenames (pattern: 2-4 letters + 2-6 digits)
 * - Virtual scrolling for 500+ photo batches
 * - Duplicate detection with user selection
 * - Existing photo replacement with warnings
 * - Chunked validation and upload
 *
 * Created: 2025-01-22
 */

import { useState, useCallback, useEffect, useMemo, memo } from 'react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { Upload, FileImage, AlertCircle, AlertTriangle, CheckCircle2, X, Info, Loader2, Download } from 'lucide-react';
import Image from 'next/image';
import { Grid } from 'react-window';

// Supabase
import { createClientSupabaseClient } from '@/lib/supabase/client';

// Services
import { StorageService } from '@/lib/storage/storage-service';

// UI Components
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

// Types
import type {
  ImageUploadStep,
  ImageFilePreview,
  ImageValidationSummary,
  ImageValidationStatus,
  ImageUploadProgress,
  ImageUploadResult,
  ImageFilterType,
  BulkUploadLearnerImagesProps,
} from './bulk-upload-images-types';

import { DEFAULT_BULK_UPLOAD_CONFIG } from './bulk-upload-images-types';

// Utilities
import {
  extractRollNumberFromFilename,
  validateImageFile,
  createValidationSummary,
  detectDuplicates,
  filterFilesByStatus,
  isBulkUploadReady,
  generateFailedUploadsCSV,
  downloadCSV,
} from '@/lib/utils/image-upload-validation';

/**
 * Main bulk upload learner images component
 *
 * This component provides a complete wizard interface for bulk uploading
 * learner photos with roll number matching and validation.
 */
export function BulkUploadLearnerImages({
  onUploadComplete,
  institutionId,
}: BulkUploadLearnerImagesProps) {
  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================

  // Dialog state
  const [open, setOpen] = useState(false);

  // Current step in wizard flow
  const [step, setStep] = useState<ImageUploadStep>('select-files');

  // File previews with validation state
  const [files, setFiles] = useState<ImageFilePreview[]>([]);

  // Validation summary
  const [validationSummary, setValidationSummary] = useState<ImageValidationSummary>({
    totalFiles: 0,
    validFiles: 0,
    warningFiles: 0,
    errorFiles: 0,
    selectedFiles: 0,
    duplicateGroups: 0,
    photosToReplace: 0,
  });

  // Upload progress
  const [uploadProgress, setUploadProgress] = useState<ImageUploadProgress>({
    completed: 0,
    total: 0,
    percentage: 0,
  });

  // Upload result
  const [result, setResult] = useState<ImageUploadResult | null>(null);

  // Filter for preview grid
  const [filter, setFilter] = useState<ImageFilterType>('all');

  // Loading states
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Confirmation dialog states
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);
  const [fileToRemove, setFileToRemove] = useState<string | null>(null);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);

  // ========================================================================
  // UPDATE VALIDATION SUMMARY
  // ========================================================================

  useEffect(() => {
    const summary = createValidationSummary(files);
    setValidationSummary(summary);
  }, [files]);

  // ========================================================================
  // AUTO-VALIDATE LEARNERS
  // ========================================================================

  /**
   * Automatically validate learners when we reach the preview-validate step
   * and have files with roll numbers that haven't been validated yet
   */
  useEffect(() => {
    const shouldValidate =
      step === 'preview-validate' &&
      files.length > 0 &&
      !isValidating &&
      // Check if we have files with roll numbers that need validation
      files.some((f) => f.rollNumber && !f.fileValidationError && f.validationStatus === 'pending');

    if (shouldValidate) {
      handleValidateLearners();
    }
  }, [step, files, isValidating]); // Note: handleValidateLearners will be defined later

  // ========================================================================
  // STEP NAVIGATION
  // ========================================================================

  const goToStep = useCallback((newStep: ImageUploadStep) => {
    setStep(newStep);
  }, []);

  const goToNextStep = useCallback(() => {
    const steps: ImageUploadStep[] = ['select-files', 'preview-validate', 'confirm', 'uploading', 'results'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  }, [step]);

  const goToPreviousStep = useCallback(() => {
    const steps: ImageUploadStep[] = ['select-files', 'preview-validate', 'confirm', 'uploading', 'results'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  }, [step]);

  // ========================================================================
  // RESET STATE
  // ========================================================================

  const resetState = useCallback(() => {
    // Revoke all object URLs to prevent memory leaks
    files.forEach((file) => {
      if (file.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
    });

    setFiles([]);
    setStep('select-files');
    setValidationSummary({
      totalFiles: 0,
      validFiles: 0,
      warningFiles: 0,
      errorFiles: 0,
      selectedFiles: 0,
      duplicateGroups: 0,
      photosToReplace: 0,
    });
    setUploadProgress({ completed: 0, total: 0, percentage: 0 });
    setResult(null);
    setFilter('all');
    setIsValidating(false);
    setIsUploading(false);
  }, [files]);

  // ========================================================================
  // DIALOG HANDLERS
  // ========================================================================

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      // Prevent closing during upload
      if (!newOpen && isUploading) {
        toast.error('Cannot close during upload');
        return;
      }

      // Show confirmation if closing with files in progress
      if (!newOpen && files.length > 0 && step !== 'results') {
        // Use setTimeout to prevent conflict with Dialog event handling
        setTimeout(() => setShowCloseConfirmation(true), 0);
        return;
      }

      setOpen(newOpen);

      // Reset state when closing
      if (!newOpen) {
        resetState();
      }
    },
    [isUploading, files.length, step, resetState]
  );

  const handleConfirmClose = useCallback(() => {
    setShowCloseConfirmation(false);
    // Small delay to allow AlertDialog to close properly before closing parent Dialog
    // This prevents "stuck" page issues with multiple Radix overlays
    setTimeout(() => {
      setOpen(false);
      resetState();
    }, 100);
  }, [resetState]);

  // ========================================================================
  // FILE PROCESSING
  // ========================================================================

  /**
   * Process selected files:
   * 1. Extract roll number from filename
   * 2. Validate file type and size
   * 3. Create preview URL
   * 4. Set initial validation status
   * 5. Auto-advance to preview step
   */
  const handleFilesSelected = useCallback((acceptedFiles: File[]) => {
    console.log('[bulk-upload-images] Files selected:', acceptedFiles.length);

    if (acceptedFiles.length === 0) {
      toast.error('No files selected');
      return;
    }

    // Process each file
    const processedFiles: ImageFilePreview[] = acceptedFiles.map((file) => {
      // Extract roll number from filename
      const rollNumber = extractRollNumberFromFilename(file.name);
      const extractionError = !rollNumber
        ? 'Could not extract roll number from filename. Expected format: ROLLNUMBER.jpg (e.g., DB22092.jpg)'
        : undefined;

      // Validate file type and size
      const fileValidation = validateImageFile(file);

      // Generate preview URL
      const previewUrl = URL.createObjectURL(file);

      // Determine initial validation status
      let validationStatus: ImageValidationStatus = 'pending';
      if (fileValidation.error || extractionError) {
        validationStatus = 'error';
      }

      // Auto-select valid files
      const selected = !fileValidation.error && !!rollNumber;

      return {
        file,
        filename: file.name,
        previewUrl,
        rollNumber,
        extractionError,
        validationStatus,
        fileValidationError: fileValidation.error,
        isDuplicate: false,
        isSelectedDuplicate: false,
        selected,
      } as ImageFilePreview;
    });

    // Add to existing files or replace if on select-files step
    if (step === 'select-files') {
      setFiles(processedFiles);
    } else {
      setFiles((prev) => [...prev, ...processedFiles]);
    }

    // Show toast notification
    const validCount = processedFiles.filter((f) => !f.fileValidationError && f.rollNumber).length;
    const errorCount = processedFiles.length - validCount;

    if (errorCount === 0) {
      toast.success(`${validCount} files ready for validation`);
    } else {
      toast(
        `${validCount} files ready, ${errorCount} files have errors`,
        { icon: '⚠️' }
      );
    }

    // Auto-advance to preview step
    goToStep('preview-validate');
  }, [step, goToStep]);

  /**
   * Remove a file from the list (with confirmation)
   */
  const handleRemoveFile = useCallback((filename: string) => {
    setFileToRemove(filename);
  }, []);

  const handleConfirmRemove = useCallback(() => {
    if (!fileToRemove) return;

    setFiles((prev) => {
      const fileToDelete = prev.find((f) => f.filename === fileToRemove);
      if (fileToDelete?.previewUrl) {
        URL.revokeObjectURL(fileToDelete.previewUrl);
      }
      return prev.filter((f) => f.filename !== fileToRemove);
    });

    toast.success('File removed');
    setFileToRemove(null);
  }, [fileToRemove]);

  /**
   * Toggle file selection
   */
  const handleToggleFileSelection = useCallback((filename: string, selected: boolean) => {
    setFiles((prev) =>
      prev.map((f) => (f.filename === filename ? { ...f, selected } : f))
    );
  }, []);

  /**
   * Select all valid files
   */
  const handleSelectAllValid = useCallback(() => {
    setFiles((prev) =>
      prev.map((f) =>
        f.validationStatus === 'valid' || f.validationStatus === 'warning'
          ? { ...f, selected: true }
          : f
      )
    );
    toast.success('All valid files selected');
  }, []);

  /**
   * Deselect all files
   */
  const handleDeselectAll = useCallback(() => {
    setFiles((prev) => prev.map((f) => ({ ...f, selected: false })));
    toast.success('All files deselected');
  }, []);

  /**
   * Handle duplicate selection (when user chooses which duplicate to use)
   */
  const handleSelectDuplicate = useCallback((filename: string, duplicateGroupId: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        // If this file is in the duplicate group
        if (f.duplicateGroupId === duplicateGroupId) {
          // Mark this file as selected duplicate, unselect others
          const isSelectedDuplicate = f.filename === filename;
          return {
            ...f,
            isSelectedDuplicate,
            selected: isSelectedDuplicate,
          };
        }
        return f;
      })
    );
  }, []);

  // ========================================================================
  // LEARNER VALIDATION (Phase 4)
  // ========================================================================

  /**
   * Validate learners against database
   *
   * Process:
   * 1. Extract roll numbers from files (only those without file validation errors)
   * 2. Query database in chunks of 50 roll numbers
   * 3. Match files to learners
   * 4. Check for existing photos
   * 5. Detect duplicates
   * 6. Update validation statuses
   */
  const handleValidateLearners = useCallback(async () => {
    console.log('[bulk-upload-images] Validating learners...');

    setIsValidating(true);

    try {
      const supabase = createClientSupabaseClient();

      // Get roll numbers from files that passed file validation
      const rollNumbers = files
        .filter((f) => f.rollNumber && !f.fileValidationError)
        .map((f) => f.rollNumber!);

      if (rollNumbers.length === 0) {
        setIsValidating(false);
        return;
      }

      // Query database in chunks of 50 roll numbers
      const CHUNK_SIZE = DEFAULT_BULK_UPLOAD_CONFIG.validationChunkSize;
      const chunks: string[][] = [];

      for (let i = 0; i < rollNumbers.length; i += CHUNK_SIZE) {
        chunks.push(rollNumbers.slice(i, i + CHUNK_SIZE));
      }

      console.log(`[bulk-upload-images] Validating ${rollNumbers.length} roll numbers in ${chunks.length} chunks`);

      // Fetch all learners in parallel chunks
      const allLearners: Array<{
        id: string;
        student_name: string;
        roll_number: string;
        semester_name: string | null;
        section_name: string | null;
        institution_name: string | null;
        student_photo_url: string | null;
      }> = [];

      for (const chunk of chunks) {
        // Build query with institution filter for RLS compliance
        let query = supabase
          .from('learners_profiles')
          .select(`
            id,
            first_name,
            last_name,
            roll_number,
            student_photo_url,
            semester:semesters(semester_name),
            section:sections(section_name),
            institution:institutions(name)
          `)
          .in('roll_number', chunk);

        // Apply institution filter if provided (required for RLS policy)
        if (institutionId) {
          query = query.eq('institution_id', institutionId);
        }

        const { data, error } = await query;

        if (error) {
          console.error('[bulk-upload-images] Database query error:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          });
          toast.error(`Failed to validate learners: ${error.message || 'Unknown error'}`);
          setIsValidating(false);
          return;
        }

        if (data) {
          // Transform data to match expected interface
          const transformedData = data.map((learner) => ({
            id: learner.id,
            student_name: [learner.first_name, learner.last_name].filter(Boolean).join(' '),
            roll_number: learner.roll_number!,
            semester_name: (learner.semester as { semester_name: string } | null)?.semester_name || null,
            section_name: (learner.section as { section_name: string } | null)?.section_name || null,
            institution_name: (learner.institution as { name: string } | null)?.name || null,
            student_photo_url: learner.student_photo_url,
          }));
          allLearners.push(...transformedData);
        }
      }

      console.log(`[bulk-upload-images] Found ${allLearners.length} learners in database`);

      // Create map for quick lookup
      const learnerMap = new Map(
        allLearners.map((l) => [l.roll_number, l])
      );

      // Update files with learner data
      setFiles((prevFiles) => {
        // First, match learners to files
        const matchedFiles = prevFiles.map((file) => {
          // Skip files with file validation errors
          if (file.fileValidationError) {
            return file;
          }

          // Skip files without roll numbers
          if (!file.rollNumber) {
            return file;
          }

          // Look up learner
          const learner = learnerMap.get(file.rollNumber);

          if (!learner) {
            // Learner not found
            return {
              ...file,
              validationStatus: 'error' as ImageValidationStatus,
              extractionError: `No learner found with roll number ${file.rollNumber}`,
              selected: false,
            };
          }

          // Learner found - update file with learner data
          const hasExistingPhoto = !!learner.student_photo_url;

          return {
            ...file,
            learnerId: learner.id,
            learnerName: learner.student_name,
            currentSemester: learner.semester_name || undefined,
            currentSection: learner.section_name || undefined,
            institutionName: learner.institution_name || undefined,
            existingPhotoUrl: learner.student_photo_url || undefined,
            validationStatus: hasExistingPhoto ? ('warning' as ImageValidationStatus) : ('valid' as ImageValidationStatus),
            selected: true, // Keep selected
          };
        });

        // Then detect duplicates
        const filesWithDuplicates = detectDuplicates(matchedFiles);

        return filesWithDuplicates;
      });

      toast.success(`Validation complete: ${allLearners.length} learners matched`);
    } catch (error) {
      console.error('[bulk-upload-images] Validation error:', error);
      toast.error('Failed to validate learners');
    } finally {
      setIsValidating(false);
    }
  }, [files, institutionId]);

  // ========================================================================
  // UPLOAD INTEGRATION (Phase 6)
  // ========================================================================

  /**
   * Upload selected files to Supabase storage
   *
   * Process:
   * 1. Get selected files with valid learner matches
   * 2. Upload using StorageService.bulkUploadStudentPhotos
   * 3. Track progress in real-time
   * 4. Display results (success/failed)
   */
  const handleUpload = useCallback(async () => {
    console.log('[bulk-upload-images] Starting upload...');

    // Get selected files
    const selectedFiles = files.filter((f) => f.selected && f.learnerId);

    if (selectedFiles.length === 0) {
      toast.error('No files selected for upload');
      return;
    }

    // Move to uploading step
    goToStep('uploading');
    setIsUploading(true);

    // Initialize progress
    setUploadProgress({
      completed: 0,
      total: selectedFiles.length,
      percentage: 0,
    });

    try {
      // Extract File objects from selected files
      const filesToUpload = selectedFiles.map((f) => f.file);

      // Upload with progress tracking
      const uploadResult = await StorageService.bulkUploadStudentPhotos(
        filesToUpload,
        (progress) => {
          // Update progress state
          setUploadProgress({
            completed: progress.completed,
            total: progress.total,
            current: progress.current,
            percentage: Math.round((progress.completed / progress.total) * 100),
          });
        }
      );

      console.log('[bulk-upload-images] Upload complete:', uploadResult);

      // Set result
      setResult({
        success: uploadResult.success.map((s) => ({
          rollNumber: s.roll_number,
          studentName: s.student_name,
          imageUrl: s.image_url,
        })),
        failed: uploadResult.failed,
      });

      // Show summary toast
      if (uploadResult.failed.length === 0) {
        toast.success(`Successfully uploaded ${uploadResult.success.length} photos`);
      } else {
        toast(`Uploaded ${uploadResult.success.length} photos, ${uploadResult.failed.length} failed`, {
          icon: '⚠️',
        });
      }

      // Move to results step
      goToStep('results');

      // Call completion callback if provided
      if (onUploadComplete) {
        onUploadComplete({
          success: uploadResult.success.map((s) => ({
            rollNumber: s.roll_number,
            studentName: s.student_name,
            imageUrl: s.image_url,
          })),
          failed: uploadResult.failed,
        });
      }
    } catch (error) {
      console.error('[bulk-upload-images] Upload error:', error);
      toast.error('Upload failed. Please try again.');

      // Go back to confirm step
      goToStep('confirm');
    } finally {
      setIsUploading(false);
    }
  }, [files, goToStep, onUploadComplete]);

  const handleUploadMore = useCallback(() => {
    resetState();
  }, [resetState]);

  const handleClose = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  // ========================================================================
  // STEP COMPONENTS
  // ========================================================================

  const renderStepContent = () => {
    switch (step) {
      case 'select-files':
        return <SelectFilesStep onFilesSelected={handleFilesSelected} />;

      case 'preview-validate':
        return (
          <PreviewValidateStep
            files={files}
            summary={validationSummary}
            filter={filter}
            onFilterChange={setFilter}
            isValidating={isValidating}
            onBack={goToPreviousStep}
            onNext={goToNextStep}
            onRemoveFile={handleRemoveFile}
            onToggleSelection={handleToggleFileSelection}
            onSelectAllValid={handleSelectAllValid}
            onDeselectAll={handleDeselectAll}
            onSelectDuplicate={handleSelectDuplicate}
          />
        );

      case 'confirm':
        return (
          <ConfirmStep
            summary={validationSummary}
            institutionId={institutionId}
            onBack={goToPreviousStep}
            onConfirm={handleUpload}
          />
        );

      case 'uploading':
        return <UploadingStep progress={uploadProgress} />;

      case 'results':
        return (
          <ResultsStep
            result={result}
            onClose={handleClose}
            onUploadMore={handleUploadMore}
          />
        );

      default:
        return null;
    }
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Bulk Upload Images
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Upload Learner Images</DialogTitle>
            <DialogDescription>
              Upload multiple learner photos at once. Images will be matched to learners by roll number
              extracted from filenames.
            </DialogDescription>
          </DialogHeader>

          {/* Progress indicator */}
          <StepIndicator currentStep={step} />

          <Separator className="my-4" />

          {/* Step content */}
          <div className="min-h-[400px]">{renderStepContent()}</div>
        </DialogContent>
      </Dialog>

      {/* Close confirmation dialog */}
      <AlertDialog open={showCloseConfirmation} onOpenChange={setShowCloseConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Bulk Upload?</AlertDialogTitle>
            <AlertDialogDescription>
              You have {files.length} file{files.length !== 1 ? 's' : ''} in progress. Closing now will
              discard all files and validation data. Are you sure you want to close?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove file confirmation dialog */}
      <AlertDialog open={fileToRemove !== null} onOpenChange={(open) => !open && setFileToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove File?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{fileToRemove}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================================================
// STEP INDICATOR COMPONENT
// ============================================================================

interface StepIndicatorProps {
  currentStep: ImageUploadStep;
}

function StepIndicator({ currentStep }: StepIndicatorProps) {
  const steps = [
    { key: 'select-files', label: 'Select Files', number: 1 },
    { key: 'preview-validate', label: 'Preview & Validate', number: 2 },
    { key: 'confirm', label: 'Confirm', number: 3 },
    { key: 'uploading', label: 'Upload', number: 4 },
    { key: 'results', label: 'Results', number: 5 },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-between">
      {steps.map((step, index) => {
        const isActive = index === currentStepIndex;
        const isCompleted = index < currentStepIndex;

        return (
          <div key={step.key} className="flex items-center flex-1">
            {/* Step circle */}
            <div
              className={`
                flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-medium
                ${isCompleted ? 'bg-green-500 border-green-500 text-white' : ''}
                ${isActive ? 'bg-primary border-primary text-primary-foreground' : ''}
                ${!isActive && !isCompleted ? 'bg-muted border-muted-foreground/30 text-muted-foreground' : ''}
              `}
            >
              {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step.number}
            </div>

            {/* Step label */}
            <span
              className={`ml-2 text-sm font-medium ${
                isActive ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {step.label}
            </span>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-[2px] mx-4 ${
                  isCompleted ? 'bg-green-500' : 'bg-muted-foreground/30'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// STEP 1: SELECT FILES
// ============================================================================

interface SelectFilesStepProps {
  onFilesSelected: (files: File[]) => void;
}

function SelectFilesStep({ onFilesSelected }: SelectFilesStepProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) {
        toast.error('No valid files selected');
        return;
      }

      onFilesSelected(acceptedFiles);
    },
    [onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
    },
    multiple: true,
  });

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'}
        `}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-full bg-primary/10">
            <Upload className="h-12 w-12 text-primary" />
          </div>

          <div className="space-y-2">
            <p className="text-lg font-medium">
              {isDragActive ? 'Drop files here' : 'Drag & drop images here'}
            </p>
            <p className="text-sm text-muted-foreground">
              or click to browse files
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant="outline">JPEG</Badge>
            <Badge variant="outline">PNG</Badge>
            <Badge variant="outline">GIF</Badge>
            <Badge variant="outline">WebP</Badge>
            <Badge variant="outline">Max 5MB</Badge>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Filename Requirements</AlertTitle>
        <AlertDescription>
          <div className="mt-2 space-y-1 text-sm">
            <p>• Filenames must contain the learner&apos;s roll number</p>
            <p>• Roll number format: 2-4 letters + 2-6 digits (e.g., DB22092, CS21001)</p>
            <p>• Examples: DB22092.jpg, Student_CS21001.png, MECH2023_photo.gif</p>
            <p>• Images will be automatically matched to learners in the database</p>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ============================================================================
// IMAGE PREVIEW CARD COMPONENT
// ============================================================================

interface ImagePreviewCardProps {
  file: ImageFilePreview;
  onToggleSelection: (filename: string, selected: boolean) => void;
  onRemove: (filename: string) => void;
  onSelectDuplicate: (filename: string, duplicateGroupId: string) => void;
}

const ImagePreviewCard = memo(function ImagePreviewCard({
  file,
  onToggleSelection,
  onRemove,
  onSelectDuplicate,
}: ImagePreviewCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <Card
      className={`
        relative overflow-hidden transition-all duration-200 hover:shadow-lg
        ${file.validationStatus === 'valid' ? 'border-green-500 hover:border-green-600' : ''}
        ${file.validationStatus === 'warning' ? 'border-yellow-500 hover:border-yellow-600' : ''}
        ${file.validationStatus === 'error' ? 'border-red-500 hover:border-red-600' : ''}
        ${file.validationStatus === 'pending' ? 'border-gray-300 hover:border-gray-400 animate-pulse' : ''}
        ${file.selected ? 'ring-2 ring-primary ring-offset-2' : ''}
      `}
    >
      <CardContent className="p-3">
        {/* Checkbox */}
        <div className="flex items-start justify-between mb-2">
          <Checkbox
            checked={file.selected}
            onCheckedChange={(checked) => onToggleSelection(file.filename, checked as boolean)}
            disabled={file.validationStatus === 'error'}
            aria-label={`Select ${file.filename}`}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground transition-colors"
            onClick={() => onRemove(file.filename)}
            aria-label={`Remove ${file.filename}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Image Thumbnail with Skeleton */}
        <div className="relative w-full aspect-square bg-muted rounded-md overflow-hidden mb-2 group">
          {/* Skeleton loader */}
          {!imageLoaded && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/50 animate-pulse">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error state */}
          {imageError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">Failed to load</p>
            </div>
          )}

          {/* Image with fade-in animation */}
          {!imageError && (
            <Image
              src={file.previewUrl}
              alt={file.filename}
              fill
              className={`
                object-cover transition-opacity duration-300
                ${imageLoaded ? 'opacity-100' : 'opacity-0'}
              `}
              onLoad={() => {
                setImageLoaded(true);
                setImageError(false);
              }}
              onError={() => {
                setImageLoaded(false);
                setImageError(true);
              }}
            />
          )}
        </div>

        {/* Filename */}
        <p className="text-xs font-medium truncate mb-1" title={file.filename}>
          {file.filename}
        </p>

        {/* Roll Number */}
        {file.rollNumber && (
          <Badge variant="outline" className="text-xs mb-2">
            {file.rollNumber}
          </Badge>
        )}

        {/* Status Badge */}
        <div className="mb-2">
          {file.validationStatus === 'valid' && (
            <Badge className="bg-green-600 text-white text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Valid
            </Badge>
          )}
          {file.validationStatus === 'warning' && (
            <Badge className="bg-yellow-600 text-white text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Warning
            </Badge>
          )}
          {file.validationStatus === 'error' && (
            <Badge variant="destructive" className="text-xs">
              <AlertCircle className="h-3 w-3 mr-1" />
              Error
            </Badge>
          )}
          {file.validationStatus === 'pending' && (
            <Badge variant="outline" className="text-xs">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Pending
            </Badge>
          )}
        </div>

        {/* Learner Information */}
        {file.learnerName && (
          <div className="space-y-1 mb-2">
            <p className="text-xs font-semibold text-foreground">{file.learnerName}</p>
            {(file.currentSemester || file.currentSection) && (
              <p className="text-xs text-muted-foreground">
                {[file.currentSemester, file.currentSection].filter(Boolean).join(' • ')}
              </p>
            )}
          </div>
        )}

        {/* Warnings */}
        {file.existingPhotoUrl && (
          <Alert variant="default" className="mb-2 py-1 px-2">
            <AlertCircle className="h-3 w-3" />
            <AlertDescription className="text-xs">
              Will replace existing photo
            </AlertDescription>
          </Alert>
        )}

        {/* Duplicate Selection */}
        {file.isDuplicate && file.duplicateGroupId && (
          <Alert variant="default" className="py-2 px-2">
            <AlertTriangle className="h-3 w-3" />
            <AlertDescription className="text-xs space-y-2">
              <p className="font-medium">Duplicate roll number</p>
              <RadioGroup
                value={file.isSelectedDuplicate ? file.filename : ''}
                onValueChange={(value) => onSelectDuplicate(value, file.duplicateGroupId!)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={file.filename} id={`radio-${file.filename}`} />
                  <Label htmlFor={`radio-${file.filename}`} className="text-xs cursor-pointer">
                    Use this file
                  </Label>
                </div>
              </RadioGroup>
            </AlertDescription>
          </Alert>
        )}

        {/* Error Messages */}
        {file.extractionError && (
          <p className="text-xs text-red-600 mt-2">{file.extractionError}</p>
        )}
        {file.fileValidationError && (
          <p className="text-xs text-red-600 mt-2">{file.fileValidationError}</p>
        )}
      </CardContent>
    </Card>
  );
});

ImagePreviewCard.displayName = 'ImagePreviewCard';

// ============================================================================
// PREVIEW GRID WITH VIRTUAL SCROLLING
// ============================================================================

interface PreviewGridProps {
  files: ImageFilePreview[];
  filter: ImageFilterType;
  onToggleSelection: (filename: string, selected: boolean) => void;
  onRemove: (filename: string) => void;
  onSelectDuplicate: (filename: string, duplicateGroupId: string) => void;
}

// Cell props type for react-window v2 Grid
interface GridCellProps {
  filteredFiles: ImageFilePreview[];
  columnCount: number;
  onToggleSelection: (filename: string, selected: boolean) => void;
  onRemove: (filename: string) => void;
  onSelectDuplicate: (filename: string, duplicateGroupId: string) => void;
}

// Cell component for react-window v2 Grid
function GridCell({
  columnIndex,
  rowIndex,
  style,
  filteredFiles,
  columnCount,
  onToggleSelection,
  onRemove,
  onSelectDuplicate,
}: {
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
  ariaAttributes: object;
} & GridCellProps) {
  const index = rowIndex * columnCount + columnIndex;
  const file = filteredFiles[index];

  if (!file) return null;

  return (
    <div style={{ ...style, padding: '8px' }}>
      <ImagePreviewCard
        file={file}
        onToggleSelection={onToggleSelection}
        onRemove={onRemove}
        onSelectDuplicate={onSelectDuplicate}
      />
    </div>
  );
}

function PreviewGrid({
  files,
  filter,
  onToggleSelection,
  onRemove,
  onSelectDuplicate,
}: PreviewGridProps) {
  // Responsive columns based on container width
  const [containerWidth, setContainerWidth] = useState(1000);

  useEffect(() => {
    const updateWidth = () => {
      // Get container width or use window width
      const width = window.innerWidth;
      setContainerWidth(width);
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Filter files based on selected filter
  const filteredFiles = useMemo(() => {
    return filterFilesByStatus(files, filter);
  }, [files, filter]);

  // Responsive grid configuration
  const columnWidth = 250; // 250px per column
  const rowHeight = 420; // 420px per row

  // Determine column count based on container width
  const columnCount = useMemo(() => {
    if (containerWidth < 600) return 1; // Mobile: 1 column
    if (containerWidth < 900) return 2; // Tablet: 2 columns
    if (containerWidth < 1200) return 3; // Small desktop: 3 columns
    return 4; // Large desktop: 4 columns
  }, [containerWidth]);

  const gridWidth = Math.min(columnCount * columnWidth, containerWidth - 32); // Leave padding
  const gridHeight = Math.min(600, Math.ceil(filteredFiles.length / columnCount) * rowHeight);
  const rowCount = Math.ceil(filteredFiles.length / columnCount);

  if (filteredFiles.length === 0) {
    return (
      <div className="text-center py-12 animate-in fade-in duration-300">
        <FileImage className="h-16 w-16 mx-auto text-muted-foreground mb-4 animate-pulse" />
        <p className="text-muted-foreground font-medium">
          {filter === 'all' ? 'No files selected' : `No ${filter} files`}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          {filter === 'all' ? 'Drop files above to get started' : `Try selecting a different filter`}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: gridWidth }}>
        <Grid<GridCellProps>
          cellComponent={GridCell}
          cellProps={{
            filteredFiles,
            columnCount,
            onToggleSelection,
            onRemove,
            onSelectDuplicate,
          }}
          columnCount={columnCount}
          columnWidth={columnWidth}
          rowCount={rowCount}
          rowHeight={rowHeight}
          style={{ height: gridHeight, width: gridWidth }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// STEP 2: PREVIEW & VALIDATE
// ============================================================================

interface PreviewValidateStepProps {
  files: ImageFilePreview[];
  summary: ImageValidationSummary;
  filter: ImageFilterType;
  onFilterChange: (filter: ImageFilterType) => void;
  isValidating: boolean;
  onBack: () => void;
  onNext: () => void;
  onRemoveFile: (filename: string) => void;
  onToggleSelection: (filename: string, selected: boolean) => void;
  onSelectAllValid: () => void;
  onDeselectAll: () => void;
  onSelectDuplicate: (filename: string, duplicateGroupId: string) => void;
}

function PreviewValidateStep({
  files,
  summary,
  filter,
  onFilterChange,
  isValidating,
  onBack,
  onNext,
  onRemoveFile,
  onToggleSelection,
  onSelectAllValid,
  onDeselectAll,
  onSelectDuplicate,
}: PreviewValidateStepProps) {
  return (
    <div className="space-y-4">
      {/* Validation summary */}
      <Card>
        <CardHeader>
          <CardTitle>Validation Summary</CardTitle>
          <CardDescription>
            {summary.totalFiles} files selected
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-bold text-green-600">{summary.validFiles}</p>
              <p className="text-sm text-muted-foreground">Valid</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-600">{summary.warningFiles}</p>
              <p className="text-sm text-muted-foreground">Warnings</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{summary.errorFiles}</p>
              <p className="text-sm text-muted-foreground">Errors</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.selectedFiles}</p>
              <p className="text-sm text-muted-foreground">Selected</p>
            </div>
          </div>

          {summary.photosToReplace > 0 && (
            <Alert variant="default" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Photos will be replaced</AlertTitle>
              <AlertDescription>
                {summary.photosToReplace} learners already have photos. Existing photos will be deleted and replaced.
              </AlertDescription>
            </Alert>
          )}

          {summary.duplicateGroups > 0 && (
            <Alert variant="default" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Duplicate roll numbers detected</AlertTitle>
              <AlertDescription>
                {summary.duplicateGroups} roll numbers have multiple files. Please select which file to use for each in the preview below.
              </AlertDescription>
            </Alert>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={onSelectAllValid}>
              Select All Valid
            </Button>
            <Button size="sm" variant="outline" onClick={onDeselectAll}>
              Deselect All
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filter and Preview Grid */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>
                Files ({files.length})
                {isValidating && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    - Validating...
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Review and select files for upload
              </CardDescription>
            </div>

            {/* Filter Control */}
            <Select value={filter} onValueChange={(value: ImageFilterType) => onFilterChange(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter files" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({summary.totalFiles})</SelectItem>
                <SelectItem value="valid">Valid ({summary.validFiles})</SelectItem>
                <SelectItem value="warning">Warnings ({summary.warningFiles})</SelectItem>
                <SelectItem value="error">Errors ({summary.errorFiles})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isValidating && (
            <Alert className="mb-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Validating learners in database. Please wait...
              </AlertDescription>
            </Alert>
          )}

          <PreviewGrid
            files={files}
            filter={filter}
            onToggleSelection={onToggleSelection}
            onRemove={onRemoveFile}
            onSelectDuplicate={onSelectDuplicate}
          />
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={summary.selectedFiles === 0}>
          Continue ({summary.selectedFiles} files)
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 3: CONFIRM
// ============================================================================

interface ConfirmStepProps {
  summary: ImageValidationSummary;
  institutionId?: string;
  onBack: () => void;
  onConfirm: () => void;
}

function ConfirmStep({ summary, institutionId, onBack, onConfirm }: ConfirmStepProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Confirm Upload</CardTitle>
          <CardDescription>Review before uploading</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <FileImage className="h-5 w-5 text-muted-foreground" />
            <span className="text-lg">
              <span className="font-semibold">{summary.selectedFiles}</span> photos for{' '}
              <span className="font-semibold">{summary.selectedFiles}</span> learners
            </span>
          </div>

          {summary.photosToReplace > 0 && (
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {summary.photosToReplace} existing photos will be replaced
              </AlertDescription>
            </Alert>
          )}

          {summary.duplicateGroups > 0 && (
            <Alert variant="default">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {summary.duplicateGroups} roll numbers had duplicates (selected files will be used)
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onConfirm}>
          Upload {summary.selectedFiles} Photos
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 4: UPLOADING
// ============================================================================

interface UploadingStepProps {
  progress: ImageUploadProgress;
}

function UploadingStep({ progress }: UploadingStepProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Uploading...</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress.percentage || 0} />

          <div className="text-center">
            <p className="text-lg font-medium">
              {progress.completed} of {progress.total}
            </p>
            {progress.current && (
              <p className="text-sm text-muted-foreground mt-1">
                Current: {progress.current}
              </p>
            )}
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Please do not close this window. Upload in progress...
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// STEP 5: RESULTS
// ============================================================================

interface ResultsStepProps {
  result: ImageUploadResult | null;
  onClose: () => void;
  onUploadMore: () => void;
}

function ResultsStep({ result, onClose, onUploadMore }: ResultsStepProps) {
  if (!result) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">No results available</p>
        </CardContent>
      </Card>
    );
  }

  const handleDownloadFailedList = () => {
    if (result.failed.length === 0) {
      toast.error('No failed uploads to download');
      return;
    }

    const csv = generateFailedUploadsCSV(result.failed);
    downloadCSV(csv);
    toast.success('Failed uploads list downloaded');
  };

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Complete</CardTitle>
          <CardDescription>
            {result.success.length > 0 && result.failed.length === 0 && (
              <span className="text-green-600">All photos uploaded successfully!</span>
            )}
            {result.success.length > 0 && result.failed.length > 0 && (
              <span className="text-yellow-600">Some photos failed to upload</span>
            )}
            {result.success.length === 0 && result.failed.length > 0 && (
              <span className="text-red-600">All uploads failed</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 rounded-lg bg-green-50 border border-green-200">
              <p className="text-4xl font-bold text-green-600">{result.success.length}</p>
              <p className="text-sm text-muted-foreground mt-1">Successfully uploaded</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-red-50 border border-red-200">
              <p className="text-4xl font-bold text-red-600">{result.failed.length}</p>
              <p className="text-sm text-muted-foreground mt-1">Failed</p>
            </div>
          </div>

          {/* Failed uploads alert with download option */}
          {result.failed.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Some uploads failed</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{result.failed.length} photos could not be uploaded. Please review the errors below.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadFailedList}
                  className="mt-2"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Failed List (CSV)
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Success Table */}
      {result.success.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">
              <CheckCircle2 className="h-5 w-5 inline mr-2" />
              Successfully Uploaded ({result.success.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">Roll Number</th>
                    <th className="text-left p-3 font-medium">Student Name</th>
                    <th className="text-left p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.success.map((item, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50">
                      <td className="p-3">
                        <Badge variant="outline">{item.rollNumber}</Badge>
                      </td>
                      <td className="p-3 font-medium">{item.studentName}</td>
                      <td className="p-3">
                        <Badge className="bg-green-600 text-white">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Uploaded
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed Table */}
      {result.failed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">
              <AlertCircle className="h-5 w-5 inline mr-2" />
              Failed Uploads ({result.failed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">Filename</th>
                    <th className="text-left p-3 font-medium">Roll Number</th>
                    <th className="text-left p-3 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.failed.map((item, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-medium truncate max-w-[200px]" title={item.filename}>
                        {item.filename}
                      </td>
                      <td className="p-3">
                        {item.rollNumber ? (
                          <Badge variant="outline">{item.rollNumber}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">N/A</span>
                        )}
                      </td>
                      <td className="p-3 text-red-600 text-xs">{item.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onUploadMore}>
          Upload More Photos
        </Button>
      </div>
    </div>
  );
}
