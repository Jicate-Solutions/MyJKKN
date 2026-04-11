'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Shield,
  Plus,
  CheckCircle,
  Clock,
  AlertTriangle,
  UserCheck,
  Building2,
  Mail,
  Phone,
  Calendar,
  Target,
} from 'lucide-react';
import {
  useGovernanceMembers,
  useAddGovernanceMember,
  useComplianceItems,
  useCreateComplianceItem,
  useUpdateComplianceStatus,
  useComplianceDashboard,
  useReadinessAssessments,
  useCreateReadinessAssessment,
  useLatestReadiness,
} from '@/hooks/startup-studio';

// ─── Configs ────────────────────────────────────────────────────────────────

const BODY_CONFIG: Record<string, { label: string; color: string }> = {
  board_of_directors: { label: 'Board of Directors', color: 'bg-blue-100 text-blue-800' },
  advisory_council: { label: 'Advisory Council', color: 'bg-purple-100 text-purple-800' },
  finance_audit_committee: { label: 'Finance & Audit Committee', color: 'bg-amber-100 text-amber-800' },
  startup_selection_committee: { label: 'Startup Selection Committee', color: 'bg-green-100 text-green-800' },
  hr_compliance_committee: { label: 'HR & Compliance Committee', color: 'bg-cyan-100 text-cyan-800' },
  internal_complaints_committee: { label: 'Internal Complaints Committee', color: 'bg-rose-100 text-rose-800' },
};

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  chairperson: { label: 'Chairperson', color: 'bg-amber-100 text-amber-800' },
  member: { label: 'Member', color: 'bg-gray-100 text-gray-700' },
  secretary: { label: 'Secretary', color: 'bg-blue-100 text-blue-700' },
  ex_officio: { label: 'Ex Officio', color: 'bg-purple-100 text-purple-700' },
  invitee: { label: 'Invitee', color: 'bg-green-100 text-green-700' },
};

const COMPLIANCE_STATUS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800', icon: Clock },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  overdue: { label: 'Overdue', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
  not_applicable: { label: 'N/A', color: 'bg-gray-100 text-gray-600', icon: Shield },
};

const COMPLIANCE_CATEGORIES: Record<string, string> = {
  legal: 'Legal',
  financial: 'Financial',
  hr: 'HR',
  startup: 'Startup',
  reporting: 'Reporting',
  safety: 'Safety',
};

const BODIES = [
  'board_of_directors',
  'advisory_council',
  'finance_audit_committee',
  'startup_selection_committee',
  'hr_compliance_committee',
  'internal_complaints_committee',
] as const;

const ROLES = ['chairperson', 'member', 'secretary', 'ex_officio', 'invitee'] as const;

function formatDate(date: string | null) {
  if (!date) return '--';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Add Member Dialog ──────────────────────────────────────────────────────

function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    designation: '',
    organization: '',
    email: '',
    phone: '',
    body: '',
    role: '',
    term_start: '',
    term_end: '',
  });
  const addMember = useAddGovernanceMember();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addMember.mutateAsync(form);
    setForm({
      name: '',
      designation: '',
      organization: '',
      email: '',
      phone: '',
      body: '',
      role: '',
      term_start: '',
      term_end: '',
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1" /> Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Governance Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Body *</Label>
              <Select
                value={form.body}
                onValueChange={(v) => setForm({ ...form, body: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select body" />
                </SelectTrigger>
                <SelectContent>
                  {BODIES.map((b) => (
                    <SelectItem key={b} value={b}>{BODY_CONFIG[b].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role *</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_CONFIG[r].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Designation</Label>
              <Input
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
              />
            </div>
            <div>
              <Label>Organization</Label>
              <Input
                value={form.organization}
                onChange={(e) => setForm({ ...form, organization: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Term Start</Label>
              <Input
                type="date"
                value={form.term_start}
                onChange={(e) => setForm({ ...form, term_start: e.target.value })}
              />
            </div>
            <div>
              <Label>Term End</Label>
              <Input
                type="date"
                value={form.term_end}
                onChange={(e) => setForm({ ...form, term_end: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={addMember.isPending}>
              {addMember.isPending ? 'Adding...' : 'Add Member'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Compliance Item Dialog ─────────────────────────────────────────────

function AddComplianceDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: '',
    requirement: '',
    description: '',
    frequency: 'annually',
    due_date: '',
    is_critical: false,
  });
  const createItem = useCreateComplianceItem();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createItem.mutateAsync(form);
    setForm({ category: '', requirement: '', description: '', frequency: 'annually', due_date: '', is_critical: false });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-1" /> Add Item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Compliance Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category *</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COMPLIANCE_CATEGORIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Frequency *</Label>
              <Select
                value={form.frequency}
                onValueChange={(v) => setForm({ ...form, frequency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One Time</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                  <SelectItem value="as_needed">As Needed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Requirement *</Label>
              <Input
                value={form.requirement}
                onChange={(e) => setForm({ ...form, requirement: e.target.value })}
                required
              />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_critical}
                  onChange={(e) => setForm({ ...form, is_critical: e.target.checked })}
                  className="rounded"
                />
                Mark as Critical
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createItem.isPending}>
              {createItem.isPending ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Update Status Dialog ───────────────────────────────────────────────────

function UpdateStatusDialog({ item, onClose }: { item: any; onClose: () => void }) {
  const [status, setStatus] = useState(item.status);
  const [notes, setNotes] = useState(item.notes || '');
  const updateStatus = useUpdateComplianceStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateStatus.mutateAsync({
      itemId: item.id,
      data: {
        status,
        notes,
        completed_date: status === 'completed' ? new Date().toISOString().split('T')[0] : undefined,
      },
    });
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Update Status</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Requirement</Label>
          <p className="text-sm text-muted-foreground">{item.requirement}</p>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="not_applicable">Not Applicable</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={updateStatus.isPending}>
            {updateStatus.isPending ? 'Updating...' : 'Update'}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

// ─── Readiness Radar (Simplified Table View) ────────────────────────────────

function ReadinessRadar({ assessment }: { assessment: any }) {
  if (!assessment) return null;

  const pillars = [
    { name: 'Infrastructure', score: assessment.infra_score ?? 0, max: 25 },
    { name: 'Finance', score: assessment.finance_score ?? 0, max: 20 },
    { name: 'Board / Governance', score: assessment.board_score ?? 0, max: 20 },
    { name: 'Human Resources', score: assessment.hr_score ?? 0, max: 20 },
    { name: 'Legal / Compliance', score: assessment.legal_score ?? 0, max: 20 },
  ];

  const totalMax = pillars.reduce((s, p) => s + p.max, 0);
  const totalScore = pillars.reduce((s, p) => s + p.score, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Readiness Score</h3>
          <p className="text-sm text-muted-foreground">
            Assessed: {formatDate(assessment.assessment_date)}
            {assessment.assessed_by ? ` by ${assessment.assessed_by}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold">{totalScore}/{totalMax}</p>
          <p className="text-sm text-muted-foreground">
            {((totalScore / totalMax) * 100).toFixed(0)}% ready
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {pillars.map((pillar) => {
          const pct = pillar.max > 0 ? (pillar.score / pillar.max) * 100 : 0;
          const isWeakest = assessment.weakest_pillar?.includes(pillar.name.toLowerCase().split(' ')[0]);
          return (
            <div key={pillar.name}>
              <div className="flex justify-between text-sm mb-1">
                <span className={isWeakest ? 'text-red-600 font-medium' : ''}>
                  {pillar.name}
                  {isWeakest && ' (weakest)'}
                </span>
                <span className="font-medium">{pillar.score}/{pillar.max}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {assessment.improvement_plan && (
        <div className="p-3 bg-muted/50 rounded-lg mt-4">
          <p className="text-sm font-medium mb-1">Improvement Plan</p>
          <p className="text-sm text-muted-foreground">{assessment.improvement_plan}</p>
        </div>
      )}
    </div>
  );
}

// ─── New Assessment Dialog ──────────────────────────────────────────────────

function NewAssessmentDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    assessed_by: '',
    improvement_plan: '',
    // Infrastructure (5 items, 0-5 each)
    infra_physical_facilities: 0,
    infra_it_systems: 0,
    infra_lab_equipment: 0,
    infra_connectivity: 0,
    infra_co_working_space: 0,
    // Finance (4 items)
    finance_budget_process: 0,
    finance_audit_compliance: 0,
    finance_grant_management: 0,
    finance_sustainability_plan: 0,
    // Board (4 items)
    board_governance_structure: 0,
    board_meeting_regularity: 0,
    board_committee_formation: 0,
    board_strategic_planning: 0,
    // HR (4 items)
    hr_staff_capacity: 0,
    hr_training_programs: 0,
    hr_mentor_network: 0,
    hr_policies_in_place: 0,
    // Legal (4 items)
    legal_registration_complete: 0,
    legal_ip_policy: 0,
    legal_incubation_policy: 0,
    legal_sop_documentation: 0,
  });
  const createAssessment = useCreateReadinessAssessment();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAssessment.mutateAsync(form);
    setOpen(false);
  };

  const ScoreInput = ({ label, field }: { label: string; field: string }) => (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Select
        value={String((form as any)[field])}
        onValueChange={(v) => setForm({ ...form, [field]: parseInt(v) })}
      >
        <SelectTrigger className="w-16 h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1" /> New Assessment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Readiness Assessment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label>Assessed By</Label>
            <Input
              value={form.assessed_by}
              onChange={(e) => setForm({ ...form, assessed_by: e.target.value })}
              placeholder="Name of assessor"
            />
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Infrastructure (0-5 each)</h4>
            <div className="space-y-2 pl-2">
              <ScoreInput label="Physical Facilities" field="infra_physical_facilities" />
              <ScoreInput label="IT Systems" field="infra_it_systems" />
              <ScoreInput label="Lab & Equipment" field="infra_lab_equipment" />
              <ScoreInput label="Connectivity" field="infra_connectivity" />
              <ScoreInput label="Co-Working Space" field="infra_co_working_space" />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Finance (0-5 each)</h4>
            <div className="space-y-2 pl-2">
              <ScoreInput label="Budget Process" field="finance_budget_process" />
              <ScoreInput label="Audit Compliance" field="finance_audit_compliance" />
              <ScoreInput label="Grant Management" field="finance_grant_management" />
              <ScoreInput label="Sustainability Plan" field="finance_sustainability_plan" />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Board / Governance (0-5 each)</h4>
            <div className="space-y-2 pl-2">
              <ScoreInput label="Governance Structure" field="board_governance_structure" />
              <ScoreInput label="Meeting Regularity" field="board_meeting_regularity" />
              <ScoreInput label="Committee Formation" field="board_committee_formation" />
              <ScoreInput label="Strategic Planning" field="board_strategic_planning" />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Human Resources (0-5 each)</h4>
            <div className="space-y-2 pl-2">
              <ScoreInput label="Staff Capacity" field="hr_staff_capacity" />
              <ScoreInput label="Training Programs" field="hr_training_programs" />
              <ScoreInput label="Mentor Network" field="hr_mentor_network" />
              <ScoreInput label="Policies in Place" field="hr_policies_in_place" />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Legal / Compliance (0-5 each)</h4>
            <div className="space-y-2 pl-2">
              <ScoreInput label="Registration Complete" field="legal_registration_complete" />
              <ScoreInput label="IP Policy" field="legal_ip_policy" />
              <ScoreInput label="Incubation Policy" field="legal_incubation_policy" />
              <ScoreInput label="SOP Documentation" field="legal_sop_documentation" />
            </div>
          </div>

          <div>
            <Label>Improvement Plan</Label>
            <Textarea
              value={form.improvement_plan}
              onChange={(e) => setForm({ ...form, improvement_plan: e.target.value })}
              rows={3}
              placeholder="Key areas to improve and action items..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createAssessment.isPending}>
              {createAssessment.isPending ? 'Saving...' : 'Save Assessment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export function GovernanceDashboard() {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedCompliance, setSelectedCompliance] = useState<any>(null);

  const { data: membersRaw, isLoading: membersLoading } = useGovernanceMembers({ is_active: true });
  const { data: complianceRaw, isLoading: complianceLoading } = useComplianceItems(
    categoryFilter !== 'all' ? { category: categoryFilter } : undefined
  );
  const { data: dashboardRaw } = useComplianceDashboard();
  const { data: readinessRaw, isLoading: readinessLoading } = useReadinessAssessments();
  const { data: latestRaw } = useLatestReadiness();

  const members = (membersRaw as any)?.data ?? membersRaw ?? [];
  const compliance = (complianceRaw as any)?.data ?? complianceRaw ?? [];
  const dashboard = (dashboardRaw as any)?.data ?? dashboardRaw ?? null;
  const readiness = (readinessRaw as any)?.data ?? readinessRaw ?? [];
  const latest = (latestRaw as any)?.data ?? latestRaw ?? null;

  const isLoading = membersLoading || complianceLoading || readinessLoading;

  // Group members by body
  const membersByBody: Record<string, any[]> = {};
  (members as any[]).forEach((m: any) => {
    if (!membersByBody[m.body]) membersByBody[m.body] = [];
    membersByBody[m.body].push(m);
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      {dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{(dashboard as any).total}</p>
              <p className="text-sm text-muted-foreground">Total Items</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-green-600">{(dashboard as any).completion_rate}%</p>
              <p className="text-sm text-muted-foreground">Completion Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-red-600">{(dashboard as any).overdue}</p>
              <p className="text-sm text-muted-foreground">Overdue</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-amber-600">{(dashboard as any).critical_overdue}</p>
              <p className="text-sm text-muted-foreground">Critical Overdue</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="board" className="w-full">
        <TabsList>
          <TabsTrigger value="board">Board & Committees</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="readiness">Readiness</TabsTrigger>
        </TabsList>

        {/* Board & Committees Tab */}
        <TabsContent value="board">
          <div className="flex justify-end mb-4">
            <AddMemberDialog />
          </div>

          {Object.keys(membersByBody).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No governance members yet. Click Add Member to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(membersByBody).map(([body, bodyMembers]) => {
                const bodyConf = BODY_CONFIG[body] || { label: body, color: 'bg-gray-100 text-gray-800' };
                return (
                  <Card key={body}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        {bodyConf.label}
                        <Badge variant="secondary" className="ml-auto">{bodyMembers.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {bodyMembers.map((m: any) => {
                          const roleConf = ROLE_CONFIG[m.role] || { label: m.role, color: 'bg-gray-100' };
                          return (
                            <div key={m.id} className="flex items-start justify-between p-2 bg-muted/30 rounded-lg">
                              <div>
                                <p className="font-medium text-sm">{m.name}</p>
                                {m.designation && (
                                  <p className="text-xs text-muted-foreground">{m.designation}</p>
                                )}
                                {m.organization && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Building2 className="w-3 h-3" />{m.organization}
                                  </p>
                                )}
                                <div className="flex gap-2 mt-1">
                                  {m.email && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                      <Mail className="w-3 h-3" />{m.email}
                                    </span>
                                  )}
                                </div>
                                {(m.term_start || m.term_end) && (
                                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {formatDate(m.term_start)} - {formatDate(m.term_end)}
                                  </p>
                                )}
                              </div>
                              <Badge className={roleConf.color}>{roleConf.label}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Category:</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(COMPLIANCE_CATEGORIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <AddComplianceDialog />
          </div>

          {(compliance as any[]).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No compliance items yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(compliance as any[]).map((item: any) => {
                const statusConf = COMPLIANCE_STATUS[item.status] || COMPLIANCE_STATUS.pending;
                const StatusIcon = statusConf.icon;
                return (
                  <Dialog
                    key={item.id}
                    open={selectedCompliance?.id === item.id}
                    onOpenChange={(open) => !open && setSelectedCompliance(null)}
                  >
                    <div className="flex items-center justify-between p-3 bg-background border rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="flex items-start gap-3 flex-1">
                        <StatusIcon className={`w-5 h-5 mt-0.5 ${
                          item.status === 'overdue' ? 'text-red-500' :
                          item.status === 'completed' ? 'text-green-500' :
                          'text-muted-foreground'
                        }`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{item.requirement}</p>
                            {item.is_critical && (
                              <Badge variant="destructive" className="text-[10px] px-1 py-0">Critical</Badge>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                          )}
                          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{COMPLIANCE_CATEGORIES[item.category] || item.category}</span>
                            {item.due_date && <span>Due: {formatDate(item.due_date)}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Badge className={statusConf.color}>{statusConf.label}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedCompliance(item)}
                        >
                          Update
                        </Button>
                      </div>
                    </div>
                    {selectedCompliance?.id === item.id && (
                      <UpdateStatusDialog
                        item={item}
                        onClose={() => setSelectedCompliance(null)}
                      />
                    )}
                  </Dialog>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Readiness Tab */}
        <TabsContent value="readiness">
          <div className="flex justify-end mb-4">
            <NewAssessmentDialog />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Latest assessment radar */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-4 h-4" /> Latest Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                {latest ? (
                  <ReadinessRadar assessment={latest} />
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No assessments yet. Create your first one.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Assessment history */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Assessment History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(readiness as any[]).length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No history yet.</p>
                ) : (
                  <div className="space-y-3">
                    {(readiness as any[]).map((a: any) => {
                      const totalScore =
                        (a.infra_score ?? 0) +
                        (a.finance_score ?? 0) +
                        (a.board_score ?? 0) +
                        (a.hr_score ?? 0) +
                        (a.legal_score ?? 0);
                      const maxScore = 105; // 25 + 20 + 20 + 20 + 20
                      const pct = ((totalScore / maxScore) * 100).toFixed(0);

                      return (
                        <div
                          key={a.id}
                          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border"
                        >
                          <div>
                            <p className="font-medium text-sm">{formatDate(a.assessment_date)}</p>
                            {a.assessed_by && (
                              <p className="text-xs text-muted-foreground">By: {a.assessed_by}</p>
                            )}
                            {a.weakest_pillar && (
                              <p className="text-xs text-red-600 mt-0.5">
                                Weakest: {a.weakest_pillar}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold">{totalScore}/{maxScore}</p>
                            <p className="text-xs text-muted-foreground">{pct}%</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
