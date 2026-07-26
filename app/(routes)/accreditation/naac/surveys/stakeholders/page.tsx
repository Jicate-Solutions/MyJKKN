// app/(routes)/accreditation/naac/surveys/stakeholders/page.tsx
// ============================================================================
// Employer & Alumni course feedback — the EXTERNAL half of NAAC 1.2.
//
// NAAC 1.2 is "stakeholder participation in curriculum design & review". Live
// today it carries 13 auto evidence rows and every one of them comes from
// bos_meetings (PR #2412) — the INTERNAL half. Employers and alumni were never
// asked anything. This page runs the other half: one short cycle per audience
// per year, opened BEFORE the review meetings so the answers can actually feed
// them, with a chase list for the people who have not replied.
//
// Three things on one page, deliberately: the cycle, the recipient list, and
// the chase view. A survey builder would be a different product and would be
// the thing that stops the form being short.
//
// Evidence is emitted by DB trigger (migration
// 20260726181500_stakeholder_course_feedback_surveys.sql): a cycle emits NAAC
// 1.2 only once it is CLOSED and at least one response landed. No responses,
// no evidence row.
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Copy, Download, ListPlus, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  StakeholderSurveyService,
  stakeholderSurveyUrl,
} from '@/lib/services/accreditation/stakeholder-survey-service';
import {
  AUDIENCE_LABELS,
  MIN_RESPONSES_FOR_MEANS,
  QUESTION_SETS,
  type StakeholderAudience,
  type StakeholderInviteRow,
  type StakeholderSurveyRow,
} from '@/types/accreditation/stakeholder-survey';

/**
 * navMeta — nav-coverage detector (scripts/assert-nav-coverage.mjs) reads this
 * for discoverability. The chip itself lives in accreditation/nav-config.ts
 * under NAAC.
 */
export const navMeta = {
  invokedFrom: '/accreditation',
} as const;

// Module constants — inline literals here would re-run the queries they feed.
const AUDIENCES: StakeholderAudience[] = ['industry', 'alumni'];

interface IqacInstitution {
  id: string;
  name: string;
  iqac_code: string;
}

async function fetchIqacInstitutions(): Promise<IqacInstitution[]> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await (supabase as any)
    .from('institutions')
    .select('id, name, iqac_code')
    .not('iqac_code', 'is', null)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as IqacInstitution[];
}

/** Next academic year, e.g. 2027-2028 — the first cycle that can still feed a review. */
function defaultAcademicYear(): string {
  const now = new Date();
  // The AY rolls over in June (matches fn_accreditation_ay_label).
  const startYear = now.getMonth() >= 5 ? now.getFullYear() + 1 : now.getFullYear();
  return `${startYear}-${startYear + 1}`;
}

function NewCycleDialog({
  open, onOpenChange, institutionId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  institutionId: string;
}) {
  const qc = useQueryClient();
  const [audience, setAudience] = useState<StakeholderAudience>('industry');
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear());
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{4}$/.test(academicYear.trim())) {
      toast.error('Academic year must look like 2027-2028.');
      return;
    }
    if (opensAt && closesAt && closesAt <= opensAt) {
      toast.error('The closing date must be after the opening date.');
      return;
    }
    setSubmitting(true);
    try {
      await StakeholderSurveyService.create({
        institution_id: institutionId,
        audience,
        academic_year: academicYear.trim(),
        opens_at: opensAt ? new Date(opensAt).toISOString() : null,
        closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      });
      toast.success('Cycle created as a draft. Build the list, then open it.');
      qc.invalidateQueries({ queryKey: ['stakeholder-surveys', institutionId] });
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const preview = QUESTION_SETS[audience];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New feedback cycle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Who is being asked</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as StakeholderAudience)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUDIENCES.map((a) => (
                  <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Academic year this feeds</Label>
            <Input
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="2027-2028"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Open the cycle before that year&apos;s review meetings, so the answers
              arrive in time to change something.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Opens</Label>
              <Input type="date" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div>
              <Label>Closes</Label>
              <Input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-1 text-xs font-medium">The form they will see ({preview.length} questions)</p>
            <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
              {preview.map((q) => <li key={q.key}>{q.label}</li>)}
            </ol>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChaseList({
  survey, canManage,
}: {
  survey: StakeholderSurveyRow;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [building, setBuilding] = useState(false);

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ['stakeholder-invites', survey.id],
    queryFn: () => StakeholderSurveyService.listInvites(survey.id),
  });

  const responded = invites.filter((i) => i.responded_at);
  const pending = invites.filter((i) => !i.responded_at);

  const buildRoster = async () => {
    setBuilding(true);
    try {
      const res = await fetch(`/api/accreditation/stakeholder-surveys/${survey.id}/build-roster`, {
        method: 'POST',
      });
      const json = (await res.json()) as { added?: number; found?: number; message?: string; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? 'Could not build the list.');
        return;
      }
      if (json.message) toast.warning(json.message);
      else toast.success(`${json.added ?? 0} new recipient(s) added (${json.found ?? 0} found).`);
      qc.invalidateQueries({ queryKey: ['stakeholder-invites', survey.id] });
    } catch {
      toast.error('Could not build the list.');
    } finally {
      setBuilding(false);
    }
  };

  const copyLink = async (invite: StakeholderInviteRow) => {
    try {
      await navigator.clipboard.writeText(stakeholderSurveyUrl(invite.token));
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy the link.');
    }
  };

  const downloadCsv = () => {
    const rows = [
      ['name', 'email', 'link', 'responded'],
      ...invites.map((i) => [
        i.invited_name ?? '',
        i.invited_email,
        stakeholderSurveyUrl(i.token),
        i.responded_at ? 'yes' : 'no',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback-links-${survey.audience}-${survey.academic_year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeInvite = async (invite: StakeholderInviteRow) => {
    try {
      await StakeholderSurveyService.removeInvite(invite.id);
      toast.success('Recipient removed. Any answer they gave is now anonymous and still counted.');
      qc.invalidateQueries({ queryKey: ['stakeholder-invites', survey.id] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{responded.length} responded</Badge>
        <Badge variant="outline">{pending.length} still to chase</Badge>
        {responded.length > 0 && responded.length < MIN_RESPONSES_FOR_MEANS && (
          <Badge variant="outline" className="text-[10px]">
            averages hidden below {MIN_RESPONSES_FOR_MEANS} responses
          </Badge>
        )}
        <div className="ml-auto flex gap-2">
          {canManage && survey.status !== 'closed' && survey.status !== 'archived' && (
            <Button size="sm" variant="outline" onClick={buildRoster} disabled={building}>
              <ListPlus className="mr-2 h-4 w-4" />
              {building ? 'Building…' : 'Build the list'}
            </Button>
          )}
          {invites.length > 0 && (
            <Button size="sm" variant="outline" onClick={downloadCsv}>
              <Download className="mr-2 h-4 w-4" /> Links CSV
            </Button>
          )}
        </div>
      </div>

      {invites.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recipients yet. &ldquo;Build the list&rdquo; pulls
          {survey.audience === 'alumni'
            ? ' graduated learners for this institution'
            : ' employer and recruiter contacts already on record'}{' '}
          — it does not create a separate contact list. Email invitations are not sent
          from here yet; use the links CSV for now.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Responded</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.invited_name ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{i.invited_email}</TableCell>
                  <TableCell>
                    {i.responded_at
                      ? <Badge variant="secondary">yes</Badge>
                      : <Badge variant="outline">not yet</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" title="Copy link" onClick={() => copyLink(i)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      {canManage && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Remove recipient (anonymises their answer, keeps the count)"
                          onClick={() => removeInvite(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function CycleCard({
  survey, canManage,
}: {
  survey: StakeholderSurveyRow;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const setStatus = async (status: StakeholderSurveyRow['status']) => {
    setBusy(true);
    try {
      await StakeholderSurveyService.setStatus(survey.id, status);
      toast.success(
        status === 'closed'
          ? 'Cycle closed. If any response landed, its NAAC 1.2 evidence row is now written.'
          : status === 'active'
            ? 'Cycle is open — the links now work.'
            : 'Cycle updated.'
      );
      qc.invalidateQueries({ queryKey: ['stakeholder-surveys', survey.institution_id] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {AUDIENCE_LABELS[survey.audience]} · {survey.academic_year}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {survey.status === 'closed'
                ? 'Closed — emits NAAC 1.2 only if at least one response landed.'
                : survey.status === 'active'
                  ? 'Open — links work, nothing is reported until it closes.'
                  : 'Draft — links do not work yet.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={survey.status === 'active' ? 'default' : 'outline'}>
              {survey.status}
            </Badge>
            {canManage && survey.status === 'draft' && (
              <Button size="sm" onClick={() => setStatus('active')} disabled={busy}>
                <Unlock className="mr-2 h-4 w-4" /> Open
              </Button>
            )}
            {canManage && survey.status === 'active' && (
              <Button size="sm" variant="outline" onClick={() => setStatus('closed')} disabled={busy}>
                <Lock className="mr-2 h-4 w-4" /> Close
              </Button>
            )}
            {canManage && survey.status === 'closed' && (
              <Button size="sm" variant="outline" onClick={() => setStatus('active')} disabled={busy}>
                <Unlock className="mr-2 h-4 w-4" /> Reopen
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Hide list' : 'Who has replied'}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="border-t p-0">
          <ChaseList survey={survey} canManage={canManage} />
        </CardContent>
      )}
    </Card>
  );
}

function NoAccess() {
  return (
    <ContentLayout title="Employer & Alumni Feedback">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">You do not have access</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Employer and alumni feedback cycles need the{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              accreditation.naac.surveys.stakeholder.view
            </code>{' '}
            permission. Contact your IQAC coordinator to have it added to your role.
          </p>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

function PageSkeleton() {
  return (
    <ContentLayout title="Employer & Alumni Feedback">
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </ContentLayout>
  );
}

function StakeholderSurveysInner() {
  const { profile } = useAuth();
  const { isSuperAdmin, canAccess } = usePermissions();
  const [showCreate, setShowCreate] = useState(false);
  const [pickedInstId, setPickedInstId] = useState<string>('');

  const canManage =
    isSuperAdmin || canAccess('accreditation.naac.surveys.stakeholder', 'manage');

  const { data: pickableInstitutions = [] } = useQuery({
    queryKey: ['stakeholder-surveys', 'iqac-institutions'],
    queryFn: fetchIqacInstitutions,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (isSuperAdmin && !pickedInstId && pickableInstitutions.length > 0) {
      setPickedInstId(pickableInstitutions[0].id);
    }
  }, [isSuperAdmin, pickedInstId, pickableInstitutions]);

  const effectiveInstitutionId = useMemo(
    () => (isSuperAdmin ? pickedInstId : profile?.institution_id ?? ''),
    [isSuperAdmin, pickedInstId, profile?.institution_id]
  );

  const { data: cycles = [], isLoading, error } = useQuery({
    queryKey: ['stakeholder-surveys', effectiveInstitutionId],
    queryFn: () => StakeholderSurveyService.list(effectiveInstitutionId),
    enabled: !!effectiveInstitutionId,
  });

  return (
    <ContentLayout title="Employer & Alumni Feedback">
      <PageBreadcrumb
        items={[
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          { label: 'Employer & Alumni Feedback' },
        ]}
      />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <CardTitle className="text-lg">Employer &amp; Alumni Feedback</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                NAAC 1.2 asks whether stakeholders take part in reviewing the learning
                framework. Minuted Board of Studies meetings already answer the internal
                half. This is the external half: one short form a year to the people who
                hire our learners and the learners who have left, timed to arrive before
                the review meetings. A cycle becomes evidence only once it is closed with
                at least one response — and only as counts and averages.
              </p>
            </div>
            <div className="flex items-end gap-2">
              {isSuperAdmin && (
                <div className="w-60">
                  <Label className="text-xs">Institution</Label>
                  <Select
                    value={pickedInstId}
                    onValueChange={setPickedInstId}
                    disabled={pickableInstitutions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick an institution…" />
                    </SelectTrigger>
                    <SelectContent>
                      {pickableInstitutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name} ({inst.iqac_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {canManage && (
                <Button onClick={() => setShowCreate(true)} disabled={!effectiveInstitutionId}>
                  <Plus className="mr-2 h-4 w-4" /> New cycle
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && (
            <>
              {[0, 1].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
              ))}
            </>
          )}
          {!isLoading && error && (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          )}
          {!isLoading && !error && cycles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No feedback cycles yet for this institution.
            </p>
          )}
          {!isLoading && !error && cycles.map((c) => (
            <CycleCard key={c.id} survey={c} canManage={canManage} />
          ))}
        </CardContent>
      </Card>

      {effectiveInstitutionId && (
        <NewCycleDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          institutionId={effectiveInstitutionId}
        />
      )}
    </ContentLayout>
  );
}

export default function StakeholderSurveysPage() {
  return (
    <PermissionGuard
      module="accreditation.naac.surveys.stakeholder"
      action="view"
      loading={<PageSkeleton />}
      fallback={<NoAccess />}
    >
      <StakeholderSurveysInner />
    </PermissionGuard>
  );
}
