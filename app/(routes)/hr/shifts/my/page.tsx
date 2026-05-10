// ============================================================================
// HR — My Shift (T1.6 Phase 2a from specs/hr-module-decomposition-2026-05-09.md)
// Created: 2026-05-10.
//
// Employee read-only view of their current shift assignment. Resolves the
// logged-in user's staff record via staff.profile_id = auth.uid(), then
// fetches their active assignment with effective hours computed from the
// template (or override).
//
// "Request swap" button is rendered but disabled — it's a Phase 2b surface
// (per Q-lock #2: employee-initiated swap with HR approval is the full
// workflow, ships separately).
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useShiftAssignment } from '@/hooks/hr/use-shifts';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function MyShiftPage() {
  const { profile } = useAuth();
  const supabase = createClientSupabaseClient();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffLookupError, setStaffLookupError] = useState<string | null>(null);

  // Resolve current user's staff.id from staff.profile_id = profile.id.
  useEffect(() => {
    if (!profile?.id) {
      setStaffId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('staff')
          .select('id')
          .eq('profile_id', profile.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setStaffLookupError(error.message);
          setStaffId(null);
          return;
        }
        setStaffLookupError(null);
        setStaffId((data as { id: string } | null)?.id ?? null);
      } catch (e: unknown) {
        if (!cancelled) {
          setStaffLookupError(e instanceof Error ? e.message : 'Lookup failed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, supabase]);

  const { data: assignment, isLoading, error } = useShiftAssignment(staffId ?? undefined);

  return (
    <ContentLayout title="My Shift">
      <div className="space-y-6">
        {!profile?.id ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Sign in to view your shift assignment.
          </Card>
        ) : staffLookupError ? (
          <Card className="border-destructive/30 p-6 text-sm">
            <div className="font-medium">Could not load your staff record.</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {staffLookupError}
            </div>
          </Card>
        ) : !staffId ? (
          <Card className="p-6 text-sm text-muted-foreground">
            We could not find a staff record linked to your account. Contact HR
            if you believe this is wrong.
          </Card>
        ) : isLoading ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Loading your shift…
          </Card>
        ) : error ? (
          <Card className="border-destructive/30 p-6 text-sm">
            <div className="font-medium">Could not load your shift.</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          </Card>
        ) : !assignment ? (
          <Card className="p-6 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">No active shift</div>
            <div className="mt-1">
              You don&apos;t have a shift assignment right now. Contact HR if
              you expected one.
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Current shift
                </div>
                <div className="mt-1 text-xl font-semibold">
                  {assignment.template?.template_name ?? 'Custom hours'}
                </div>
                {assignment.template?.template_code && (
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {assignment.template.template_code}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Hours
                  </div>
                  <div className="mt-1 font-mono text-sm">
                    {assignment.effective.start_time.slice(0, 5)} –{' '}
                    {assignment.effective.end_time.slice(0, 5)}
                  </div>
                  {assignment.effective.source !== 'template' && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      ({assignment.effective.source})
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Effective from
                  </div>
                  <div className="mt-1 text-sm">{assignment.effective_from}</div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Effective until
                  </div>
                  <div className="mt-1 text-sm">
                    {assignment.effective_until ?? (
                      <span className="text-muted-foreground">Ongoing</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Pattern
                  </div>
                  <div className="mt-1 text-sm">
                    {assignment.rotation_weeks === 1
                      ? 'Single-week'
                      : `${assignment.rotation_weeks}-week rotation`}
                  </div>
                </div>

                {assignment.template?.category && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Category
                    </div>
                    <div className="mt-1 text-sm capitalize">
                      {assignment.template.category}
                    </div>
                  </div>
                )}
              </div>

              {assignment.notes && (
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Notes
                  </div>
                  <div className="mt-1">{assignment.notes}</div>
                </div>
              )}

              <div className="flex items-center gap-3 border-t pt-4">
                <Button
                  variant="outline"
                  disabled
                  title="Coming in Phase 2b — employee-initiated swap with HR approval."
                >
                  Request swap
                </Button>
                <span className="text-xs text-muted-foreground">
                  Swap workflow ships in Phase 2b.
                </span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
