/**
 * FileUploadWidget — file upload renderer using Supabase Storage.
 *
 * Wave 3 — M9 follow-up (builder UI + per-widget renderers).
 *
 * Uploads to the `hr-form-attachments` bucket via StorageUtils. Returns the
 * public URL (or array of URLs when widget.multiple = true) into the submission
 * payload.
 */
'use client';

import { useState } from 'react';
import { Upload, Loader2, X, FileText } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { StorageUtils } from '@/lib/supabase/storage-utils';
import type { FileUploadWidget as FileUploadWidgetType } from '@/types/hr-forms';

interface FileUploadWidgetProps {
  widget: FileUploadWidgetType;
  value?: string[] | string;
  onChange?: (next: string[] | string) => void;
  readOnly?: boolean;
}

export function FileUploadWidget({
  widget,
  value,
  onChange,
  readOnly,
}: FileUploadWidgetProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urls: string[] = Array.isArray(value)
    ? value
    : value
      ? [value]
      : [];

  const maxBytes = (widget.max_size_mb ?? 10) * 1024 * 1024;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !onChange) return;
    setError(null);
    setUploading(true);
    try {
      const filesArr = Array.from(files);
      for (const f of filesArr) {
        if (f.size > maxBytes) {
          throw new Error(
            `File ${f.name} exceeds ${widget.max_size_mb ?? 10} MB`,
          );
        }
      }
      const uploaded = await Promise.all(
        filesArr.map((f) =>
          StorageUtils.uploadFile('hr-form-attachments', f, widget.id),
        ),
      );
      if (widget.multiple) {
        onChange([...urls, ...uploaded]);
      } else {
        onChange(uploaded[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function removeUrl(idx: number) {
    if (!onChange) return;
    const next = urls.filter((_, i) => i !== idx);
    onChange(widget.multiple ? next : '');
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={widget.id} className="text-sm font-medium">
        {widget.label}
        {widget.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={widget.id}
          type="file"
          multiple={widget.multiple}
          accept={widget.accept?.join(',')}
          disabled={readOnly || uploading}
          onChange={(e) => handleFiles(e.target.files)}
          className="flex-1"
        />
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      {urls.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {urls.map((url, i) => (
            <li
              key={url}
              className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1"
            >
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 truncate text-primary hover:underline"
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate">{url.split('/').pop()}</span>
              </a>
              {!readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeUrl(i)}
                  aria-label={`Remove ${url}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {widget.help_text ? (
        <p className="text-xs text-muted-foreground">{widget.help_text}</p>
      ) : null}
    </div>
  );
}
