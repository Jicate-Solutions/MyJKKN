'use client';

// A postgraduate applicant's degree mark sheet and entrance scorecard
// (Director ruling 2026-09-30). Shown inside the profile's Previous Degree
// section. Viewing needs admission_fees.read or admission_documents.manage;
// uploading needs admission_documents.manage — the storage policies enforce the
// same rule, so hiding a button here is a courtesy, not the guard.

import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AdmissionDocumentService,
  PG_DEGREE_DOC_TYPES,
  type PgDegreeDocType,
} from '@/lib/services/admission/admission-document-service';

export function PgDegreeDocuments({
  learnerId,
  canView,
  canUpload,
}: {
  learnerId: string;
  canView: boolean;
  canUpload: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: docs, isLoading, error } = useQuery({
    queryKey: ['learner-admission-documents', learnerId],
    queryFn: () => AdmissionDocumentService.listForLearner(learnerId),
    enabled: canView,
  });

  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to this learner&apos;s admission documents.
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">
        Could not load the documents: {(error as Error).message}
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(Object.keys(PG_DEGREE_DOC_TYPES) as PgDegreeDocType[]).map((docType) => (
        <DocumentRow
          key={docType}
          learnerId={learnerId}
          docType={docType}
          label={PG_DEGREE_DOC_TYPES[docType]}
          doc={docs?.find((d) => d.doc_type === docType && d.document_ref)}
          isLoading={isLoading}
          canUpload={canUpload}
          onChanged={() =>
            queryClient.invalidateQueries({ queryKey: ['learner-admission-documents', learnerId] })
          }
        />
      ))}
    </div>
  );
}

function DocumentRow({
  learnerId,
  docType,
  label,
  doc,
  isLoading,
  canUpload,
  onChanged,
}: {
  learnerId: string;
  docType: PgDegreeDocType;
  label: string;
  doc?: { document_ref: string | null; received_at: string | null };
  isLoading: boolean;
  canUpload: boolean;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'view' | null>(null);

  const upload = async (file: File) => {
    setBusy('upload');
    try {
      await AdmissionDocumentService.uploadFile(learnerId, docType, file);
      toast.success(`${label} uploaded.`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message || `Could not upload the ${label.toLowerCase()}.`);
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const view = async () => {
    if (!doc?.document_ref) return;
    setBusy('view');
    try {
      const url = await AdmissionDocumentService.getViewUrl(doc.document_ref);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0 space-y-0.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 shrink-0" /> {label}
        </p>
        <p className="text-xs text-muted-foreground">
          {isLoading
            ? 'Checking…'
            : doc?.received_at
              ? `Uploaded ${format(new Date(doc.received_at), 'd MMM yyyy')}`
              : 'Not uploaded'}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {doc?.document_ref && (
          <Button type="button" size="sm" variant="outline" onClick={view} disabled={busy !== null}>
            {busy === 'view' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'View'}
          </Button>
        )}
        {canUpload && (
          <>
            <input
              ref={inputRef}
              id={`upload-${docType}`}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant={doc?.document_ref ? 'ghost' : 'default'}
              onClick={() => inputRef.current?.click()}
              disabled={busy !== null}
            >
              {busy === 'upload' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Upload className="mr-1 h-4 w-4" /> {doc?.document_ref ? 'Replace' : 'Upload'}
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
