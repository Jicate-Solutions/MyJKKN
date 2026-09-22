'use client';

/**
 * Ask to be made eligible for a gated leave type.
 * Created: 2026-09-19.
 *
 * A gated type (PH.D and its like) is invisible in Apply Leave until this is
 * approved. The document asked for here is asked for ONCE — afterwards the
 * type appears in the list and applying for it needs no certificate at all.
 *
 * The upload reuses /api/hr/leave/documents/upload and LeaveDocumentUpload
 * unchanged, so the size limits, the accepted types and the Drive handling are
 * the same ones the leave form already uses.
 */

import { useState } from 'react';
import { AlertCircle, GraduationCap, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRequestLeaveEligibility } from '@/hooks/hr/use-leave-eligibility';
import { getErrorMessage } from '@/lib/utils';
import type { LeaveDocument } from '@/types/hr';
import { LeaveDocumentUpload } from './leave-document-upload';

export function RequestEligibilityDialog({
  open,
  onOpenChange,
  leaveTypeId,
  leaveTypeName,
  employeeId,
  hrOrgId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leaveTypeId: string;
  leaveTypeName: string;
  employeeId: string;
  hrOrgId: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [reason, setReason] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useRequestLeaveEligibility();

  const close = () => {
    setFiles([]); setReason(''); setError(null); setUploading(false);
    onOpenChange(false);
  };

  const submit = async () => {
    setError(null);
    if (files.length === 0) {
      setError('Attach the supporting document — it is what the approver reads.');
      return;
    }
    try {
      setUploading(true);
      // Sequential for the same reason the leave form does it: several large
      // scans racing on a phone connection is how you get a timeout.
      const documents: LeaveDocument[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('employee_id', employeeId);
        fd.append('leave_type_id', leaveTypeId);
        fd.append('start_date', new Date().toISOString().slice(0, 10));
        const res = await fetch('/api/hr/leave/documents/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Could not upload "${file.name}".`);
        }
        documents.push((await res.json()) as LeaveDocument);
      }
      setUploading(false);

      await request.mutateAsync({
        employeeId,
        leaveTypeId,
        hrOrgId,
        // Only read when the flow is a role ladder, and the ladder is resolved
        // in Postgres from the employee id — so null is correct here rather
        // than a department this drawer does not carry.
        departmentId: null,
        documents,
        reason: reason.trim() || null,
      });
      toast.success(`Eligibility for ${leaveTypeName} sent for approval`);
      close();
    } catch (err) {
      setUploading(false);
      setError(getErrorMessage(err));
    }
  };

  const busy = uploading || request.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      {/* Opened from INSIDE the Apply Leave Sheet (z-[85] overlay / z-[90]
          panel), so both layers are raised above it; at the default z-50 this
          dialog rendered behind the sheet, dimmed and unreachable. The
          Eligibility page opens it with nothing above z-50, where the higher
          values are harmless. */}
      <DialogContent
        className="z-[100] flex max-h-[90vh] max-w-lg flex-col"
        overlayClassName="z-[95]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Request eligibility — {leaveTypeName}
          </DialogTitle>
          <DialogDescription>
            This leave type is not open to everyone. Send your supporting document once; after it is
            approved, {leaveTypeName} appears in your leave list and you will not be asked for the
            document again.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <LeaveDocumentUpload
            files={files}
            onChange={setFiles}
            required
            reason="Proof that you qualify for this leave type — for example your enrolment certificate."
            uploading={uploading}
            error={null}
          />

          <div>
            <Label htmlFor="eligibility-reason" className="text-xs">
              Anything the approver should know (optional)
            </Label>
            <Textarea
              id="eligibility-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Enrolled for a part-time PhD at Anna University since June 2026."
              className="mt-1"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || files.length === 0}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {uploading ? 'Uploading…' : 'Send for approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
