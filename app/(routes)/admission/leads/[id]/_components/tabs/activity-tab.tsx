'use client';

// ════════════════════════════════════════════════════════════════════════════
// Activity Tab
// Renders the timeline (activities + stage changes) for a lead. Extracted from
// page.tsx as part of the monolith reduction (PR-D / phase 1).
// 2026-05-20: Card layout matches the enquiries-page activities-tab.tsx so
// the lead detail and learner detail surfaces are visually consistent.
// Two-column key/value description + hidden-UUID filter ported from there.
// ════════════════════════════════════════════════════════════════════════════

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Phone, Mail, Calendar, MessageSquare, TrendingUp, Target, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TimelineEntry } from '@/lib/services/admission/activity-service';
import { formatDateTimeDMY } from '@/lib/utils/date-format';

const timelineIcons: Record<string, typeof Activity> = {
  phone: Phone,
  mail: Mail,
  calendar: Calendar,
  'file-text': Activity,
  'message-square': MessageSquare,
  'message-circle': MessageSquare,
  'git-branch': TrendingUp,
  'check-circle': Target,
  // 'user-plus' is emitted by activity-service for the audit activity types
  // lead_created and moved_to_counselor — surfaces the lead's provenance on
  // the timeline.
  'user-plus': UserPlus,
  activity: Activity
};

const timelineColors: Record<string, string> = {
  green: 'bg-green-100 text-green-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  gray: 'bg-gray-100 text-gray-700',
  orange: 'bg-orange-100 text-orange-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  emerald: 'bg-emerald-100 text-emerald-700'
};

// UUID and ISO-timestamp patterns — used to strip noise from legacy audit
// descriptions where these were embedded inline. Mirrors the helper in the
// enquiries-page activities-tab.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// Keys never shown on the timeline card. Either redundant with other UI
// surface (the card header already shows the timestamp) or machine-only audit
// fields whose value is a UUID. created_by + FK columns on
// admission_lead_activities still hold the canonical record.
const HIDDEN_KEYS = new Set(
  ['user id', 'new learner profile', 'profile id', 'lead id', 'moved at'].map((s) => s.toLowerCase()),
);

/**
 * Parse a description string into key/value rows when it follows the
 * `Key: value · Key: value` convention used by audit activities (e.g.
 * Moved-to-Counselor). Returns null for free-text descriptions so the caller
 * falls back to plain-paragraph rendering. Filters HIDDEN_KEYS + raw UUIDs +
 * ISO timestamps so legacy rows render cleanly without a data backfill.
 */
function parseStructuredDescription(
  raw: string | null,
): Array<{ key: string; value: string }> | null {
  if (!raw) return null;
  const segments = raw.split('·').map((s) => s.trim()).filter(Boolean);
  const rows: Array<{ key: string; value: string }> = [];
  for (const seg of segments) {
    const m = seg.match(/^([^:]+):\s*(.+)$/);
    if (!m) return null;
    const key = m[1].trim();
    const value = m[2].trim();
    if (HIDDEN_KEYS.has(key.toLowerCase())) continue;
    if (UUID_RE.test(value)) continue;
    if (ISO_TS_RE.test(value)) continue;
    rows.push({ key, value });
  }
  return rows.length >= 2 ? rows : null;
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const IconComponent = timelineIcons[entry.icon || 'activity'] || Activity;
  const colorClass = timelineColors[entry.color || 'gray'] || timelineColors.gray;

  // Author label: prefer full_name, then email, then a fallback. The
  // 'Unknown user' case happens when created_by/changed_by points at a
  // profile row that's been deleted (audit-table soft FK pattern).
  // 'System' covers null author (e.g., trigger-written rows).
  const authorLabel = entry.author
    ? entry.author.full_name || entry.author.email || 'Unknown user'
    : 'System';

  const structured = parseStructuredDescription(entry.description);

  return (
    <div className="flex gap-3">
      {/* Icon disc — sized to align with the card's header row */}
      <div className="flex-shrink-0 pt-1">
        <div
          className={`h-9 w-9 rounded-full flex items-center justify-center ${colorClass}`}
        >
          <IconComponent className="h-4 w-4" />
        </div>
      </div>

      {/* Card body */}
      <div className="flex-1 min-w-0">
        <div className="rounded-md border bg-card px-3 py-2.5 shadow-sm">
          {/* Header — subject + type chip + timestamp */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold leading-tight capitalize">
                {entry.title}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatDateTimeDMY(entry.timestamp)}
              </p>
            </div>
            {/* Badge inherits the same tint as the icon disc so the chip
             *  reads as a colour-coded type label rather than a neutral
             *  outline. `border-transparent` prevents the default outline
             *  variant's hairline from washing out the soft pastel. */}
            <Badge
              variant="outline"
              className={`shrink-0 text-[10px] uppercase tracking-wide border-transparent ${colorClass}`}
            >
              {entry.type === 'stage_change' ? 'Stage change' : 'Activity'}
            </Badge>
          </div>

          {/* Description — structured (key/value rows) when the audit string
           *  parses cleanly, otherwise plain prose. Structured branch strips
           *  UUIDs / timestamps from view; created_by + FK columns are still
           *  recorded at the row level. */}
          {structured ? (
            <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
              {structured.map((row) => (
                <div key={row.key} className="contents">
                  <dt className="text-xs font-medium text-muted-foreground pt-0.5">
                    {row.key}
                  </dt>
                  <dd className="text-sm text-foreground break-words">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : entry.description ? (
            <p className="mt-2 text-sm text-foreground whitespace-pre-wrap break-words">
              {entry.description}
            </p>
          ) : null}

          {/* Footer — who performed the action */}
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">{authorLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ActivityTabProps {
  timeline: TimelineEntry[];
  timelineLoading: boolean;
}

export function ActivityTab({ timeline, timelineLoading }: ActivityTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity Timeline</CardTitle>
        <CardDescription>Recent activities for this lead</CardDescription>
      </CardHeader>
      <CardContent>
        {timelineLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : timeline.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No activity recorded yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {timeline.map((entry) => (
              <TimelineItem key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
