'use client';

/**
 * The Principal's decision on ONE COLLEGE's part of a tournament-permission
 * request (D6).
 *
 * Writes the approvals row for that college and nothing else — the request's
 * overall status is derived by the database and becomes approved only once
 * every participating college has approved. The approver's identity is stamped
 * server-side from the signed-in session, so this dialog neither sends nor can
 * forge it.
 *
 * A rejection requires a note, because a squad told "no" with no reason has
 * nothing to fix.
 */

import { useState } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { HealthSportsService } from '@/lib/services/health/health-sports-service';
import type {
  TournamentCollegeApproval,
  TournamentPermissionRecord,
} from '@/lib/services/health/health-sports-service';
import {
  dateRange,
  isSchemaNotApplied,
  levelLabel,
  readFailure,
} from '../../_components/tournament-permission-ui';

export function DecideDialog({
  request,
  approval,
  decision,
  onClose,
  onDecided,
}: {
  request: TournamentPermissionRecord | null;
  /** The caller's OWN college row — the only one they may decide. */
  approval: TournamentCollegeApproval | null;
  decision: 'approved' | 'rejected';
  onClose: () => void;
  onDecided: (approvalId: string) => void;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ message: string; code: string | null } | null>(
    null
  );

  const rejecting = decision === 'rejected';
  const noteMissing = rejecting && note.trim().length === 0;

  async function submit() {
    if (!request || !approval || noteMissing) return;
    setSaving(true);
    setFailure(null);
    try {
      await HealthSportsService.decideCollegeApproval(
        approval.approval_id,
        decision,
        note.trim() || undefined
      );
      toast.success(
        rejecting
          ? 'Rejected for your college — the squad can see your reason.'
          : 'Approved for your college. The squad travels once every college has approved.'
      );
      onDecided(approval.approval_id);
      setNote('');
      onClose();
    } catch (err) {
      // Surface the real reason rather than closing as if it worked
      // (CLAUDE.md #27 — a failure must never be silent). A PostgREST error is a
      // plain object, so readFailure is needed to see it at all.
      setFailure(readFailure(err));
      toast.error('Decision not saved');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !saving) {
          setNote('');
          setFailure(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {rejecting
              ? 'Reject for your college'
              : 'Approve for your college'}
          </DialogTitle>
          <DialogDescription>
            {request ? (
              <>
                {request.tournament_name} · {levelLabel(request.tournament_level)} ·{' '}
                {dateRange(request.start_date, request.end_date)}
                {approval?.institution_name ? (
                  <>
                    <br />
                    You are deciding for{' '}
                    <span className="font-medium">{approval.institution_name}</span> only.
                    Other colleges on this squad are decided by their own Principals.
                  </>
                ) : null}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="decision-note">
              Note {rejecting ? '(required)' : '(optional)'}
            </Label>
            <Textarea
              id="decision-note"
              rows={3}
              placeholder={
                rejecting
                  ? 'Why is this not approved? The squad sees this.'
                  : 'Any condition attached to the approval.'
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {noteMissing ? (
              <p className="text-xs text-amber-600">
                A rejection needs a reason the squad can act on.
              </p>
            ) : null}
          </div>

          {failure ? (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-xs text-red-900">
                <span className="font-medium">
                  {failure.code ? `${failure.code}: ` : ''}
                  {failure.message}
                </span>
                <br />
                Nothing was recorded.{' '}
                {isSchemaNotApplied(failure.code, failure.message)
                  ? 'The database change for this feature has not been applied to this environment yet — an administrator needs to apply the pending migration.'
                  : 'If this mentions row-level security, your role is missing health.sports.approve.'}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={saving || noteMissing}
            onClick={submit}
            className={
              rejecting
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }
          >
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {rejecting ? 'Reject' : 'Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
