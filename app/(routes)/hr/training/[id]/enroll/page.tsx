// ============================================================================
// HR — Training Enrollment Confirmation (Staff-facing) — T5.3
// Spec: specs/hr-module-decomposition-2026-05-09.md §T5.3
// Created: 2026-06-19
//
// Shows the program summary + "Confirm Enrollment" CTA. On click:
//   - Resolves staff_id from auth.uid() ↔ staff.profile_id
//   - Inserts a row into hr_training_enrollments (RLS allows self-enroll)
//   - Redirects back to /hr/training
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  TrainingService,
  type HRTrainingSession,
  type TrainingCategory,
} from '@/lib/services/hr/training-service';

const CATEGORY_LABELS: Record<TrainingCategory, string> = {
  induction: 'Induction',
  internal: 'Internal',
  specialised: 'Specialised',
  fdp: 'FDP',
};

export default function EnrollPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const [program, setProgram] = useState<HRTrainingSession | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        const p = await TrainingService.getSession(supabase, id);
        if (cancelled) return;
        setProgram(p);

        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (uid) {
          const { data: staffRow } = await supabase
            .from('staff')
            .select('id')
            .eq('profile_id', uid)
            .maybeSingle();
          const sid = (staffRow as { id?: string } | null)?.id ?? null;
          if (!cancelled) setStaffId(sid);

          if (sid && p) {
            const existing = await TrainingService.listEnrollments(supabase, {
              session_id: p.id,
              staff_id: sid,
            });
            if (!cancelled && existing.length > 0) setAlreadyEnrolled(true);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleEnroll() {
    if (!program || !staffId) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      await TrainingService.enrollStaff(supabase, {
        session_id: program.id,
        staff_id: staffId,
      });
      router.push('/hr/training');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <ContentLayout title="Confirm Enrollment">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/training">Training</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Enroll</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-2xl space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Error: {error}
          </p>
        )}

        {!loading && !program && !error && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              This program was not found, or is no longer open for enrollment.
            </CardContent>
          </Card>
        )}

        {program && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {program.title}{' '}
                <Badge variant="outline" className="ml-2 text-[10px]">
                  {CATEGORY_LABELS[program.category]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Start</div>
                  <div>{program.start_date}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">End</div>
                  <div>{program.end_date}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Location</div>
                  <div>{program.location ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Facilitator
                  </div>
                  <div>{program.facilitator_name ?? '—'}</div>
                </div>
              </div>

              {program.description && (
                <div>
                  <div className="text-xs text-muted-foreground">About</div>
                  <p className="whitespace-pre-line">{program.description}</p>
                </div>
              )}

              {!staffId && (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Your staff record could not be linked. Ask HR to associate
                  your profile with your staff record before enrolling.
                </p>
              )}

              {alreadyEnrolled && (
                <p className="text-sm text-green-700 dark:text-green-300">
                  You are already enrolled in this program. See{' '}
                  <Link
                    href="/hr/training"
                    className="underline text-primary"
                  >
                    your enrollments
                  </Link>
                  .
                </p>
              )}

              {!alreadyEnrolled && staffId && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={handleEnroll} disabled={submitting}>
                    {submitting ? 'Enrolling…' : 'Confirm Enrollment'}
                  </Button>
                  <Button variant="outline" asChild disabled={submitting}>
                    <Link href="/hr/training">Cancel</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
