'use client';

/**
 * CircularAttachment — upload / preview / replace / remove the drive circular.
 *
 * The file goes straight to Google Drive through
 * POST /api/cdc/drives/circular/upload; only the returned Drive reference is
 * handed back to the parent (`onChange`). Nothing is marked as attached until
 * the upload succeeds. Viewing/downloading goes through the authenticated proxy
 * /api/cdc/drives/[id]/circular once the drive exists; before that (new drive)
 * the Drive webViewLink is shown to the uploader only.
 */

import { useRef, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadCdcDriveCircular } from '@/hooks/cdc/use-cdc-drives';
import type { CdcDriveCircular } from '@/types/cdc';

interface Props {
  value: CdcDriveCircular | null;
  onChange: (next: CdcDriveCircular | null) => void | Promise<void>;
  /** Existing drive id — enables the authenticated view/download links. */
  driveId?: string;
  /** Sent to the upload route for folder naming. */
  driveTitle?: string;
  recruiterId?: string;
  disabled?: boolean;
  /** Hide replace/remove (e.g. read-only states). */
  readOnly?: boolean;
}

const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf';

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function CircularAttachment({
  value,
  onChange,
  driveId,
  driveTitle,
  recruiterId,
  disabled,
  readOnly,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const circular = await uploadCdcDriveCircular(file, {
        title: driveTitle,
        recruiter_id: recruiterId,
      });
      await onChange(circular);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const viewHref = driveId ? `/api/cdc/drives/${driveId}/circular` : value?.url ?? undefined;
  const downloadHref = driveId ? `/api/cdc/drives/${driveId}/circular?download=1` : value?.url ?? undefined;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />

      {value ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" title={value.file_name}>
              {value.file_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {[value.mime_type === 'application/pdf' ? 'PDF' : value.mime_type, formatBytes(value.size_bytes)]
                .filter(Boolean)
                .join(' · ')}
              {value.uploaded_at ? ` · uploaded ${new Date(value.uploaded_at).toLocaleString()}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {viewHref ? (
              <Button asChild type="button" variant="outline" size="sm">
                <a href={viewHref} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> View
                </a>
              </Button>
            ) : null}
            {downloadHref ? (
              <Button asChild type="button" variant="outline" size="sm">
                <a href={downloadHref}>
                  <Download className="h-4 w-4 mr-1" /> Download
                </a>
              </Button>
            ) : null}
            {!readOnly ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || uploading}
                  onClick={() => inputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-1" />}
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={disabled || uploading}
                  onClick={() => onChange(null)}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : readOnly ? (
        <p className="text-sm text-muted-foreground">No circular attached.</p>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className="w-full rounded-md border-2 border-dashed p-6 text-center hover:bg-muted/40 transition-colors disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <UploadCloud className="mx-auto h-6 w-6 text-muted-foreground" />
          )}
          <p className="mt-2 text-sm font-medium">
            {uploading ? 'Uploading to Google Drive…' : 'Upload circular'}
          </p>
          <p className="text-xs text-muted-foreground">
            PDF preferred · Word or image also accepted · up to 10 MB
          </p>
        </button>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
