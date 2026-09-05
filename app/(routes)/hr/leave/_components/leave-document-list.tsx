'use client';

// Read-only list of a leave application's supporting documents.
//
// Every item OPENS THE IN-APP VIEWER — it is not a link. It used to be an
// <a href target="_blank"> at /api/hr/leave/documents/[fileId], which meant a
// click was a navigation, and a navigation to bytes the proxy was mislabelling
// as application/octet-stream is a download. Approvers reported the sidebar
// "downloading instead of viewing"; that anchor was the second half of the
// reason (the first was the Content-Type, fixed in the route). A button that
// opens LeaveDocumentViewer cannot navigate anywhere, so the behaviour no
// longer depends on how a browser feels about a header.
//
// The Drive file carries no public permission by design, so doc.url only works
// for someone who already has access to the Drive itself — rendering it would
// hand approvers a link that 404s for them. The proxy authorises the viewer
// against the application and streams the bytes.

import { useState } from 'react';
import { AlertTriangle, Eye, FileText, ImageIcon } from 'lucide-react';

import { LeaveDocumentViewer, leaveDocumentHref } from './leave-document-viewer';
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
  /** Passed to the viewer's subtitle: whose document this is. */
  viewerTitle?: string;
}

export function LeaveDocumentList({
  documents,
  outstanding = false,
  hideWhenEmpty = false,
  viewerTitle,
}: LeaveDocumentListProps) {
  const docs = documents ?? [];
  // null = closed. The index is which document the click was on, so a request
  // with three attachments opens the one the approver actually pointed at.
  const [viewing, setViewing] = useState<number | null>(null);

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
        // No dash under the emergency warning: that block already says there is
        // nothing here and why, so a dash beneath it reads as a second, emptier
        // answer to the same question.
        outstanding ? null : <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((doc, i) => {
            const isImage = (doc.mime_type ?? '').startsWith('image/');
            const size = humanSize(doc.size_bytes);
            // Older rows (or a partial write) may lack the id. Show the name so
            // the approver knows something was attached, but do not offer a
            // view that cannot resolve.
            const viewable = leaveDocumentHref(doc) !== null;

            const body = (
              <>
                {isImage
                  ? <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate text-left">{doc.name || 'Document'}</span>
                {size && <span className="shrink-0 text-xs text-muted-foreground">{size}</span>}
                {viewable && <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </>
            );

            return (
              <li key={doc.drive_file_id ?? `${doc.name}-${i}`}>
                {viewable ? (
                  <button
                    type="button"
                    onClick={() => setViewing(i)}
                    title={`View ${doc.name || 'document'}`}
                    className="flex w-full items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    {body}
                  </button>
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

      <LeaveDocumentViewer
        documents={docs}
        startIndex={viewing ?? 0}
        open={viewing !== null}
        onOpenChange={(open) => { if (!open) setViewing(null); }}
        title={viewerTitle}
      />
    </div>
  );
}
