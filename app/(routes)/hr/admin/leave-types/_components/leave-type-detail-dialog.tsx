'use client';

// Read-only detail view for one HR leave type (2026-07-23).
//
// The table shows 8 of ~40 columns on hr_leave_types. Everything else — accrual,
// STO caps, notice periods, document rules, validity window — was only visible by
// opening the edit form, which meant reading configuration through a form full of
// live inputs. This is the read path.
//
// Responsive by the same rule the rest of the app uses: Drawer at <=768px,
// Dialog above it (see learners/leave-onduty/my-applications). 768 is also where
// the DataTable swaps its rows for cards, so the table and this modal agree on
// what "mobile" means.

import { format } from 'date-fns';
import { Pencil, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { useMediaQuery } from '@/hooks/use-media-query';
import { LEAVE_DURATION_LABELS } from '@/types/hr';
import {
  ACCRUAL_TYPE_LABELS,
  APPLICABLE_GENDER_LABELS,
  REQUEST_CATEGORY_LABELS,
  STO_LIMIT_MODE_LABELS,
  STO_LIMIT_PERIOD_LABELS,
  type HRLeaveType,
} from '@/types/hr-leave-types';

/** Renders '—' for null/undefined/'' so an empty column never looks like a bug. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  const empty =
    children === null || children === undefined || children === '' || children === false;
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">
        {empty ? <span className="text-muted-foreground">—</span> : children}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-medium">{title}</h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

/** `valid_from` / `valid_until` are timestamps; guard against an unparseable one. */
function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : format(d, 'dd MMM yyyy');
}

function LeaveTypeDetailContent({ t }: { t: HRLeaveType }) {
  const isSto = t.request_category === 'short_time_off';
  // Shared ['hr-org-mappings'] query — already in cache from the page, filters
  // and table, so this resolves without a request.
  const { orgNameById } = useHrOrgMappings();

  return (
    <div className="space-y-4">
      <Section title="Overview">
        <Field label="Institution">
          {orgNameById.get(t.hr_organization_id)}
        </Field>
        <Field label="Code">
          <span className="font-mono">{t.leave_type_code}</span>
        </Field>
        <Field label="Category">
          <Badge variant="secondary">
            {REQUEST_CATEGORY_LABELS[t.request_category] ?? t.request_category}
          </Badge>
        </Field>
        <Field label="Status">
          {t.is_active ? (
            <Badge>Active</Badge>
          ) : (
            <Badge variant="secondary">Archived</Badge>
          )}
        </Field>
        <Field label="Display order">{t.display_order}</Field>
        <div className="sm:col-span-2">
          <Field label="Description">{t.description}</Field>
        </div>
      </Section>

      {isSto ? (
        <Section title="Short Time Off limits">
          <Field label="Limit mode">
            {STO_LIMIT_MODE_LABELS[t.sto_limit_mode] ?? t.sto_limit_mode}
          </Field>
          {t.sto_limit_mode !== 'none' && (
            <Field label="Period">
              {STO_LIMIT_PERIOD_LABELS[t.sto_limit_period] ?? t.sto_limit_period}
            </Field>
          )}
          {t.sto_limit_mode === 'request_count' && (
            <Field label="Max requests">{t.sto_max_requests}</Field>
          )}
          {t.sto_limit_mode === 'total_duration' && (
            <Field label="Total minutes">{t.sto_total_minutes}</Field>
          )}
          <Field label="Min per request">
            {t.sto_min_minutes ? `${t.sto_min_minutes} min` : null}
          </Field>
          <Field label="Max per request">
            {t.sto_max_minutes ? `${t.sto_max_minutes} min` : null}
          </Field>
        </Section>
      ) : (
        <Section title="Entitlement">
          <Field label="Default entitled days">{t.default_entitled_days} days</Field>
          <Field label="Accrual">
            {ACCRUAL_TYPE_LABELS[t.accrual_type] ?? t.accrual_type}
          </Field>
          {t.accrual_type !== 'none' && (
            <Field label="Accrual rate">{t.accrual_rate}</Field>
          )}
          <Field label="Carry-forward">
            {t.allow_carry_forward
              ? t.max_carry_forward_days != null
                ? `Yes — up to ${t.max_carry_forward_days} days`
                : 'Yes — no cap'
              : 'No'}
          </Field>
          <Field label="Encashable">
            {t.is_encashable
              ? t.max_encashable_days != null
                ? `Yes — up to ${t.max_encashable_days} days`
                : 'Yes — no cap'
              : 'No'}
          </Field>
        </Section>
      )}

      <Section title="How it is applied">
        <Field label="Duration type">
          {LEAVE_DURATION_LABELS[t.duration_type] ?? t.duration_type}
        </Field>
        <Field label="Half day allowed">{yesNo(t.allow_half_day)}</Field>
        <Field label="Hourly allowed">{yesNo(t.allow_hourly)}</Field>
        <Field label="Skips weekends">{yesNo(t.skip_weekends)}</Field>
        <Field label="Skips holidays">{yesNo(t.skip_holidays)}</Field>
      </Section>

      <Section title="Approval and documents">
        <Field label="Requires approval">{yesNo(t.requires_approval)}</Field>
        <Field label="Minimum advance notice">
          {t.min_advance_notice_days > 0 ? `${t.min_advance_notice_days} days` : 'None'}
        </Field>
        <Field label="Max continuous days">{t.max_continuous_days}</Field>
        <Field label="Requires documents">{yesNo(t.requires_documents)}</Field>
        {t.requires_documents && (
          <Field label="Documents required after">
            {t.document_required_after_days != null
              ? `${t.document_required_after_days} days`
              : null}
          </Field>
        )}
      </Section>

      <Section title="Eligibility and validity">
        <Field label="Applies to">
          {APPLICABLE_GENDER_LABELS[t.applicable_gender] ?? t.applicable_gender}
        </Field>
        <Field label="Cadres">
          {t.applicable_cadre_ids?.length
            ? `${t.applicable_cadre_ids.length} selected`
            : 'All cadres'}
        </Field>
        <Field label="Valid from">{formatDate(t.valid_from)}</Field>
        <Field label="Valid until">{formatDate(t.valid_until) ?? 'No end date'}</Field>
      </Section>
    </div>
  );
}

interface LeaveTypeDetailDialogProps {
  /**
   * The row to show. The page deliberately does NOT clear this on close — see
   * `open`. Null only before the first row has ever been opened.
   */
  leaveType: HRLeaveType | null;
  /**
   * Visibility, kept SEPARATE from `leaveType` on purpose. Deriving it as
   * `!!leaveType` and nulling the row on close unmounts this component on the
   * same tick, so Radix/vaul never plays its exit transition and the modal
   * disappears instead of sliding away.
   */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  onEdit: (t: HRLeaveType) => void;
  onAssign: (t: HRLeaveType) => void;
}

export function LeaveTypeDetailDialog({
  leaveType: t,
  open,
  onOpenChange,
  canManage,
  onEdit,
  onAssign,
}: LeaveTypeDetailDialogProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (!t) return null;

  const title = (
    <span className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-full border"
        style={{ background: t.color_code }}
        aria-hidden
      />
      {t.leave_type_name}
    </span>
  );

  const description = `${
    REQUEST_CATEGORY_LABELS[t.request_category] ?? t.request_category
  } · ${t.leave_type_code}`;

  const actions = canManage ? (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button
        variant="outline"
        onClick={() => {
          onOpenChange(false);
          onAssign(t);
        }}
      >
        <Users className="mr-2 h-4 w-4" />
        Who gets this
      </Button>
      <Button
        onClick={() => {
          onOpenChange(false);
          onEdit(t);
        }}
      >
        <Pencil className="mr-2 h-4 w-4" />
        Edit
      </Button>
    </div>
  ) : null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-2">
            <LeaveTypeDetailContent t={t} />
          </div>
          <DrawerFooter>{actions}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <LeaveTypeDetailContent t={t} />
        {actions && <DialogFooter>{actions}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
