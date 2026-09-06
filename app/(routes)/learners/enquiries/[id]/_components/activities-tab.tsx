'use client';

// app/(routes)/learners/enquiries/[id]/_components/activities-tab.tsx
//
// "Activities" tab for the enquiry edit page. Renders:
//   - The NotesAndMemoCapture panel on top (only when user can create)
//   - A reverse-chronological timeline of activities below
//
// Single source of truth is admission_lead_activities — the API endpoint
// /api/admission/enquiries/[id]/activities resolves the lead via
// learner_profile_id and reads/writes that table.

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  Mic,
  StickyNote,
  TrendingUp,
  Pencil,
  UserPlus,
  FileText,
  Landmark,
} from 'lucide-react';
import { formatDateTimeDMY } from '@/lib/utils/date-format';
import { NotesAndMemoCapture } from '@/components/admission/notes-and-memo-capture';
import { usePermissions } from '@/hooks/use-permissions';

interface ActivityRow {
  id: string;
  activity_type: string;
  subject: string | null;
  description: string | null;
  outcome: string | null;
  voice_memo_url: string | null;
  voice_memo_duration_sec: number | null;
  created_by: string | null;
  created_at: string;
  creator?: { full_name?: string | null; email?: string | null } | null;
}

interface ActivitiesTabProps {
  learnerProfileId: string;
  institutionId: string;
}

// Map activity_type → icon + tint class for visual scanning. The tint follows
// the project palette: each activity type gets a soft pastel background +
// matching text color so the icon column reads as a scannable column on the
// left of the timeline at a glance.
const TYPE_VISUAL: Record<string, { Icon: typeof Activity; tint: string; label: string }> = {
  note:                 { Icon: StickyNote, tint: 'bg-blue-100 text-blue-700',         label: 'Note' },
  voice_memo:           { Icon: Mic,        tint: 'bg-purple-100 text-purple-700',     label: 'Voice memo' },
  manual_edit:          { Icon: Pencil,     tint: 'bg-amber-100 text-amber-700',       label: 'Edit' },
  student_section_filled: { Icon: FileText, tint: 'bg-emerald-100 text-emerald-700',   label: 'Form section' },
  // 2026-05-20: Summary activity emitted by StudentFormService on final submit.
  enquiry_submitted:    { Icon: FileText,   tint: 'bg-purple-100 text-purple-700',     label: 'Enquiry submitted' },
  lead_stage_change:    { Icon: TrendingUp, tint: 'bg-indigo-100 text-indigo-700',     label: 'Stage change' },
  lead_converted:       { Icon: UserPlus,   tint: 'bg-green-100 text-green-700',       label: 'Lead converted' },
  // 2026-05-20: Distinct visual for the Move-to-Counselor audit row written
  // by the leads detail page. Reuses the lead_converted icon (UserPlus) but
  // bumps to a stronger green so it stands out on the timeline.
  moved_to_counselor:   { Icon: UserPlus,   tint: 'bg-emerald-100 text-emerald-800',   label: 'Moved to counselor' },
  // 2026-05-20: Lead creation audit — written by LeadService.runCreateSideEffects
  // and LeadService.createGateEntry. Surfaces the lead's first touch on the
  // timeline so officers can see when (and from where) it entered the system.
  lead_created:         { Icon: UserPlus,   tint: 'bg-blue-100 text-blue-700',         label: 'Lead created' },
  // 2026-05-21: Verified account transition — written by
  // AccountVerificationDialog after the admin ticks every academic
  // dimension and confirms. Distinct amber tint so reviewers can spot
  // verified vs unverified transitions on a scrolling timeline.
  moved_to_account_verified: { Icon: Landmark, tint: 'bg-amber-100 text-amber-800',    label: 'Moved to account (verified)' },
};

function getVisual(type: string) {
  return (
    TYPE_VISUAL[type] ?? {
      Icon: Activity,
      tint: 'bg-gray-100 text-gray-700',
      label: type.replace(/_/g, ' '),
    }
  );
}

// UUID and ISO-timestamp patterns. Used to strip noise from legacy audit
// descriptions where these were embedded inline.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// Keys we never show on the timeline card. These are either redundant with
// other UI surface (the card header already shows the timestamp) or
// machine-only audit fields whose value is a UUID. created_by + FK columns
// on admission_lead_activities continue to hold the canonical record.
const HIDDEN_KEYS = new Set(
  ['user id', 'new learner profile', 'profile id', 'lead id', 'moved at'].map((s) => s.toLowerCase()),
);

/**
 * Parse a description string into key/value rows when it follows the
 * `Key: value · Key: value` convention used by audit activities (e.g.
 * Moved-to-Counselor). For free-text descriptions (notes, edits) the regex
 * yields zero matches and we fall back to rendering the raw string.
 *
 * Filters out (1) the HIDDEN_KEYS list above, (2) values that look like raw
 * UUIDs, and (3) values that look like ISO timestamps. This way legacy
 * activity rows already in the DB (which carry the full UUID-laden
 * description) render cleanly on the new layout WITHOUT a data backfill.
 */
function parseStructuredDescription(
  raw: string | null,
): Array<{ key: string; value: string }> | null {
  if (!raw) return null;
  const segments = raw.split('·').map((s) => s.trim()).filter(Boolean);
  const rows: Array<{ key: string; value: string }> = [];
  for (const seg of segments) {
    const m = seg.match(/^([^:]+):\s*(.+)$/);
    if (!m) return null; // non-structured segment found — bail out
    const key = m[1].trim();
    const value = m[2].trim();
    if (HIDDEN_KEYS.has(key.toLowerCase())) continue;
    if (UUID_RE.test(value)) continue;
    if (ISO_TS_RE.test(value)) continue;
    rows.push({ key, value });
  }
  // At least two key:value pairs to qualify as "structured" — single colons
  // in free-text like "Reminder: call back tomorrow" shouldn't render as a
  // table.
  return rows.length >= 2 ? rows : null;
}

function TimelineRow({ activity }: { activity: ActivityRow }) {
  const { Icon, tint, label } = getVisual(activity.activity_type);
  const author =
    activity.creator?.full_name ||
    activity.creator?.email ||
    (activity.created_by ? 'Unknown user' : 'System');
  const structured = parseStructuredDescription(activity.description);
  const subject =
    activity.subject ?? activity.activity_type.replace(/_/g, ' ');

  return (
    <div className="flex gap-3">
      {/* Icon disc — sized to align with the card's header row */}
      <div className="flex-shrink-0 pt-1">
        <div
          className={`h-9 w-9 rounded-full flex items-center justify-center ${tint}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>

      {/* Card body */}
      <div className="flex-1 min-w-0">
        <div className="rounded-md border bg-card px-3 py-2.5 shadow-sm">
          {/* Header — subject + type chip + timestamp */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold leading-tight capitalize">
                {subject}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatDateTimeDMY(activity.created_at)}
              </p>
            </div>
            {/* Badge inherits the same tint as the icon disc so the chip
             *  reads as a colour-coded type label rather than a neutral
             *  outline. `border-transparent` prevents the default outline
             *  variant's hairline from washing out the soft pastel. */}
            <Badge
              variant="outline"
              className={`shrink-0 text-[10px] uppercase tracking-wide border-transparent ${tint}`}
            >
              {label}
            </Badge>
          </div>

          {/* Description — structured (key/value rows) when it parses cleanly,
           *  otherwise the raw string as before. The structured branch hides
           *  raw UUIDs from view while keeping created_by + FK columns
           *  intact for the audit trail. */}
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
          ) : activity.description ? (
            <p className="mt-2 text-sm text-foreground whitespace-pre-wrap break-words">
              {activity.description}
            </p>
          ) : null}

          {/* Optional voice memo player */}
          {activity.voice_memo_url && (
            <audio
              controls
              src={activity.voice_memo_url}
              className="mt-2 w-full max-w-sm h-10"
              preload="none"
            >
              Your browser does not support audio playback.
            </audio>
          )}

          {/* Footer — who performed the action */}
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">{author}</span>
            {activity.voice_memo_duration_sec && (
              <>
                <span aria-hidden>·</span>
                <span>{activity.voice_memo_duration_sec}s</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActivitiesTab({ learnerProfileId, institutionId }: ActivitiesTabProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canCreate =
    isSuperAdmin || canAccess('admission.enquiries.activities', 'create');

  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admission/enquiries/${encodeURIComponent(learnerProfileId)}/activities`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'fetch failed');
      }
      const data = await res.json();
      setActivities(data.activities ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activities');
    } finally {
      setLoading(false);
    }
  }, [learnerProfileId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  return (
    <div className="space-y-4">
      {canCreate && (
        <NotesAndMemoCapture
          learnerProfileId={learnerProfileId}
          institutionId={institutionId}
          onSaved={fetchActivities}
        />
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Activity Timeline</CardTitle>
          <CardDescription>
            All updates to this enquiry — student submissions, profile edits, notes, voice memos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive text-sm">
              {error}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No activity recorded yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((a) => (
                <TimelineRow key={a.id} activity={a} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
