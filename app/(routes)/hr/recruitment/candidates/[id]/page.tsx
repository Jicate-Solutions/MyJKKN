'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ExternalLink, AlertTriangle, ArrowRight, GraduationCap, Users, Lightbulb, Bug, Briefcase, Calendar } from 'lucide-react';
import {
  useCandidate,
  usePackages,
  useProposePackage,
  useApprovePackage,
  useCounterPackage,
  useWithdrawCandidate,
  useUpdateCandidateStatus,
} from '@/hooks/hr/use-recruitment';
import { useAlumniSignal } from '@/hooks/hr/use-alumni-signal';
import {
  CANDIDATE_STATUS_LABELS,
  ROLE_CATEGORY_LABELS,
  MONTHLY_SALARY_BAND_LABELS,
  type CandidateStatus,
  type HRRecruitmentCandidatePackage,
} from '@/types/hr-recruitment';
import { toast } from 'sonner';

// Status colour map (matches my/page.tsx)
const STATUS_COLORS: Record<CandidateStatus, string> = {
  submitted:        'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200',
  pending_approval: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200',
  approved:         'bg-green-100 text-green-900 dark:bg-green-900/20 dark:text-green-200',
  package_fixed:    'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  offer_issued:     'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  joined:           'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200',
  rejected:         'bg-red-100 text-red-900 dark:bg-red-900/20 dark:text-red-200',
  withdrawn:        'bg-gray-100 text-gray-900 dark:bg-gray-900/20 dark:text-gray-200',
  offer_rescinded:  'bg-gray-100 text-gray-900 dark:bg-gray-900/20 dark:text-gray-200',
  no_show:          'bg-orange-100 text-orange-900 dark:bg-orange-900/20 dark:text-orange-200',
};

const PACKAGE_STATUS_COLORS: Record<HRRecruitmentCandidatePackage['status'], string> = {
  proposed: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200',
  approved:  'bg-green-100 text-green-900 dark:bg-green-900/20 dark:text-green-200',
  countered: 'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  rejected:  'bg-red-100 text-red-900 dark:bg-red-900/20 dark:text-red-200',
};

function formatSalary(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export default function CandidateDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const { data: candidate, isLoading } = useCandidate(id);
  const { data: alumniSignal } = useAlumniSignal(id);
  const { data: packages = [] } = usePackages(id);
  const propose = useProposePackage();
  const approvePackage = useApprovePackage();
  const counterPackage = useCounterPackage();
  const withdraw = useWithdrawCandidate();
  const updateStatus = useUpdateCandidateStatus();

  // Propose package dialog
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeSalary, setProposeCtc] = useState('');
  const [proposeBreakdown, setProposeBreakdown] = useState('');
  const [proposeIsCounter, setProposeIsCounter] = useState(false);
  const [proposeParentId, setProposeParentId] = useState('');
  const [proposeNotes, setProposeNotes] = useState('');

  const onPropose = async (e: React.FormEvent) => {
    e.preventDefault();
    const monthlySalary = parseFloat(proposeSalary);
    if (isNaN(monthlySalary) || monthlySalary <= 0) {
      toast.error('Enter a valid Monthly Salary');
      return;
    }

    let breakdown: Record<string, number> | null = null;
    if (proposeBreakdown.trim()) {
      try {
        breakdown = JSON.parse(proposeBreakdown.trim());
      } catch {
        toast.error('Breakdown must be valid JSON (e.g. {"basic":300000,"hra":120000})');
        return;
      }
    }

    try {
      await propose.mutateAsync({
        candidate_id: id,
        hr_organization_id: candidate?.hr_organization_id ?? null,
        proposed_monthly_salary: monthlySalary,
        proposed_monthly_salary_breakdown: breakdown,
        is_counter_offer: proposeIsCounter,
        parent_package_id: proposeIsCounter && proposeParentId ? proposeParentId : null,
        notes: proposeNotes.trim() || null,
        proposed_by: '', // server fills
      });
      toast.success('Package proposed');
      setProposeOpen(false);
      setProposeCtc('');
      setProposeBreakdown('');
      setProposeIsCounter(false);
      setProposeParentId('');
      setProposeNotes('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Counter offer dialog
  const [counterPackageId, setCounterPackageId] = useState<string | null>(null);
  const [counterCtc, setCounterCtc] = useState('');
  const [counterBreakdown, setCounterBreakdown] = useState('');
  const [counterNotes, setCounterNotes] = useState('');

  const onCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterPackageId) return;
    const monthlySalary = parseFloat(counterCtc);
    if (isNaN(monthlySalary) || monthlySalary <= 0) {
      toast.error('Enter a valid Monthly Salary');
      return;
    }

    let breakdown: Record<string, number> | null = null;
    if (counterBreakdown.trim()) {
      try {
        breakdown = JSON.parse(counterBreakdown.trim());
      } catch {
        toast.error('Breakdown must be valid JSON');
        return;
      }
    }

    try {
      await counterPackage.mutateAsync({
        candidateId: id,
        packageId: counterPackageId,
        proposed_monthly_salary: monthlySalary,
        proposed_monthly_salary_breakdown: breakdown,
        notes: counterNotes.trim() || null,
        hr_organization_id: candidate?.hr_organization_id ?? null,
      });
      toast.success('Counter offer submitted');
      setCounterPackageId(null);
      setCounterCtc('');
      setCounterBreakdown('');
      setCounterNotes('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Withdraw
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');

  const onWithdraw = async () => {
    try {
      await withdraw.mutateAsync({ id, reason: withdrawReason.trim() || undefined });
      toast.success('Candidate withdrawn');
      setWithdrawOpen(false);
      setWithdrawReason('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Mark joined
  const onMarkJoined = async () => {
    try {
      await updateStatus.mutateAsync({ id, status: 'joined' });
      toast.success('Marked as joined');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title="Loading…">
        <div className="mt-6 space-y-3 max-w-3xl">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-md p-4">
              <div className="space-y-2">
                <div className="h-5 w-56 rounded bg-muted/60 animate-pulse" />
                <div className="h-4 w-80 rounded bg-muted/40 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </ContentLayout>
    );
  }

  if (!candidate) {
    return (
      <ContentLayout title="Not Found">
        <p className="text-sm text-muted-foreground mt-6">Candidate not found.</p>
      </ContentLayout>
    );
  }

  const approvalChain = candidate.approval_chain ?? [];
  const canWithdraw = ['submitted', 'pending_approval'].includes(candidate.status);
  const canMarkJoined = ['offer_issued', 'approved'].includes(candidate.status);

  return (
    <ContentLayout title="Candidate Detail">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/recruitment">Recruitment</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{candidate.name}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4 max-w-3xl">

        {/* 1. Header card */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl font-semibold">{candidate.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">{candidate.role_title}</p>
                <p className="text-xs text-muted-foreground">{ROLE_CATEGORY_LABELS[candidate.role_category]}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-1 rounded text-sm font-medium ${STATUS_COLORS[candidate.status]}`}>
                  {CANDIDATE_STATUS_LABELS[candidate.status]}
                </span>
                {candidate.cvviz_url && (
                  <a
                    href={candidate.cvviz_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline border rounded px-2 py-1"
                  >
                    CVViz <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Email:</span>{' '}
                <span className="font-medium">{candidate.email}</span>
              </div>
              {candidate.phone && (
                <div>
                  <span className="text-muted-foreground">Phone:</span>{' '}
                  <span className="font-medium">{candidate.phone}</span>
                </div>
              )}
              {candidate.institution_id && (
                <div>
                  <span className="text-muted-foreground">Institution:</span>{' '}
                  <span className="font-mono text-xs">{candidate.institution_id}</span>
                </div>
              )}
              {candidate.proposed_monthly_salary_band && (
                <div>
                  <span className="text-muted-foreground">Monthly Salary Band:</span>{' '}
                  <span className="font-medium">{MONTHLY_SALARY_BAND_LABELS[candidate.proposed_monthly_salary_band]}</span>
                </div>
              )}
              {candidate.expected_joining_date && (
                <div>
                  <span className="text-muted-foreground">Expected Joining:</span>{' '}
                  <span className="font-medium">{candidate.expected_joining_date}</span>
                </div>
              )}
              {candidate.actual_joining_date && (
                <div>
                  <span className="text-muted-foreground">Actual Joining:</span>{' '}
                  <span className="font-medium">{candidate.actual_joining_date}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Submitted:</span>{' '}
                <span className="font-medium">
                  {new Date(candidate.submitted_at ?? candidate.created_at).toLocaleString()}
                </span>
              </div>
              {candidate.is_emergency && (
                <div className="col-span-2">
                  <Badge variant="outline" className="border-red-500 text-red-700 dark:text-red-300 flex items-center gap-1 w-fit">
                    <AlertTriangle className="h-3 w-3" />
                    Urgent — bypasses multi-step approval
                  </Badge>
                </div>
              )}
              {candidate.is_internal_transfer && (
                <div className="col-span-2">
                  <Badge variant="outline" className="border-blue-500 text-blue-700 dark:text-blue-300 w-fit">
                    Internal Transfer
                    {candidate.source_staff_id && (
                      <span className="ml-1 font-mono text-xs">(from {candidate.source_staff_id})</span>
                    )}
                  </Badge>
                </div>
              )}
            </div>

            {candidate.rejection_reason && (
              <div className="mt-3 text-sm text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded p-2">
                <span className="font-medium">Rejection reason:</span> {candidate.rejection_reason}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. JKKN History panel — R4.3 Alumni Signals */}
        {alumniSignal && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                JKKN History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {/* Academic record — only when graduation_year is real (>0).
                    For staff-only matches the service returns 0 here. */}
                {alumniSignal.graduation_year > 0 && (
                  <li className="flex items-start gap-2">
                    <GraduationCap className="h-4 w-4 mt-0.5 shrink-0 text-indigo-500" />
                    <span>
                      {[
                        alumniSignal.course_name,
                        String(alumniSignal.graduation_year),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                )}

                {/* T8.5 — Staff tenure (former / current JKKN staff) */}
                {alumniSignal.staff_tenure && (
                  <li className="flex items-start gap-2">
                    <Briefcase className="h-4 w-4 mt-0.5 shrink-0 text-cyan-600" />
                    <span>
                      {alumniSignal.staff_tenure.still_active
                        ? 'Current JKKN Staff'
                        : 'Former JKKN Staff'}
                      {alumniSignal.staff_tenure.years > 0 && (
                        <> &mdash; {alumniSignal.staff_tenure.years} year
                          {alumniSignal.staff_tenure.years === 1 ? '' : 's'}</>
                      )}
                      {alumniSignal.staff_tenure.designation && (
                        <> &middot; {alumniSignal.staff_tenure.designation}</>
                      )}
                    </span>
                  </li>
                )}

                {/* Learners Council role */}
                {alumniSignal.council_role && (
                  <li className="flex items-start gap-2">
                    <Users className="h-4 w-4 mt-0.5 shrink-0 text-violet-500" />
                    <span>
                      Learners Council &mdash;{' '}
                      {alumniSignal.council_role.position_title},{' '}
                      {alumniSignal.council_role.term_name}
                    </span>
                  </li>
                )}

                {/* T8.5 — LC committees served */}
                {alumniSignal.lc_committee_count !== undefined && (
                  <li className="flex items-start gap-2">
                    <Users className="h-4 w-4 mt-0.5 shrink-0 text-fuchsia-500" />
                    <span>
                      LC Committees &mdash;{' '}
                      {alumniSignal.lc_committee_count}{' '}
                      {alumniSignal.lc_committee_count === 1 ? 'committee' : 'committees'}
                    </span>
                  </li>
                )}

                {/* T8.5 — LC events attended */}
                {alumniSignal.lc_events_attended !== undefined && (
                  <li className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 mt-0.5 shrink-0 text-teal-500" />
                    <span>
                      LC Events &mdash;{' '}
                      {alumniSignal.lc_events_attended}{' '}
                      {alumniSignal.lc_events_attended === 1 ? 'event' : 'events'}
                    </span>
                  </li>
                )}

                {/* Solutions Hub contributions */}
                {alumniSignal.sh_contributions !== undefined && (
                  <li className="flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                    <span>
                      Solutions Hub &mdash;{' '}
                      {alumniSignal.sh_contributions}{' '}
                      {alumniSignal.sh_contributions === 1
                        ? 'contribution'
                        : 'contributions'}
                    </span>
                  </li>
                )}

                {/* Bug reports filed */}
                {alumniSignal.bug_reports_filed !== undefined && (
                  <li className="flex items-start gap-2">
                    <Bug className="h-4 w-4 mt-0.5 shrink-0 text-rose-500" />
                    <span>
                      Bug Reports &mdash;{' '}
                      {alumniSignal.bug_reports_filed} filed
                    </span>
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* 3. Approval chain timeline (renumbered from 2) */}
        {approvalChain.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Approval Chain</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative ml-2 space-y-4">
                {approvalChain.map((step, idx) => {
                  const isActive = idx === candidate.current_step;
                  const dotColor =
                    step.status === 'approved' ? 'bg-green-500' :
                    step.status === 'rejected' ? 'bg-red-500' :
                    isActive ? 'bg-yellow-500' : 'bg-muted-foreground/30';

                  return (
                    <li key={idx} className="flex items-start gap-3 text-sm">
                      {/* Vertical connector */}
                      <div className="relative flex flex-col items-center">
                        <span className={`h-3 w-3 rounded-full mt-0.5 shrink-0 ${dotColor}`} />
                        {idx < approvalChain.length - 1 && (
                          <span className="w-px flex-1 bg-border mt-1 min-h-[1rem]" />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">Step {step.step_order ?? idx + 1}:</span>
                          <span>{step.approver_role}</span>
                          <span className="text-xs text-muted-foreground">({step.status})</span>
                          {isActive && step.status === 'pending' && (
                            <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700 dark:text-yellow-300">
                              Current
                            </Badge>
                          )}
                        </div>
                        {step.decided_at && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(step.decided_at).toLocaleString()}
                          </p>
                        )}
                        {(step as any).comment && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">
                            &ldquo;{(step as any).comment}&rdquo;
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* 4. Package negotiation history */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Salary Negotiation</CardTitle>
              <Button size="sm" onClick={() => setProposeOpen(true)}>
                Propose Package
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No packages proposed yet.{' '}
                <button type="button" className="text-primary hover:underline" onClick={() => setProposeOpen(true)}>
                  Propose one &rarr;
                </button>
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-1 pr-3 font-medium">Proposed Monthly Salary</th>
                      <th className="text-left py-1 pr-3 font-medium">Proposed By</th>
                      <th className="text-left py-1 pr-3 font-medium">Type</th>
                      <th className="text-left py-1 pr-3 font-medium">Status</th>
                      <th className="text-left py-1 pr-3 font-medium">Approved At</th>
                      <th className="text-left py-1 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map((pkg) => (
                      <tr key={pkg.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-3 font-medium">{formatSalary(pkg.proposed_monthly_salary)}</td>
                        <td className="py-2 pr-3 font-mono text-xs max-w-[120px] truncate">{pkg.proposed_by}</td>
                        <td className="py-2 pr-3">
                          {pkg.is_counter_offer ? (
                            <Badge variant="outline" className="text-xs">Counter</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">Initial</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${PACKAGE_STATUS_COLORS[pkg.status]}`}>
                            {pkg.status.charAt(0).toUpperCase() + pkg.status.slice(1)}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {pkg.approved_at ? new Date(pkg.approved_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2">
                          {pkg.status === 'proposed' && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="text-xs text-primary hover:underline"
                                onClick={() => approvePackage.mutate({ candidateId: id, packageId: pkg.id })}
                                disabled={approvePackage.isPending}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setCounterPackageId(pkg.id);
                                  setCounterCtc('');
                                  setCounterBreakdown('');
                                  setCounterNotes('');
                                }}
                              >
                                Counter
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 5. Bottom actions */}
        {(canWithdraw || canMarkJoined) && (
          <div className="flex gap-2 flex-wrap">
            {canWithdraw && (
              <Button variant="outline" onClick={() => setWithdrawOpen(true)} disabled={withdraw.isPending}>
                Withdraw Candidate
              </Button>
            )}
            {canMarkJoined && (
              <Button onClick={onMarkJoined} disabled={updateStatus.isPending}>
                <ArrowRight className="h-4 w-4 mr-1" />
                {updateStatus.isPending ? 'Updating…' : 'Mark as Joined'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Propose package dialog */}
      <Dialog open={proposeOpen} onOpenChange={setProposeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propose Monthly Salary Package</DialogTitle>
          </DialogHeader>
          <form onSubmit={onPropose} className="space-y-3">
            <div>
              <Label htmlFor="proposeSalary">Monthly Salary (₹) <span className="text-destructive">*</span></Label>
              <Input
                id="proposeSalary"
                type="number"
                value={proposeSalary}
                onChange={(e) => setProposeCtc(e.target.value)}
                required
                placeholder="e.g. 600000"
                min="1"
              />
            </div>
            <div>
              <Label htmlFor="proposeBreakdown">Breakdown (JSON, optional)</Label>
              <Textarea
                id="proposeBreakdown"
                value={proposeBreakdown}
                onChange={(e) => setProposeBreakdown(e.target.value)}
                rows={3}
                placeholder={'{"basic":300000,"hra":120000,"da":60000}'}
              />
            </div>
            <div>
              <Label htmlFor="proposeNotes">Notes</Label>
              <Textarea
                id="proposeNotes"
                value={proposeNotes}
                onChange={(e) => setProposeNotes(e.target.value)}
                rows={2}
                placeholder="Any additional notes…"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="proposeIsCounter"
                type="checkbox"
                checked={proposeIsCounter}
                onChange={(e) => setProposeIsCounter(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="proposeIsCounter" className="text-sm font-normal cursor-pointer">
                This is a counter offer
              </Label>
            </div>
            {proposeIsCounter && packages.length > 0 && (
              <div>
                <Label htmlFor="proposeParentId">Counter to which package?</Label>
                <select
                  id="proposeParentId"
                  value={proposeParentId}
                  onChange={(e) => setProposeParentId(e.target.value)}
                  className="w-full border rounded-md h-10 px-3 bg-background mt-1"
                >
                  <option value="">Select parent package…</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {formatSalary(pkg.proposed_monthly_salary)} — {pkg.status}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProposeOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={propose.isPending}>
                {propose.isPending ? 'Proposing…' : 'Propose Package'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Counter offer dialog */}
      <Dialog open={!!counterPackageId} onOpenChange={(open) => { if (!open) setCounterPackageId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Counter Offer</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCounter} className="space-y-3">
            <div>
              <Label htmlFor="counterCtc">Counter Monthly Salary Amount (₹) <span className="text-destructive">*</span></Label>
              <Input
                id="counterCtc"
                type="number"
                value={counterCtc}
                onChange={(e) => setCounterCtc(e.target.value)}
                required
                placeholder="e.g. 550000"
                min="1"
              />
            </div>
            <div>
              <Label htmlFor="counterBreakdown">Breakdown (JSON, optional)</Label>
              <Textarea
                id="counterBreakdown"
                value={counterBreakdown}
                onChange={(e) => setCounterBreakdown(e.target.value)}
                rows={3}
                placeholder={'{"basic":280000,"hra":110000}'}
              />
            </div>
            <div>
              <Label htmlFor="counterNotes">Notes</Label>
              <Textarea
                id="counterNotes"
                value={counterNotes}
                onChange={(e) => setCounterNotes(e.target.value)}
                rows={2}
                placeholder="Reason for counter offer…"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCounterPackageId(null)}>Cancel</Button>
              <Button type="submit" disabled={counterPackage.isPending}>
                {counterPackage.isPending ? 'Submitting…' : 'Submit Counter Offer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Withdraw dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will remove the candidacy from the active approval queue.
            </p>
            <div>
              <Label htmlFor="withdrawReason">Reason (optional)</Label>
              <Textarea
                id="withdrawReason"
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                rows={2}
                placeholder="Why are you withdrawing this candidate?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={onWithdraw}
              disabled={withdraw.isPending}
            >
              {withdraw.isPending ? 'Withdrawing…' : 'Confirm Withdraw'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
