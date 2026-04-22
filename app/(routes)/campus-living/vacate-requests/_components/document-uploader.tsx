'use client';

// File uploader for hostel_vacate_documents. Validates MIME + size client-side,
// uploads to Supabase Storage bucket 'hostel-vacate-documents', then creates
// the hostel_vacate_documents row via HostelVacateRequestService.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useCreateVacateDocument, useDeleteVacateDocument } from '@/hooks/campus-living/use-hostel-vacate';
import { FileText, Image as ImageIcon, Trash2, Upload, Loader2 } from 'lucide-react';
import type { HostelVacateDocument, VacateDocumentType } from '@/types/hostel-vacate';
import { toast } from 'sonner';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;

const DOC_TYPE_OPTIONS: { value: VacateDocumentType; label: string }[] = [
  { value: 'medical_certificate', label: 'Medical certificate' },
  { value: 'id_proof', label: 'ID proof' },
  { value: 'parent_consent_scan', label: 'Parent consent (scanned)' },
  { value: 'clearance_receipt', label: 'Clearance receipt' },
  { value: 'other', label: 'Other' },
];

interface DocumentUploaderProps {
  vacateRequestId: string;
  documents: HostelVacateDocument[];
  readOnly?: boolean;
  requireMedicalCert?: boolean;
}

export function DocumentUploader({
  vacateRequestId,
  documents,
  readOnly = false,
  requireMedicalCert = false,
}: DocumentUploaderProps) {
  const { user } = useAuth();
  const [docType, setDocType] = useState<VacateDocumentType>('medical_certificate');
  const [uploading, setUploading] = useState(false);
  const createMut = useCreateVacateDocument();
  const deleteMut = useDeleteVacateDocument();

  const hasMedicalCert = documents.some((d) => d.document_type === 'medical_certificate');

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
      toast.error('Only PDF, JPG, or PNG files are allowed.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('File exceeds 5 MB limit.');
      e.target.value = '';
      return;
    }
    if (documents.length >= 3) {
      toast.error('Maximum 3 files per request.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const supabase = createClientSupabaseClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${vacateRequestId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('hostel-vacate-documents')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage
        .from('hostel-vacate-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1-year signed URL

      await createMut.mutateAsync({
        vacate_request_id: vacateRequestId,
        document_type: docType,
        file_url: signed?.signedUrl ?? path,
        file_name: safeName,
        file_size_bytes: file.size,
        mime_type: file.type as HostelVacateDocument['mime_type'],
        uploaded_by: user.id,
      });
    } catch (err) {
      toast.error(
        `Upload failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDelete(doc: HostelVacateDocument) {
    if (!confirm(`Delete "${doc.file_name}"?`)) return;
    // Remove from storage too — best-effort
    try {
      const supabase = createClientSupabaseClient();
      // Path stored as-is in file_url as signed URL; extract path from URL
      const match = doc.file_url.match(/hostel-vacate-documents\/([^?]+)/);
      if (match) {
        await supabase.storage.from('hostel-vacate-documents').remove([match[1]!]);
      }
    } catch {
      // Swallow storage errors — DB row cleanup still happens
    }
    await deleteMut.mutateAsync(doc.id);
  }

  return (
    <div className='space-y-3'>
      {requireMedicalCert && !hasMedicalCert && !readOnly && (
        <div className='text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2'>
          Medical-reason vacate requires a <strong>Medical certificate</strong> document
          before you can submit.
        </div>
      )}

      {!readOnly && (
        <Card>
          <CardContent className='p-4 space-y-3'>
            <div className='space-y-2'>
              <Label>Document type</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as VacateDocumentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label
                htmlFor='file-upload'
                className='flex items-center gap-2 cursor-pointer text-sm rounded-md border border-dashed p-3 hover:bg-accent'
              >
                {uploading ? (
                  <>
                    <Loader2 className='h-4 w-4 animate-spin' /> Uploading...
                  </>
                ) : (
                  <>
                    <Upload className='h-4 w-4' /> Choose file (PDF / JPG / PNG, max 5 MB)
                  </>
                )}
              </Label>
              <input
                id='file-upload'
                type='file'
                accept='application/pdf,image/jpeg,image/png'
                onChange={handleFileChange}
                disabled={uploading || documents.length >= 3}
                className='hidden'
              />
              <p className='text-xs text-muted-foreground mt-1'>
                {documents.length} of 3 files attached.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {documents.length > 0 && (
        <div className='space-y-2'>
          {documents.map((doc) => {
            const isPdf = doc.mime_type === 'application/pdf';
            const Icon = isPdf ? FileText : ImageIcon;
            const typeLabel =
              DOC_TYPE_OPTIONS.find((o) => o.value === doc.document_type)?.label ?? doc.document_type;
            return (
              <div
                key={doc.id}
                className='flex items-center justify-between gap-2 rounded-md border p-2'
              >
                <div className='flex items-center gap-2 min-w-0'>
                  <Icon className='h-4 w-4 text-muted-foreground shrink-0' />
                  <div className='min-w-0'>
                    <a
                      href={doc.file_url}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-sm font-medium truncate hover:underline block'
                    >
                      {doc.file_name}
                    </a>
                    <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                      <Badge variant='outline' className='text-xs'>
                        {typeLabel}
                      </Badge>
                      <span>{(doc.file_size_bytes / 1024).toFixed(0)} KB</span>
                    </div>
                  </div>
                </div>
                {!readOnly && (
                  <Button
                    size='icon'
                    variant='ghost'
                    onClick={() => handleDelete(doc)}
                    aria-label='Delete document'
                  >
                    <Trash2 className='h-4 w-4 text-destructive' />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
