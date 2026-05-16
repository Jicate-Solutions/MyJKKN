'use client';

/**
 * LeadHeader — mobile-first compact header for /admission/leads/[id].
 *
 * Replaces the legacy 5-stacked-row mobile header (raw UUID breadcrumb,
 * name+button cramping, untappable phone) with 2 rows:
 *   Row 1 — single Breadcrumb: Dashboard > Admission > Leads > {full_name}
 *   Row 2 — h1 name (full width on mobile) + meta line (email, tappable phone,
 *           connection indicator) + Hot/Priority chips that wrap below name on
 *           narrow viewports and align right on md+.
 *
 * Director's #1 audit finding: phone number must be one-tap dial via
 * <a href="tel:..."> for iOS/Android.
 *
 * Read-only cascaded view (Phase 6 spec #14) is honored by disabling the
 * Mark Hot / Mark Priority buttons via pointer-events-none + opacity-50.
 */

import Link from 'next/link';
import { ArrowLeft, Flame, Mail, Phone, ScanLine, Star } from 'lucide-react';
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
import { LeadInlineConnectionIndicator } from '@/components/whatsapp/lead-inline-connection-indicator';

export interface LeadHeaderProps {
  lead: {
    id: string;
    full_name: string | null;
    email?: string | null;
    phone: string | null;
    department_id?: string | null;
    is_hot_lead?: boolean | null;
    is_priority?: boolean | null;
    first_gate_entry_at?: string | null;
    gate_entry_count?: number | null;
  };
  isHot: boolean;
  onMarkHot: () => void;
  isPriority: boolean;
  onMarkPriority: () => void;
  /** Phase 6 spec #14 — when true, write-actions are visually disabled. */
  isReadonlyCascadedView?: boolean;
  /** Counselor name shown on the read-only cascade badge. */
  readonlyReassignedTo?: string | null;
}

export function LeadHeader({
  lead,
  isHot,
  onMarkHot,
  isPriority,
  onMarkPriority,
  isReadonlyCascadedView = false,
  readonlyReassignedTo,
}: LeadHeaderProps) {
  const fullName = lead.full_name || 'Unknown';
  const gateCount = lead.gate_entry_count ?? 0;

  return (
    <div className="space-y-3">
      {/* Row 1 — Single breadcrumb showing lead's full name (not UUID). */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/leads">Leads</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-[180px] truncate sm:max-w-none">
              {fullName}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Row 2 — Hero block. Mobile-first: name on its own row, meta line below,
          status chips wrap. Md+: back-button + name on left, action chips on right. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="outline" size="icon" asChild className="shrink-0">
            <Link href="/admission/leads" aria-label="Back to leads">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-tight break-words">
              {fullName}
            </h1>

            {/* Meta line — email, tappable phone, connection indicator. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{lead.email}</span>
                </a>
              )}
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                  aria-label={`Call ${fullName} at ${lead.phone}`}
                >
                  <Phone className="h-3 w-3 shrink-0" />
                  <span>{lead.phone}</span>
                </a>
              )}
              <LeadInlineConnectionIndicator departmentId={lead.department_id ?? undefined} />
            </div>

            {/* Status chips — wrap below name on mobile. */}
            <div className="flex flex-wrap gap-1 mt-2">
              {lead.is_hot_lead && (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                  <Flame className="h-3 w-3 mr-1" />
                  Hot
                </Badge>
              )}
              {lead.is_priority && !lead.is_hot_lead && (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                  <Star className="h-3 w-3 mr-1 fill-current" />
                  Priority
                </Badge>
              )}
              {lead.first_gate_entry_at && (
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200"
                  title={`First gate entry: ${new Date(lead.first_gate_entry_at).toLocaleString('en-IN')}${
                    gateCount > 1 ? ` · Visits: ${gateCount}` : ''
                  }`}
                >
                  <ScanLine className="h-3 w-3 mr-1" />
                  Came via Gate
                  {gateCount > 1 && (
                    <span className="ml-1 text-[10px] font-normal">×{gateCount}</span>
                  )}
                </Badge>
              )}
              {isReadonlyCascadedView && readonlyReassignedTo && (
                <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300">
                  Reassigned to {readonlyReassignedTo} — read-only
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Mark Hot + Mark Priority chips — drop below name on mobile, sit at right on md+. */}
        <div
          className={`flex flex-wrap items-center gap-2 md:shrink-0 ${
            isReadonlyCascadedView ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          <Button
            variant={isHot ? 'default' : 'outline'}
            size="sm"
            onClick={onMarkHot}
          >
            <Flame className="h-4 w-4 mr-1" />
            {isHot ? 'Hot' : 'Mark Hot'}
          </Button>
          <Button
            variant={isPriority ? 'default' : 'outline'}
            size="sm"
            onClick={onMarkPriority}
          >
            <Star className="h-4 w-4 mr-1" />
            {isPriority ? 'Priority' : 'Mark Priority'}
          </Button>
        </div>
      </div>
    </div>
  );
}
