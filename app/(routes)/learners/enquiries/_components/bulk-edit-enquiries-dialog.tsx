'use client';
// ============================================
// BULK EXPORT & EDIT ENQUIRIES DIALOG (SUPER ADMIN)
// ============================================
// Created: 2026-06-29
// Purpose: Export every non-active (enquiry-stage) learner to Excel, edit a safe
//   subset of fields, and re-upload to bulk-UPDATE existing records (update-only,
//   id-keyed). Adapted from the active-learner bulk-edit dialog; the academic
//   filter card + "include complete" toggle are removed because the export is
//   always "everything except active".
// Access: rendered only when useAuth().isSuperAdmin (see enquiries-header.tsx).
// ============================================

import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Edit,
  X,
  CheckCircle,
  AlertCircle,
  FileText,
  Download,
  TrendingUp,
  Upload,
  Eye,
  ArrowRight,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
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
  error?: string;
}

interface EditResult {
  success: boolean;
  total_rows: number;
  updated: number;
  skipped: number;
  failed: number;
  updated_learners: Array<{ id: string; name: string; fields_updated: string[] }>;
  errors: Array<{ row: number; id?: string; error: string }>;
  error?: string;
}

type Step = 'select' | 'preview' | 'uploading' | 'result';

export function BulkEditEnquiriesDialog({ onSuccess }: { onSuccess?: () => void }) {
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

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedFile(null);
      setPreviewData(null);
      setResult(null);
      setUploadProgress(0);
      setCurrentLearner('');
      setPreviewing(false);
      setUploading(false);
      setStep('select');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  // Export current non-active learners (all statuses except active)
  const downloadExport = async () => {
    setDownloading(true);
    try {
      const response = await fetch('/api/learners/enquiries/export-for-edit');

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to export');
        }
        throw new Error('Failed to export');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enquiries-bulk-edit-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Export downloaded successfully!');
    } catch (error) {
      console.error('[bulk-edit-enquiries] Export error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to export');
    } finally {
      setDownloading(false);
    }
  };

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

  const handlePreview = async () => {
    if (!selectedFile) {
      toast.error('No file selected');
      return;
    }
    setPreviewing(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const response = await fetch('/api/learners/enquiries/bulk-edit-preview', {
        method: 'POST',
        body: formData
      });
      const data: PreviewResult = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to preview changes');
      }
      setPreviewData(data);
      setStep('preview');
      toast.success(`Preview generated! ${data.valid_changes} record(s) with changes found.`);
    } catch (error) {
      console.error('[bulk-edit-enquiries] Preview error:', error);
      toast.error(error instanceof Error ? error.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

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

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          const newProgress = Math.min(prev + 5, 90);
          if (newProgress < 30) setCurrentLearner('Validating data...');
          else if (newProgress < 60) setCurrentLearner('Processing updates...');
          else setCurrentLearner('Finalizing changes...');
          return newProgress;
        });
      }, 300);

      const response = await fetch('/api/learners/enquiries/bulk-edit-apply', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      setCurrentLearner('Complete!');

      const data: EditResult = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.errors?.[0]?.error || data.error || 'Update failed');
      }

      setResult(data);
      setStep('result');

      if (data.updated > 0) toast.success(`Successfully updated ${data.updated} record(s)!`);
      if (data.failed > 0) toast.error(`${data.failed} update(s) failed`);
      if (data.skipped > 0) toast(`${data.skipped} record(s) skipped (no changes)`);
      if (onSuccess && data.updated > 0) onSuccess();
    } catch (error) {
      console.error('[bulk-edit-enquiries] Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Update failed');
      setStep('select');
    } finally {
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setResult(null);
    setUploadProgress(0);
    setCurrentLearner('');
    setPreviewing(false);
    setUploading(false);
    setStep('select');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
          Export / Bulk Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-5 border-b bg-gradient-to-r from-primary/5 to-primary/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Edit className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 flex-wrap">
                Export &amp; Bulk Edit Enquiries
                <Badge variant="outline" className="text-xs">Super Admin</Badge>
                {step === 'preview' && <Badge variant="outline" className="text-xs">Preview</Badge>}
                {step === 'uploading' && <Badge className="bg-blue-500 text-xs">Updating</Badge>}
                {step === 'result' && <Badge className="bg-green-500 text-xs">Complete</Badge>}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs sm:text-sm">
                {step === 'select' && 'Export all enquiry-stage records, edit the white columns, and upload to update'}
                {step === 'preview' && 'Review changes before confirming update'}
                {step === 'uploading' && 'Processing bulk update...'}
                {step === 'result' && 'Update complete — review results below'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* STEP 1: SELECT FILE */}
          {step === 'select' && !selectedFile && (
            <div className="p-4 sm:p-6 lg:p-8">
              <div className="max-w-4xl mx-auto space-y-6">
                <Alert className="border-primary/20 bg-primary/5">
                  <Info className="h-4 w-4 text-primary" />
                  <AlertTitle className="text-primary font-semibold">How Bulk Edit Works</AlertTitle>
                  <AlertDescription className="space-y-3 mt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">1</div>
                        <span>Export current data (all statuses except active)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">2</div>
                        <span>Edit the white columns; leave a cell blank to keep its value</span>
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
                      Do NOT modify the ID* column — it&apos;s used to match records. Columns marked
                      &quot;(read-only)&quot; are ignored on upload.
                    </p>
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card
                    className="border-2 border-primary/20 hover:border-primary/40 transition-colors cursor-pointer group"
                    onClick={downloadExport}
                  >
                    <CardContent className="p-6 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Download className="h-8 w-8 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2">Export Current Data</h3>
                      <p className="text-xs text-muted-foreground mb-4">
                        Download every enquiry-stage record as Excel
                      </p>
                      <Button onClick={downloadExport} disabled={downloading} className="w-full" size="sm">
                        {downloading ? 'Exporting...' : 'Export Data'}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-muted hover:border-muted-foreground/40 transition-colors cursor-pointer group">
                    <CardContent className="p-6 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center group-hover:bg-muted/80 transition-colors">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="font-semibold mb-2">Upload Edited File</h3>
                      <p className="text-xs text-muted-foreground mb-4">
                        Select the edited Excel file to upload
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.csv"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="enquiry-bulk-edit-file"
                      />
                      <label htmlFor="enquiry-bulk-edit-file" className="w-full">
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

          {/* STEP 2: FILE SELECTED */}
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
                        We&apos;ll analyze your file and show exactly what will change before updating any data.
                      </AlertDescription>
                    </Alert>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button variant="outline" onClick={resetUpload} className="flex-1" size="lg">
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                      <Button onClick={handlePreview} disabled={previewing} className="flex-1" size="lg">
                        <Eye className="mr-2 h-4 w-4" />
                        {previewing ? 'Analyzing...' : 'Preview Changes'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW */}
          {step === 'preview' && previewData && (
            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Rows</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{previewData.total_rows}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Valid Changes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{previewData.valid_changes}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">No Changes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-gray-500">{previewData.no_changes}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Errors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{previewData.errors}</div>
                  </CardContent>
                </Card>
              </div>

              {previewData.valid_changes > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Pending Changes ({previewData.valid_changes} record(s))</CardTitle>
                    <CardDescription>Review the fields that will be updated for each record</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] w-full">
                      <div className="space-y-4">
                        {previewData.preview
                          .filter((row) => row.status === 'valid')
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
                                        <TableCell className="font-medium">{change.fieldLabel}</TableCell>
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

              {previewData.errors > 0 && (
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-red-600">Errors ({previewData.errors})</CardTitle>
                    <CardDescription>These rows have validation errors and will be skipped</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {previewData.preview
                        .filter((row) => row.status === 'error')
                        .map((row, idx) => (
                          <Alert key={idx} variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>
                              Row {row.rowNumber}: {row.learnerName}
                            </AlertTitle>
                            <AlertDescription>{row.error}</AlertDescription>
                          </Alert>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3 justify-end pt-4 border-t">
                <Button variant="outline" onClick={resetUpload}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={handleUpload} disabled={previewData.valid_changes === 0}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Confirm &amp; Update ({previewData.valid_changes} record(s))
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
                    <h3 className="text-xl font-semibold mb-2">Updating Records...</h3>
                    <p className="text-sm text-muted-foreground mb-6">{currentLearner}</p>
                    <div className="space-y-3 mb-6">
                      <Progress value={uploadProgress} className="h-3" />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Processing</span>
                        <span className="font-semibold text-blue-600">{uploadProgress}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* STEP 5: RESULTS */}
          {step === 'result' && result && (
            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Processed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{result.total_rows}</div>
                  </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-green-700">Successfully Updated</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{result.updated}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Skipped (No Changes)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-gray-500">{result.skipped}</div>
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

              {result.updated > 0 && (
                <Card className="border-2 border-green-200 bg-green-50">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-green-700 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Successfully Updated
                    </CardTitle>
                    <CardDescription className="text-xs">Summary of bulk update operation</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Sample Updated Records</Label>
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
                            + {result.updated_learners.length - 5} more record(s) updated
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {result.failed > 0 && (
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-red-600">
                      <AlertCircle className="inline h-5 w-5 mr-2" />
                      Failed Updates ({result.failed})
                    </CardTitle>
                    <CardDescription>These updates encountered errors</CardDescription>
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

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={() => setOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
