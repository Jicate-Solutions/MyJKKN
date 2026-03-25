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
 * Import Dialog Component for Semesters
 *
 * Features:
 * - File upload with drag & drop
 * - Real-time progress tracking
 * - Detailed error reporting with row numbers
 * - Success/error summary
 * - Download template shortcut
 * - Supports 4-level cascading validation (Institution → Degree → Department → Program)
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

      const response = await fetch('/api/organizations/semesters/import', {
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
          `Successfully imported ${data.successCount} semester${data.successCount !== 1 ? 's' : ''}!`,
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
      const response = await fetch('/api/organizations/semesters/template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `semesters-template-${new Date().toISOString().split('T')[0]}.xlsx`;
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
            Import Semesters
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file to import multiple semesters at once. The file must match
            the template format with 4-level cascading hierarchy (Institution → Degree → Department → Program).
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
              {file ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2">
                    <FileSpreadsheet className="h-8 w-8 text-blue-500" />
                    <div className="text-left">
                      <p className="font-medium text-sm">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setFile(null)}
                      className="ml-2"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {uploading && (
                    <div className="space-y-2">
                      <Progress value={progress} className="h-2" />
                      <p className="text-xs text-muted-foreground">
                        Uploading... {progress}%
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      Drag and drop your Excel file here
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      or click to browse
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload">
                    <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                      <span>Select File</span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Result Section */}
          {result && (
            <div className="space-y-4">
              {/* Summary */}
              <Alert variant={result.success ? 'default' : 'destructive'}>
                {result.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">
                      {result.success
                        ? `Successfully imported ${result.successCount} semester${result.successCount !== 1 ? 's' : ''}`
                        : `Import failed with ${result.errorCount} error${result.errorCount !== 1 ? 's' : ''}`}
                    </p>
                    <div className="flex gap-4 text-sm">
                      <span>Total Rows: {result.totalRows}</span>
                      {result.successCount > 0 && (
                        <span className="text-green-600 dark:text-green-400">
                          Success: {result.successCount}
                        </span>
                      )}
                      {result.errorCount > 0 && (
                        <span className="text-red-600 dark:text-red-400">
                          Errors: {result.errorCount}
                        </span>
                      )}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Error Details */}
              {result.errors && result.errors.length > 0 && (
                <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
                  <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Error Details
                  </h4>
                  <div className="space-y-2">
                    {result.errors.map((error, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 text-sm p-2 bg-red-50 dark:bg-red-950/20 rounded"
                      >
                        <Badge variant="destructive" className="shrink-0">
                          Row {error.row || 'N/A'}
                        </Badge>
                        <div className="flex-1">
                          {error.field && (
                            <span className="font-medium text-xs uppercase text-muted-foreground">
                              {error.field}:{' '}
                            </span>
                          )}
                          <span className="text-red-600 dark:text-red-400">
                            {error.message}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Duplicate Codes */}
              {result.duplicateCodes && result.duplicateCodes.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-sm mb-2">
                    Duplicate Semester Codes
                  </h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    {result.duplicateCodes.map((code, index) => (
                      <li key={index}>• {code}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && file && (
            <Button
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload & Import'}
            </Button>
          )}
          {result && !result.success && (
            <Button
              variant="outline"
              onClick={() => {
                setFile(null);
                setResult(null);
              }}
            >
              Try Again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
