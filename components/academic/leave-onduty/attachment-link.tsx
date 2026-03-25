'use client';

/**
 * Attachment Link Component
 *
 * Generates signed URLs for private storage bucket attachments.
 * Handles the conversion from public URLs to signed URLs automatically.
 */

import { useState, useEffect } from 'react';
import { FileText, ExternalLink, Loader2 } from 'lucide-react';
import { extractFilePathFromUrl, generateSignedUrl } from '@/lib/utils/storage-url-helper';

interface AttachmentLinkProps {
  attachmentUrl: string;
  className?: string;
}

export function AttachmentLink({ attachmentUrl, className = '' }: AttachmentLinkProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSignedUrl() {
      try {
        setIsLoading(true);
        setError(null);

        // Extract file path from the URL
        const filePath = extractFilePathFromUrl(attachmentUrl, 'leave-onduty-attachments');

        if (!filePath) {
          setError('Invalid attachment URL');
          setIsLoading(false);
          return;
        }

        // Generate signed URL (valid for 1 hour)
        const url = await generateSignedUrl('leave-onduty-attachments', filePath, 3600);

        if (!url) {
          setError('Failed to generate download link');
          setIsLoading(false);
          return;
        }

        setSignedUrl(url);
        setIsLoading(false);
      } catch (err) {
        console.error('[attachment-link] Error loading signed URL:', err);
        setError('Failed to load attachment');
        setIsLoading(false);
      }
    }

    if (attachmentUrl) {
      loadSignedUrl();
    }
  }, [attachmentUrl]);

  if (isLoading) {
    return (
      <div className={`inline-flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading attachment...
      </div>
    );
  }

  if (error || !signedUrl) {
    return (
      <div className={`inline-flex items-center gap-2 text-sm text-destructive ${className}`}>
        <FileText className="h-4 w-4" />
        {error || 'Unable to load attachment'}
      </div>
    );
  }

  return (
    <a
      href={signedUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 text-sm text-primary hover:underline ${className}`}
    >
      <FileText className="h-4 w-4" />
      View Attachment
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
