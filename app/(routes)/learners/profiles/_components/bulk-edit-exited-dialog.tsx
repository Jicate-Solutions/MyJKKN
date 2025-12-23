// ============================================
// BULK EDIT ACTIVE LEARNERS DIALOG
// ============================================
// Created: 2025-01-22
// Updated: 2025-01-22 - Added preview, progress tracking, enhanced summary, and full hierarchy filters
// Purpose: Bulk update existing active learners' incomplete data
// Filters: Institution → Degree → Department → Program → Semester → Section
// ============================================

'use client';

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
}

interface PreviewResult {
  success: boolean;
  total_rows: number;
  valid_changes: number;
  no_changes: number;
  errors: number;
  preview: PreviewRow[];
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
}

type Step = 'select' | 'preview' | 'uploading' | 'result';

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
        throw new Error('Failed to preview changes');
      }

      setPreviewData(data);
      setStep('preview');

      toast.success(`Preview generated! ${data.valid_changes} learners with changes found.`);

    } catch (error) {
      console.error('[bulk-edit-active] Preview error:', error);
      toast.error(error instanceof Error ? error.message : 'Preview failed');
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

      if (!response.ok || !data.success) {
        throw new Error(data.errors?.[0]?.error || 'Update failed');
      }

      setResult(data);
      setStep('result');

      // Show success message
      if (data.updated > 0) {
        toast.success(`Successfully updated ${data.updated} learners!`);
      }

      if (data.failed > 0) {
        toast.error(`${data.failed} updates failed`);
      }

      if (data.skipped > 0) {
        toast(`${data.skipped} learners skipped (no changes)`);
      }

      if (onSuccess && data.updated > 0) {
        onSuccess();
      }

    } catch (error) {
      console.error('[bulk-edit-active] Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Update failed');
      setStep('select');
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
                    {step === 'preview' && <Badge variant="outline" className="text-xs">Preview</Badge>}
                    {step === 'uploading' && <Badge className="bg-blue-500 text-xs">Updating</Badge>}
                    {step === 'result' && <Badge className="bg-green-500 text-xs">Complete</Badge>}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-xs sm:text-sm">
                    {step === 'select' && 'Download template, fill in missing data, and upload to update'}
                    {step === 'preview' && 'Review changes before confirming update'}
                    {step === 'uploading' && 'Processing bulk update...'}
                    {step === 'result' && 'Update complete - Review results below'}
                  </DialogDescription>
                </div>
              </div>
            </div>
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

              {/* Errors */}
              {previewData.errors > 0 && (
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-red-600">
                      Errors ({previewData.errors})
                    </CardTitle>
                    <CardDescription>
                      These rows have validation errors and will be skipped
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {previewData.preview
                        .filter(row => row.status === 'error')
                        .map((row, idx) => (
                          <Alert key={idx} variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Row {row.rowNumber}: {row.learnerName}</AlertTitle>
                            <AlertDescription>{row.error}</AlertDescription>
                          </Alert>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t">
                <Button variant="outline" onClick={resetUpload}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={previewData.valid_changes === 0}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Confirm & Update ({previewData.valid_changes} learners)
                </Button>
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
