'use client';

/**
 * DraftPublishToggle — shows current publication state with publish/unpublish actions.
 *
 * Features:
 *   - Displays "Draft" / "Published" badge with published_at timestamp
 *   - "Publish" button opens a reason dialog (mandatory reason text)
 *   - "Revert to Draft" button for unpublishing
 *   - Shows publisher name from profiles
 *   - Disabled states while mutations are in flight
 */

import { useState } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Check,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { usePublishPolicy, useUnpublishPolicy } from '@/hooks/hr/use-policy-audit';
import type {
  PolicyPublicationState,
  PolicyClassification,
} from '@/types/hr-policy-audit';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DraftPublishToggleProps {
  policyKey: string;
  scopeType: 'global' | 'institution' | 'role' | 'user';
  scopeId: string | null;
  publicationState: PolicyPublicationState;
  classification: PolicyClassification;
  publishedAt: string | null;
  publishedBy: string | null;
  publisherName?: string | null;
  hasDraft: boolean;
  /** Called after a successful publish/unpublish so the parent can refresh. */
  onStateChange?: () => void;
  /** Whether the user is allowed to publish (Director/super_admin for major). */
  canPublish?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DraftPublishToggle({
  policyKey,
  scopeType,
  scopeId,
  publicationState,
  classification,
  publishedAt,
  publishedBy,
  publisherName,
  hasDraft,
  onStateChange,
  canPublish = true,
}: DraftPublishToggleProps) {
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);
  const [reason, setReason] = useState('');

  const publishMutation = usePublishPolicy();
  const unpublishMutation = useUnpublishPolicy();

  const isMutating = publishMutation.isPending || unpublishMutation.isPending;

  const handlePublish = async () => {
    if (reason.trim().length === 0) return;
    try {
      await publishMutation.mutateAsync({
        policy_key: policyKey,
        scope_type: scopeType,
        scope_id: scopeId,
        reason: reason.trim(),
      });
      toast.success('Policy published');
      setShowPublishDialog(false);
      setReason('');
      onStateChange?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to publish policy'
      );
    }
  };

  const handleUnpublish = async () => {
    if (reason.trim().length === 0) return;
    try {
      await unpublishMutation.mutateAsync({
        policy_key: policyKey,
        scope_type: scopeType,
        scope_id: scopeId,
        reason: reason.trim(),
      });
      toast.success('Policy reverted to draft');
      setShowUnpublishDialog(false);
      setReason('');
      onStateChange?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to unpublish policy'
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Status row */}
      <div className="flex items-center gap-3 flex-wrap">
        <StateBadge state={publicationState} />

        {classification === 'major' && (
          <Badge variant="outline" className="text-xs gap-1">
            <AlertTriangle className="h-3 w-3" />
            Major (Director-only)
          </Badge>
        )}

        {publicationState === 'published' && publishedAt && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Published {formatDate(publishedAt)}
            {publisherName && (
              <span> by {publisherName}</span>
            )}
          </span>
        )}

        {publicationState === 'draft_pending' && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Unpublished changes pending
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {/* Show Publish button when there's a draft to publish */}
        {(publicationState === 'draft_pending' || publicationState === 'draft_only') && (
          <Button
            size="sm"
            onClick={() => {
              setReason('');
              setShowPublishDialog(true);
            }}
            disabled={isMutating || !canPublish}
            className="gap-1"
          >
            <Upload className="h-3.5 w-3.5" />
            Publish
          </Button>
        )}

        {/* Show Unpublish button when published */}
        {publicationState === 'published' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setReason('');
              setShowUnpublishDialog(true);
            }}
            disabled={isMutating || !canPublish}
            className="gap-1"
          >
            <EyeOff className="h-3.5 w-3.5" />
            Revert to Draft
          </Button>
        )}

        {!canPublish && classification === 'major' && (
          <p className="text-xs text-muted-foreground">
            Only the Director can publish/unpublish major-classified policies.
          </p>
        )}
      </div>

      {/* Publish dialog */}
      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Publish Policy</DialogTitle>
            <DialogDescription>
              This will make the draft changes live. All staff will see the
              updated policy values. A reason is required for the audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="text-sm">
              <span className="font-medium">Policy: </span>
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {policyKey}
              </code>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="publish-reason">
                Reason for publishing <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="publish-reason"
                placeholder="e.g. Approved by Director after review meeting on 24-May-2026"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPublishDialog(false)}
              disabled={publishMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePublish}
              disabled={reason.trim().length === 0 || publishMutation.isPending}
              className="gap-1"
            >
              {publishMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Confirm Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unpublish dialog */}
      <Dialog open={showUnpublishDialog} onOpenChange={setShowUnpublishDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Revert to Draft</DialogTitle>
            <DialogDescription>
              This will unpublish the current policy. The live value will be
              preserved as a draft for re-editing. Staff will no longer see it
              as active. A reason is required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="text-sm">
              <span className="font-medium">Policy: </span>
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {policyKey}
              </code>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unpublish-reason">
                Reason for unpublishing <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="unpublish-reason"
                placeholder="e.g. Found error in leave calculation formula, reverting for correction"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUnpublishDialog(false)}
              disabled={unpublishMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleUnpublish}
              disabled={reason.trim().length === 0 || unpublishMutation.isPending}
              className="gap-1"
            >
              {unpublishMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
              Confirm Unpublish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StateBadge({ state }: { state: PolicyPublicationState }) {
  switch (state) {
    case 'published':
      return (
        <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
          <Eye className="h-3 w-3" />
          Published
        </Badge>
      );
    case 'draft_only':
      return (
        <Badge variant="secondary" className="gap-1">
          <EyeOff className="h-3 w-3" />
          Draft
        </Badge>
      );
    case 'draft_pending':
      return (
        <Badge variant="outline" className="gap-1 border-amber-400 text-amber-600 dark:text-amber-400">
          <Clock className="h-3 w-3" />
          Draft (pending)
        </Badge>
      );
    default:
      return <Badge variant="outline">{state}</Badge>;
  }
}

function formatDate(iso: string): string {
  try {
    return format(new Date(iso), 'dd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}
