'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  FileUp,
  Loader2,
  Upload,
  XCircle
} from 'lucide-react';
import { BulkEditPreview, BulkEditResult } from '@/types/student';
import { ChangePreviewTable } from './change-preview-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import toast from 'react-hot-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface BulkEditLearnersProps {
  onSuccess?: () => void;
}

type DialogState = 'upload' | 'preview' | 'processing' | 'results';

export function BulkEditLearners({ onSuccess }: BulkEditLearnersProps) {
  const [open, setOpen] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BulkEditPreview | null>(null);
  const [result, setResult] = useState<BulkEditResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
        '.xlsx'
      ],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false
  });

  const handleGeneratePreview = async () => {
    if (!file) return;

    setDialogState('processing');
    setProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/students/bulk-edit/preview', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate preview');
      }

      const previewData: BulkEditPreview = await response.json();

      if (previewData.students.length === 0) {
        throw new Error('No changes detected in the uploaded file');
      }

      setPreview(previewData);
      setDialogState('preview');
      setProgress(100);
    } catch (err) {
      console.error('Preview generation error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to generate preview'
      );
      setDialogState('upload');
      toast.error(
        err instanceof Error ? err.message : 'Failed to generate preview'
      );
    }
  };

  const handleApplyChanges = async () => {
    if (!preview) return;

    setDialogState('processing');
    setProgress(0);
    setError(null);

    try {
      // Extract updates from preview
      const updates = preview.students.flatMap((student) => {
        const update: any = { id: student.studentId };
        student.changes.forEach((change) => {
          update[change.fieldName] = change.newValue;
        });
        return update;
      });

      const response = await fetch('/api/students/bulk-edit/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to apply changes');
      }

      const resultData: BulkEditResult = await response.json();
      setResult(resultData);
      setDialogState('results');
      setProgress(100);

      if (resultData.summary.updated > 0) {
        toast.success(
          `Successfully updated ${resultData.summary.updated} learner(s)!`
        );
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch (err) {
      console.error('Apply changes error:', err);
      setError(err instanceof Error ? err.message : 'Failed to apply changes');
      setDialogState('preview');
      toast.error(
        err instanceof Error ? err.message : 'Failed to apply changes'
      );
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setDialogState('upload');
      setFile(null);
      setPreview(null);
      setResult(null);
      setProgress(0);
      setError(null);
    }, 200);
  };

  const renderUploadState = () => (
    <div className='space-y-4'>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className='mx-auto h-12 w-12 text-muted-foreground mb-4' />
        {isDragActive ? (
          <p className='text-lg'>Drop the file here...</p>
        ) : (
          <>
            <p className='text-lg mb-2'>
              Drag & drop your edited learners file here
            </p>
            <p className='text-sm text-muted-foreground mb-4'>
              or click to browse
            </p>
            <p className='text-xs text-muted-foreground'>
              Accepts: .xlsx, .xls, .csv
            </p>
          </>
        )}
      </div>

      {file && (
        <Alert>
          <FileUp className='h-4 w-4' />
          <AlertTitle>File Selected</AlertTitle>
          <AlertDescription>
            {file.name} ({(file.size / 1024).toFixed(2)} KB)
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  const renderPreviewState = () => {
    if (!preview) return null;

    return (
      <div className='space-y-4'>
        {/* Summary Cards */}
        <div className='grid grid-cols-3 gap-4'>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {preview.summary.totalStudents}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Total Changes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {preview.summary.totalChanges}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Fields Updated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {Object.keys(preview.summary.changesByField).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Changes by Field */}
        <Alert>
          <AlertTitle>Fields Being Updated</AlertTitle>
          <AlertDescription>
            <div className='flex flex-wrap gap-2 mt-2'>
              {Object.entries(preview.summary.changesByField).map(
                ([field, count]) => (
                  <Badge key={field} variant='secondary'>
                    {field}: {count}
                  </Badge>
                )
              )}
            </div>
          </AlertDescription>
        </Alert>

        {/* Student Changes Accordion */}
        <div className='max-h-[400px] overflow-y-auto border rounded-lg'>
          <Accordion type='single' collapsible className='w-full'>
            {preview.students.map((student, index) => (
              <AccordionItem key={student.studentId} value={`student-${index}`}>
                <AccordionTrigger className='px-4 hover:no-underline'>
                  <div className='flex items-center gap-3 text-left'>
                    <span className='font-medium'>{student.studentName}</span>
                    {student.rollNumber && (
                      <span className='text-sm text-muted-foreground'>
                        ({student.rollNumber})
                      </span>
                    )}
                    <Badge variant='secondary' className='ml-2'>
                      {student.changes.length} changes
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='px-4 pb-4'>
                  <ChangePreviewTable studentChanges={student} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <Alert>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Review Carefully</AlertTitle>
          <AlertDescription>
            Please review all changes above. Once you click &quot;Apply
            Changes&quot;, these updates will be permanently saved to the
            database.
          </AlertDescription>
        </Alert>
      </div>
    );
  };

  const renderProcessingState = () => (
    <div className='space-y-4 py-8'>
      <div className='text-center'>
        <Loader2 className='mx-auto h-12 w-12 animate-spin text-primary mb-4' />
        <p className='text-lg font-medium mb-2'>Processing...</p>
        <p className='text-sm text-muted-foreground'>
          {dialogState === 'processing' && preview
            ? 'Applying changes to database'
            : 'Generating preview'}
        </p>
      </div>
      <Progress value={progress} className='w-full' />
    </div>
  );

  const renderResultsState = () => {
    if (!result) return null;

    return (
      <div className='space-y-4'>
        {/* Summary Cards */}
        <div className='grid grid-cols-3 gap-4'>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{result.summary.total}</div>
            </CardContent>
          </Card>
          <Card className='border-green-200 bg-green-50 dark:bg-green-950'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-green-700 dark:text-green-300'>
                Updated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-700 dark:text-green-300'>
                {result.summary.updated}
              </div>
            </CardContent>
          </Card>
          <Card className='border-red-200 bg-red-50 dark:bg-red-950'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-red-700 dark:text-red-300'>
                Failed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-700 dark:text-red-300'>
                {result.summary.failed}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results Tabs */}
        <Tabs defaultValue='success' className='w-full'>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='success'>
              Updated ({result.success.length})
            </TabsTrigger>
            <TabsTrigger value='failed'>
              Failed ({result.failed.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value='success' className='space-y-2'>
            {result.success.length === 0 ? (
              <Alert>
                <AlertDescription>No students were updated</AlertDescription>
              </Alert>
            ) : (
              <div className='max-h-[300px] overflow-y-auto space-y-2'>
                {result.success.map((item) => (
                  <Alert key={item.studentId}>
                    <CheckCircle2 className='h-4 w-4 text-green-600' />
                    <AlertTitle>{item.studentName}</AlertTitle>
                    <AlertDescription>
                      Updated fields: {item.fieldsUpdated.join(', ')}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value='failed' className='space-y-2'>
            {result.failed.length === 0 ? (
              <Alert>
                <AlertDescription>All updates succeeded!</AlertDescription>
              </Alert>
            ) : (
              <div className='max-h-[300px] overflow-y-auto space-y-2'>
                {result.failed.map((item) => (
                  <Alert key={item.studentId} variant='destructive'>
                    <XCircle className='h-4 w-4' />
                    <AlertTitle>{item.studentName}</AlertTitle>
                    <AlertDescription>{item.error}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='default' size='sm'>
          <Edit3 className='mr-2 h-4 w-4' />
          Bulk Edit Learners
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {dialogState === 'upload' && 'Upload Edited Learners File'}
            {dialogState === 'preview' && 'Preview Changes'}
            {dialogState === 'processing' && 'Processing...'}
            {dialogState === 'results' && 'Results'}
          </DialogTitle>
          <DialogDescription>
            {dialogState === 'upload' &&
              'Upload your edited Excel or CSV file to preview changes'}
            {dialogState === 'preview' &&
              'Review the changes below before applying them'}
            {dialogState === 'processing' &&
              'Please wait while we process your request'}
            {dialogState === 'results' && 'Bulk edit operation completed'}
          </DialogDescription>
        </DialogHeader>

        {dialogState === 'upload' && renderUploadState()}
        {dialogState === 'preview' && renderPreviewState()}
        {dialogState === 'processing' && renderProcessingState()}
        {dialogState === 'results' && renderResultsState()}

        <DialogFooter>
          {dialogState === 'upload' && (
            <>
              <Button variant='outline' onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleGeneratePreview} disabled={!file}>
                Generate Preview
              </Button>
            </>
          )}
          {dialogState === 'preview' && (
            <>
              <Button
                variant='outline'
                onClick={() => setDialogState('upload')}
              >
                Back
              </Button>
              <Button
                onClick={handleApplyChanges}
                className='bg-green-600 hover:bg-green-700'
              >
                Apply Changes
              </Button>
            </>
          )}
          {dialogState === 'results' && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
