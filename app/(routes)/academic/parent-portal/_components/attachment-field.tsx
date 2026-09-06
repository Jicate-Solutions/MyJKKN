'use client';

/**
 * Parent Portal authoring — reusable Google Drive attachment picker.
 * Uploads each chosen file immediately (so the parent create call only carries
 * lightweight Attachment refs) and shows a removable list. The `context` is
 * forwarded so the upload route can nest the Drive folder by program/section.
 */
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Paperclip, X, Loader2, FileText } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  ParentPortalAdminService,
  type PPFeature,
} from '@/lib/services/academic/parent-portal-admin-service';
import type { Attachment } from '@/types/parent-portal';

// PDF + images only (matches the upload route's server-side check).
const ACCEPT = 'application/pdf,image/*';
const isAllowed = (file: File) =>
  file.type === 'application/pdf' || file.type.startsWith('image/');

export function AttachmentField({
  feature,
  institutionId,
  context,
  value,
  onChange,
}: {
  feature: PPFeature;
  institutionId: string;
  context?: { programIds?: string[]; sectionIds?: string[]; learnerIds?: string[] };
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const pick = () => {
    if (!institutionId) return toast.error('Select an institution first.');
    inputRef.current?.click();
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files);
    if (picked.some((file) => !isAllowed(file))) {
      toast.error('Only PDF and image files are allowed.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of picked) {
        uploaded.push(
          await ParentPortalAdminService.uploadAttachment(file, feature, institutionId, context)
        );
      }
      onChange([...value, ...uploaded]);
      toast.success(`${uploaded.length} file(s) attached.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>
        Attachments <span className="font-normal text-muted-foreground">(optional · PDF or image · saved to Google Drive)</span>
      </Label>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => onFiles(e.target.files)} />
      <button
        type="button"
        onClick={pick}
        disabled={uploading}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#0b6d41]/40 bg-[#0b6d41]/5 px-3 py-3 text-sm font-medium text-[#0b6d41] transition-colors hover:bg-[#0b6d41]/10 disabled:opacity-60"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        {uploading ? 'Uploading…' : 'Add files'}
      </button>
      {value.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {value.map((a, i) => (
            <li
              key={a.driveFileId ?? i}
              className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm dark:bg-neutral-900"
            >
              <FileText className="h-4 w-4 shrink-0 text-[#0b6d41]" />
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate hover:underline"
              >
                {a.name}
              </a>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="shrink-0 text-muted-foreground hover:text-rose-600"
                aria-label={`Remove ${a.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
