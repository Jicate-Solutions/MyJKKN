'use client';
// ============================================
// BULK EDIT ACTIVE LEARNERS DIALOG
// ============================================
// Created: 2025-01-22
// Updated: 2025-01-22 - Added preview, progress tracking, enhanced summary, and full hierarchy filters
// Purpose: Bulk update existing active learners' incomplete data
// Filters: Institution → Degree → Department → Program → Semester → Section
// ============================================


import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Edit, X, CheckCircle, AlertCircle, FileText, Download, TrendingUp, Upload, Filter, Eye, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useInstitutionHierarchy } from '@/hooks/use-institution-hierarchy';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FieldChange {
  field: string;
  fieldLabel: string;
  oldValue: any;
  newValue: any;
}

interface PreviewRow {
  learnerId: string;
  learnerName: string;
  rowNumber: number;
  changes: FieldChange[];
  status: 'valid' | 'error' | 'no_changes';
  error?: string;
  /** Labels (Community, Caste, Quota…) that matched no record — field skipped. */
  warnings?: string[];
  /** 'format' → fix the cell; 'record' → wrong learner for this flow. */
  issueKind?: 'format' | 'record';
  /** Per-field format failures, mirroring what the write path enforces. */
  issues?: Array<{ field: string; message: string }>;
}

interface PreviewResult {
  success: boolean;
  total_rows: number;
  valid_changes: number;
  no_changes: number;
  errors: number;
  /** Count of rows carrying at least one unresolved label. */
  warnings?: number;
  /** Blocking issues split by where the fix lives. */
  format_errors?: number;
  record_errors?: number;
  /**
   * What the reference columns will do. Two things the row list can't show:
   * which names get stored with no link behind them, and how many consultant
   * attributions this upload creates — those feed commission calculation.
   */
  reference_summary?: {
    linked: number;
    name_only: number;
    type_only: number;
    attributions_created: number;
    attributions_replaced: number;
    name_only_names: Array<{ type: string; name: string; hint: string | null }>;
  };
  preview: PreviewRow[];
  error?: string; // Added for error responses from server
}

interface EditResult {
  success: boolean;
  total_rows: number;
  updated: number;
  skipped: number;
  failed: number;
  updated_learners: Array<{
    id: string;
    name: string;
    fields_updated: string[];
  }>;
  errors: Array<{
    row: number;
    id?: string;
    error: string;
  }>;
  /** Present when the server refused the batch outright (validation gate). */
  error?: string;
}

type Step = 'select' | 'preview' | 'validate' | 'uploading' | 'result';

/** Wizard rail — the user should always know what is still ahead of the write. */
const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'select', label: 'Upload' },
  { key: 'preview', label: 'Review changes' },
  { key: 'validate', label: 'Validation' },
  { key: 'result', label: 'Result' }
];

export function BulkEditActiveDialog({ onSuccess }: { onSuccess?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('select');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentLearner, setCurrentLearner] = useState('');
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<EditResult | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [includeComplete, setIncludeComplete] = useState(true);
  /** Opt-in to writing the good rows while leaving the bad ones behind. */
  const [skipInvalid, setSkipInvalid] = useState(false);

  // Filters
  const [selectedInstitution, setSelectedInstitution] = useState<string>('');
  const [selectedDegree, setSelectedDegree] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');

  // Get hierarchy data
  const {
    institutions,
    degrees,
    departments,
    programs,
    semesters,
    sections,
    isLoading: hierarchyLoading
  } = useInstitutionHierarchy({
    institutionId: selectedInstitution || undefined,
    degreeId: selectedDegree || undefined,
    departmentId: selectedDepartment || undefined,
    programId: selectedProgram || undefined,
    semesterId: selectedSemester || undefined
  });

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      // Reset all upload-related state when opening
      setSelectedFile(null);
      setPreviewData(null);
      setResult(null);
      setUploadProgress(0);
      setCurrentLearner('');
      setPreviewing(false);
      setUploading(false);
      setSkipInvalid(false);
      setStep('select');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [open]);

  // Download template with current active learners data
  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      // Build query parameters with filters
      const params = new URLSearchParams();
      params.append('include_complete', includeComplete.toString());

      if (selectedInstitution) params.append('institution_id', selectedInstitution);
      if (selectedDegree) params.append('degree_id', selectedDegree);
      if (selectedDepartment) params.append('department_id', selectedDepartment);
      if (selectedProgram) params.append('program_id', selectedProgram);
      if (selectedSemester) params.append('semester_id', selectedSemester);
      if (selectedSection) params.append('section_id', selectedSection);

      const response = await fetch(`/api/learners/export-exited-for-edit?${params.toString()}`);

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to download template');
        }
        throw new Error('Failed to download template');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `active-learners-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Template downloaded successfully!');

    } catch (error) {
      console.error('[bulk-edit-active] Download error:', error);
      toast.error('Failed to download template');
    } finally {
      setDownloading(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv')) {
      toast.error('Please upload an Excel (.xlsx) or CSV file');
      return;
    }

    setSelectedFile(file);
    setPreviewData(null);
    setResult(null);
    setStep('select');
  };

  // Preview changes
  const handlePreview = async () => {
    if (!selectedFile) {
      toast.error('No file selected');
      return;
    }

    setPreviewing(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/learners/bulk-edit-preview', {
        method: 'POST',
        body: formData
      });

      const data: PreviewResult = await response.json();

      if (!response.ok || !data.success) {
        // Show actual server error message instead of generic error
        const errorMessage = data.error || 'Failed to preview changes';
        throw new Error(errorMessage);
      }

      setPreviewData(data);
      setStep('preview');

      const blocking = data.preview.filter(row => row.status === 'error').length;
      if (blocking > 0) {
        toast(`${data.valid_changes} row(s) ready, ${blocking} need attention`);
      } else {
        toast.success(`Preview generated! ${data.valid_changes} learners with changes found.`);
      }

    } catch (error) {
      console.error('[bulk-edit-active] Preview error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Preview failed';

      // Show specific error with helpful message (server returns 503 with
      // a "Temporary network error..." body for retryable fetch failures).
      const lower = errorMessage.toLowerCase();
      if (lower.includes('temporary network') || lower.includes('timeout') || lower.includes('network') || lower.includes('fetch failed')) {
        toast.error('Connection hiccup reaching the server. Please try again in a moment.');
      } else if (lower.includes('unauthorized') || lower.includes('authentication') || lower.includes('session')) {
        toast.error('Session expired. Please refresh the page and try again.');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setPreviewing(false);
    }
  };

  // Handle upload with progress tracking
  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('No file selected');
      return;
    }

    setStep('uploading');
    setUploading(true);
    setUploadProgress(0);
    setCurrentLearner('Initializing...');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      // Server-side gate: without this the route refuses the whole batch if any
      // row is invalid, rather than silently writing the good ones.
      formData.append('skipInvalid', String(skipInvalid));

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          const newProgress = Math.min(prev + 5, 90);

          // Update current learner message based on progress
          if (newProgress < 30) {
            setCurrentLearner('Validating data...');
          } else if (newProgress < 60) {
            setCurrentLearner('Processing updates...');
          } else {
            setCurrentLearner('Finalizing changes...');
          }

          return newProgress;
        });
      }, 300);

      const response = await fetch('/api/learners/bulk-edit-exited', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      setCurrentLearner('Complete!');

      const data: EditResult = await response.json();

      // A partial run returns a FULL report (updated: N, failed: M) with
      // success:false, because processBulkEdit skips a bad row and writes the
      // rest. Throwing that away left "was anything updated?" unanswerable, so
      // render the report whenever the server sent one - failures included.
      const hasReport = typeof data?.total_rows === 'number';

      if (!hasReport) {
        throw new Error(data?.errors?.[0]?.error || data?.error || 'Update failed');
      }

      setResult(data);
      setStep('result');

      // Show success message
      if (data.updated > 0) {
        toast.success(`Successfully updated ${data.updated} learners!`);
      }

      if (data.failed > 0) {
        toast.error(`${data.failed} row(s) failed - see the report`);
      }

      if (data.updated === 0 && data.failed > 0) {
        toast.error('Nothing was updated');
      }

      if (onSuccess && data.updated > 0) {
        onSuccess();
      }

    } catch (error) {
      console.error('[bulk-edit-active] Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Update failed');
      // Only transport/permission failures reach here now, so keep the reviewed
      // file and land back on the gate rather than dumping the user at step 1.
      setStep('validate');
    } finally {
      setUploading(false);
    }
  };

  // Reset to initial state
  const resetUpload = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setResult(null);
    setUploadProgress(0);
    setCurrentLearner('');
    setPreviewing(false);
    setUploading(false);
    setStep('select');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Format value for display
  const formatValue = (value: any): string => {
    if (value === null || value === undefined || value === '') return '(empty)';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  // Derived validation state - the gate between "review" and "write".
  const blockingRows = previewData?.preview.filter(r => r.status === 'error') ?? [];
  const formatIssueRows = blockingRows.filter(r => r.issueKind !== 'record');
  const recordIssueRows = blockingRows.filter(r => r.issueKind === 'record');
  const warningRows = previewData?.preview.filter(r => (r.warnings?.length ?? 0) > 0) ?? [];
  const canSubmit =
    !!previewData &&
    previewData.valid_changes > 0 &&
    (blockingRows.length === 0 || skipInvalid);

  const activeStepIndex = STEPS.findIndex(
    s => s.key === (step === 'uploading' ? 'validate' : step)
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="mr-2 h-4 w-4" />
          Bulk Edit Active
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-5 border-b bg-gradient-to-r from-primary/5 to-primary/10 flex-shrink-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Edit className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2 flex-wrap">
                    Bulk Edit Active Learners
                    {step === 'preview' && <Badge variant="outline" className="text-xs">Step 2 - Review</Badge>}
                    {step === 'validate' && <Badge variant="outline" className="text-xs">Step 3 - Validation</Badge>}
                    {step === 'uploading' && <Badge className="bg-blue-500 text-xs">Updating</Badge>}
                    {step === 'result' && (
                      <Badge className={`text-xs ${(result?.updated ?? 0) > 0 ? 'bg-green-500' : 'bg-red-500'}`}>
                        {(result?.updated ?? 0) > 0 ? 'Complete' : 'Not applied'}
                      </Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-xs sm:text-sm">
                    {step === 'select' && 'Download template, fill in missing data, and upload to update'}
                    {step === 'preview' && 'Review what will change - nothing is written yet'}
                    {step === 'validate' && 'Every rule the update enforces, checked before anything is written'}
                    {step === 'uploading' && 'Processing bulk update...'}
                    {step === 'result' && 'Update finished - review exactly what was written below'}
                  </DialogDescription>
                </div>
              </div>
            </div>
          </div>

          {/* Wizard rail - makes it explicit that a validation gate stands
              between the file and the write. */}
          <div className="flex items-center gap-1 sm:gap-2 mt-4 overflow-x-auto">
            {STEPS.map((s, idx) => {
              const done = idx < activeStepIndex;
              const active = idx === activeStepIndex;
              return (
                <div key={s.key} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] sm:text-xs font-medium transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : done
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                        active ? 'bg-primary-foreground/20' : done ? 'bg-primary/20' : 'bg-foreground/10'
                      }`}
                    >
                      {done ? <CheckCircle className="h-3 w-3" /> : idx + 1}
                    </span>
                    {s.label}
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`h-px w-3 sm:w-6 ${done ? 'bg-primary/40' : 'bg-border'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* STEP 1: SELECT FILE */}
          {step === 'select' && !selectedFile && (
            <div className="p-4 sm:p-6 lg:p-8">
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Instructions */}
                <Alert className="border-primary/20 bg-primary/5">
                  <Info className="h-4 w-4 text-primary" />
                  <AlertTitle className="text-primary font-semibold">How Bulk Edit Works</AlertTitle>
                  <AlertDescription className="space-y-3 mt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">1</div>
                        <span>Download template with current data</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">2</div>
                        <span>Fill ONLY empty or missing fields</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">3</div>
                        <span>Upload and preview changes</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">4</div>
                        <span>Confirm to apply updates</span>
                      </div>
                    </div>
                    <p className="text-xs font-medium text-destructive flex items-center gap-2 mt-3 pt-3 border-t border-primary/10">
                      <AlertCircle className="h-3 w-3" />
                      Do NOT modify the ID column - it&apos;s used to match records
                    </p>
                  </AlertDescription>
                </Alert>

                {/* Filter Options Card */}
                <Card className="border-2">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-primary" />
                        <CardTitle className="text-base">Filter Options</CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowFilters(!showFilters)}
                        className="text-xs"
                      >
                        {showFilters ? 'Hide Advanced' : 'Show Advanced'}
                      </Button>
                    </div>
                    <CardDescription className="text-xs">
                      Filter which learners to include in the export
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Include Complete Profiles Toggle */}
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                      <div className="flex-1">
                        <Label htmlFor="include-complete" className="text-sm font-medium cursor-pointer">
                          Include Complete Profiles
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Show all active learners, not just incomplete ones
                        </p>
                      </div>
                      <Switch
                        id="include-complete"
                        checked={includeComplete}
                        onCheckedChange={setIncludeComplete}
                        className="ml-4"
                      />
                    </div>

                    {/* Advanced Filters */}
                    {showFilters && (
                      <div className="space-y-4 pt-2 animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <div className="h-px flex-1 bg-border" />
                          <span>Academic Hierarchy Filters</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {/* Institution Filter */}
                          <div className="space-y-2">
                            <Label htmlFor="institution" className="text-xs font-medium">
                              Institution
                            </Label>
                            <Select value={selectedInstitution || undefined} onValueChange={(value) => {
                              setSelectedInstitution(value === 'all' ? '' : value);
                              setSelectedDegree('');
                              setSelectedDepartment('');
                              setSelectedProgram('');
                              setSelectedSemester('');
                              setSelectedSection('');
                            }}>
                              <SelectTrigger id="institution" className="h-9">
                                <SelectValue placeholder="All Institutions" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Institutions</SelectItem>
                                {institutions.map(inst => (
                                  <SelectItem key={inst.id} value={inst.id}>
                                    {inst.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Degree Filter */}
                          <div className="space-y-2">
                            <Label htmlFor="degree" className="text-xs font-medium">
                              Degree
                            </Label>
                            <Select
                              value={selectedDegree || undefined}
                              onValueChange={(value) => {
                                setSelectedDegree(value === 'all' ? '' : value);
                                setSelectedDepartment('');
                                setSelectedProgram('');
                                setSelectedSemester('');
                                setSelectedSection('');
                              }}
                              disabled={!selectedInstitution}
                            >
                              <SelectTrigger id="degree" className="h-9">
                                <SelectValue placeholder="All Degrees" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Degrees</SelectItem>
                                {degrees.map(deg => (
                                  <SelectItem key={deg.id} value={deg.id}>
                                    {deg.degree_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Department Filter */}
                          <div className="space-y-2">
                            <Label htmlFor="department" className="text-xs font-medium">
                              Department
                            </Label>
                            <Select
                              value={selectedDepartment || undefined}
                              onValueChange={(value) => {
                                setSelectedDepartment(value === 'all' ? '' : value);
                                setSelectedProgram('');
                                setSelectedSemester('');
                                setSelectedSection('');
                              }}
                              disabled={!selectedDegree}
                            >
                              <SelectTrigger id="department" className="h-9">
                                <SelectValue placeholder="All Departments" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {departments.map(dept => (
                                  <SelectItem key={dept.id} value={dept.id}>
                                    {dept.department_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Program Filter */}
                          <div className="space-y-2">
                            <Label htmlFor="program" className="text-xs font-medium">
                              Program
                            </Label>
                            <Select
                              value={selectedProgram || undefined}
                              onValueChange={(value) => {
                                setSelectedProgram(value === 'all' ? '' : value);
                                setSelectedSemester('');
                                setSelectedSection('');
                              }}
                              disabled={!selectedDepartment}
                            >
                              <SelectTrigger id="program" className="h-9">
                                <SelectValue placeholder="All Programs" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Programs</SelectItem>
                                {programs.map(prog => (
                                  <SelectItem key={prog.id} value={prog.id}>
                                    {prog.program_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Semester Filter */}
                          <div className="space-y-2">
                            <Label htmlFor="semester" className="text-xs font-medium">
                              Semester
                            </Label>
                            <Select
                              value={selectedSemester || undefined}
                              onValueChange={(value) => {
                                setSelectedSemester(value === 'all' ? '' : value);
                                setSelectedSection('');
                              }}
                              disabled={!selectedProgram}
                            >
                              <SelectTrigger id="semester" className="h-9">
                                <SelectValue placeholder="All Semesters" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Semesters</SelectItem>
                                {semesters.map(sem => (
                                  <SelectItem key={sem.id} value={sem.id}>
                                    {sem.semester_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Section Filter */}
                          <div className="space-y-2">
                            <Label htmlFor="section" className="text-xs font-medium">
                              Section
                            </Label>
                            <Select
                              value={selectedSection || undefined}
                              onValueChange={(value) => setSelectedSection(value === 'all' ? '' : value)}
                              disabled={!selectedSemester}
                            >
                              <SelectTrigger id="section" className="h-9">
                                <SelectValue placeholder="All Sections" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Sections</SelectItem>
                                {sections.map(sec => (
                                  <SelectItem key={sec.id} value={sec.id}>
                                    {sec.section_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="border-2 border-primary/20 hover:border-primary/40 transition-colors cursor-pointer group" onClick={downloadTemplate}>
                    <CardContent className="p-6 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Download className="h-8 w-8 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2">Download Current Data</h3>
                      <p className="text-xs text-muted-foreground mb-4">
                        Export current active learners data
                      </p>
                      <Button
                        onClick={downloadTemplate}
                        disabled={downloading}
                        className="w-full"
                        size="sm"
                      >
                        {downloading ? 'Downloading...' : 'Download Data'}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-muted hover:border-muted-foreground/40 transition-colors cursor-pointer group">
                    <CardContent className="p-6 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center group-hover:bg-muted/80 transition-colors">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="font-semibold mb-2">Upload File</h3>
                      <p className="text-xs text-muted-foreground mb-4">
                        Select edited Excel file to upload
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.csv"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-upload"
                      />
                      <label htmlFor="file-upload" className="w-full">
                        <Button variant="outline" size="sm" className="w-full" asChild>
                          <span>Select File</span>
                        </Button>
                      </label>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: FILE SELECTED - PREVIEW BUTTON */}
          {step === 'select' && selectedFile && (
            <div className="p-4 sm:p-6 lg:p-8">
              <div className="max-w-2xl mx-auto space-y-6">
                <Card className="border-2 border-green-200 bg-green-50/50">
                  <CardContent className="p-6 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 bg-green-500/10 rounded-full flex items-center justify-center">
                      <FileText className="h-10 w-10 text-green-600" />
                    </div>

                    <h3 className="text-lg font-semibold mb-2">File Ready for Preview</h3>
                    <div className="space-y-1 mb-6">
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                    </div>

                    <Alert className="text-left mb-6">
                      <Eye className="h-4 w-4" />
                      <AlertTitle className="text-sm">Next Step: Preview Changes</AlertTitle>
                      <AlertDescription className="text-xs">
                        We&apos;ll analyze your file and show you exactly what will change before updating any data.
                      </AlertDescription>
                    </Alert>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        variant="outline"
                        onClick={resetUpload}
                        className="flex-1"
                        size="lg"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                      <Button
                        onClick={handlePreview}
                        disabled={previewing}
                        className="flex-1"
                        size="lg"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        {previewing ? 'Analyzing...' : 'Preview Changes'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW CHANGES */}
          {step === 'preview' && previewData && (
            <div className="p-4 sm:p-6 space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Rows
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{previewData.total_rows}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Valid Changes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {previewData.valid_changes}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      No Changes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-gray-500">
                      {previewData.no_changes}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Errors
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {previewData.errors}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Changes Table */}
              {previewData.valid_changes > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Pending Changes ({previewData.valid_changes} learners)</CardTitle>
                    <CardDescription>
                      Review the fields that will be updated for each learner
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] w-full">
                      <div className="space-y-4">
                        {previewData.preview
                          .filter(row => row.status === 'valid')
                          .map((row, idx) => (
                            <Card key={idx} className="border-l-4 border-l-blue-500">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium">
                                  {row.learnerName}
                                  <Badge variant="outline" className="ml-2">
                                    {row.changes.length} field{row.changes.length > 1 ? 's' : ''}
                                  </Badge>
                                </CardTitle>
                                <CardDescription className="text-xs">
                                  ID: {row.learnerId} • Row: {row.rowNumber}
                                </CardDescription>
                              </CardHeader>
                              <CardContent>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Field</TableHead>
                                      <TableHead>Current Value</TableHead>
                                      <TableHead>New Value</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {row.changes.map((change, changeIdx) => (
                                      <TableRow key={changeIdx}>
                                        <TableCell className="font-medium">
                                          {change.fieldLabel}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                          {formatValue(change.oldValue)}
                                        </TableCell>
                                        <TableCell className="text-green-600 font-medium">
                                          {formatValue(change.newValue)}
                                          <ArrowRight className="inline h-3 w-3 mx-1" />
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </CardContent>
                            </Card>
                          ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Action Buttons — review never writes. Issues are triaged on the
                  next step so a blocking problem can't be scrolled past. */}
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  {blockingRows.length > 0
                    ? `${blockingRows.length} row(s) need attention before updating`
                    : 'No blocking issues found'}
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={resetUpload}>
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                  <Button onClick={() => setStep('validate')}>
                    Next: Validation
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: VALIDATION — every rule the write path enforces, checked
              here first. Nothing has been written at this point. */}
          {step === 'validate' && previewData && (
            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Will Update</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{previewData.valid_changes}</div>
                  </CardContent>
                </Card>
                <Card className={formatIssueRows.length > 0 ? 'border-red-200 bg-red-50' : ''}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Fix in Sheet</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${formatIssueRows.length > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {formatIssueRows.length}
                    </div>
                  </CardContent>
                </Card>
                <Card className={recordIssueRows.length > 0 ? 'border-red-200 bg-red-50' : ''}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Record Issues</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${recordIssueRows.length > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {recordIssueRows.length}
                    </div>
                  </CardContent>
                </Card>
                <Card className={warningRows.length > 0 ? 'border-amber-200 bg-amber-50' : ''}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Warnings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${warningRows.length > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                      {warningRows.length}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* An absence of red is not the same as a confirmation. */}
              {blockingRows.length === 0 && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">All {previewData.total_rows} rows passed validation</AlertTitle>
                  <AlertDescription className="text-green-700 text-xs">
                    Email formats, mobile numbers and learner eligibility were all checked against
                    the same rules the update itself enforces.
                  </AlertDescription>
                </Alert>
              )}

              {/* Reference roll-up. A name stored WITHOUT a link is a supported
                  outcome (old staff, old learners), but it is indistinguishable
                  from a typo unless we say so here — hence the "did you mean".
                  The consultant count is separate because it moves money. */}
              {previewData.reference_summary &&
                previewData.reference_summary.name_only > 0 && (
                  <Card className="border-sky-200">
                    <CardHeader>
                      <CardTitle className="text-sky-700 text-base">
                        Stored as name only ({previewData.reference_summary.name_only})
                      </CardTitle>
                      <CardDescription>
                        These references had no matching record, so the name is saved on its own
                        with no link. That is expected for staff or learners who were never
                        entered in the system — but check the suggestions below for typos first.
                        {previewData.reference_summary.linked > 0 && (
                          <> {previewData.reference_summary.linked} other rows linked cleanly.</>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="max-h-[220px]">
                        <ul className="space-y-1.5 text-xs">
                          {previewData.reference_summary.name_only_names.map((entry, idx) => (
                            <li key={idx} className="flex flex-wrap items-center gap-x-2">
                              <span className="font-medium">{entry.name}</span>
                              <span className="text-muted-foreground">({entry.type})</span>
                              {entry.hint ? (
                                <span className="text-amber-700">
                                  — did you mean <strong>{entry.hint}</strong>?
                                </span>
                              ) : (
                                <span className="text-muted-foreground">— no near match</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

              {previewData.reference_summary &&
                previewData.reference_summary.attributions_created +
                  previewData.reference_summary.attributions_replaced >
                  0 && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800">
                      {previewData.reference_summary.attributions_created +
                        previewData.reference_summary.attributions_replaced}{' '}
                      rows set a Consultant reference
                    </AlertTitle>
                    <AlertDescription className="text-amber-700 text-xs">
                      This creates {previewData.reference_summary.attributions_created} consultant
                      attribution
                      {previewData.reference_summary.attributions_created === 1 ? '' : 's'} at
                      primary / 100%, which feed commission calculation.
                      {previewData.reference_summary.attributions_replaced > 0 && (
                        <>
                          {' '}
                          {previewData.reference_summary.attributions_replaced} of them replace an
                          existing auto-synced attribution.
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

              {/* Format issues — the uploader fixes these in the spreadsheet. */}
              {formatIssueRows.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-red-600 text-base">
                      <AlertCircle className="inline h-5 w-5 mr-2" />
                      Fix in the sheet ({formatIssueRows.length})
                    </CardTitle>
                    <CardDescription>
                      These cells break a rule the update enforces. Correct them in your file and
                      re-upload — or skip these rows below.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[280px]">
                      <div className="space-y-2">
                        {formatIssueRows.map((row, idx) => (
                          <Alert key={idx} variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle className="text-sm">
                              Row {row.rowNumber}: {row.learnerName}
                            </AlertTitle>
                            <AlertDescription className="text-xs">
                              {row.issues?.length ? (
                                <ul className="list-disc pl-4 space-y-0.5">
                                  {row.issues.map((issue, iIdx) => (
                                    <li key={iIdx}>
                                      <span className="font-medium">{issue.field}</span>: {issue.message}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                row.error
                              )}
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Record issues — the sheet is fine; the learner isn't eligible here. */}
              {recordIssueRows.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-red-600 text-base">
                      <AlertCircle className="inline h-5 w-5 mr-2" />
                      Record issues ({recordIssueRows.length})
                    </CardTitle>
                    <CardDescription>
                      The cells are valid, but these learners can&apos;t be edited from this dialog —
                      it only updates learners in <strong>Active</strong> status within your institution.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[280px]">
                      <div className="space-y-2">
                        {recordIssueRows.map((row, idx) => (
                          <Alert key={idx} variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle className="text-sm">
                              Row {row.rowNumber}: {row.learnerName}
                            </AlertTitle>
                            <AlertDescription className="text-xs">{row.error}</AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Unresolved labels — non-blocking: the row still applies, minus
                  that one field. Kept visible so a typo'd Quota/Caste can't be
                  silently dropped the way it was before. */}
              {warningRows.length > 0 && (
                <Card className="border-amber-200">
                  <CardHeader>
                    <CardTitle className="text-amber-600 text-base">
                      <AlertCircle className="inline h-5 w-5 mr-2" />
                      Unmatched values ({warningRows.length}) — not blocking
                    </CardTitle>
                    <CardDescription>
                      These cells didn&apos;t match any record. The rest of each row still updates —
                      only the listed field is skipped.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[240px]">
                      <div className="space-y-2">
                        {warningRows.map((row, idx) => (
                          <Alert key={idx} className="border-amber-200 bg-amber-50">
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                            <AlertTitle className="text-amber-800 text-sm">
                              Row {row.rowNumber}: {row.learnerName}
                            </AlertTitle>
                            <AlertDescription className="text-amber-700 text-xs">
                              <ul className="list-disc pl-4 space-y-0.5">
                                {row.warnings?.map((w, wIdx) => (
                                  <li key={wIdx}>{w}</li>
                                ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* The gate. Server enforces this too - the toggle isn't cosmetic. */}
              {blockingRows.length > 0 && (
                <div className="flex items-start justify-between gap-4 p-4 rounded-lg border-2 border-dashed bg-muted/20">
                  <div className="flex-1">
                    <Label htmlFor="skip-invalid" className="text-sm font-medium cursor-pointer">
                      Skip the {blockingRows.length} failing row(s) and update the rest
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Leave this off to write nothing until the sheet is clean. The server applies
                      the same rule, so an unchecked box really does mean no data is touched.
                    </p>
                  </div>
                  <Switch id="skip-invalid" checked={skipInvalid} onCheckedChange={setSkipInvalid} />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  {canSubmit
                    ? `${previewData.valid_changes} learner(s) will be updated${
                        blockingRows.length > 0 ? `, ${blockingRows.length} skipped` : ''
                      }`
                    : blockingRows.length > 0
                      ? 'Resolve the issues above, or tick "skip" to proceed without them'
                      : 'No changes to apply'}
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep('preview')}>
                    Back
                  </Button>
                  <Button variant="outline" onClick={resetUpload}>
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                  <Button onClick={handleUpload} disabled={!canSubmit}>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Confirm &amp; Update ({previewData.valid_changes})
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: UPLOADING */}
          {step === 'uploading' && (
            <div className="p-4 sm:p-6 lg:p-8">
              <div className="max-w-lg mx-auto">
                <Card className="border-2 border-blue-200 bg-blue-50/50">
                  <CardContent className="p-8 text-center">
                    <div className="w-24 h-24 mx-auto mb-6 bg-blue-500/10 rounded-full flex items-center justify-center animate-pulse">
                      <TrendingUp className="h-12 w-12 text-blue-500" />
                    </div>

                    <h3 className="text-xl font-semibold mb-2">Updating Learners...</h3>
                    <p className="text-sm text-muted-foreground mb-6">{currentLearner}</p>

                    <div className="space-y-3 mb-6">
                      <Progress value={uploadProgress} className="h-3" />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Processing</span>
                        <span className="font-semibold text-blue-600">{uploadProgress}%</span>
                      </div>
                    </div>

                    <Alert className="text-left">
                      <Info className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Please wait while we update the learner profiles. This may take a few moments.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* STEP 5: RESULTS */}
          {step === 'result' && result && (
            <div className="p-4 sm:p-6 space-y-4">
              {/* States plainly whether data was written. A partial run used to
                  surface as a lone error toast, leaving no way to tell. */}
              {result.updated > 0 && result.failed === 0 && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">
                    All {result.updated} learner(s) updated
                  </AlertTitle>
                  <AlertDescription className="text-green-700 text-xs">
                    Every row in the sheet was written successfully.
                  </AlertDescription>
                </Alert>
              )}

              {result.updated > 0 && result.failed > 0 && (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800">
                    Partial update — {result.updated} written, {result.failed} not
                  </AlertTitle>
                  <AlertDescription className="text-amber-700 text-xs">
                    The {result.updated} learner(s) below <strong>were saved</strong>. The failed rows
                    were skipped and left untouched — fix them in the sheet and re-upload just those.
                  </AlertDescription>
                </Alert>
              )}

              {result.updated === 0 && result.failed > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Nothing was updated</AlertTitle>
                  <AlertDescription className="text-xs">
                    {result.error ||
                      'No rows were written — every row failed validation. Your data is unchanged.'}
                  </AlertDescription>
                </Alert>
              )}

              {/* skipped counts rows whose cells already matched the DB. */}
              {result.updated === 0 && result.failed === 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No changes were needed</AlertTitle>
                  <AlertDescription className="text-xs">
                    All {result.skipped} row(s) already matched the stored data, so nothing was written.
                  </AlertDescription>
                </Alert>
              )}

              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Processed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{result.total_rows}</div>
                  </CardContent>
                </Card>

                <Card className="border-green-200 bg-green-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-green-700">
                      Successfully Updated
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {result.updated}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Skipped (No Changes)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-gray-500">
                      {result.skipped}
                    </div>
                  </CardContent>
                </Card>

                <Card className={result.failed > 0 ? 'border-red-200 bg-red-50' : ''}>
                  <CardHeader className="pb-3">
                    <CardTitle className={`text-sm font-medium ${result.failed > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
                      Failed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${result.failed > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {result.failed}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Updated Learners Summary */}
              {result.updated > 0 && (
                <Card className="border-2 border-green-200 bg-green-50">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-green-700 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Successfully Updated
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Summary of bulk update operation
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Overall Statistics */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="flex items-center justify-between p-3 bg-white rounded-lg border shadow-sm">
                        <span className="text-xs font-medium text-muted-foreground">Learners Updated</span>
                        <span className="text-xl sm:text-2xl font-bold text-green-600">{result.updated}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-white rounded-lg border shadow-sm">
                        <span className="text-xs font-medium text-muted-foreground">Total Fields</span>
                        <span className="text-xl sm:text-2xl font-bold text-green-600">
                          {result.updated_learners.reduce((sum, l) => sum + l.fields_updated.length, 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-white rounded-lg border shadow-sm">
                        <span className="text-xs font-medium text-muted-foreground">Avg Fields</span>
                        <span className="text-xl sm:text-2xl font-bold text-green-600">
                          {(result.updated_learners.reduce((sum, l) => sum + l.fields_updated.length, 0) / result.updated).toFixed(1)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-white rounded-lg border shadow-sm">
                        <span className="text-xs font-medium text-muted-foreground">Success Rate</span>
                        <span className="text-xl sm:text-2xl font-bold text-green-600">
                          {((result.updated / result.total_rows) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* Sample of Updated Learners (first 5) */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Sample Updated Learners</Label>
                      <div className="bg-white rounded-lg border p-4 space-y-2">
                        {result.updated_learners.slice(0, 5).map((learner, idx) => (
                          <div key={idx} className="flex items-center justify-between py-2 border-b last:border-b-0">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{learner.name}</p>
                              <p className="text-xs text-muted-foreground">ID: {learner.id}</p>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              {learner.fields_updated.length} field{learner.fields_updated.length > 1 ? 's' : ''}
                            </Badge>
                          </div>
                        ))}
                        {result.updated_learners.length > 5 && (
                          <p className="text-xs text-center text-muted-foreground pt-2">
                            + {result.updated_learners.length - 5} more learners updated
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Errors */}
              {result.failed > 0 && (
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-red-600">
                      <AlertCircle className="inline h-5 w-5 mr-2" />
                      Failed Updates ({result.failed})
                    </CardTitle>
                    <CardDescription>
                      These updates encountered errors
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {result.errors.map((error, idx) => (
                        <Alert key={idx} variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>
                            Row {error.row}
                            {error.id && ` (ID: ${error.id})`}
                          </AlertTitle>
                          <AlertDescription>{error.error}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Close Button */}
              <div className="flex justify-end pt-4 border-t">
                <Button onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
