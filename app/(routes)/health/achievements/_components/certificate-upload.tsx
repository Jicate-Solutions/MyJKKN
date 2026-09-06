'use client';

// app/(routes)/health/achievements/_components/certificate-upload.tsx
// ============================================================================
// Certificate evidence picker for an achievement.
//
// The picker STAGES the file; it does not upload it. Nothing is written to
// storage until the achievement row exists, because the upload action now
// authorizes the caller against THAT row — owner, IQAC, or admin — and there is
// no row to authorize against while the form is still being filled in. The page
// creates the achievement first and then hands the staged file, with the new
// row's id, to _actions/upload-certificate.ts.
//
// The typed-URL input stays available beside it: a certificate that already
// lives in Drive or in a mail thread is still evidence, and if an upload is ever
// refused the learner pastes a link instead of losing the record.
// ============================================================================

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileCheck2, X } from 'lucide-react';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];

interface CertificateUploadProps {
  /** A link the learner pasted — stored verbatim on the row. */
  url: string;
  /** A file staged for upload after the achievement row is created. */
  file: File | null;
  onUrlChange: (url: string) => void;
  onFileChange: (file: File | null) => void;
  /** Surfaced by the parent so a rejected file explains itself in one place. */
  error: string | null;
  onError: (message: string | null) => void;
  disabled?: boolean;
}

export function CertificateUpload({
  url,
  file,
  onUrlChange,
  onFileChange,
  error,
  onError,
  disabled,
}: CertificateUploadProps) {
  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    // Reset immediately so re-picking the same file fires onChange again.
    e.target.value = '';
    if (!picked) return;
    onError(null);

    if (picked.size === 0) {
      onError('That file is empty.');
      return;
    }
    if (picked.size > MAX_BYTES) {
      onError('Certificate must be 5 MB or smaller.');
      return;
    }
    // The same allowlist the server enforces — this only saves a round trip.
    if (!ALLOWED_MIME.includes(picked.type)) {
      onError('Upload a PDF, JPG, PNG or WebP file.');
      return;
    }

    onFileChange(picked);
    onUrlChange('');
  }

  function clear() {
    onFileChange(null);
    onError(null);
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-gray-600">
        Certificate (optional — upload the scan, or paste a link)
      </Label>

      {file ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <FileCheck2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-xs text-emerald-800 truncate flex-1">
            {file.name}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={disabled}
            className="h-6 px-1 text-emerald-700 hover:text-emerald-900"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <label className="flex items-center justify-center gap-2 h-9 rounded-md border border-dashed border-amber-300 bg-white text-xs font-medium text-amber-700 cursor-pointer hover:bg-amber-50">
            <Upload className="h-3.5 w-3.5" />
            Upload certificate (PDF or image)
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleFilePick}
              disabled={disabled}
            />
          </label>
          <Input
            type="url"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="…or paste a certificate link (https://…)"
            className="h-9 bg-white"
            disabled={disabled}
          />
        </>
      )}

      {file && (
        <p className="text-[11px] text-gray-500">
          Attached when you save this achievement.
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
