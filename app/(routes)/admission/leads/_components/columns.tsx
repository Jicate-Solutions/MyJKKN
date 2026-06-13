'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Flame, Star } from 'lucide-react';
import type { AdmissionLead } from '@/types/admission';
import type { AdmissionStatus } from '@/types/admission-status';
import { DataTableRowActions } from './row-actions';
import { SourceBadge, OverdueBadge } from './source-badge';
// BUG-003922 (Isvarya, Joint MD): the "Created" column was rendering MM/DD/YYYY
// because bare toLocaleDateString() inherits the runtime locale (en-US on Vercel).
// Route through the canonical DD/MM/YYYY helper.
import { formatDateDMY } from '@/lib/utils/date-format';
import { useAdmissionStatuses } from '@/hooks/admission/use-admission-statuses';

export const FUNNEL_STAGES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'not_reachable', label: 'Not Reachable' },
  { value: 'interested', label: 'Interested' },
  { value: 'follow_up_scheduled', label: 'Follow-up Scheduled' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'application_started', label: 'Application Started' },
  { value: 'application_submitted', label: 'Application Submitted' },
  { value: 'documents_pending', label: 'Documents Pending' },
  { value: 'documents_verified', label: 'Documents Verified' },
  { value: 'interview_scheduled', label: 'Interview Scheduled' },
  { value: 'interview_completed', label: 'Interview Completed' },
  { value: 'offer_sent', label: 'Offer Sent' },
  { value: 'offer_accepted', label: 'Offer Accepted' },
  { value: 'token_paid', label: 'Token Paid' },
  { value: 'applied', label: 'Applied' },
  { value: 'offered', label: 'Offered' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
  { value: 'withdrew', label: 'Withdrew' },
  { value: 'expired', label: 'Expired' },
  { value: 'lost', label: 'Lost' },
  { value: 'dormant', label: 'Dormant' }
];

// FALLBACK color map — used by non-hook contexts (static cell renderers, exports).
// Dynamic colors from admission_statuses are preferred; use LeadStageBadge
// or pass the statuses list to getStageColor when inside a React component.
export function getStageColor(stage: string | null): string {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800',
    contacted: 'bg-indigo-100 text-indigo-800',
    not_reachable: 'bg-slate-100 text-slate-800',
    interested: 'bg-sky-100 text-sky-800',
    follow_up_scheduled: 'bg-violet-100 text-violet-800',
    engaged: 'bg-fuchsia-100 text-fuchsia-800',
    qualified: 'bg-purple-100 text-purple-800',
    application_started: 'bg-pink-100 text-pink-800',
    application_submitted: 'bg-rose-100 text-rose-800',
    documents_pending: 'bg-orange-100 text-orange-800',
    documents_verified: 'bg-amber-100 text-amber-800',
    interview_scheduled: 'bg-yellow-100 text-yellow-800',
    interview_completed: 'bg-lime-100 text-lime-800',
    offer_sent: 'bg-green-100 text-green-800',
    offer_accepted: 'bg-emerald-100 text-emerald-800',
    token_paid: 'bg-teal-100 text-teal-800',
    applied: 'bg-violet-100 text-violet-800',
    offered: 'bg-orange-100 text-orange-800',
    enrolled: 'bg-cyan-100 text-cyan-800',
    confirmed: 'bg-green-100 text-green-800',
    declined: 'bg-red-100 text-red-800',
    withdrew: 'bg-red-100 text-red-800',
    expired: 'bg-gray-100 text-gray-800',
    lost: 'bg-gray-100 text-gray-800',
    dormant: 'bg-stone-100 text-stone-800'
  };
  return colors[stage || 'new'] || 'bg-gray-100 text-gray-800';
}

/**
 * Renders a stage badge using the dynamic color from admission_statuses.
 * Falls back to the static Tailwind color map when the hook hasn't resolved yet
 * or when the code is not found in the dynamic list.
 *
 * Always prefer this component over a raw <Badge className={getStageColor(...)}> in
 * React render trees — it will automatically pick up colour changes made in the
 * Admission Statuses admin panel without a deploy.
 */
export function LeadStageBadge({ stage }: { stage: string | null | undefined }) {
  const { data: statuses } = useAdmissionStatuses('lead', { activeOnly: false });
  const code = stage || 'new';
  const found = statuses?.find((s: AdmissionStatus) => s.code === code);

  if (found) {
    return (
      <Badge
        variant="outline"
        className="border capitalize"
        style={{
          backgroundColor: `${found.color}18`,
          color: found.color,
          borderColor: `${found.color}40`,
        }}
      >
        {found.label}
      </Badge>
    );
  }

  // Fallback: hook not yet resolved or code unknown — use static map
  return (
    <Badge className={`${getStageColor(code)} border`} variant="outline">
      {code.replace(/_/g, ' ')}
    </Badge>
  );
}

/**
 * Dynamic version of FUNNEL_STAGES: reads from admission_statuses (scope='lead',
 * active only). Falls back to the hardcoded FUNNEL_STAGES array while the query
 * is loading or if it returns no rows, so callers never see an empty dropdown.
 *
 * Note: this is a hook — only callable from React components / other hooks
 * (rules of hooks). Cell-level `cell:` callbacks in column defs cannot use
 * hooks; those should keep using getStageColor + FUNNEL_STAGES directly until
 * the renderer is migrated to a component.
 */
export function useLeadStageOptions(): typeof FUNNEL_STAGES {
  const { data } = useAdmissionStatuses('lead', { activeOnly: true });
  if (!data || data.length === 0) return FUNNEL_STAGES;
  return data.map((s) => ({ value: s.code, label: s.label })) as typeof FUNNEL_STAGES;
}

// FALLBACK label resolver — accepts an optional dynamic statuses list.
// When statuses are available (e.g. passed from a hook caller), dynamic labels
// are preferred. Falls back to the static FUNNEL_STAGES array when not provided.
export function getStageLabel(stage: string | null, statuses?: AdmissionStatus[]): string {
  if (statuses?.length) {
    const found = statuses.find((s) => s.code === stage);
    if (found) return found.label;
  }
  const found = FUNNEL_STAGES.find((s) => s.value === stage);
  return found ? found.label : stage?.replace(/_/g, ' ') || 'New';
}

export function getLeadColumns(
  attributionsMap: Map<string, string> = new Map(),
  currentUser?: { id?: string | null; counselorId?: string | null }
): ColumnDef<AdmissionLead>[] {
  return [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) =>
          table.toggleAllPageRowsSelected(!!value)
        }
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    maxSize: 50,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
  },
  {
    accessorKey: 'full_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Lead Name" />
    ),
    cell: ({ row }) => {
      const lead = row.original;
      return (
        <div className="flex flex-col gap-1">
          <Link
            href={`/admission/leads/${lead.id}`}
            className="flex items-center gap-2 hover:text-primary font-medium"
          >
            <span>{lead.full_name || 'Unknown'}</span>
            {lead.is_hot_lead && (
              <Flame className="h-4 w-4 text-orange-500 shrink-0" />
            )}
            {lead.is_priority && !lead.is_hot_lead && (
              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />
            )}
          </Link>
          <div className="flex flex-wrap gap-1">
            <SourceBadge source={lead.source} />
            <OverdueBadge nextFollowupAt={lead.next_followup_at} />
          </div>
        </div>
      );
    },
    size: 250,
    minSize: 180
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Contact" />
    ),
    cell: ({ row }) => {
      const lead = row.original;
      return (
        <div className="flex flex-col">
          {lead.email && <span className="text-sm">{lead.email}</span>}
          {lead.phone && (
            <span className="text-sm text-muted-foreground">{lead.phone}</span>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: 'funnel_stage',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Stage" />
    ),
    cell: ({ row }) => {
      const stage = row.getValue('funnel_stage') as string | null;
      return <LeadStageBadge stage={stage} />;
    }
  },
  {
    id: 'institution',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Institution" />
    ),
    cell: ({ row }) => {
      const name = row.original.institution?.name;
      return name
        ? <span className="text-sm">{name}</span>
        : <span className="text-sm text-muted-foreground">-</span>;
    },
    size: 200,
    minSize: 140
  },
  {
    id: 'interested_courses',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Interested Courses" />
    ),
    cell: ({ row }) => {
      const names = row.original.interested_program_names || [];
      if (!names.length) return <span className="text-sm text-muted-foreground">-</span>;

      return (
        <div className="flex flex-wrap gap-1 max-w-[260px]">
          {names.slice(0, 2).map((label, idx) => (
            <Badge key={idx} variant="outline" className="text-xs font-normal">
              {label}
            </Badge>
          ))}
          {names.length > 2 && (
            <Badge variant="secondary" className="text-xs font-normal">
              +{names.length - 2}
            </Badge>
          )}
        </div>
      );
    },
    size: 280,
    minSize: 180
  },
  {
    accessorKey: 'source',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Source" />
    ),
    cell: ({ row }) => {
      const source = row.getValue('source') as string | null;
      if (source === 'admission_form') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Admission Form
          </span>
        );
      }
      return (
        <span className="text-sm text-muted-foreground">
          {source?.replace(/_/g, ' ') || '-'}
        </span>
      );
    }
  },
  {
    id: 'assigned_to',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Assigned To" />
    ),
    cell: ({ row }) => {
      const lead = row.original;
      const isReferral = lead.source === 'referral';
      if (isReferral) {
        const consultantName = attributionsMap.get(lead.id);
        return consultantName
          ? <span className="text-sm">{consultantName} <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">Consultant</Badge></span>
          : <span className="text-sm text-muted-foreground">No consultant</span>;
      }
      // "Assigned to you" — when the row is assigned to the current counselor.
      // Reporters (correctly-scoped strict counselors) read the assignee column
      // as "another facilitator is on my lead" because it renders the canonical
      // counselor display name, which differs from their self-image. Surfacing
      // an explicit badge resolves the confusion.
      const assignedToMe =
        (!!currentUser?.counselorId && lead.counselor_id === currentUser.counselorId) ||
        (!!currentUser?.id && (lead as any).assigned_counselor_id === currentUser.id);
      if (assignedToMe) {
        return (
          <span className="text-sm">
            {lead.counselor?.name || 'You'}{' '}
            <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">Assigned to you</Badge>
          </span>
        );
      }
      return lead.counselor?.name
        ? <span className="text-sm">{lead.counselor.name} <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">Counselor</Badge></span>
        : <span className="text-sm text-muted-foreground">Unassigned</span>;
    }
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      return formatDateDMY(date);
    }
  },

  {
    id: 'actions',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Actions" />
    ),
    cell: ({ row }) => <DataTableRowActions row={row} />
  }
  ];
}

// Backward-compatible default export for any other imports
export const columns = getLeadColumns();
