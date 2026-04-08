'use client';

// app/(routes)/admission/settings/forms/[id]/_components/image-upload-field.tsx
// Reusable upload + URL fallback input for form builder logo / banner.
// Added: 2026-04-08

import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StorageService } from '@/lib/storage/storage-service';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';

interface ImageUploadFieldProps {
  label: string;
  kind: 'logo' | 'banner';
  formId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** Optional helper text shown below the field */
  help?: string;
  /** Aspect-ratio preview class — e.g. "h-16 w-16" for logo, "h-24 w-full" for banner */
  previewClassName?: string;
}

export function ImageUploadField({
  label,
  kind,
  formId,
  value,
  onChange,
  help,
  previewClassName = 'h-16 w-16',
}: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [urlDraft, setUrlDraft] = useState(value ?? '');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const uploadPromise = StorageService.uploadFormAsset(file, formId, kind);

    try {
      const result = await toast.promise(uploadPromise, {
        loading: `Uploading ${kind}...`,
        success: `${kind.charAt(0).toUpperCase() + kind.slice(1)} uploaded`,
        error: (err) => err?.message || 'Upload failed',
      });

      if (result.publicUrl) {
        onChange(result.publicUrl);
        setUrlDraft(result.publicUrl);
      }
    } catch {
      // toast.promise already surfaced the error
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClear = () => {
    onChange(null);
    setUrlDraft('');
  };

  const handleUrlBlur = () => {
    const trimmed = urlDraft.trim();
    const next = trimmed === '' ? null : trimmed;
    if (next !== value) {
      onChange(next);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {/* Preview area */}
      {value ? (
        <div className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={label}
            className={`${previewClassName} object-cover rounded border bg-muted`}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={`Remove ${label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div
          className={`${previewClassName} border-2 border-dashed rounded flex items-center justify-center text-muted-foreground bg-muted/30`}
        >
          <ImageIcon className="h-6 w-6" />
        </div>
      )}

      {/* Upload button + hidden file input */}
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex-1"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5 mr-2" />
              Upload Image
            </>
          )}
        </Button>
      </div>

      {/* URL fallback — for pasting a pre-hosted image */}
      <div className="space-y-1">
        <Input
          type="url"
          placeholder="or paste image URL…"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onBlur={handleUrlBlur}
          className="text-xs"
        />
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
    </div>
  );
}
