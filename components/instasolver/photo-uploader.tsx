'use client';

// Photograph picker for InstaSolver: uploads each file to Google Drive through
// /api/instasolver/attachments as soon as it is chosen, and hands the parent
// the resulting URLs. Nothing is written to the record until the form submits.

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_MIME_TYPES } from '@/lib/instasolver/constants';

interface PhotoUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  kind: 'issue' | 'requirement' | 'resolution';
  institutionId?: string;
  max?: number;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export function PhotoUploader({
  value,
  onChange,
  kind,
  institutionId,
  max = MAX_PHOTOS,
  disabled,
  onBusyChange
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  const setBusy = (n: number) => {
    setUploading(n);
    onBusyChange?.(n > 0);
  };

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = max - value.length;
    const chosen = Array.from(files).slice(0, room);
    if (files.length > room) toast.error(`Up to ${max} photographs — ${files.length - room} not added.`);

    const valid = chosen.filter((f) => {
      if (!(PHOTO_MIME_TYPES as readonly string[]).includes(f.type)) {
        toast.error(`${f.name}: only JPEG, PNG or WebP.`);
        return false;
      }
      if (f.size > MAX_PHOTO_BYTES) {
        toast.error(`${f.name}: larger than ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB.`);
        return false;
      }
      return true;
    });
    if (!valid.length) return;

    setBusy(valid.length);
    const urls: string[] = [];
    let remaining = valid.length;
    await Promise.all(
      valid.map(async (file) => {
        try {
          const body = new FormData();
          body.append('file', file);
          body.append('kind', kind);
          if (institutionId) body.append('institution_id', institutionId);
          const res = await fetch('/api/instasolver/attachments', { method: 'POST', body });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || 'Upload failed');
          urls.push(json.url as string);
        } catch (err) {
          toast.error(`${file.name}: ${(err as Error).message}`);
        } finally {
          remaining -= 1;
          setBusy(remaining);
        }
      })
    );
    if (urls.length) onChange([...value, ...urls]);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((url) => (
          <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border bg-muted">
            <Image src={url} alt="Attached photograph" fill sizes="80px" className="object-cover" />
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(value.filter((u) => u !== url))}
                className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 shadow"
                aria-label="Remove photograph"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {uploading > 0 && (
          <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      {value.length + uploading < max && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={PHOTO_MIME_TYPES.join(',')}
            multiple
            capture={undefined}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading > 0}
          >
            <Camera className="mr-2 h-4 w-4" />
            {value.length ? 'Add another photograph' : 'Add photographs'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Up to {max}, JPEG / PNG / WebP, {Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB each.
          </p>
        </>
      )}
    </div>
  );
}
