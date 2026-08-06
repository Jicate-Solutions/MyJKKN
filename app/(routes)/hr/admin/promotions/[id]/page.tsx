'use client';

/**
 * /hr/admin/promotions/[id] — detail / scoring screen (T5.2)
 *
 * Renders:
 *   1. Applicant + designation summary
 *   2. Evidence the applicant attached (computed qualification preview)
 *   3. SEDC scoring form (visible when status = 'submitted' OR 'sedc_scored')
 *   4. Director decision panel (visible when status = 'sedc_scored')
 *   5. Audit trail (every decision row, oldest → newest)
 */

import { useEffect, useMemo, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, History } from 'lucide-react';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
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
import { Badge } from '@/components/ui/badge';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  getPromotionPolicy,
  calculateQualificationPoints,
  type PromotionApplication,
  type PromotionDecision,
  type PromotionPolicy,
  type PromotionEvidence,
  type PromotionStatus,
} from '@/lib/services/hr/promotion-service';

const STATUS_LABELS: Record<PromotionStatus, string> = {
  submitted: 'Awaiting SEDC',
  sedc_scored: 'Awaiting Director',
  director_decided: 'Director Decided',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const EVENT_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  sedc_scored: 'SEDC scored',
  sedc_rescored: 'SEDC re-scored',
  director_approved: 'Director approved',
  director_rejected: 'Director rejected',
  revision_requested: 'Revision requested',
  withdrawn: 'Withdrawn',
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function PromotionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const supabase = createClientSupabaseClient();

  const [application, setApplication] = useState<PromotionApplication | null>(null);
  const [decisions, setDecisions] = useState<PromotionDecision[]>([]);
  const [policy, setPolicy] = useState<PromotionPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // SEDC form state
  const [merit, setMerit] = useState<string>('');
  const [qual, setQual] = useState<string>('');
  const [commit, setCommit] = useState<string>('');
  const [sedcNotes, setSedcNotes] = useState<string>('');

  // Director state
  const [directorNotes, setDirectorNotes] = useState<string>('');

  const [busy, setBusy] = useState(false);

  const refetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/promotions/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Load failed' }));
        throw new Error(err.error ?? 'Load failed');
      }
      const json = (await res.json()) as {
        data: { application: PromotionApplication; decisions: PromotionDecision[] };
      };
      setApplication(json.data.application);
      setDecisions(json.data.decisions);

      // Initialize SEDC form from existing scores when re-scoring
      if (json.data.application.merit_score !== null) {
        setMerit(String(json.data.application.merit_score));
      }
      if (json.data.application.qualification_points !== null) {
        setQual(String(json.data.application.qualification_points));
      }
      if (json.data.application.commitment_points !== null) {
        setCommit(String(json.data.application.commitment_points));
      }

      const p = await getPromotionPolicy(supabase as any, json.data.application.institution_id);
      setPolicy(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const qualPreview = useMemo(() => {
    if (!policy || !application) return null;
    return calculateQualificationPoints(
      application.evidence_jsonb as PromotionEvidence,
      policy
    );
  }, [policy, application]);

  const handleSedcSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!application) return;
    const meritN = Number(merit);
    const qualN = Number(qual);
    const commitN = Number(commit);
    if (Number.isNaN(meritN) || Number.isNaN(qualN) || Number.isNaN(commitN)) {
      toast.error('All three score fields must be numbers');
      return;
    }
    if (policy && (meritN < 0 || meritN > policy.max_merit_points)) {
      toast.error(`Merit must be between 0 and ${policy.max_merit_points}`);
      return;
    }
    if (policy && (qualN < 0 || qualN > policy.qualification_points_max)) {
      toast.error(`Qualification must be between 0 and ${policy.qualification_points_max}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/hr/promotions/${application.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sedc_score',
          merit_score: meritN,
          qualification_points: qualN,
          commitment_points: commitN,
          notes: sedcNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Score failed' }));
        throw new Error(err.error ?? 'Score failed');
      }
      toast.success('SEDC score saved. Director can now decide.');
      setSedcNotes('');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Score failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDirector = async (decision: 'approved' | 'rejected') => {
    if (!application) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/hr/promotions/${application.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'director_decide',
          decision,
          notes: directorNotes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Decision failed' }));
        throw new Error(err.error ?? 'Decision failed');
      }
      toast.success(`Application ${decision}.`);
      setDirectorNotes('');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ContentLayout title="Promotion Application">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </ContentLayout>
    );
  }
  if (error || !application) {
    return (
      <ContentLayout title="Promotion Application">
        <p className="text-sm text-destructive">{error ?? 'Application not found'}</p>
        <Button variant="outline" onClick={() => router.push('/hr/admin/promotions')}>
          Back to queue
        </Button>
      </ContentLayout>
    );
  }

  const showSedcForm =
    application.status === 'submitted' || application.status === 'sedc_scored';
  const showDirectorPanel = application.status === 'sedc_scored';

  const evidence = application.evidence_jsonb as PromotionEvidence;

  return (
    <SuperAdminOnly>
    <ContentLayout title="Promotion Application">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/admin/promotions">Promotion Queue</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Application {application.id.slice(0, 8)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  {application.from_designation_name} → {application.to_designation_name}
                </span>
                <Badge className="shrink-0">{STATUS_LABELS[application.status]}</Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Submitted {formatDateTime(application.submitted_at)}
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <Label>Merit</Label>
                <div className="text-xl font-semibold">{application.merit_score ?? '—'}</div>
                {policy && (
                  <p className="text-xs text-muted-foreground">/ {policy.max_merit_points}</p>
                )}
              </div>
              <div>
                <Label>Qualification</Label>
                <div className="text-xl font-semibold">
                  {application.qualification_points ?? '—'}
                </div>
                {policy && (
                  <p className="text-xs text-muted-foreground">
                    / {policy.qualification_points_max}
                  </p>
                )}
              </div>
              <div>
                <Label>Commitment</Label>
                <div className="text-xl font-semibold">{application.commitment_points ?? '—'}</div>
              </div>
              <div className="col-span-3 pt-2 border-t">
                <Label>Total</Label>
                <div className="text-2xl font-bold">{application.total_score ?? 0}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Applicant Evidence</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>Masters/PhD: {evidence.masters_completed ? 'Yes' : 'No'}</p>
              <p>Graduation/PG Diploma: {evidence.graduation_pg_diploma ? 'Yes' : 'No'}</p>
              <p>Diploma/ITI: {evidence.diploma_iti ? 'Yes' : 'No'}</p>
              <p>Training days: {evidence.training_days ?? 0}</p>
              <p>Books published: {evidence.book_publications ?? 0}</p>
              <p>Articles published: {evidence.article_publications ?? 0}</p>
              {evidence.narrative && (
                <div className="pt-2">
                  <Label>Notes</Label>
                  <p className="whitespace-pre-wrap">{evidence.narrative}</p>
                </div>
              )}
              {qualPreview && (
                <p className="text-xs text-muted-foreground pt-2 border-t mt-2">
                  Auto-computed qualification suggestion: {qualPreview.score} (SEDC may override).
                </p>
              )}
            </CardContent>
          </Card>

          {showSedcForm && (
            <Card>
              <CardHeader>
                <CardTitle>SEDC Scoring</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Apply the policy formula. {application.status === 'sedc_scored' ? 'Re-scoring overwrites the previous values; the audit log keeps history.' : ''}
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSedcSubmit} className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="merit">Merit (0 – {policy?.max_merit_points ?? 50})</Label>
                      <Input
                        id="merit"
                        type="number"
                        step="0.1"
                        min={0}
                        max={policy?.max_merit_points ?? 50}
                        value={merit}
                        onChange={(e) => setMerit(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="qual">
                        Qualification (0 – {policy?.qualification_points_max ?? 10})
                      </Label>
                      <Input
                        id="qual"
                        type="number"
                        step="0.1"
                        min={0}
                        max={policy?.qualification_points_max ?? 10}
                        value={qual}
                        onChange={(e) => setQual(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="commit">Commitment</Label>
                      <Input
                        id="commit"
                        type="number"
                        step="0.1"
                        min={0}
                        value={commit}
                        onChange={(e) => setCommit(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="sedc-notes">SEDC notes (optional)</Label>
                    <Textarea
                      id="sedc-notes"
                      value={sedcNotes}
                      onChange={(e) => setSedcNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button type="submit" disabled={busy}>
                    {busy ? 'Saving…' : application.status === 'sedc_scored' ? 'Re-score' : 'Save SEDC Score'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {showDirectorPanel && (
            <Card>
              <CardHeader>
                <CardTitle>Director Decision</CardTitle>
                <p className="text-sm text-muted-foreground">
                  SEDC has scored. Approve to grant promotion; reject to close.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={directorNotes}
                  onChange={(e) => setDirectorNotes(e.target.value)}
                  placeholder="Decision notes (visible on the audit trail)"
                  rows={3}
                />
                <div className="flex gap-3">
                  <Button onClick={() => handleDirector('approved')} disabled={busy}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleDirector('rejected')}
                    disabled={busy}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {decisions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No events yet.</p>
                )}
                {decisions.map((d) => (
                  <div key={d.id} className="border-l-2 border-muted pl-3 text-sm">
                    <div className="font-medium">{EVENT_LABELS[d.event_type] ?? d.event_type}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(d.created_at)}
                      {d.actor_role ? ` · ${d.actor_role}` : ''}
                    </div>
                    {(d.merit_score_snapshot !== null ||
                      d.qualification_points_snapshot !== null ||
                      d.commitment_points_snapshot !== null) && (
                      <div className="text-xs mt-1">
                        Merit {d.merit_score_snapshot ?? '—'} · Qual{' '}
                        {d.qualification_points_snapshot ?? '—'} · Commit{' '}
                        {d.commitment_points_snapshot ?? '—'}
                      </div>
                    )}
                    {d.notes && <p className="text-xs mt-1 italic">"{d.notes}"</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
    </SuperAdminOnly>
  );
}
