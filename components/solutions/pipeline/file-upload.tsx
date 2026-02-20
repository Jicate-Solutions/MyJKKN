'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  X,
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  entityType: 'prospect' | 'mou';
  entityId: string;
  currentUrl?: string;
  currentFilename?: string;
  onUploadComplete: (url: string, filename: string) => void;
  onDelete?: () => void;
}

const ACCEPTED_TYPES = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp';
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function isImageFile(filename: string): boolean {
  return /\.(png|jpg|jpeg|webp)$/i.test(filename);
}

function getFileIcon(filename: string) {
  if (isImageFile(filename)) return ImageIcon;
  return FileText;
}

export function FileUpload({
  entityType,
  entityId,
  currentUrl,
  currentFilename,
  onUploadComplete,
  onDelete,
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      if (file.size > MAX_SIZE_BYTES) {
        toast.error(`File size exceeds ${MAX_SIZE_MB}MB limit`);
        return;
      }

      setIsUploading(true);
      setProgress(10);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', entityType);
        formData.append('entityId', entityId);

        setProgress(30);

        const response = await fetch('/api/upload/solutions-documents', {
          method: 'POST',
          body: formData,
        });

        setProgress(80);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const data = await response.json();
        setProgress(100);

        onUploadComplete(data.url, data.filename);
        toast.success('File uploaded successfully');
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Upload failed'
        );
      } finally {
        setIsUploading(false);
        setProgress(0);
      }
    },
    [entityType, entityId, onUploadComplete]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDelete = () => {
    onDelete?.();
    toast.success('File removed');
  };

  // Show current file if uploaded
  if (currentUrl && currentFilename && !isUploading) {
    const FileIcon = getFileIcon(currentFilename);

    return (
      <div className="flex items-center justify-between gap-3 p-3 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-3 min-w-0">
          <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">
            {currentFilename}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <a href={currentUrl} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" />
            </a>
          </Button>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleDelete}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30',
          isUploading && 'pointer-events-none opacity-70'
        )}
      >
        {isUploading ? (
          <div className="space-y-3">
            <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Uploading...</p>
            <Progress value={progress} className="h-1.5 max-w-48 mx-auto" />
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                Drop a file here or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, DOCX, PNG, JPG, WEBP (max {MAX_SIZE_MB}MB)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
