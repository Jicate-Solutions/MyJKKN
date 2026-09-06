'use client';

/**
 * UploadDialog — metadata-only document upload.
 *
 * STORAGE DEFERRED: This dialog collects file metadata (name, mime, size, version,
 * is_final_report, supersedes_id) and inserts a project_task_attachments row.
 * The storage_path is derived as "projects/{projectId}/{sanitised-file-name}" and
 * recorded, but the actual file is NOT uploaded to a Supabase storage bucket —
 * that wiring is deferred. See PR body for context.
 *
 * When file upload is wired, replace the `storage_path` derivation with an
 * actual `supabase.storage.from('project-docs').upload(...)` call and pass
 * the returned path to createAttachment.
 */

import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useCreateAttachment, useAttachments } from '@/hooks/projects/use-documents';

interface UploadDialogProps {
  projectId: string;
}

export function UploadDialog({ projectId }: UploadDialogProps) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);
  const [version, setVersion] = useState(1);
  const [isFinalReport, setIsFinalReport] = useState(false);
  const [supersedesId, setSupersedesId] = useState('');

  const create = useCreateAttachment();
  const { data: existingDocs } = useAttachments(projectId);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setMimeType(file.type || null);
    setSizeBytes(file.size);
  }

  function reset() {
    setFileName('');
    setMimeType(null);
    setSizeBytes(null);
    setVersion(1);
    setIsFinalReport(false);
    setSupersedesId('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fileName.trim()) return;

    // Derive a stable storage path — actual upload deferred (see header comment).
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `projects/${projectId}/${Date.now()}_${safeName}`;

    await create.mutateAsync({
      project_id: projectId,
      file_name: fileName.trim(),
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      version,
      is_final_report: isFinalReport,
      supersedes_id: supersedesId.trim() || null,
      uploaded_by: null, // deferred: wire auth helper
    });

    reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Upload className="h-4 w-4" />
          Upload document
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            Add a document to this project. File metadata is saved immediately; actual
            storage upload wiring is deferred (see PR notes).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          {/* File picker */}
          <div className="grid gap-1.5">
            <Label htmlFor="doc-file">File</Label>
            <Input
              id="doc-file"
              type="file"
              ref={fileRef}
              onChange={handleFileChange}
              className="cursor-pointer"
            />
            {fileName && (
              <p className="text-xs text-muted-foreground truncate">{fileName}</p>
            )}
          </div>

          {/* Manual name override */}
          <div className="grid gap-1.5">
            <Label htmlFor="doc-name">File name</Label>
            <Input
              id="doc-name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="my-report.pdf"
              required
            />
          </div>

          {/* Version */}
          <div className="grid gap-1.5">
            <Label htmlFor="doc-version">Version</Label>
            <Input
              id="doc-version"
              type="number"
              min={1}
              value={version}
              onChange={(e) => setVersion(Number(e.target.value) || 1)}
            />
          </div>

          {/* Supersedes */}
          <div className="grid gap-1.5">
            <Label htmlFor="doc-supersedes">
              Supersedes document ID{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="doc-supersedes"
              value={supersedesId}
              onChange={(e) => setSupersedesId(e.target.value)}
              placeholder="UUID of the document this replaces"
              list="doc-id-list"
            />
            {existingDocs && existingDocs.length > 0 && (
              <datalist id="doc-id-list">
                {existingDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.file_name} v{d.version}
                  </option>
                ))}
              </datalist>
            )}
          </div>

          {/* Final report flag */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="doc-final"
              checked={isFinalReport}
              onCheckedChange={(v) => setIsFinalReport(Boolean(v))}
            />
            <Label htmlFor="doc-final" className="cursor-pointer">
              Mark as final report
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !fileName.trim()}>
              {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
