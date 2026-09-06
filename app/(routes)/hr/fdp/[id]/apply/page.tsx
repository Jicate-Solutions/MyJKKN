// ============================================================================
// HR — FDP Apply (Staff-facing) — T5.4
// Spec: specs/hr-module-decomposition-2026-05-09.md §T5.4
// Created: 2026-06-22
//
// Application confirmation for a single FDP catalog entry. Submits the
// application via FdpService.applyForFdp; status starts at 'applied' and
// proceeds to HoD then Director approval.
// ============================================================================

'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  FdpService,
  type FdpCatalogEntry,
} from '@/lib/services/hr/fdp-service';

export default function StaffFdpApplyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const fdpId = params.id;

  const [entry, setEntry] = useState<FdpCatalogEntry | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;
      setActorId(uid);

      let resolved: string | null = null;
      if (uid) {
        const { data: staffRow } = await supabase
          .from('staff')
          .select('id')
          .eq('profile_id', uid)
          .maybeSingle();
        resolved = (staffRow as { id?: string } | null)?.id ?? null;
      }
      setStaffId(resolved);

      const e = await FdpService.getCatalogEntry(supabase, fdpId);
      setEntry(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fdpId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit() {
    if (!staffId || !entry || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      await FdpService.applyForFdp(supabase, {
        session_id: entry.id,
        staff_id: staffId,
        actor_id: actorId,
        note: note.trim() || null,
      });
      setSuccess(true);
      // Redirect back to staff FDP page after a short pause
      setTimeout(() => router.push('/hr/fdp'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ContentLayout title="Apply for FDP">
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
              <Link href="/hr/fdp">FDP</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Apply</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4 max-w-2xl">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Error: {error}
          </p>
        )}

        {!loading && !entry && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              FDP entry not found.
            </CardContent>
          </Card>
        )}

        {entry && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{entry.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {entry.description && (
                <p className="text-muted-foreground">{entry.description}</p>
              )}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Dates</dt>
                  <dd>
                    {entry.start_date} → {entry.end_date}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Location</dt>
                  <dd>{entry.location || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    External faculty
                  </dt>
                  <dd>
                    {entry.external_faculty_name || '—'}
                    {entry.external_faculty_org
                      ? ` (${entry.external_faculty_org})`
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Sponsoring body
                  </dt>
                  <dd>{entry.sponsoring_body || '—'}</dd>
                </div>
              </dl>

              <div className="pt-2">
                <label
                  htmlFor="fdp-apply-note"
                  className="text-xs text-muted-foreground"
                >
                  Why are you applying? (optional)
                </label>
                <Textarea
                  id="fdp-apply-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Brief justification or learning goal"
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  onClick={handleSubmit}
                  disabled={!staffId || submitting || success}
                >
                  {success ? 'Application submitted' : 'Submit Application'}
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/hr/fdp">Cancel</Link>
                </Button>
              </div>

              {!staffId && !loading && (
                <p className="text-xs text-muted-foreground">
                  Your staff record could not be resolved; ask HR to link your
                  profile before applying.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
