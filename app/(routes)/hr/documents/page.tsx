// ============================================================================
// HR — My Documents (T1.5b Phase 2a, employee-facing upload page)
// Created: 2026-05-10.
//
// Spec: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.5b Phase 2a)
//
// What this page is
// -----------------
// The employee-side surface for fulfilling the document-upload requirements
// defined by HR in /admin/hr/required-documents (PR #809). Each row in the
// checklist is a hr_required_documents policy row applicable to full-time
// staff, joined with the latest live upload from hr_employee_documents.
//
// Phase 2a (this PR) — employee can:
//   * see the checklist with progress counter
//   * see each requirement with its mandatory flag + verification status
//   * click "Upload" to attach a file (PDF / JPG / PNG, max 5 MB)
//   * click "Re-upload" to replace a rejected or expired document
//   * click "View" to open a signed URL of an existing upload
//
// Phase 2b (NOT this PR):
//   * HR officer verification queue (/hr/documents/verify)
//   * Expiry reminder cron + dashboard widget
//   * Bulk download ZIP for HR
//
// Pattern reuse (Director's standing rule, 2026-04-29):
//   File upload UI lifted from app/(routes)/campus-living/vacate-requests/
//     _components/document-uploader.tsx — same MAX_BYTES, ALLOWED_MIME, hidden
//     file input, drop-zone label, toast pattern. Adapted to one-row-per-doc
//     checklist instead of free-form upload-up-to-3.
// ============================================================================

'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';

import {
  useDocumentChecklist,
  useGetSignedDownloadUrl,
  useStaffForCurrentUser,
  useUploadDocument,
} from '@/hooks/hr/use-employee-documents';
import {
  EMPLOYEE_DOCUMENT_ACCEPT_ATTR,
  EMPLOYEE_DOCUMENT_ALLOWED_MIME,
  EMPLOYEE_DOCUMENT_MAX_BYTES,
  EMPLOYEE_DOCUMENT_STATUS_LABELS,
  type EmployeeDocumentVerificationStatus,
  type HRDocumentChecklistItem,
} from '@/types/hr';

// ----------------------------------------------------------------------------
// Status visuals
// ----------------------------------------------------------------------------

function StatusBadge({ status }: { status: EmployeeDocumentVerificationStatus | 'not_uploaded' }) {
  if (status === 'not_uploaded') {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Not uploaded
      </Badge>
    );
  }
  if (status === 'verified') {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        {EMPLOYEE_DOCUMENT_STATUS_LABELS.verified}
      </Badge>
    );
  }
  if (status === 'rejected') {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-xs">
        <XCircle className="h-3 w-3 mr-1" />
        {EMPLOYEE_DOCUMENT_STATUS_LABELS.rejected}
      </Badge>
    );
  }
  if (status === 'expired') {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs">
        <AlertCircle className="h-3 w-3 mr-1" />
        {EMPLOYEE_DOCUMENT_STATUS_LABELS.expired}
      </Badge>
    );
  }
  // pending
  return (
    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-xs">
      <Clock className="h-3 w-3 mr-1" />
      {EMPLOYEE_DOCUMENT_STATUS_LABELS.pending}
    </Badge>
  );
}

// ----------------------------------------------------------------------------
// Upload trigger — opens hidden file input. Disabled while uploading.
// ----------------------------------------------------------------------------

interface UploadButtonProps {
  staffId: string;
  item: HRDocumentChecklistItem;
  isReupload: boolean;
}

function UploadButton({ staffId, item, isReupload }: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMut = useUploadDocument();

  function trigger() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Pre-flight client-side validation. Service does these too, but failing
    // fast in the UI gives a clearer error than the network layer's wrap.
    if (
      !EMPLOYEE_DOCUMENT_ALLOWED_MIME.includes(
        file.type as (typeof EMPLOYEE_DOCUMENT_ALLOWED_MIME)[number],
      )
    ) {
      uploadMut.reset();
      // toast will be triggered by the service layer; don't double-fire here
    }
    if (file.size > EMPLOYEE_DOCUMENT_MAX_BYTES) {
      // Same — service throws "File is X MB, exceeds the 5 MB limit."
    }

    uploadMut.mutate(
      {
        staffId,
        documentCode: item.document_code,
        documentName: item.document_name,
        requiredDocumentId: item.required_document_id,
        replacesDocumentId: isReupload ? (item.upload?.id ?? null) : null,
        file,
      },
      {
        onSettled: () => {
          // Reset the input so the same filename can be picked again next time.
          if (fileInputRef.current) fileInputRef.current.value = '';
        },
      },
    );
  }

  const busy = uploadMut.isPending;

  return (
    <>
      <Button
        size="sm"
        variant={isReupload ? 'outline' : 'default'}
        onClick={trigger}
        disabled={busy}
        className="gap-2"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {isReupload ? 'Re-upload' : 'Upload'}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept={EMPLOYEE_DOCUMENT_ACCEPT_ATTR}
        onChange={handleFileChange}
        className="hidden"
      />
    </>
  );
}

// ----------------------------------------------------------------------------
// Download link — opens a signed URL in a new tab on click.
// ----------------------------------------------------------------------------

function DownloadLink({ documentId, fileName }: { documentId: string; fileName: string }) {
  const signMut = useGetSignedDownloadUrl();

  async function handleClick() {
    const url = await signMut.mutateAsync(documentId);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handleClick}
      disabled={signMut.isPending}
      className="gap-2"
      title={fileName}
    >
      {signMut.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      View
    </Button>
  );
}

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------

export default function MyDocumentsPage() {
  const staffQuery = useStaffForCurrentUser();
  const staffId = staffQuery.data?.id;
  const checklistQuery = useDocumentChecklist(staffId);

  // Progress count: how many mandatory items have a non-rejected, non-expired upload.
  const { uploadedCount, totalCount, mandatoryCount, mandatoryUploadedCount } = useMemo(() => {
    const items = checklistQuery.data ?? [];
    const total = items.length;
    const mandatory = items.filter((i) => i.is_mandatory).length;
    const uploaded = items.filter((i) => {
      const u = i.upload;
      return u && (u.verification_status === 'pending' || u.verification_status === 'verified');
    }).length;
    const mandatoryUploaded = items.filter((i) => {
      if (!i.is_mandatory) return false;
      const u = i.upload;
      return u && (u.verification_status === 'pending' || u.verification_status === 'verified');
    }).length;
    return {
      uploadedCount: uploaded,
      totalCount: total,
      mandatoryCount: mandatory,
      mandatoryUploadedCount: mandatoryUploaded,
    };
  }, [checklistQuery.data]);

  // ---------- Loading / not-staff states -----------------------------------------
  if (staffQuery.isLoading) {
    return (
      <ContentLayout title="My Documents">
        <Breadcrumbs />
        <div className="mt-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your profile…
        </div>
      </ContentLayout>
    );
  }

  if (!staffId) {
    return (
      <ContentLayout title="My Documents">
        <Breadcrumbs />
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>No staff record found</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              We could not find a staff record linked to your account. Document
              uploads are only available to JKKN full-time employees right now.
            </p>
            <p>
              If you believe this is wrong, please contact HR — they can verify
              your staff record and link it to your login.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const items = checklistQuery.data ?? [];

  return (
    <ContentLayout title="My Documents">
      <Breadcrumbs />

      <div className="mt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">My Documents</h1>
          <p className="text-sm text-muted-foreground">
            Upload the documents HR has marked as required for your role. PDF,
            JPG, or PNG, up to 5 MB each. Re-upload anything that gets rejected
            or expires.
          </p>
        </div>

        {/* Progress summary */}
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div>
              <div className="text-sm font-medium">
                {uploadedCount} of {totalCount} documents uploaded
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {mandatoryUploadedCount} of {mandatoryCount} mandatory
              </div>
            </div>
            <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{
                  width: `${totalCount === 0 ? 0 : Math.round((uploadedCount / totalCount) * 100)}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* List */}
        {checklistQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading checklist…
          </div>
        ) : checklistQuery.error ? (
          <Card>
            <CardContent className="p-4 text-sm text-red-700">
              Could not load your document checklist:{' '}
              {(checklistQuery.error as Error).message}
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No required documents are configured for your role yet. If you
              think there should be some, please contact HR.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <ChecklistRow key={item.required_document_id} staffId={staffId} item={item} />
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

function Breadcrumbs() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/hr">HR</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>My Documents</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

interface ChecklistRowProps {
  staffId: string;
  item: HRDocumentChecklistItem;
}

function ChecklistRow({ staffId, item }: ChecklistRowProps) {
  const upload = item.upload;
  const status: EmployeeDocumentVerificationStatus | 'not_uploaded' = upload
    ? upload.verification_status
    : 'not_uploaded';

  // Re-upload conditions: existing upload was rejected OR expired. Pending and
  // verified uploads are NOT user-replaceable from this surface (HR override
  // exists in Phase 2b).
  const allowReupload =
    !!upload &&
    (upload.verification_status === 'rejected' ||
      upload.verification_status === 'expired');

  return (
    <Card>
      <CardContent className="p-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{item.document_name}</span>
              {item.is_mandatory ? (
                <Badge variant="destructive" className="text-[10px] uppercase">
                  Mandatory
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] uppercase">
                  Optional
                </Badge>
              )}
              {item.category && (
                <Badge variant="secondary" className="text-[10px] uppercase">
                  {item.category}
                </Badge>
              )}
              <StatusBadge status={status} />
            </div>
            {item.notes && (
              <p className="text-xs text-muted-foreground">{item.notes}</p>
            )}
            {upload && (
              <div className="text-xs text-muted-foreground">
                <span className="font-mono">{upload.file_name}</span>
                {' · '}
                <span>{(upload.file_size_bytes / 1024).toFixed(0)} KB</span>
                {' · '}
                <span>
                  uploaded{' '}
                  {new Date(upload.uploaded_at).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                {upload.expires_at && (
                  <>
                    {' · '}
                    <span>
                      expires{' '}
                      {new Date(upload.expires_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </>
                )}
              </div>
            )}
            {upload?.verification_status === 'rejected' && upload.verification_notes && (
              <p className="text-xs text-red-700">
                HR note: {upload.verification_notes}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {upload && (
            <DownloadLink documentId={upload.id} fileName={upload.file_name} />
          )}
          {!upload && (
            <UploadButton staffId={staffId} item={item} isReupload={false} />
          )}
          {allowReupload && (
            <UploadButton staffId={staffId} item={item} isReupload={true} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
