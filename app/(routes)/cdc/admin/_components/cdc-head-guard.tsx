'use client';

// ============================================================
// _components/cdc-head-guard.tsx
// Head-only reveal primitive for the govt-job-readiness curation surfaces.
// ============================================================
// The cdc_exam_syllabus_topics and cdc_exam_topic_map tables both carry a
// head-only write-RLS (public.is_cdc_head_or_super()). To keep app == UI == RLS
// on ONE boundary (deep-review R4 #1), the exam-topic-map route and every UI
// reveal that leads to a WRITE evaluate the SAME predicate rather than the
// broader cdc.training.edit permission (which cdc_coordinator also holds and
// which would silently fail at the head-only RLS). By calling the live predicate
// — not hardcoding a role — a Director who later broadens the table RLS gets the
// UI and route following automatically.
// ============================================================

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// Shared across the guard and any inline reveal (e.g. the govt-readiness "Curate"
// links) so the head check is fetched once and deduped.
const IS_CDC_HEAD_QUERY_KEY = ['is-cdc-head-or-super'] as const;

/**
 * useIsCdcHead — evaluates public.is_cdc_head_or_super() (super_admin OR a
 * cdc_head role via profiles.role OR user_roles). Returns isHead=false while the
 * check is loading so callers fail closed. Use for inline reveals; use
 * <CdcHeadGuard> to gate a whole page.
 */
export function useIsCdcHead(): { isHead: boolean; isLoading: boolean; isError: boolean } {
  const { isLoading: authLoading } = useAuth();
  const q = useQuery({
    queryKey: IS_CDC_HEAD_QUERY_KEY,
    queryFn: async () => {
      const db = createClientSupabaseClient();
      const { data, error } = await db.rpc('is_cdc_head_or_super');
      if (error) throw error;
      return data === true;
    },
    enabled: !authLoading,
    staleTime: 5 * 60 * 1000,
  });
  return { isHead: q.data === true, isLoading: authLoading || q.isLoading, isError: q.isError };
}

/**
 * CdcHeadGuard — reveals children only to CDC Head / super-admin, matching the
 * table write-RLS. Renders an explicit "Access restricted" panel (never a silent
 * redirect) for everyone else, per the permission-failure-must-be-explicit rule.
 */
export function CdcHeadGuard({ title, children }: { title: string; children: ReactNode }) {
  const { isHead, isLoading, isError } = useIsCdcHead();

  if (isLoading) {
    return (
      <ContentLayout title={title}>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </ContentLayout>
    );
  }

  if (isError || !isHead) {
    return (
      <ContentLayout title={title}>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>
            Curating government-exam syllabus topics and their exam mappings requires the
            CDC Head or super-admin role. Contact your CDC Head to request a change.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return <>{children}</>;
}
