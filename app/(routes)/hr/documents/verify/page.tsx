// ============================================================================
// HR — Document Verification Queue (T1.5b Phase 2b)
// Created: 2026-05-10.
//
// Spec: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.5b Phase 2b)
//
// What this page is
// -----------------
// HR officer's verification queue for employee uploads. Each row is a
// hr_employee_documents row joined with the uploading employee's identity.
// HR officer can:
//   * View the document (signed URL in new tab)
//   * Verify (sets status='verified', stamps verified_by + verified_at)
//   * Reject (sets status='rejected' with required notes employee can read)
//
// Permission gate
// ---------------
// AdminPermissionGuard checks for hr.employees.edit OR super_admin/admin.
// RLS handles institution scoping at the row level — HR officers only see
// rows in institutions they have access to.
//
// Pattern reuse
// -------------
// Action layout (Approve/Reject buttons + dialogs) mirrors
// app/(routes)/hr/recruitment/approvals/page.tsx (PR #810). Toast pattern
// matches the rest of the HR module (sonner).
// ============================================================================

'use client';

import { useMemo, useState } from 'react';
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
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  XCircle,
} from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useDocumentsForVerification,
  useGetSignedDownloadUrl,
  useRejectDocument,
  useVerifyDocument,
} from '@/hooks/hr/use-employee-documents';
import {
  EMPLOYEE_DOCUMENT_STATUS_LABELS,
  type EmployeeDocumentVerificationStatus,
} from '@/types/hr';
import type { EmployeeDocumentVerificationRow } from '@/lib/services/hr/employee-documents-service';

// ----------------------------------------------------------------------------
// Filter chip values — `'all'` is a UI sentinel, not a real status.
// ----------------------------------------------------------------------------

type FilterValue = EmployeeDocumentVerificationStatus | 'all';

const FILTER_OPTIONS: ReadonlyArray<{ value: FilterValue; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: 'all', label: 'All' },
];

// ----------------------------------------------------------------------------
// Status badge — local copy of /hr/documents/page.tsx StatusBadge for visual
// consistency. Kept inline so the two pages can drift independently if needed.
// ----------------------------------------------------------------------------

function StatusBadge({ status }: { status: EmployeeDocumentVerificationStatus }) {
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
  return (
    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-xs">
      <Clock className="h-3 w-3 mr-1" />
      {EMPLOYEE_DOCUMENT_STATUS_LABELS.pending}
    </Badge>
  );
}

// ----------------------------------------------------------------------------
// Relative-time helper — inlined to avoid pulling date-fns just for one fmt.
// ----------------------------------------------------------------------------

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

function formatExpiryHint(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = then - now;
  if (diffMs <= 0) return 'EXPIRED';
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return days === 1 ? 'in 1 day' : `in ${days} days`;
}

function isImageMime(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/png';
}

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------

export default function HRDocumentVerifyPage() {
  // Permission gate — hr.employees.edit OR super_admin/admin (canAccess returns
  // true for super_admin/admin automatically).
  const { isSuperAdmin, canAccess, isLoading: permsLoading } = usePermissions();
  const canVerify = isSuperAdmin || canAccess('hr.employees', 'edit');

  if (permsLoading) {
    return (
      <ContentLayout title="Document Verification">
        <Breadcrumbs />
        <div className="mt-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </ContentLayout>
    );
  }

  if (!canVerify) {
    return (
      <ContentLayout title="Document Verification">
        <Breadcrumbs />
        <Card className="mt-6">
          <CardContent className="p-6 text-sm text-muted-foreground">
            You need HR officer access to view this page. If you believe this
            is wrong, contact a super admin.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return <VerifyPageInner />;
}

function VerifyPageInner() {
  const { profile } = useAuth();
  const verifierProfileId = profile?.id ?? null;

  const [filter, setFilter] = useState<FilterValue>('pending');

  const queueQuery = useDocumentsForVerification({ status: filter });
  const rows = queueQuery.data ?? [];

  const counts = useMemo(() => {
    return rows.length;
  }, [rows]);

  return (
    <ContentLayout title="Document Verification">
      <Breadcrumbs />

      <div className="mt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Document Verification</h1>
          <p className="text-sm text-muted-foreground">
            Review documents employees have uploaded and mark them as verified
            or rejected. Rejected documents will show your note to the employee
            so they can re-upload.
          </p>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((opt) => {
            const active = opt.value === filter;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-foreground border-border hover:border-foreground/50'
                }`}
              >
                {opt.label}
                {active && rows.length > 0 ? ` (${counts})` : ''}
              </button>
            );
          })}
        </div>

        {/* Rows */}
        {queueQuery.isLoading ? (
          <Card>
            <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
            </CardContent>
          </Card>
        ) : queueQuery.error ? (
          <Card>
            <CardContent className="p-6 text-sm text-red-700">
              Could not load verification queue:{' '}
              {(queueQuery.error as Error).message}
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {filter === 'pending'
                ? 'Nothing to verify right now. New uploads will appear here.'
                : 'No documents match this filter.'}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <DocumentRow
                key={row.id}
                row={row}
                verifierProfileId={verifierProfileId}
              />
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
          <BreadcrumbLink asChild>
            <Link href="/hr/documents">Documents</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Verification</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

interface DocumentRowProps {
  row: EmployeeDocumentVerificationRow;
  verifierProfileId: string | null;
}

function DocumentRow({ row, verifierProfileId }: DocumentRowProps) {
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');

  const signMut = useGetSignedDownloadUrl();
  const verifyMut = useVerifyDocument();
  const rejectMut = useRejectDocument();

  const employeeName = (() => {
    const e = row.employee;
    if (!e) return '(unknown employee)';
    const fn = (e.first_name ?? '').trim();
    const ln = (e.last_name ?? '').trim();
    const full = `${fn} ${ln}`.trim();
    return full.length > 0 ? full : (e.email ?? '(unnamed)');
  })();

  const expiryHint = formatExpiryHint(row.expires_at);
  const isExpiredHint = expiryHint === 'EXPIRED';

  async function handleView() {
    try {
      const url = await signMut.mutateAsync(row.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // toast handled in hook
    }
  }

  async function handleVerifyConfirm() {
    if (!verifierProfileId) return;
    await verifyMut.mutateAsync({
      documentId: row.id,
      verifierProfileId,
    });
    setVerifyOpen(false);
  }

  async function handleRejectConfirm() {
    if (!verifierProfileId) return;
    if (rejectNotes.trim().length === 0) return;
    await rejectMut.mutateAsync({
      documentId: row.id,
      verifierProfileId,
      notes: rejectNotes.trim(),
    });
    setRejectOpen(false);
    setRejectNotes('');
  }

  // Action availability — only `pending` rows get the action buttons. Verified
  // and rejected rows remain visible (when filter is set to those) but read-only.
  const isPending = row.verification_status === 'pending';

  return (
    <Card>
      <CardContent className="p-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Thumbnail / file-type pill */}
          <div className="shrink-0 w-12 h-12 rounded border border-border bg-muted/40 flex items-center justify-center text-[10px] font-semibold text-muted-foreground uppercase">
            {isImageMime(row.mime_type) ? (
              <FileText className="h-5 w-5" />
            ) : (
              'PDF'
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{row.document_name}</span>
              <StatusBadge status={row.verification_status} />
              {isExpiredHint && (
                <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-xs">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Expired
                </Badge>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{employeeName}</span>
              {row.employee?.email && (
                <>
                  {' · '}
                  <span>{row.employee.email}</span>
                </>
              )}
              {row.employee?.designation && (
                <>
                  {' · '}
                  <span>{row.employee.designation}</span>
                </>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              <span className="font-mono">{row.file_name}</span>
              {' · '}
              <span>{(row.file_size_bytes / 1024).toFixed(0)} KB</span>
              {' · '}
              <span>uploaded {formatRelative(row.uploaded_at)}</span>
              {expiryHint && (
                <>
                  {' · '}
                  <span className={isExpiredHint ? 'text-red-700 font-medium' : ''}>
                    expires {expiryHint}
                  </span>
                </>
              )}
            </div>

            {row.verification_status === 'rejected' && row.verification_notes && (
              <p className="text-xs text-red-700">
                Rejection note: {row.verification_notes}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleView}
            disabled={signMut.isPending}
            className="gap-2"
          >
            {signMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            View
          </Button>
          {isPending && (
            <>
              <Button
                size="sm"
                onClick={() => setVerifyOpen(true)}
                disabled={verifyMut.isPending || !verifierProfileId}
              >
                Verify
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectOpen(true)}
                disabled={rejectMut.isPending || !verifierProfileId}
              >
                Reject
              </Button>
            </>
          )}
        </div>
      </CardContent>

      {/* Verify dialog */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this document verified?</DialogTitle>
            <DialogDescription>
              Confirms the upload meets HR&apos;s requirements. The employee
              will see this as verified on their My Documents page.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{row.document_name}</span>
            <br />
            <span>From: {employeeName}</span>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVerifyOpen(false)}
              disabled={verifyMut.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVerifyConfirm}
              disabled={verifyMut.isPending || !verifierProfileId}
            >
              {verifyMut.isPending ? 'Verifying…' : 'Confirm Verify'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setRejectNotes('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this document?</DialogTitle>
            <DialogDescription>
              The employee will see your note and can re-upload. Be specific so
              they know what to fix.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{row.document_name}</span>
              <br />
              <span>From: {employeeName}</span>
            </div>
            <div>
              <Label htmlFor={`reject-notes-${row.id}`}>
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id={`reject-notes-${row.id}`}
                rows={3}
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="e.g. Document is unreadable; please re-scan in colour."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectOpen(false);
                setRejectNotes('');
              }}
              disabled={rejectMut.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={
                rejectMut.isPending ||
                !verifierProfileId ||
                rejectNotes.trim().length === 0
              }
            >
              {rejectMut.isPending ? 'Rejecting…' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
