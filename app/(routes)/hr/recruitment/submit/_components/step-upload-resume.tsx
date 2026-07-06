'use client';

import { useState, useRef, useCallback } from 'react';
import { UploadCloud, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

interface StepUploadResumeProps {
  initialFile: File | null;
  onNext: (file: File) => void;
  onCancel: () => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepUploadResume({ initialFile, onNext, onCancel }: StepUploadResumeProps) {
  const [file, setFile] = useState<File | null>(initialFile);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = (f: File): string | null => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      return 'Only PDF, DOC, and DOCX files are supported.';
    }
    if (f.size > MAX_BYTES) {
      return `File size must be under 2 MB (yours is ${formatBytes(f.size)}).`;
    }
    return null;
  };

  const handleFile = useCallback((f: File) => {
    const err = validate(f);
    if (err) { toast.error(err); return; }
    setFile(f);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) handleFile(picked);
    e.target.value = '';
  };

  const handleNext = () => {
    if (!file) { toast.error('Please select a resume file.'); return; }
    onNext(file);
  };

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/30',
          file && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20',
        )}
        onClick={() => !file && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="sr-only"
          onChange={onInputChange}
        />

        <div className={cn(
          'mb-4 flex h-14 w-14 items-center justify-center rounded-full',
          file ? 'bg-emerald-100 dark:bg-emerald-900' : 'bg-muted',
        )}>
          <UploadCloud className={cn('h-7 w-7', file ? 'text-emerald-600' : 'text-muted-foreground')} />
        </div>

        <p className="text-sm font-medium text-foreground">
          {file ? 'Resume selected' : 'Click or drag resume file to this area to upload'}
        </p>
        {!file && (
          <>
            <p className="mt-1 text-xs text-muted-foreground">Supported formats: .pdf, .doc, .docx</p>
            <p className="text-xs text-muted-foreground">File size should be less than 2 MB</p>
          </>
        )}
      </div>

      {/* Selected file */}
      {file && (
        <>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground">
              <Paperclip className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
            <span className="flex-shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="ml-1 flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your resume will be uploaded when you submit the application.
          </p>
        </>
      )}

      {!file && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => inputRef.current?.click()}
        >
          Browse Files
        </Button>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" className="flex-1" onClick={handleNext} disabled={!file}>
          Next
        </Button>
      </div>
    </div>
  );
}
