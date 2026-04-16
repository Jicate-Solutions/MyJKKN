'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Info } from 'lucide-react';
import { useSubmitCandidate } from '@/hooks/hr/use-recruitment';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useStaff } from '@/hooks/staff/use-staff';
import { toast } from 'sonner';
import type { RoleCategory, MonthlySalaryBand } from '@/types/hr-recruitment';
import {
  ROLE_CATEGORY_LABELS,
  MONTHLY_SALARY_BAND_LABELS,
} from '@/types/hr-recruitment';

interface ApprovalFlowStep {
  step_order: number;
  approver_role: string;
  [key: string]: unknown;
}

interface ApprovalFlow {
  id: string;
  flow_name: string;
  conditions: Record<string, unknown>;
  steps: ApprovalFlowStep[];
}

export default function SubmitCandidatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mutation = useSubmitCandidate();

  // Read cross-profile entry-point params (R4.1 internal transfer, R4.2 learner graduate)
  const paramSourceStaffId = searchParams.get('source_staff_id') ?? '';
  const paramSource = searchParams.get('source') ?? '';          // 'internal_transfer' | 'learner_graduate'
  const paramName = searchParams.get('name') ?? '';
  const paramEmail = searchParams.get('email') ?? '';

  // Context (v1 — accepted as form input; Sprint N will auto-resolve from profile)
  const [hrOrgId, setHrOrgId] = useState('');

  // Candidate basics — initialised from URL params when present (pre-fill only, no auto-submit)
  const [name, setName] = useState(paramName);
  const [email, setEmail] = useState(paramEmail);
  const [phone, setPhone] = useState('');
  const [roleCategory, setRoleCategory] = useState<RoleCategory | ''>('');
  const [roleTitle, setRoleTitle] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [cvvizUrl, setCvvizUrl] = useState('');
  const [proposedMonthlySalaryBand, setProposedCtcBand] = useState<MonthlySalaryBand | ''>('');
  const [isEmergency, setIsEmergency] = useState(false);
  // R4.1: pre-tick "internal transfer" if arriving from a staff profile
  const [isInternalTransfer, setIsInternalTransfer] = useState(paramSource === 'internal_transfer');
  // R4.1: pre-select source staff when arriving from a staff profile
  const [sourceStaffId, setSourceStaffId] = useState(paramSourceStaffId);
  const [expectedJoiningDate, setExpectedJoiningDate] = useState('');

  // Sync URL params → form fields on initial mount (pre-fill, not auto-submit)
  useEffect(() => {
    if (paramName) setName(paramName);
    if (paramEmail) setEmail(paramEmail);
    if (paramSource === 'internal_transfer') setIsInternalTransfer(true);
    if (paramSourceStaffId) setSourceStaffId(paramSourceStaffId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // Approval flow preview
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlow[]>([]);
  const [flowsLoading, setFlowsLoading] = useState(false);

  // Institutions dropdown
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  // Staff list for internal transfer source (only load when needed)
  const { data: staffData } = useStaff({
    institution_id: institutionId || undefined,
  });
  const staffList = (staffData as any)?.data ?? [];

  // Fetch approval flow preview when role_category + proposed_monthly_salary_band are set
  useEffect(() => {
    if (!roleCategory || !proposedMonthlySalaryBand) {
      setApprovalFlows([]);
      return;
    }
    let cancelled = false;
    setFlowsLoading(true);

    const params = new URLSearchParams();
    if (hrOrgId) params.set('hr_organization_id', hrOrgId);

    fetch(`/api/hr/recruitment/approval-flows?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setApprovalFlows(json.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setApprovalFlows([]);
      })
      .finally(() => {
        if (!cancelled) setFlowsLoading(false);
      });

    return () => { cancelled = true; };
  }, [roleCategory, proposedMonthlySalaryBand, hrOrgId]);

  // Find a matching flow for the current category + band selection (best-effort client filter)
  const matchingFlow = approvalFlows.find((f) => {
    const c = f.conditions ?? {};
    const matchesCategory = !c.role_category || c.role_category === roleCategory;
    const matchesBand = !c.monthly_salary_band || c.monthly_salary_band === proposedMonthlySalaryBand;
    return matchesCategory && matchesBand;
  }) ?? (approvalFlows.length === 1 ? approvalFlows[0] : null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hrOrgId || !name || !email || !roleCategory || !roleTitle || !cvvizUrl) return;

    try {
      const result = await mutation.mutateAsync({
        hr_organization_id: hrOrgId,
        institution_id: institutionId || null,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        role_category: roleCategory,
        role_title: roleTitle.trim(),
        cvviz_url: cvvizUrl.trim(),
        proposed_monthly_salary_band: proposedMonthlySalaryBand || null,
        is_emergency: isEmergency,
        is_internal_transfer: isInternalTransfer,
        source_staff_id: isInternalTransfer && sourceStaffId ? sourceStaffId : null,
        expected_joining_date: expectedJoiningDate || null,
        submitted_by: '', // server fills from user.id
      });

      toast.success('Candidate submitted for approval');
      router.push(`/hr/recruitment/candidates/${result.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <ContentLayout title="Submit Candidate">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/recruitment">Recruitment</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Submit Candidate</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Pre-fill banner — shown when arriving from a staff or learner profile (R4.1 / R4.2) */}
      {(paramSource === 'internal_transfer' || paramSource === 'learner_graduate') && (
        <Alert className="mt-4 max-w-3xl">
          <Info className="h-4 w-4" />
          <AlertDescription>
            {paramSource === 'internal_transfer'
              ? 'Pre-filled from staff profile for internal mobility. Review all fields before submitting.'
              : 'Pre-filled from learner profile for graduate hiring. Review all fields before submitting.'}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4 max-w-3xl">
        {/* Context card — MVP until Sprint N auto-resolves from profile */}
        <Card>
          <CardHeader><CardTitle className="text-base">Context</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="hrOrgId">HR Organization ID</Label>
              <Input
                id="hrOrgId"
                value={hrOrgId}
                onChange={(e) => setHrOrgId(e.target.value)}
                required
                placeholder="uuid"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Sprint 3.1 will auto-resolve this from your logged-in profile. For now paste the UUID.
            </p>
          </CardContent>
        </Card>

        {/* Candidate basics */}
        <Card>
          <CardHeader><CardTitle className="text-base">Candidate Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Candidate's full name"
                />
              </div>
              <div>
                <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="candidate@example.com"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 XXXXX XXXXX (optional)"
                />
              </div>
              <div>
                <Label htmlFor="expectedJoiningDate">Expected Joining Date</Label>
                <Input
                  id="expectedJoiningDate"
                  type="date"
                  value={expectedJoiningDate}
                  onChange={(e) => setExpectedJoiningDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="cvvizUrl">CVViz Profile URL <span className="text-destructive">*</span></Label>
              <Input
                id="cvvizUrl"
                type="url"
                value={cvvizUrl}
                onChange={(e) => setCvvizUrl(e.target.value)}
                required
                placeholder="https://app.cvviz.com/jobs/XXXXX/candidates/XXXXX/notes"
              />
            </div>
          </CardContent>
        </Card>

        {/* Role details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Role</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="roleCategory">Role Category <span className="text-destructive">*</span></Label>
                <select
                  id="roleCategory"
                  value={roleCategory}
                  onChange={(e) => setRoleCategory(e.target.value as RoleCategory | '')}
                  required
                  className="w-full border rounded-md h-10 px-3 bg-background"
                >
                  <option value="">Select category…</option>
                  {(Object.entries(ROLE_CATEGORY_LABELS) as [RoleCategory, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="proposedMonthlySalaryBand">Proposed Monthly Salary Band</Label>
                <select
                  id="proposedMonthlySalaryBand"
                  value={proposedMonthlySalaryBand}
                  onChange={(e) => setProposedCtcBand(e.target.value as MonthlySalaryBand | '')}
                  className="w-full border rounded-md h-10 px-3 bg-background"
                >
                  <option value="">Not specified</option>
                  {(Object.entries(MONTHLY_SALARY_BAND_LABELS) as [MonthlySalaryBand, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="roleTitle">Role Title <span className="text-destructive">*</span></Label>
              <Input
                id="roleTitle"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                required
                placeholder="e.g. B.Com Faculty — CAS SF"
              />
            </div>

            <div>
              <Label htmlFor="institutionId">Institution</Label>
              {institutionsLoading ? (
                <div className="h-10 rounded-md border bg-muted/40 animate-pulse" />
              ) : institutions.length > 0 ? (
                <select
                  id="institutionId"
                  value={institutionId}
                  onChange={(e) => setInstitutionId(e.target.value)}
                  className="w-full border rounded-md h-10 px-3 bg-background"
                >
                  <option value="">All institutions</option>
                  {institutions.map((inst) => (
                    <option key={inst.id} value={inst.id}>{inst.name}</option>
                  ))}
                </select>
              ) : (
                <Input
                  id="institutionId"
                  value={institutionId}
                  onChange={(e) => setInstitutionId(e.target.value)}
                  placeholder="Institution UUID (optional)"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Approval chain preview */}
        {roleCategory && proposedMonthlySalaryBand && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                Approval Routing Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {flowsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-4 rounded bg-muted/40 animate-pulse" />
                  ))}
                </div>
              ) : matchingFlow ? (
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground text-xs mb-2">
                    Flow: <span className="font-medium text-foreground">{matchingFlow.flow_name}</span>
                  </p>
                  <p className="text-sm">This candidate will be routed to:</p>
                  <ol className="mt-1 space-y-1">
                    {(matchingFlow.steps ?? []).map((step, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {step.step_order ?? idx + 1}
                        </span>
                        <span>{step.approver_role}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : approvalFlows.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {approvalFlows.length} flow(s) available — no exact match for this category+band combination. Default routing will apply.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No approval flows configured for this HR organization yet. Contact your HR admin.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Flags */}
        <Card>
          <CardHeader><CardTitle className="text-base">Flags</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="isEmergency"
                checked={isEmergency}
                onCheckedChange={(v) => setIsEmergency(v === true)}
              />
              <Label htmlFor="isEmergency" className="text-sm font-normal cursor-pointer">
                Mark as urgent (bypass multi-step approval)
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="isInternalTransfer"
                checked={isInternalTransfer}
                onCheckedChange={(v) => setIsInternalTransfer(v === true)}
              />
              <Label htmlFor="isInternalTransfer" className="text-sm font-normal cursor-pointer">
                Internal transfer from existing staff
              </Label>
            </div>

            {isInternalTransfer && (
              <div className="pl-6 pt-1">
                <Label htmlFor="sourceStaffId">Source Staff Member</Label>
                {staffList.length > 0 ? (
                  <select
                    id="sourceStaffId"
                    value={sourceStaffId}
                    onChange={(e) => setSourceStaffId(e.target.value)}
                    className="w-full border rounded-md h-10 px-3 bg-background mt-1"
                  >
                    <option value="">Select staff member…</option>
                    {staffList.map((s: { id: string; name?: string; email?: string }) => (
                      <option key={s.id} value={s.id}>
                        {s.name ?? s.email ?? s.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="sourceStaffId"
                    value={sourceStaffId}
                    onChange={(e) => setSourceStaffId(e.target.value)}
                    placeholder="staff.id (UUID)"
                    className="mt-1"
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {mutation.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{(mutation.error as Error).message}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Submitting…' : 'Submit Candidate'}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/hr/recruitment">Cancel</Link>
          </Button>
        </div>
      </form>
    </ContentLayout>
  );
}
