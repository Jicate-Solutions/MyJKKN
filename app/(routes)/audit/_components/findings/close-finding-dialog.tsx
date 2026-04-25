'use client';

// Audit Workflow Sprint 01 — Close-finding dialog (rectification workflow).
// Enforces thrash T17 (all required evidence uploaded) client-side BEFORE submit
// so the button is disabled until the checklist is satisfied. Server-side
// `AuditFindingService.closeAsRectified` re-validates and will 422 on bypass.

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCloseFinding } from '@/hooks/audit/use-audit-findings';
import { useAuth } from '@/hooks/use-auth';
import { EvidenceUploadItem } from './evidence-upload-item';
import { SeverityBadge } from './severity-badge';
import type { AuditFindingView, AuditFindingFormData } from '@/lib/types/audit';

type UploadedFile = NonNullable<AuditFindingFormData['evidence_uploaded']>[number];

interface CloseFindingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finding: AuditFindingView | null;
  onSuccess?: () => void;
}

export function CloseFindingDialog({
  open,
  onOpenChange,
  finding,
  onSuccess,
}: CloseFindingDialogProps) {
  const { profile } = useAuth();
  const userId = profile?.id ?? '';
  const closeMut = useCloseFinding(userId);

  const [uploads, setUploads] = useState<Record<string, UploadedFile>>({});
  const [notes, setNotes] = useState('');

  // Re-initialise local state each time a different finding is opened
  const findingId = finding?.finding_id ?? null;
  useEffect(() => {
    // Seed from existing uploads so re-opens don't lose state
    const existing = finding?.form_data?.evidence_uploaded ?? [];
    const map: Record<string, UploadedFile> = {};
    for (const up of existing) map[up.label] = up as UploadedFile;
    setUploads(map);
    setNotes(finding?.form_data?.notes ?? '');
    // Only re-run when the finding identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findingId]);

  const requirements = finding?.form_data?.evidence_required ?? [];
  const requiredLabels = useMemo(
    () => requirements.filter((r) => r.required).map((r) => r.label),
    [requirements]
  );
  const missing = requiredLabels.filter((label) => !uploads[label]);
  const allRequiredSatisfied = missing.length === 0;

  async function handleSubmit() {
    if (!finding) return;
    if (!userId) {
      toast.error('You must be signed in to close a finding.');
      return;
    }
    if (!allRequiredSatisfied) {
      toast.error(`Missing required evidence: ${missing.join(', ')}`);
      return;
    }

    try {
      await closeMut.mutateAsync({
        findingId: finding.finding_id,
        evidenceUploaded: Object.values(uploads),
        notes: notes.trim() || undefined,
      });
      toast.success('Finding rectified and closed.');
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(
        `Failed to close finding: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const submitting = closeMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Close finding
            {finding && <SeverityBadge severity={finding.severity} />}
          </DialogTitle>
          <DialogDescription>
            {finding ? (
              <>
                <span className="font-mono">{finding.request_number ?? finding.finding_id.slice(0, 8)}</span>
                {' · '}
                Parameter <span className="font-mono">{finding.parameter_code}</span>
                {' · '}
                Upload evidence and confirm rectification.
              </>
            ) : (
              'Upload evidence to rectify this finding.'
            )}
          </DialogDescription>
        </DialogHeader>

        {finding && (
          <div className="space-y-4">
            {requirements.length === 0 ? (
              <p className="text-sm text-muted-foreground border rounded-md p-3 bg-muted/30">
                No evidence schema defined for this parameter. Close will proceed without uploads.
              </p>
            ) : (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Evidence checklist</Label>
                <div className="space-y-2">
                  {requirements.map((req) => (
                    <EvidenceUploadItem
                      key={req.label}
                      requirement={req}
                      findingId={finding.finding_id}
                      uploadedBy={userId}
                      existingUpload={uploads[req.label] ?? null}
                      onUploaded={(file) =>
                        setUploads((prev) => ({ ...prev, [req.label]: file }))
                      }
                      onRemoved={() =>
                        setUploads((prev) => {
                          const next = { ...prev };
                          delete next[req.label];
                          return next;
                        })
                      }
                      disabled={submitting}
                    />
                  ))}
                </div>
                {!allRequiredSatisfied && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Required items still missing: {missing.join(', ')}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="close-notes" className="text-sm font-semibold">
                Rectification notes (optional)
              </Label>
              <Textarea
                id="close-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Summarise the rectification action taken, including any caveats or follow-up."
                rows={3}
                disabled={submitting}
              />
            </div>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !allRequiredSatisfied}
          >
            {submitting ? 'Closing…' : 'Close as rectified'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
