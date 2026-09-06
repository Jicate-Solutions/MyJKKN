'use client';

/**
 * DocumentList — table of project-scoped attachments.
 *
 * Shows file_name, mime_type, size_bytes, version, is_final_report badge,
 * and a "History" button that opens the VersionHistory panel for that doc.
 * Omits storage_path from the visible table (internal pointer).
 */

import { useState } from 'react';
import { FileText, Star, Trash2, Clock, Loader2, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAttachments, useDeleteAttachment } from '@/hooks/projects/use-documents';
import { VersionHistory } from '@/components/projects/documents/version-history';

interface DocumentListProps {
  projectId: string;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortMime(mime: string | null): string {
  if (!mime) return '—';
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'text/plain': 'TXT',
    'text/csv': 'CSV',
  };
  return map[mime] ?? mime.split('/').pop()?.toUpperCase() ?? '—';
}

export function DocumentList({ projectId }: DocumentListProps) {
  const { data: docs, isLoading, error } = useAttachments(projectId);
  const deleteDoc = useDeleteAttachment();
  const [historyDocId, setHistoryDocId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading documents…
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-4 text-sm text-destructive">
        Failed to load documents: {String(error)}
      </p>
    );
  }

  if (!docs || docs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
        <FileQuestion className="h-8 w-8" />
        <p className="text-sm">No documents yet. Use "Upload document" to add one.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Final report</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate max-w-[200px]">{doc.file_name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {shortMime(doc.mime_type)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatBytes(doc.size_bytes)}
                </TableCell>
                <TableCell className="text-sm">v{doc.version}</TableCell>
                <TableCell>
                  {doc.is_final_report ? (
                    <Badge variant="default" className="gap-1 text-xs">
                      <Star className="h-3 w-3" />
                      Final
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => setHistoryDocId(doc.id)}
                    >
                      <Clock className="h-3 w-3" />
                      History
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete document?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the metadata row for{' '}
                            <span className="font-medium">{doc.file_name}</span>. The file
                            in storage (if any) is not deleted automatically.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteDoc.mutate(doc.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Version history drawer panel */}
      {historyDocId && (
        <VersionHistory
          attachmentId={historyDocId}
          onClose={() => setHistoryDocId(null)}
        />
      )}
    </>
  );
}
