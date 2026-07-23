'use client';

/**
 * PeriodActionButtons — primary CTA + More-actions dropdown rendered in the
 * detail-page header (top-right).
 *
 * Per spec specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md Q3 + E3 + E12:
 *   - Primary button label is stage-specific (Prepare for review / Mark as
 *     CAO-reviewed / etc.).
 *   - "More actions" dropdown reveals Reject + Backdate + Lock.
 *   - Hidden (not greyed out) when user has no allowed action.
 *   - Backdate visible only to Director/admin/super_admin.
 *   - Lock visible only when status='distributed' AND user is Director/admin.
 *
 * RPC authorization rules (per fn_advance + fn_reject + fn_backdate):
 *   ADVANCE_ALLOWED maps current status → roles that can advance.
 *   REJECT_ALLOWED maps current status → roles that can reject.
 *   Director/admin/super_admin override every gate.
 *   See git show jicate/main:supabase/migrations/20260629000000_t4_3_pr2_payroll_rpcs.sql
 */

import { useState } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import {
  useAdvancePayrollPeriod,
  usePreparePayrollPeriod,
} from '@/hooks/hr/payroll/use-payroll-periods';
import type { HRPayrollPeriod, PayrollPeriodStatus } from '@/types/hr-payroll';

import { PeriodRejectModal } from './period-reject-modal';
import { PeriodBackdateModal } from './period-backdate-modal';
import { PeriodLockModal } from './period-lock-modal';

// =====================================================================================
// Authorization tables (mirror the RPC source-of-truth)
// =====================================================================================

const ADVANCE_ALLOWED: Record<PayrollPeriodStatus, string[]> = {
  draft: ['hr_officer', 'hr_admin', 'hr_manager', 'director'],
  prepared: ['cao', 'director'],
  cao_reviewed: ['accounts', 'accountant', 'director'],
  accounts_verified: ['chairperson', 'director'],
  chairperson_approved: ['hr_officer', 'hr_admin', 'hr_manager', 'director'],
  distributed: ['director'],
  locked: [],
};

const REJECT_ALLOWED: Record<PayrollPeriodStatus, string[]> = {
  draft: [],
  prepared: ['hr_officer', 'hr_admin', 'hr_manager', 'director'],
  cao_reviewed: ['cao', 'director'],
  accounts_verified: ['accounts', 'accountant', 'director'],
  chairperson_approved: ['chairperson', 'director'],
  distributed: ['hr_officer', 'hr_admin', 'hr_manager', 'director'],
  locked: [],
};

const PRIMARY_BUTTON_LABEL: Record<PayrollPeriodStatus, string | null> = {
  draft: 'Prepare for review',
  prepared: 'Mark as CAO-reviewed',
  cao_reviewed: 'Mark as Accounts-verified',
  accounts_verified: 'Approve as Chairperson',
  chairperson_approved: 'Distribute payslips',
  distributed: 'Lock period',
  locked: null,
};

// =====================================================================================
// Component
// =====================================================================================

export function PeriodActionButtons({
  period,
}: {
  period: HRPayrollPeriod;
}) {
  const { profile } = useAuth();
  const preparePeriod = usePreparePayrollPeriod();
  const advancePeriod = useAdvancePayrollPeriod();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [backdateOpen, setBackdateOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);

  const isPending = preparePeriod.isPending || advancePeriod.isPending;

  const roleKey =
    profile?.primary_role?.role_key ??
    profile?.user_roles?.[0]?.role_key ??
    null;
  const isDirectorOrAdmin =
    profile?.is_super_admin === true || roleKey === 'director' || roleKey === 'admin';

  const status = period.status;
  const canAdvance =
    isDirectorOrAdmin ||
    (roleKey != null && ADVANCE_ALLOWED[status].includes(roleKey));
  const canReject =
    isDirectorOrAdmin ||
    (roleKey != null && REJECT_ALLOWED[status].includes(roleKey));
  const canBackdate = isDirectorOrAdmin && status !== 'locked';
  // Lock is just "advance from distributed" — surface as its own modal for clarity
  const showLockAsModal = status === 'distributed' && isDirectorOrAdmin;

  const primaryLabel = PRIMARY_BUTTON_LABEL[status];

  const onPrimaryClick = () => {
    if (status === 'distributed' && isDirectorOrAdmin) {
      setLockOpen(true);
      return;
    }
    if (status === 'draft') {
      preparePeriod.mutate({ periodId: period.id });
      return;
    }
    advancePeriod.mutate({ periodId: period.id });
  };

  // Hide whole component when user has nothing actionable
  if (!canAdvance && !canReject && !canBackdate) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {canAdvance && primaryLabel && (
          <Button
            onClick={onPrimaryClick}
            disabled={isPending}
            size="sm"
          >
            {isPending ? 'Working…' : primaryLabel}
            <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
          </Button>
        )}

        {(canReject || canBackdate) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canReject && (
                <DropdownMenuItem
                  onClick={() => setRejectOpen(true)}
                  className="text-red-700 focus:text-red-700"
                >
                  Reject to prior stage…
                </DropdownMenuItem>
              )}
              {canBackdate && (
                <>
                  {canReject && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onClick={() => setBackdateOpen(true)}
                    className="text-amber-800 focus:text-amber-800"
                  >
                    {period.is_backdated ? 'Update backdate reason…' : 'Backdate this period…'}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <PeriodRejectModal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        period={period}
      />
      <PeriodBackdateModal
        open={backdateOpen}
        onOpenChange={setBackdateOpen}
        period={period}
      />
      {showLockAsModal && (
        <PeriodLockModal
          open={lockOpen}
          onOpenChange={setLockOpen}
          period={period}
        />
      )}
    </>
  );
}
