'use client';

/**
 * ProspectAttachmentsCard
 * Surfaces every file linked to a prospect via the
 * sh_prospect_attachments substrate (C1a). Supports drag-drop or
 * picker upload, kind classification, signed-URL download, delete.
 */

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Download,
  Trash2,
  Upload,
  Loader2,
  Paperclip,
  FileText,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import {
  useDeleteProspectAttachment,
  useProspectAttachments,
  useUploadProspectAttachment,
} from '@/hooks/solutions/use-prospect-attachments';
import {
  ATTACHMENT_KIND_LABELS,
  ATTACHMENT_KINDS,
  type AttachmentKind,
  type ProspectAttachment,
} from '@/lib/services/solutions/prospect-attachments-service';

interface ProspectAttachmentsCardProps {
  prospectId: string;
  className?: string;
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const KIND_BADGE_CLASS: Record<AttachmentKind, string> = {
  proposal: 'bg-blue-50 text-blue-700 border-blue-200',
  rfp: 'bg-purple-50 text-purple-700 border-purple-200',
  mou_draft: 'bg-amber-50 text-amber-700 border-amber-200',
  contract: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  other: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function ProspectAttachmentsCard({
  prospectId,
  className,
}: ProspectAttachmentsCardProps) {
  const [pendingKind, setPendingKind] = useState<AttachmentKind>('proposal');

  const { data: attachments, isLoading } = useProspectAttachments(prospectId);
  const upload = useUploadProspectAttachment();
  const remove = useDeleteProspectAttachment();

  const handleFiles = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error('File exceeds 25MB limit');
        return;
      }
      upload.mutate(
        { prospectId, file, kind: pendingKind },
        {
          onSuccess: () =>
            toast.success(
              `Uploaded "${file.name}" as ${ATTACHMENT_KIND_LABELS[pendingKind]}`
            ),
          onError: (err) =>
            toast.error(err.message || 'Upload failed. Try again.'),
        }
      );
    },
    [prospectId, pendingKind, upload]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleFiles,
    multiple: false,
    noClick: true, // we use a dedicated button so the kind picker stays interactive
    maxSize: MAX_FILE_SIZE_BYTES,
    onDropRejected: (rejections) => {
      const reason =
        rejections[0]?.errors?.[0]?.message ?? 'File rejected by browser';
      toast.error(reason);
    },
  });

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          Attachments
        </CardTitle>
        {attachments && attachments.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {attachments.length} file{attachments.length === 1 ? '' : 's'}
          </span>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Upload zone */}
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-4 transition-colors',
            isDragActive
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          )}
        >
          <input {...getInputProps()} />

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Select
              value={pendingKind}
              onValueChange={(v) => setPendingKind(v as AttachmentKind)}
              disabled={upload.isPending}
            >
              <SelectTrigger className="w-full sm:w-[160px] h-9 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTACHMENT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {ATTACHMENT_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={open}
              disabled={upload.isPending}
              className="bg-white"
            >
              {upload.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {upload.isPending ? 'Uploading...' : 'Choose file'}
            </Button>

            <p className="text-xs text-muted-foreground sm:ml-auto">
              or drop a file here (max 25MB)
            </p>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-md" />
            ))}
          </div>
        ) : !attachments || attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            No files attached yet
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {attachments.map((a) => (
              <AttachmentRow
                key={a.id}
                prospectId={prospectId}
                attachment={a}
                onDelete={() => {
                  if (
                    !confirm(
                      `Delete "${a.file_name}"? This removes the file from storage and cannot be undone.`
                    )
                  ) {
                    return;
                  }
                  remove.mutate(
                    { prospectId, attachmentId: a.id },
                    {
                      onSuccess: () => toast.success('Attachment deleted'),
                      onError: (err) =>
                        toast.error(err.message || 'Failed to delete'),
                    }
                  );
                }}
                isDeleting={
                  remove.isPending && remove.variables?.attachmentId === a.id
                }
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface AttachmentRowProps {
  prospectId: string;
  attachment: ProspectAttachment;
  onDelete: () => void;
  isDeleting: boolean;
}

function AttachmentRow({
  prospectId,
  attachment,
  onDelete,
  isDeleting,
}: AttachmentRowProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/solutions/prospects/${prospectId}/attachments?signedUrlFor=${encodeURIComponent(
          attachment.storage_path
        )}`,
        { credentials: 'same-origin' }
      );
      if (!res.ok) throw new Error('Failed to sign URL');
      const json = await res.json();
      const url = json?.data?.signedUrl ?? json?.signedUrl;
      if (!url) throw new Error('Signed URL missing in response');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <li className="flex items-center gap-3 p-3 hover:bg-slate-50">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{attachment.file_name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          <Badge
            variant="outline"
            className={cn('text-[10px] py-0 h-4', KIND_BADGE_CLASS[attachment.kind])}
          >
            {ATTACHMENT_KIND_LABELS[attachment.kind]}
          </Badge>
          <span>{humanFileSize(attachment.file_size_bytes)}</span>
          <span aria-hidden>·</span>
          <span>{format(new Date(attachment.created_at), 'MMM d, yyyy')}</span>
          {attachment.uploaded_by_user?.full_name && (
            <>
              <span aria-hidden>·</span>
              <span>by {attachment.uploaded_by_user.full_name}</span>
            </>
          )}
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleDownload}
        disabled={downloading}
        title="Download"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={isDeleting}
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
        title="Delete"
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </li>
  );
}
