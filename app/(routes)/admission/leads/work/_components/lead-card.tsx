'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Flame,
  Phone,
  Clock,
  AlertTriangle,
  User,
  GraduationCap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LeadCardProps {
  lead: {
    id: string;
    full_name: string | null;
    phone: string;
    email?: string | null;
    funnel_stage: string | null;
    score?: number | null;
    score_category?: string | null;
    is_hot_lead?: boolean;
    source?: string | null;
    // 2026-04-21 — new split: primary FK + alternatives multi. Legacy interested_programs kept as fallback.
    program_id?: string | null;
    program?: { id: string; program_name: string } | null;
    alternative_programs?: string[] | null;
    interested_programs?: string[] | null;
    last_contact_at?: string | null;
    next_followup_at?: string | null;
    parent_name?: string | null;
    parent_phone?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Relative time string from an ISO date. */
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (Number.isNaN(then)) return 'unknown';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  return `${months}mo ago`;
}

/** Friendly future-relative string (e.g. "Tomorrow 10am", "In 3 days"). */
function timeUntil(dateStr: string): { label: string; overdue: boolean } {
  const now = new Date();
  const target = new Date(dateStr);

  if (Number.isNaN(target.getTime())) return { label: 'unknown', overdue: false };

  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    // Overdue
    const overdueDays = Math.abs(diffDays);
    if (overdueDays === 0) return { label: 'Today (overdue)', overdue: true };
    if (overdueDays === 1) return { label: 'Yesterday', overdue: true };
    return { label: `${overdueDays}d overdue`, overdue: true };
  }

  // Future
  const hours = target.getHours();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHour = hours % 12 || 12;
  const timeStr = `${displayHour}${ampm}`;

  if (diffDays === 0) return { label: `Today ${timeStr}`, overdue: false };
  if (diffDays === 1) return { label: `Tomorrow ${timeStr}`, overdue: false };
  if (diffDays < 7) return { label: `In ${diffDays} days`, overdue: false };
  return { label: target.toLocaleDateString(), overdue: false };
}

/** Score badge background + text color. */
function getScoreStyle(score: number, category?: string | null) {
  const cat = category || (score >= 75 ? 'hot' : score >= 50 ? 'warm' : score >= 25 ? 'cool' : 'cold');
  switch (cat) {
    case 'hot':
      return 'bg-red-100 text-red-700';
    case 'warm':
      return 'bg-orange-100 text-orange-700';
    case 'cool':
      return 'bg-cyan-100 text-cyan-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

/** Source badge color mapping. */
function getSourceStyle(source: string): string {
  const map: Record<string, string> = {
    facebook_ads: 'bg-blue-100 text-blue-700',
    facebook: 'bg-blue-100 text-blue-700',
    google_ads: 'bg-red-100 text-red-700',
    google: 'bg-red-100 text-red-700',
    referral: 'bg-green-100 text-green-700',
    walk_in: 'bg-orange-100 text-orange-700',
    walkin: 'bg-orange-100 text-orange-700',
    education_fair: 'bg-purple-100 text-purple-700',
    expo: 'bg-purple-100 text-purple-700',
    website: 'bg-indigo-100 text-indigo-700',
    instagram: 'bg-pink-100 text-pink-700',
    instagram_ads: 'bg-pink-100 text-pink-700',
    youtube: 'bg-red-100 text-red-700',
    whatsapp: 'bg-emerald-100 text-emerald-700',
    newspaper: 'bg-amber-100 text-amber-700',
    tv_ad: 'bg-violet-100 text-violet-700',
    radio: 'bg-yellow-100 text-yellow-700',
    direct_call: 'bg-teal-100 text-teal-700',
    sms_campaign: 'bg-lime-100 text-lime-700',
    alumni: 'bg-cyan-100 text-cyan-700',
    consultant: 'bg-fuchsia-100 text-fuchsia-700',
  };
  return map[source] || 'bg-gray-100 text-gray-600';
}

/** Prettify source label. */
function formatSource(source: string): string {
  return source
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Prettify stage label. */
function formatStage(stage: string): string {
  return stage
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Stage badge color (matching columns.tsx palette). */
function getStageStyle(stage: string): string {
  const map: Record<string, string> = {
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
    enrolled: 'bg-cyan-100 text-cyan-800',
    confirmed: 'bg-green-100 text-green-800',
    declined: 'bg-red-100 text-red-800',
    withdrew: 'bg-red-100 text-red-800',
    lost: 'bg-gray-100 text-gray-800',
    dormant: 'bg-stone-100 text-stone-800',
  };
  return map[stage] || 'bg-gray-100 text-gray-700';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LeadCard({ lead }: LeadCardProps) {
  const score = lead.score ?? null;
  const scoreCategory = lead.score_category ?? null;
  // 2026-04-21 — primary program from resolved join; legacy interested_programs[0] as fallback.
  const primaryProgramLabel =
    lead.program?.program_name ??
    (lead.interested_programs && lead.interested_programs.length > 0
      ? lead.interested_programs[0]
      : null);
  // Alternative count = alternative_programs length, OR for legacy rows the
  // remaining interested_programs entries after the first (which we used as primary fallback).
  const alternativeCount = lead.alternative_programs
    ? lead.alternative_programs.length
    : Math.max(0, (lead.interested_programs?.length ?? 0) - 1);

  const followup = lead.next_followup_at
    ? timeUntil(lead.next_followup_at)
    : null;

  return (
    <Card className="w-full active:scale-[0.98] transition-transform duration-100">
      <CardContent className="p-3.5 space-y-2">
        {/* Row 1 — Name + Score */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-foreground truncate leading-tight">
            {lead.full_name || 'Unknown Lead'}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {score !== null && (
              <span
                className={`text-xs font-semibold px-1.5 py-0.5 rounded ${getScoreStyle(score, scoreCategory)}`}
              >
                {score}
              </span>
            )}
            {lead.is_hot_lead && (
              <Flame className="h-4 w-4 text-orange-500 shrink-0" />
            )}
          </div>
        </div>

        {/* Row 2 — Phone + Hot Lead badge */}
        <div className="flex items-center justify-between gap-2">
          <a
            href={`tel:${lead.phone}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{lead.phone}</span>
          </a>
          {lead.is_hot_lead && (
            <Badge
              variant="destructive"
              className="text-[10px] px-1.5 py-0 h-5 gap-0.5 shrink-0"
            >
              <Flame className="h-3 w-3" />
              Hot Lead
            </Badge>
          )}
        </div>

        {/* Row 3 — Stage + Source badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {lead.funnel_stage && (
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 h-5 ${getStageStyle(lead.funnel_stage)}`}
            >
              {formatStage(lead.funnel_stage)}
            </Badge>
          )}
          {lead.source && (
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 h-5 ${getSourceStyle(lead.source)}`}
            >
              {formatSource(lead.source)}
            </Badge>
          )}
        </div>

        {/* Row 4 — Interested program + alternatives count */}
        {primaryProgramLabel && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GraduationCap className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {primaryProgramLabel}
              {alternativeCount > 0 && (
                <span className="text-muted-foreground/70">
                  {' '}
                  +{alternativeCount} alternative{alternativeCount === 1 ? '' : 's'}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Row 5 — Last contact */}
        {lead.last_contact_at && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Last contact: {timeAgo(lead.last_contact_at)}</span>
          </div>
        )}

        {/* Row 6 — Next follow-up */}
        {followup && (
          <div
            className={`flex items-center gap-1.5 text-xs ${
              followup.overdue
                ? 'text-amber-700 font-medium'
                : 'text-muted-foreground'
            }`}
          >
            {followup.overdue ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            ) : (
              <Clock className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              Follow-up: {followup.label}
              {followup.overdue && (
                <span className="ml-1 text-amber-600">Overdue</span>
              )}
            </span>
          </div>
        )}

        {/* Row 7 — Parent info (conditional) */}
        {lead.parent_name && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 pt-0.5 border-t border-border/50">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">
              Parent: {lead.parent_name}
              {lead.parent_phone && (
                <>
                  {' | '}
                  <a
                    href={`tel:${lead.parent_phone}`}
                    className="underline underline-offset-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {lead.parent_phone}
                  </a>
                </>
              )}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
