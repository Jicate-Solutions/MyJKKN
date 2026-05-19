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

// Map activity_type → icon + tint class for visual scanning
const TYPE_VISUAL: Record<string, { Icon: typeof Activity; tint: string }> = {
  note: { Icon: StickyNote, tint: 'bg-blue-100 text-blue-700' },
  voice_memo: { Icon: Mic, tint: 'bg-purple-100 text-purple-700' },
  manual_edit: { Icon: Pencil, tint: 'bg-amber-100 text-amber-700' },
  student_section_filled: { Icon: FileText, tint: 'bg-emerald-100 text-emerald-700' },
  // 2026-05-20: Summary activity emitted by StudentFormService on final submit.
  // Strong visual so officers can spot completed enquiries on scrolling timelines.
  enquiry_submitted: { Icon: FileText, tint: 'bg-purple-100 text-purple-700' },
  lead_stage_change: { Icon: TrendingUp, tint: 'bg-indigo-100 text-indigo-700' },
  lead_converted: { Icon: UserPlus, tint: 'bg-green-100 text-green-700' },
};

function getVisual(type: string) {
  return TYPE_VISUAL[type] ?? { Icon: Activity, tint: 'bg-gray-100 text-gray-700' };
}

function TimelineRow({ activity }: { activity: ActivityRow }) {
  const { Icon, tint } = getVisual(activity.activity_type);
  const author =
    activity.creator?.full_name ||
    activity.creator?.email ||
    (activity.created_by ? 'Unknown user' : 'System');

  return (
    <div className="flex gap-3 pb-4 border-b last:border-0 last:pb-0">
      <div className="flex-shrink-0">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${tint}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">
            {activity.subject ?? activity.activity_type.replace(/_/g, ' ')}
          </p>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {activity.activity_type.replace(/_/g, ' ')}
          </Badge>
        </div>

        {activity.description && (
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {activity.description}
          </p>
        )}

        {activity.voice_memo_url && (
          <audio
            controls
            src={activity.voice_memo_url}
            className="w-full max-w-sm h-10"
            preload="none"
          >
            Your browser does not support audio playback.
          </audio>
        )}

        <p className="text-xs text-muted-foreground">
          {author} · {formatDateTimeDMY(activity.created_at)}
          {activity.voice_memo_duration_sec && (
            <span> · {activity.voice_memo_duration_sec}s</span>
          )}
        </p>
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
