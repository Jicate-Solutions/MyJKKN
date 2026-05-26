'use client';

/**
 * Escalation Attachment Upload + Display
 *
 * Uploads files to Supabase Storage bucket `hr-recruitment-escalation-docs`
 * via API route, then updates the escalation's documents JSONB array.
 * Displays existing attachments as download links.
 */

import { useState, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Paperclip,
  Upload,
  FileText,
  Image,
  Download,
  Loader2,
  X,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { signalKeys } from '@/hooks/hr/recruitment-need/use-recruitment-signal';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'png', 'jpg', 'jpeg'];
const BUCKET = 'hr-recruitment-escalation-docs';

interface AttachmentDoc {
  name: string;
  path: string;
  size: number;
  type: string;
  uploaded_at: string;
  uploaded_by?: string;
}

interface EscalationAttachmentUploadProps {
  escalationId: string;
  documents?: AttachmentDoc[] | null;
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith('image/')) return <Image className="h-3.5 w-3.5" />;
  return <FileText className="h-3.5 w-3.5" />;
}

export function EscalationAttachmentUpload({
  escalationId,
  documents,
  className,
}: EscalationAttachmentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch current attachments
  const { data: attachments } = useQuery({
    queryKey: [...signalKeys.all, 'attachments', escalationId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/recruitment-need/escalations/${escalationId}/attachments`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to fetch');
      return (json.data ?? []) as AttachmentDoc[];
    },
    initialData: documents ? (documents as AttachmentDoc[]) : undefined,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(
        `/api/hr/recruitment-need/escalations/${escalationId}/attachments`,
        { method: 'POST', body: formData }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      return json.data as AttachmentDoc;
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({
        queryKey: [...signalKeys.all, 'attachments', escalationId],
      });
      queryClient.invalidateQueries({ queryKey: signalKeys.escalations() });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset input so same file can be re-selected
      e.target.value = '';

      // Client-side validation
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        setError(`File type .${ext} not allowed. Accepted: ${ALLOWED_EXTENSIONS.join(', ')}`);
        return;
      }

      if (file.size > MAX_SIZE) {
        setError(`File size ${formatFileSize(file.size)} exceeds 10MB limit`);
        return;
      }

      setError(null);
      uploadMutation.mutate(file);
    },
    [uploadMutation]
  );

  const handleDownload = useCallback(async (doc: AttachmentDoc) => {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(doc.path, 60); // 60s signed URL

      if (error || !data?.signedUrl) {
        console.error('Failed to create signed URL', error);
        return;
      }

      window.open(data.signedUrl, '_blank');
    } catch (err) {
      console.error('Download error', err);
    }
  }, []);

  return (
    <div className={className}>
      {/* Existing attachments */}
      {attachments && attachments.length > 0 && (
        <div className="space-y-1 mb-2">
          {attachments.map((doc, idx) => (
            <div
              key={`${doc.path}-${idx}`}
              className="flex items-center gap-2 rounded border px-2 py-1 text-xs bg-muted/30"
            >
              <FileIcon type={doc.type} />
              <span className="truncate flex-1 min-w-0">{doc.name}</span>
              <span className="text-muted-foreground shrink-0">
                {formatFileSize(doc.size)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0 shrink-0"
                onClick={() => handleDownload(doc)}
                title="Download"
              >
                <Download className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Paperclip className="h-3 w-3" />
          )}
          {uploadMutation.isPending ? 'Uploading...' : 'Attach File'}
        </Button>
        {attachments && attachments.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {attachments.length} file{attachments.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
          <X className="h-3 w-3" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
