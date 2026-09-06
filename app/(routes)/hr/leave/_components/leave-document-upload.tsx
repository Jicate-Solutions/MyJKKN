'use client';

// Supporting-document picker for the Apply Leave drawer.
//
// It PICKS files, it does not upload them. The files stay in the parent's state
// as plain `File` objects until Submit, which is what stops a cancelled drawer
// from leaving orphans in Drive — the recruitment apply wizard learned this the
// expensive way (see 2026-07-02, uploads moved off step 1 onto Submit).
//
// Validation is duplicated here and in the route on purpose: this copy exists
// to tell someone their scan is 9 MB before they wait for the upload, and the
// route's copy exists because this one runs on their machine.

import { useRef, useState } from 'react';
import { FileText, Paperclip, X, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const LEAVE_DOC_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
export const LEAVE_DOC_MAX_BYTES = 5 * 1024 * 1024;
export const LEAVE_DOC_MAX_FILES = 3;

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

/** Returns a human sentence, or null when the file is fine. */
export function validateLeaveDocument(file: File): string | null {
  if (!ALLOWED.has(file.type)) {
    return `"${file.name}" is not a PDF or an image. Attach a PDF, JPG, PNG or WEBP.`;
  }
  if (file.size > LEAVE_DOC_MAX_BYTES) {
    return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`;
  }
  return null;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface LeaveDocumentUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  /** True when the request cannot be submitted without at least one file. */
  required: boolean;
  /** Why a document is (or is not yet) needed. Rendered as the field's help text. */
  reason: string | null;
  /** Set while the parent is uploading on Submit — the picker locks. */
  uploading?: boolean;
  /** Surfaced by the parent when an upload fails mid-submit. */
  error?: string | null;
}

export function LeaveDocumentUpload({
  files,
  onChange,
  required,
  reason,
  uploading = false,
  error = null,
}: LeaveDocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Rejections from the last pick. STATE, not a ref: when every picked file is
  // rejected the parent's onChange never fires, so a ref would be updated with
  // nothing to trigger the render that shows it — the user would pick a 9 MB
  // scan and see absolutely nothing happen. They are about the attempt rather
  // than the form, so they stay local and clear on the next pick.
  const [rejected, setRejected] = useState<string[]>([]);

  const atLimit = files.length >= LEAVE_DOC_MAX_FILES;

  const handlePick = (list: FileList | null) => {
    if (!list?.length) return;
    const problems: string[] = [];
    const accepted: File[] = [];

    for (const file of Array.from(list)) {
      if (files.length + accepted.length >= LEAVE_DOC_MAX_FILES) {
        problems.push(`"${file.name}" was not added — ${LEAVE_DOC_MAX_FILES} files is the maximum.`);
        continue;
      }
      const problem = validateLeaveDocument(file);
      if (problem) { problems.push(problem); continue; }
      // Same name AND same size is the same document picked twice, which is a
      // misclick every time. Two genuinely different files sharing both is not
      // a case worth building for.
      const duplicate = files.some((f) => f.name === file.name && f.size === file.size);
      if (duplicate) {
        problems.push(`"${file.name}" is already attached.`);
        continue;
      }
      accepted.push(file);
    }

    setRejected(problems);
    if (accepted.length) onChange([...files, ...accepted]);
    // Reset the input so re-picking the same file after removing it still fires
    // a change event.
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = (index: number) => {
    setRejected([]);
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div>
      <Label htmlFor="leave-documents">
        Supporting document
        {required && <span className="text-destructive"> *</span>}
        {!required && <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>}
      </Label>

      {reason && (
        <p className="mt-1 text-xs text-muted-foreground">{reason}</p>
      )}

      <input
        ref={inputRef}
        id="leave-documents"
        type="file"
        className="hidden"
        accept={LEAVE_DOC_ACCEPT}
        multiple
        disabled={uploading || atLimit}
        onChange={(e) => handlePick(e.target.files)}
      />

      <div className="mt-2 space-y-2">
        {files.map((file, i) => (
          <div
            key={`${file.name}-${file.size}-${i}`}
            className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-sm"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{humanSize(file.size)}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 shrink-0 p-0"
              onClick={() => remove(i)}
              disabled={uploading}
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || atLimit}
        >
          <Paperclip className="mr-2 h-4 w-4" />
          {files.length === 0
            ? 'Attach a file'
            : atLimit
              ? `${LEAVE_DOC_MAX_FILES} files attached (maximum)`
              : 'Attach another'}
        </Button>

        <p className="text-xs text-muted-foreground">
          PDF or image, up to 5 MB each. Uploaded when you submit.
        </p>
      </div>

      {rejected.length > 0 && (
        <Alert variant="destructive" className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="space-y-0.5">
              {rejected.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
