'use client';

// ============================================================================
// OKR File Upload Component
// Handles file attachments with drag-and-drop and link support
// ============================================================================

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Paperclip,
  Upload,
  Link2,
  File,
  FileImage,
  FileText,
  FileSpreadsheet,
  Presentation,
  X,
  Download,
  Trash2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import {
  useOKRAttachments,
  useUploadOKRAttachment,
  useAddOKRLinkAttachment,
  useDeleteOKRAttachment,
  useOKRAttachmentUrl,
} from '@/hooks/okr';
import type { OKREntityType, OKRAttachment } from '@/types/okr';

// File type icons mapping
const FILE_ICONS: Record<string, React.ReactNode> = {
  'image/': <FileImage className="h-4 w-4" />,
  'application/pdf': <FileText className="h-4 w-4" />,
  'application/msword': <FileText className="h-4 w-4" />,
  'application/vnd.openxmlformats-officedocument.wordprocessingml': <FileText className="h-4 w-4" />,
  'application/vnd.ms-excel': <FileSpreadsheet className="h-4 w-4" />,
  'application/vnd.openxmlformats-officedocument.spreadsheetml': <FileSpreadsheet className="h-4 w-4" />,
  'application/vnd.ms-powerpoint': <Presentation className="h-4 w-4" />,
  'application/vnd.openxmlformats-officedocument.presentationml': <Presentation className="h-4 w-4" />,
  'link': <Link2 className="h-4 w-4" />,
};

function getFileIcon(mimeType: string | null, isLink: boolean): React.ReactNode {
  if (isLink) return FILE_ICONS['link'];
  if (!mimeType) return <File className="h-4 w-4" />;

  for (const [prefix, icon] of Object.entries(FILE_ICONS)) {
    if (mimeType.startsWith(prefix)) return icon;
  }
  return <File className="h-4 w-4" />;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileUploadProps {
  entityType: OKREntityType;
  entityId: string;
  title?: string;
  className?: string;
  maxFiles?: number;
  maxFileSize?: number; // in bytes
  allowedTypes?: string[];
}

export function FileUpload({
  entityType,
  entityId,
  title = 'Attachments',
  className,
  maxFiles = 10,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  allowedTypes = [
    'image/*',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: attachments, isLoading } = useOKRAttachments(entityType, entityId);
  const uploadAttachment = useUploadOKRAttachment();
  const addLink = useAddOKRLinkAttachment();
  const deleteAttachment = useDeleteOKRAttachment();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      await uploadFiles(files);
    },
    [entityType, entityId]
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await uploadFiles(files);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFiles = async (files: File[]) => {
    const currentCount = attachments?.length || 0;
    const remaining = maxFiles - currentCount;

    if (remaining <= 0) {
      alert(`Maximum ${maxFiles} attachments allowed`);
      return;
    }

    const filesToUpload = files.slice(0, remaining);

    for (const file of filesToUpload) {
      if (file.size > maxFileSize) {
        alert(`File "${file.name}" exceeds maximum size of ${formatFileSize(maxFileSize)}`);
        continue;
      }

      try {
        await uploadAttachment.mutateAsync({
          entityType,
          entityId,
          file,
        });
      } catch (error) {
        console.error('Failed to upload file:', error);
      }
    }
  };

  const handleAddLink = async () => {
    if (!linkUrl.trim()) return;

    try {
      await addLink.mutateAsync({
        entity_type: entityType,
        entity_id: entityId,
        file_name: linkName || new URL(linkUrl).hostname,
        external_url: linkUrl,
        description: undefined,
      });
      setLinkUrl('');
      setLinkName('');
      setLinkDialogOpen(false);
    } catch (error) {
      console.error('Failed to add link:', error);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (confirm('Are you sure you want to delete this attachment?')) {
      await deleteAttachment.mutateAsync(attachmentId);
    }
  };

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            {title}
            {attachments && attachments.length > 0 && (
              <span className="text-muted-foreground text-sm">
                ({attachments.length}/{maxFiles})
              </span>
            )}
          </div>
          <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7">
                <Link2 className="h-3.5 w-3.5 mr-1" />
                Add Link
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add External Link</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="link-url">URL</Label>
                  <Input
                    id="link-url"
                    type="url"
                    placeholder="https://..."
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="link-name">Display Name (optional)</Label>
                  <Input
                    id="link-name"
                    placeholder="e.g., Google Drive Link"
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setLinkDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddLink}
                  disabled={!linkUrl.trim() || addLink.isPending}
                >
                  {addLink.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Link2 className="h-4 w-4 mr-1" />
                  )}
                  Add Link
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
            isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
            'hover:border-primary/50'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={allowedTypes.join(',')}
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-2">
            Drag and drop files here, or{' '}
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => fileInputRef.current?.click()}
            >
              browse
            </button>
          </p>
          <p className="text-xs text-muted-foreground">
            Max {formatFileSize(maxFileSize)} per file • Images, PDFs, Office docs
          </p>
        </div>

        {/* Attachments list */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : attachments && attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <AttachmentItem
                key={attachment.id}
                attachment={attachment}
                onDelete={() => handleDelete(attachment.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-2">
            No attachments yet
          </p>
        )}

        {/* Upload progress */}
        {uploadAttachment.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Individual attachment item
function AttachmentItem({
  attachment,
  onDelete,
}: {
  attachment: OKRAttachment;
  onDelete: () => void;
}) {
  const isLink = attachment.file_type === 'link';
  const { data: downloadUrl } = useOKRAttachmentUrl(
    isLink ? undefined : (attachment.storage_path ?? undefined)
  );

  const handleDownload = () => {
    if (isLink && attachment.external_url) {
      window.open(attachment.external_url, '_blank');
    } else if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    }
  };

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 group">
      <div className={cn(
        'h-8 w-8 rounded flex items-center justify-center',
        isLink ? 'bg-blue-100 text-blue-600' : 'bg-muted'
      )}>
        {getFileIcon(attachment.file_type, isLink)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {attachment.file_name}
        </p>
        {attachment.file_size && (
          <p className="text-xs text-muted-foreground">
            {formatFileSize(attachment.file_size)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleDownload}
              >
                {isLink ? (
                  <ExternalLink className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isLink ? 'Open Link' : 'Download'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

// Compact attachment count badge
export function AttachmentCountBadge({
  entityType,
  entityId,
  className,
}: {
  entityType: OKREntityType;
  entityId: string;
  className?: string;
}) {
  const { data: attachments } = useOKRAttachments(entityType, entityId);

  if (!attachments?.length) return null;

  return (
    <div className={cn('flex items-center gap-1 text-muted-foreground', className)}>
      <Paperclip className="h-3.5 w-3.5" />
      <span className="text-xs">{attachments.length}</span>
    </div>
  );
}
