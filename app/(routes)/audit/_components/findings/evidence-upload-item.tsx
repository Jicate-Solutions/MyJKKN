'use client';

// Audit Workflow Sprint 01 — single evidence upload row.
// Renders label + required/optional chip + file picker + uploaded-filename readout.
// Upload target: Supabase Storage bucket 'audit-evidence'. If the bucket is not
// provisioned yet, callers can pass onUploaded with a custom path string.

import { useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle2, Upload, FileText, X } from 'lucide-react';
import type { EvidenceRequirementItem } from '@/lib/types/audit';

interface UploadedFile {
  label: string;
  storage_path: string;
  uploaded_at: string;
  uploaded_by: string;
  original_name?: string;
}

interface EvidenceUploadItemProps {
  requirement: EvidenceRequirementItem;
  findingId: string;
  uploadedBy: string;
  existingUpload: UploadedFile | null;
  onUploaded: (file: UploadedFile) => void;
  onRemoved: () => void;
  disabled?: boolean;
}

const STORAGE_BUCKET = 'audit-evidence';

export function EvidenceUploadItem({
  requirement,
  findingId,
  uploadedBy,
  existingUpload,
  onUploaded,
  onRemoved,
  disabled,
}: EvidenceUploadItemProps) {
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);

    // Optional MIME validation
    if (requirement.mime_types && requirement.mime_types.length > 0) {
      const allowed = requirement.mime_types.some((m) =>
        // Supports exact MIME or wildcard like 'image/*'
        m.endsWith('/*')
          ? file.type.startsWith(m.slice(0, -1))
          : file.type === m
      );
      if (!allowed) {
        setErrorMsg(`Unsupported file type. Allowed: ${requirement.mime_types.join(', ')}`);
        e.target.value = '';
        return;
      }
    }

    setUploading(true);
    try {
      const supabase = createClientSupabaseClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const safeLabel = requirement.label.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${findingId}/${safeLabel}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (upErr) {
        // Fallback: if bucket missing, store the intended path as a reference string
        // so closing the finding still captures the label. Server-side close will
        // accept the path; admins can re-upload the file once the bucket exists.
        const msg = upErr.message ?? String(upErr);
        if (msg.toLowerCase().includes('bucket') || msg.toLowerCase().includes('not found')) {
          onUploaded({
            label: requirement.label,
            storage_path: `pending:${path}`,
            uploaded_at: new Date().toISOString(),
            uploaded_by: uploadedBy,
            original_name: file.name,
          });
          setErrorMsg(
            'Storage bucket not ready — reference recorded. Re-upload once bucket is provisioned.'
          );
          e.target.value = '';
          return;
        }
        throw upErr;
      }

      onUploaded({
        label: requirement.label,
        storage_path: path,
        uploaded_at: new Date().toISOString(),
        uploaded_by: uploadedBy,
        original_name: file.name,
      });
    } catch (err) {
      setErrorMsg(
        `Upload failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  const hasFile = !!existingUpload;
  const inputId = `evidence-upload-${requirement.label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border p-3 transition-colors',
        hasFile ? 'border-green-500/50 bg-green-50/50 dark:bg-green-900/10' : 'border-border'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Label htmlFor={inputId} className="text-sm font-medium">
              {requirement.label}
            </Label>
            {requirement.required ? (
              <Badge variant="outline" className="text-xs border-red-300 text-red-700 dark:text-red-300">
                Required
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Optional
              </Badge>
            )}
            {hasFile && (
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-label="Uploaded" />
            )}
          </div>
          {requirement.description && (
            <p className="text-xs text-muted-foreground mt-1">{requirement.description}</p>
          )}
          {requirement.mime_types && requirement.mime_types.length > 0 && (
            <p className="text-[10px] text-muted-foreground/80 mt-1">
              Accepted: {requirement.mime_types.join(', ')}
            </p>
          )}
        </div>
      </div>

      {hasFile ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate font-mono text-xs">
              {existingUpload?.original_name ?? existingUpload?.storage_path}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemoved}
            disabled={disabled || uploading}
            className="h-7 px-2 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Remove
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => document.getElementById(inputId)?.click()}
            className="h-8"
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {uploading ? 'Uploading…' : 'Choose file'}
          </Button>
          <input
            id={inputId}
            type="file"
            className="hidden"
            onChange={handleFilePick}
            accept={requirement.mime_types?.join(',')}
            disabled={disabled || uploading}
          />
        </div>
      )}

      {errorMsg && <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>}
    </div>
  );
}
