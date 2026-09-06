'use client';

/**
 * /hr/promotions/apply — staff-facing form to submit a promotion application
 * (T5.2). Consumes hr.promotion_policy to surface the scoring rules inline so
 * applicants see what evidence they need before they click submit.
 *
 * Architecture (per reference_platform_policies_director_view_pattern.md):
 *   - policy row: hr.promotion_policy (platform_policies)
 *   - reader: fn_get_policy RPC (from PromotionService.getPromotionPolicy)
 *   - editor: /hr/admin/policies/promotion (Wave 3 policy shell — not in scope here)
 *   - this UI: applies the policy at submit time
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Info, AlertCircle } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  getPromotionPolicy,
  calculateQualificationPoints,
  type PromotionPolicy,
  type PromotionEvidence,
} from '@/lib/services/hr/promotion-service';

interface StaffContext {
  staff_id: string;
  institution_id: string;
  hr_organization_id: string;
  current_designation_name: string;
}

export default function PromotionApplyPage() {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const supabase = createClientSupabaseClient();

  const [staffCtx, setStaffCtx] = useState<StaffContext | null>(null);
  const [policy, setPolicy] = useState<PromotionPolicy | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // Form state
  const [toDesignation, setToDesignation] = useState('');
  const [evidence, setEvidence] = useState<PromotionEvidence>({
    masters_completed: false,
    graduation_pg_diploma: false,
    diploma_iti: false,
    training_days: 0,
    book_publications: 0,
    article_publications: 0,
    narrative: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Bootstrap: resolve staff context + policy
  useEffect(() => {
    if (authLoading || !profile?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: staff, error: staffErr } = await (supabase as any)
          .from('staff')
          .select(
            `id, institution_id,
             hr_staff_details!hr_staff_details_staff_id_fkey (
               hr_organization_id,
               designation:designation_id (id, name)
             )`
          )
          .eq('profile_id', profile.id)
          .maybeSingle();
        if (staffErr) throw staffErr;
        if (!staff) {
          if (!cancelled) setBootstrapError('No staff record linked to your profile. Contact HR.');
          return;
        }
        const details = Array.isArray(staff.hr_staff_details)
          ? staff.hr_staff_details[0]
          : staff.hr_staff_details;
        if (!details?.hr_organization_id) {
          if (!cancelled)
            setBootstrapError('No HR organization linked to your staff record. Contact HR.');
          return;
        }
        const ctx: StaffContext = {
          staff_id: staff.id,
          institution_id: staff.institution_id,
          hr_organization_id: details.hr_organization_id,
          current_designation_name:
            (details.designation && (details.designation as any).name) ?? 'Not set',
        };
        if (!cancelled) setStaffCtx(ctx);

        const p = await getPromotionPolicy(supabase as any, ctx.institution_id);
        if (!cancelled) setPolicy(p);
      } catch (err) {
        if (!cancelled) setBootstrapError(err instanceof Error ? err.message : 'Bootstrap failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, profile?.id, supabase]);

  // Live qualification-points preview
  const qualPreview = useMemo(() => {
    if (!policy) return null;
    return calculateQualificationPoints(evidence, policy);
  }, [evidence, policy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffCtx) return;
    if (!toDesignation.trim()) {
      toast.error('Please enter the promotion target designation');
      return;
    }
    if (toDesignation.trim() === staffCtx.current_designation_name) {
      toast.error('Target designation must differ from your current designation');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/hr/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffCtx.staff_id,
          hr_organization_id: staffCtx.hr_organization_id,
          institution_id: staffCtx.institution_id,
          from_designation_name: staffCtx.current_designation_name,
          to_designation_name: toDesignation.trim(),
          evidence_jsonb: evidence,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Submit failed' }));
        throw new Error(err.error ?? 'Submit failed');
      }
      toast.success('Application submitted. SEDC will review.');
      router.push('/hr');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <ContentLayout title="Apply for Promotion">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Apply for Promotion">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Apply for Promotion</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — the form */}
        <div className="lg:col-span-2 space-y-6">
          {bootstrapError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{bootstrapError}</AlertDescription>
            </Alert>
          )}

          {staffCtx && policy && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Designation Change</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Current Designation</Label>
                    <Input value={staffCtx.current_designation_name} disabled />
                  </div>
                  <div>
                    <Label htmlFor="to-designation">Apply For (Target Designation)</Label>
                    <Input
                      id="to-designation"
                      value={toDesignation}
                      onChange={(e) => setToDesignation(e.target.value)}
                      placeholder="e.g. Associate Professor"
                      required
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Qualification Evidence</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Tick everything you can document. SEDC will verify before scoring.
                    Maximum {policy.qualification_points_max} qualification points apply.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={evidence.masters_completed ?? false}
                      onCheckedChange={(v) =>
                        setEvidence((s) => ({ ...s, masters_completed: Boolean(v) }))
                      }
                    />
                    <span className="text-sm">
                      Masters / PhD completed (+{policy.qualification_point_scale.masters_completed} pts)
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={evidence.graduation_pg_diploma ?? false}
                      onCheckedChange={(v) =>
                        setEvidence((s) => ({ ...s, graduation_pg_diploma: Boolean(v) }))
                      }
                    />
                    <span className="text-sm">
                      Graduation / PG Diploma (≥1 yr) (+
                      {policy.qualification_point_scale.graduation_pg_diploma_min_1yr} pts)
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={evidence.diploma_iti ?? false}
                      onCheckedChange={(v) =>
                        setEvidence((s) => ({ ...s, diploma_iti: Boolean(v) }))
                      }
                    />
                    <span className="text-sm">
                      Diploma / ITI (≥1 yr) (+{policy.qualification_point_scale.diploma_iti_min_1yr}{' '}
                      pts)
                    </span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <Label htmlFor="training">Training days</Label>
                      <Input
                        id="training"
                        type="number"
                        min={0}
                        value={evidence.training_days ?? 0}
                        onChange={(e) =>
                          setEvidence((s) => ({
                            ...s,
                            training_days: Number(e.target.value),
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        +{policy.qualification_point_scale.training_per_5_days} pt per 5 days
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="books">Books published</Label>
                      <Input
                        id="books"
                        type="number"
                        min={0}
                        value={evidence.book_publications ?? 0}
                        onChange={(e) =>
                          setEvidence((s) => ({
                            ...s,
                            book_publications: Number(e.target.value),
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        +{policy.qualification_point_scale.book_publication} pt each
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="articles">Articles published</Label>
                      <Input
                        id="articles"
                        type="number"
                        min={0}
                        value={evidence.article_publications ?? 0}
                        onChange={(e) =>
                          setEvidence((s) => ({
                            ...s,
                            article_publications: Number(e.target.value),
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        +{policy.qualification_point_scale.article_publication} pt each
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="narrative">Additional notes (optional)</Label>
                    <Textarea
                      id="narrative"
                      value={evidence.narrative ?? ''}
                      onChange={(e) =>
                        setEvidence((s) => ({ ...s, narrative: e.target.value }))
                      }
                      placeholder="Contributions, ranks earned, special achievements…"
                      rows={4}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={submitting || !staffCtx || !policy}>
                  {submitting ? 'Submitting…' : 'Submit Application'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push('/hr')}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Right column — scoring preview + policy explainer */}
        <div className="space-y-6">
          {policy && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  How Scoring Works
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p>
                  <strong>Merit Points</strong>: up to {policy.max_merit_points} pts, computed from
                  the last {policy.delay_lookback_years} years of performance reviews
                  ({policy.merit_score_formula}).
                </p>
                <p>
                  <strong>Qualification Points</strong>: up to {policy.qualification_points_max}{' '}
                  pts, from documented education + training + publications.
                </p>
                <p>
                  <strong>Commitment Points</strong>: assessed by SEDC during review.
                </p>
                {policy.seniority_tiebreaker && (
                  <p className="text-xs text-muted-foreground">
                    Ties broken by years of service.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {qualPreview && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your Estimated Qualification Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {qualPreview.score.toFixed(1)}
                  <span className="text-base text-muted-foreground ml-1">
                    / {policy?.qualification_points_max ?? 10}
                  </span>
                </div>
                <div className="mt-3 text-xs space-y-1">
                  {Object.entries(qualPreview.breakdown).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground">{k}</span>
                      <span>+{v}</span>
                    </div>
                  ))}
                  {Object.keys(qualPreview.breakdown).length === 0 && (
                    <p className="text-muted-foreground">No evidence ticked yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ContentLayout>
  );
}
