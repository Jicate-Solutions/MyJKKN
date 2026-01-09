'use client';

import { useState } from 'react';
import { Upload, X, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import toast from 'react-hot-toast';

/**
 * Import Dialog Component for Programs
 *
 * Features:
 * - File upload with drag & drop
 * - Real-time progress tracking
 * - Detailed error reporting with row numbers
 * - Success/error summary
 * - Download template shortcut
 */

interface ImportError {
  row: number;
  field?: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors: ImportError[];
  duplicateCodes?: string[];
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

export function ImportDialog({
  open,
  onOpenChange,
  onImportComplete
}: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Reset state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setFile(null);
      setResult(null);
      setProgress(0);
    }
    onOpenChange(newOpen);
  };

  // Handle file selection
  const handleFileChange = (selectedFile: File | null) => {
    if (selectedFile) {
      // Validate file type
      if (
        !selectedFile.name.endsWith('.xlsx') &&
        !selectedFile.name.endsWith('.xls')
      ) {
        toast.error('Invalid file type', {
          icon: <FileSpreadsheet className="h-4 w-4" />,
          duration: 5000
        });
        return;
      }

      setFile(selectedFile);
      setResult(null);
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileChange(droppedFile);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append('file', file);

      setProgress(30);

      const response = await fetch('/api/organizations/programs/import', {
        method: 'POST',
        body: formData
      });

      setProgress(70);

      const data: ImportResult = await response.json();

      setProgress(100);
      setResult(data);

      // Show toast notification
      if (data.success) {
        toast.success(
          `Successfully imported ${data.successCount} program${data.successCount !== 1 ? 's' : ''}!`,
          {
            icon: <CheckCircle2 className="h-4 w-4" />,
            duration: 5000
          }
        );

        // Trigger refresh
        if (onImportComplete) {
          setTimeout(() => {
            onImportComplete();
          }, 500);
        }
      } else {
        toast.error(
          `Import failed with ${data.errorCount} error${data.errorCount !== 1 ? 's' : ''}`,
          {
            icon: <AlertCircle className="h-4 w-4" />,
            duration: 5000
          }
        );
      }
    } catch (error) {
      console.error('[ImportDialog] Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';

      toast.error('Upload failed', {
        icon: <AlertCircle className="h-4 w-4" />,
        duration: 5000
      });

      setResult({
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows: 0,
        errors: [
          {
            row: 0,
            message: errorMessage
          }
        ]
      });
    } finally {
      setUploading(false);
    }
  };

  // Download template
  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/organizations/programs/template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `programs-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('[ImportDialog] Template download error:', error);
      toast.error('Failed to download template');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Programs
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file to import multiple programs at once. The file must match
            the template format with 3-level cascading hierarchy (Institution → Degree → Department).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download Section */}
          <Alert>
            <FileSpreadsheet className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-sm">
                Don&apos;t have a template? Download it to get started.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="ml-2"
              >
                Download Template
              </Button>
            </AlertDescription>
          </Alert>

          {/* File Upload Section */}
          {!result && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {!file ? (
                <>
                  <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Drag and drop your Excel file here, or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload">
                    <Button variant="outline" size="sm" asChild>
                      <span>Choose File</span>
                    </Button>
                  </label>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-8 w-8 text-green-600" />
                    <div className="text-left">
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile(null)}
                    disabled={uploading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Progress Bar */}
          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                {progress < 30 && 'Uploading file...'}
                {progress >= 30 && progress < 70 && 'Processing data...'}
                {progress >= 70 && 'Finalizing import...'}
              </p>
            </div>
          )}

          {/* Results Section */}
          {result && (
            <div className="space-y-4">
              {/* Success Summary */}
              {result.success && (
                <Alert className="border-green-200 bg-green-50 dark:bg-green-900/10">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-green-800 dark:text-green-200">
                          Import Successful!
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Successfully imported {result.successCount} program
                          {result.successCount !== 1 ? 's' : ''} out of {result.totalRows}{' '}
                          row{result.totalRows !== 1 ? 's' : ''}.
                        </p>
                      </div>
                      <Badge variant="outline" className="bg-green-100 text-green-800">
                        {result.successCount}/{result.totalRows}
                      </Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Error Summary */}
              {!result.success && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Import Failed</p>
                          <p className="text-sm">
                            {result.errorCount} error{result.errorCount !== 1 ? 's' : ''}{' '}
                            found in {result.totalRows} row
                            {result.totalRows !== 1 ? 's' : ''}.
                          </p>
                        </div>
                        <Badge variant="outline" className="bg-red-100 text-red-800">
                          {result.errorCount} error{result.errorCount !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Duplicate Codes */}
              {result.duplicateCodes && result.duplicateCodes.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium mb-2">Duplicate Program IDs Found:</p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {result.duplicateCodes.map((msg, index) => (
                        <li key={index}>{msg}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Error Details */}
              {result.errors && result.errors.length > 0 && !result.duplicateCodes && (
                <div className="border rounded-lg p-4 max-h-80 overflow-y-auto bg-gray-50 dark:bg-gray-900">
                  <p className="font-medium mb-3 text-sm">Error Details:</p>
                  <div className="space-y-2">
                    {result.errors.map((error, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 text-sm p-2 bg-white dark:bg-gray-800 rounded border"
                      >
                        <Badge variant="outline" className="mt-0.5">
                          Row {error.row}
                        </Badge>
                        <div className="flex-1">
                          {error.field && (
                            <span className="font-medium text-red-600 dark:text-red-400">
                              {error.field}:{' '}
                            </span>
                          )}
                          <span className="text-gray-700 dark:text-gray-300">
                            {error.message}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!file || uploading}>
                {uploading ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              {result.success ? (
                <Button onClick={() => handleOpenChange(false)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFile(null);
                      setResult(null);
                      setProgress(0);
                    }}
                  >
                    Try Again
                  </Button>
                  <Button onClick={() => handleOpenChange(false)}>Close</Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
