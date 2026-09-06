'use client';

// Read-only list of a leave application's supporting documents.
//
// Every link points at /api/hr/leave/documents/[fileId], never at the Drive
// URL. The Drive file carries no public permission by design, so its `url` only
// works for someone who already has access to the Drive itself — rendering it
// would hand approvers a link that 404s for them. The proxy authorises the
// viewer against the application and streams the bytes.

import { FileText, ImageIcon, ExternalLink, AlertTriangle } from 'lucide-react';
import type { LeaveDocument } from '@/types/hr';

function humanSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface LeaveDocumentListProps {
  documents: LeaveDocument[] | null | undefined;
  /**
   * True when the type wanted a document and this request does not have one —
   * an emergency filed before the certificate existed. Rendered as a warning
   * rather than silence, so "it is coming" is a state an approver can see.
   */
  outstanding?: boolean;
  /** Hide the block entirely when there is nothing to say. */
  hideWhenEmpty?: boolean;
}

export function LeaveDocumentList({
  documents,
  outstanding = false,
  hideWhenEmpty = false,
}: LeaveDocumentListProps) {
  const docs = documents ?? [];

  if (docs.length === 0 && !outstanding && hideWhenEmpty) return null;

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">Supporting documents</p>

      {outstanding && (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Filed as an emergency without the document. It is due within 48 hours of
            the request.
          </span>
        </div>
      )}

      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((doc, i) => {
            const isImage = (doc.mime_type ?? '').startsWith('image/');
            const size = humanSize(doc.size_bytes);
            // Older rows (or a partial write) may lack the id. Show the name so
            // the approver knows something was attached, but do not render a
            // link that cannot resolve.
            const href = doc.drive_file_id
              ? `/api/hr/leave/documents/${doc.drive_file_id}`
              : null;

            const body = (
              <>
                {isImage
                  ? <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate">{doc.name || 'Document'}</span>
                {size && <span className="shrink-0 text-xs text-muted-foreground">{size}</span>}
                {href && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </>
            );

            return (
              <li key={doc.drive_file_id ?? `${doc.name}-${i}`}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-sm text-muted-foreground">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
