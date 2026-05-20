'use client';

/**
 * Visible status-update control for the enquiry detail page header.
 *
 * Mirrors the status sub-menu in row-actions.tsx but exposes it as a
 * prominent top-level button so users don't have to navigate back to the
 * table to change a lifecycle status.
 *
 * Permission: `learners.admissions:edit` (or super admin). When the user
 * lacks it, the component renders only the read-only status badge.
 *
 * Special-case: moving to `account` triggers OnboardingService.markAsAccount
 * which validates finance fields before flipping the status.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ChevronDown, Clock, CheckCircle, XCircle, AlertCircle, HelpCircle,
  Landmark, Send, FileCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useUpdateLearnerProfile } from '@/hooks/use-learner-profiles';
import { useMarkAsAccount } from '@/hooks/billing/use-onboarding';
import { OnboardingService } from '@/lib/services/billing/onboarding/onboarding-service';
import type { LearnerProfile, LifecycleStatus } from '@/types/learner-profile';

interface EnquiryStatusUpdateProps {
  enquiry: LearnerProfile;
}

/** Manually-transitionable statuses (the rest are computed/system-driven). */
const STATUS_OPTIONS: Array<{
  value: LifecycleStatus;
  label: string;
  icon: React.ElementType;
  iconClassName: string;
}> = [
  { value: 'enquiry',           label: 'Enquiry',            icon: HelpCircle,  iconClassName: 'text-gray-500' },
  { value: 'enquiry_submitted', label: 'Enquiry Submitted',  icon: Send,        iconClassName: 'text-sky-500' },
  { value: 'pending',           label: 'Pending',            icon: Clock,       iconClassName: 'text-yellow-500' },
  { value: 'approved',          label: 'Approved',           icon: CheckCircle, iconClassName: 'text-green-500' },
  { value: 'account',           label: 'Account (Billing)',  icon: Landmark,    iconClassName: 'text-amber-500' },
  { value: 'admitted',          label: 'Admitted',           icon: FileCheck,   iconClassName: 'text-emerald-500' },
  { value: 'waitlisted',        label: 'Waitlisted',         icon: AlertCircle, iconClassName: 'text-blue-500' },
  { value: 'rejected',          label: 'Rejected',           icon: XCircle,     iconClassName: 'text-red-500' },
];

const STATUS_BADGE_CLASS: Partial<Record<LifecycleStatus, string>> = {
  enquiry:           'bg-gray-100 text-gray-700 border-gray-200',
  enquiry_submitted: 'bg-sky-50 text-sky-700 border-sky-200',
  pending:           'bg-yellow-50 text-yellow-800 border-yellow-200',
  approved:          'bg-green-50 text-green-700 border-green-200',
  account:           'bg-amber-50 text-amber-800 border-amber-200',
  reserved:          'bg-purple-50 text-purple-700 border-purple-200',
  admitted:          'bg-emerald-50 text-emerald-700 border-emerald-200',
  active:            'bg-emerald-100 text-emerald-800 border-emerald-300',
  waitlisted:        'bg-blue-50 text-blue-700 border-blue-200',
  rejected:          'bg-red-50 text-red-700 border-red-200',
};

function prettyStatus(s: LifecycleStatus): string {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function EnquiryStatusUpdate({ enquiry }: EnquiryStatusUpdateProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const [pendingStatus, setPendingStatus] = useState<LifecycleStatus | null>(null);

  const updateMutation = useUpdateLearnerProfile();
  const markAsAccountMutation = useMarkAsAccount();

  const canEdit =
    !permissionsLoading && (isSuperAdmin || canAccess('learners.admissions', 'edit'));

  const currentBadgeClass =
    STATUS_BADGE_CLASS[enquiry.lifecycle_status] ?? 'bg-muted text-muted-foreground border-input';

  // Read-only badge for users without edit permission
  if (!canEdit) {
    return (
      <Badge variant="outline" className={`${currentBadgeClass} px-3 py-1 text-sm`}>
        Status: {prettyStatus(enquiry.lifecycle_status)}
      </Badge>
    );
  }

  const handleSelect = (status: LifecycleStatus) => {
    if (status === enquiry.lifecycle_status) return;

    // Pre-validate finance fields for 'account' before opening the confirmation.
    if (status === 'account') {
      const validation = OnboardingService.validateFinanceFields(enquiry);
      if (!validation.valid) {
        toast.error(
          `Missing finance fields: ${(validation as { missing: string[] }).missing.join(', ')}. ` +
          `Please edit the enquiry to add finance details first.`,
        );
        return;
      }
    }
    setPendingStatus(status);
  };

  const confirmUpdate = async () => {
    if (!pendingStatus) return;
    const target = pendingStatus;

    try {
      if (target === 'account') {
        await markAsAccountMutation.mutateAsync(enquiry.id);
        // markAsAccount hook shows its own success/error toast
      } else {
        await updateMutation.mutateAsync({
          id: enquiry.id,
          dto: { lifecycle_status: target },
        });
        toast.success(`Status updated to ${prettyStatus(target)}`);
      }
      setPendingStatus(null);
      setTimeout(() => router.refresh(), 300);
    } catch (error) {
      console.error('[enquiry-status-update] Failed to update status:', error);
      if (target !== 'account') {
        // markAsAccount hook already shows its own error toast
        toast.error('Failed to update status. Please try again.');
      }
      setPendingStatus(null);
    }
  };

  const submitting = updateMutation.isPending || markAsAccountMutation.isPending;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" disabled={submitting}>
            <Badge
              variant="outline"
              className={`${currentBadgeClass} px-2 py-0.5 text-xs font-medium`}
            >
              {prettyStatus(enquiry.lifecycle_status)}
            </Badge>
            <span className="text-sm">Update Status</span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[220px]">
          <DropdownMenuLabel>Move to…</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {STATUS_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const isCurrent = opt.value === enquiry.lifecycle_status;
            return (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                disabled={isCurrent || submitting}
              >
                <Icon className={`mr-2 h-4 w-4 ${opt.iconClassName}`} />
                <span>{opt.label}</span>
                {isCurrent && (
                  <span className="ml-auto text-xs text-muted-foreground">current</span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={!!pendingStatus}
        onOpenChange={(open) => { if (!open) setPendingStatus(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Status</AlertDialogTitle>
            <AlertDialogDescription>
              Move {enquiry.first_name} {enquiry.last_name || ''} from{' '}
              <strong>{prettyStatus(enquiry.lifecycle_status)}</strong> to{' '}
              <strong>{pendingStatus ? prettyStatus(pendingStatus) : ''}</strong>?
              {pendingStatus === 'account' && (
                <>
                  <br /><br />
                  This sends the learner to the Accounts team&apos;s onboarding
                  queue. Bills are not auto-created — the accounts team creates
                  them manually from captured fee items.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <Button onClick={confirmUpdate} disabled={submitting}>
              {submitting ? 'Updating…' : 'Confirm'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
