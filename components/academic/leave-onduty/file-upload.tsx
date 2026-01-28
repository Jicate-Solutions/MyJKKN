'use client';

/**
 * File Upload Component for Leave/OnDuty Applications
 *
 * Features:
 * - Drag and drop file upload
 * - File type and size validation
 * - Preview uploaded file
 * - Shows validation requirements dynamically
 *
 * @module components/academic/leave-onduty/file-upload
 */

import { useState, useCallback } from 'react';
import { Upload, X, File, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FileRequirements } from '@/types/leave-onduty';

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  requirements: FileRequirements;
  selectedFile: File | null;
  className?: string;
}

export function FileUpload({
  onFileSelect,
  requirements,
  selectedFile,
  className,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = useCallback(
    (file: File): { valid: boolean; error?: string } => {
      // Check file size
      if (file.size > requirements.maxSize) {
        return {
          valid: false,
          error: `File size exceeds ${requirements.maxSize / (1024 * 1024)}MB`,
        };
      }

      // Check file type
      if (!requirements.allowedTypes.includes(file.type)) {
        return {
          valid: false,
          error: 'Invalid file type. Only PDF, JPG, and PNG files are allowed.',
        };
      }

      return { valid: true };
    },
    [requirements]
  );

  const handleFileChange = useCallback(
    (file: File) => {
      const validation = validateFile(file);
      if (!validation.valid) {
        setError(validation.error || 'Invalid file');
        onFileSelect(null);
        return;
      }

      setError(null);
      onFileSelect(file);
    },
    [validateFile, onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        handleFileChange(files[0]);
      }
    },
    [handleFileChange]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileChange(files[0]);
      }
    },
    [handleFileChange]
  );

  const handleRemoveFile = useCallback(() => {
    onFileSelect(null);
    setError(null);
  }, [onFileSelect]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Requirements Info */}
      {requirements.required && (
        <div className="flex items-start gap-2 rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
          <p className="text-yellow-800 dark:text-yellow-200">
            <strong>Required:</strong> {requirements.reason}
          </p>
        </div>
      )}

      {/* Upload Area */}
      {!selectedFile ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'relative rounded-lg border-2 border-dashed p-6 transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-gray-300 dark:border-gray-700',
            'hover:border-primary hover:bg-primary/5 cursor-pointer'
          )}
        >
          <input
            type="file"
            id="file-upload"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept={requirements.allowedTypes.join(',')}
            onChange={handleInputChange}
          />
          <div className="flex flex-col items-center gap-2 text-center">
            <Upload className="h-10 w-10 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Drop your file here or click to browse
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                PDF, JPG, PNG up to {requirements.maxSize / (1024 * 1024)}MB
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Selected File Preview */
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800">
          <File className="h-8 w-8 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {selectedFile.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatFileSize(selectedFile.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemoveFile}
            className="flex-shrink-0 rounded-md p-1 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Remove file"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
}
