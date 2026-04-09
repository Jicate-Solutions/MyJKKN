'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Phone,
  MessageCircle,
  MessageSquare,
  Mail,
  StickyNote,
  Activity,
  ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TimelineSnippetProps {
  leadId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map activity_type → lucide icon component. */
const activityIcons: Record<string, typeof Activity> = {
  call: Phone,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  email: Mail,
  note: StickyNote,
};

function getIcon(activityType: string | null) {
  return activityIcons[activityType || ''] || Activity;
}

/** Simple relative time string. */
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return '';

  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimelineSnippet({ leadId }: TimelineSnippetProps) {
  const { data: activities, isLoading } = useQuery({
    queryKey: ['timeline-snippet', leadId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('admission_lead_activities')
        .select('id, activity_type, title, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        activity_type: string | null;
        title: string | null;
        created_at: string;
      }>;
    },
    enabled: !!leadId,
    staleTime: 30_000,
  });

  // Loading skeleton — 3 compact lines
  if (isLoading) {
    return (
      <div className="space-y-2.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-full shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-3 w-12 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (!activities || activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-3">
        No activity yet
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {activities.map((entry) => {
        const Icon = getIcon(entry.activity_type);
        return (
          <div
            key={entry.id}
            className="flex items-center gap-2 py-1.5"
          >
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm truncate flex-1">
              {entry.title || entry.activity_type || 'Activity'}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
              {timeAgo(entry.created_at)}
            </span>
          </div>
        );
      })}

      <Link
        href={`/admission/leads/${leadId}`}
        className="flex items-center justify-center gap-1 text-xs text-primary font-medium pt-1.5 hover:underline"
      >
        See full history
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
