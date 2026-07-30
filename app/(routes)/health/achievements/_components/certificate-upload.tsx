'use client';

// app/(routes)/health/achievements/_components/certificate-upload.tsx
// ============================================================================
// Certificate evidence picker for an achievement.
//
// The file is handed to the uploadCertificate server action, which stores it in
// the repo's existing learner-document bucket (cdc-docs) and returns the storage
// PATH — never an openable link. See that action for why the upload cannot run
// from the browser (production storage RLS refuses a learner session) and why a
// stored link would have been both an exposure and a document that expires after
// a year. The link is minted per view, short-lived, by the certificate-link
// action, for viewers who pass the D7 visibility rule.
//
// The typed-URL input stays available beside it: a certificate that already
// lives in Drive or in a mail thread is still evidence, and if an upload is ever
// refused the learner pastes a link instead of losing the record.
// ============================================================================

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileCheck2, X } from 'lucide-react';
import { uploadCertificate } from '../_actions/upload-certificate';

const MAX_BYTES = 5 * 1024 * 1024;

interface CertificateUploadProps {
  /**
   * Current certificate_url value: either a storage PATH written by the upload
   * action, or a link the learner pasted. Never a link this component minted.
   */
  value: string;
  onChange: (pointer: string) => void;
  disabled?: boolean;
}

export function CertificateUpload({
  value,
  onChange,
  disabled,
}: CertificateUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > MAX_BYTES) {
      setError('Certificate must be 5 MB or smaller.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await uploadCertificate(body);
      if (!res.ok || !res.path) {
        setError(res.error ?? 'Upload failed. Paste a link to the certificate instead.');
        return;
      }
      onChange(res.path);
      setUploadedName(file.name);
    } catch (err) {
      setError(
        `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setUploading(false);
      // Reset so re-picking the same file fires onChange again.
      e.target.value = '';
    }
  }

  function clear() {
    onChange('');
    setUploadedName(null);
    setError(null);
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-gray-600">
        Certificate (optional — upload the scan, or paste a link)
      </Label>

      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <FileCheck2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-xs text-emerald-800 truncate flex-1">
            {uploadedName ?? value}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={disabled || uploading}
            className="h-6 px-1 text-emerald-700 hover:text-emerald-900"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <label className="flex items-center justify-center gap-2 h-9 rounded-md border border-dashed border-amber-300 bg-white text-xs font-medium text-amber-700 cursor-pointer hover:bg-amber-50">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Uploading…' : 'Upload certificate (PDF or image)'}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleFilePick}
              disabled={disabled || uploading}
            />
          </label>
          <Input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="…or paste a certificate link (https://…)"
            className="h-9 bg-white"
            disabled={disabled || uploading}
          />
        </>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
