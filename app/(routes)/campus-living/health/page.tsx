'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Stethoscope,
  Plus,
  Search,
  Loader2,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Flame,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  useHealthCases,
  useCreateHealthCase,
} from '@/hooks/campus-living/use-hostel-health';
import { BlockSelector } from '@/components/campus-living/block-selector';


/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 * Added 2026-04-24 in the matchPaths-only sweep (PR follow-up to #408).
 */
export const navMeta = {
  invokedFrom: '/campus-living',
} as const;

// Real prod schema enums (verified via Supabase Management API):
// hostel_health_cases.severity → health_severity_enum
const SEVERITY_OPTIONS = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'serious', label: 'Serious' },
  { value: 'emergency', label: 'Emergency' },
];

// hostel_health_cases.status → health_case_status_enum
const STATUS_OPTIONS = [
  { value: 'reported', label: 'Reported' },
  { value: 'first_aid', label: 'First Aid' },
  { value: 'doctor_referred', label: 'Doctor Referred' },
  { value: 'hospitalized', label: 'Hospitalized' },
  { value: 'recovering', label: 'Recovering' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'closed', label: 'Closed' },
];

export default function HealthPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const filters = useMemo(
    () => ({
      block_id: blockFilter !== 'all' ? blockFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      severity: severityFilter !== 'all' ? severityFilter : undefined,
    }),
    [blockFilter, statusFilter, severityFilter]
  );

  const { data, isLoading } = useHealthCases(institutionId, filters);
  const cases = data?.data ?? [];

  const filteredCases = cases.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(c.case_number ?? '').toLowerCase().includes(q) ||
      String(c.symptoms ?? '').toLowerCase().includes(q) ||
      String(c.notes ?? '').toLowerCase().includes(q) ||
      String(c.id ?? '').toLowerCase().includes(q)
    );
  });

  const stats = useMemo(
    () => ({
      total: cases.length,
      open: cases.filter(
        (c) =>
          c.status === 'reported' ||
          c.status === 'first_aid' ||
          c.status === 'doctor_referred' ||
          c.status === 'hospitalized' ||
          c.status === 'recovering' ||
          c.status === 'open' || // legacy fallback
          c.status === 'under_treatment'
      ).length,
      critical: cases.filter(
        (c) => c.severity === 'serious' || c.severity === 'emergency' || c.severity === 'high' || c.severity === 'critical'
      ).length,
      recovered: cases.filter(
        (c) =>
          c.status === 'cleared' ||
          c.status === 'closed' ||
          c.status === 'recovered'
      ).length,
    }),
    [cases]
  );

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'emergency':
      case 'critical':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><Flame className="mr-1 h-3 w-3" />Emergency</Badge>;
      case 'serious':
      case 'high':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100"><AlertTriangle className="mr-1 h-3 w-3" />Serious</Badge>;
      case 'moderate':
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Moderate</Badge>;
      case 'minor':
      case 'low':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Minor</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'reported':
      case 'open':
        return <Badge variant="outline"><AlertTriangle className="mr-1 h-3 w-3" />Reported</Badge>;
      case 'first_aid':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">First Aid</Badge>;
      case 'doctor_referred':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Doctor Referred</Badge>;
      case 'hospitalized':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Hospitalized</Badge>;
      case 'recovering':
      case 'under_treatment':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><Activity className="mr-1 h-3 w-3" />Recovering</Badge>;
      case 'cleared':
      case 'recovered':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Cleared</Badge>;
      case 'closed':
        return <Badge variant="outline" className="text-muted-foreground">Closed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ContentLayout title="Health Cases">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Health' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Stethoscope className="h-6 w-6 text-primary" />
              Resident Health Cases
            </h1>
            <p className="text-muted-foreground">
              Log illnesses, track treatment and monitor recovery for hostel residents.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!institutionId}>
            <Plus className="mr-2 h-4 w-4" />
            Log Case
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-blue-600">{stats.open}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Serious / Emergency</p>
              <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Cleared / Closed</p>
              <p className="text-2xl font-bold text-green-600">{stats.recovered}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search cases…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <BlockSelector
                institutionId={institutionId}
                value={blockFilter}
                onValueChange={setBlockFilter}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  {SEVERITY_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredCases.length === 0 ? (
              <div className="py-16 text-center">
                <Stethoscope className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No health cases logged</h3>
                <p className="text-sm text-muted-foreground">
                  Log a case to start tracking a resident&apos;s treatment.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case #</TableHead>
                    <TableHead>Symptoms</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reported</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCases.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">
                        {String(c.case_number ?? c.id.slice(0, 8))}
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate text-sm">
                        {String(c.symptoms ?? '—')}
                      </TableCell>
                      <TableCell>{getSeverityBadge(c.severity as string)}</TableCell>
                      <TableCell>{getStatusBadge(c.status as string)}</TableCell>
                      <TableCell>
                        {c.reported_at
                          ? new Date(c.reported_at as string).toLocaleDateString()
                          : new Date(c.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateHealthCaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        institutionId={institutionId}
      />
    </ContentLayout>
  );
}

interface CreateHealthCaseDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  institutionId: string;
}

function CreateHealthCaseDialog({ open, onOpenChange, institutionId }: CreateHealthCaseDialogProps) {
  const createMut = useCreateHealthCase();
  const [blockId, setBlockId] = useState<string>('all');
  const [learnerId, setLearnerId] = useState<string>('');
  const [caseNumber, setCaseNumber] = useState<string>('');
  const [symptoms, setSymptoms] = useState<string>('');
  const [severity, setSeverity] = useState<string>('minor');
  const [status, setStatus] = useState<string>('reported');

  const reset = () => {
    setBlockId('all');
    setLearnerId('');
    setCaseNumber('');
    setSymptoms('');
    setSeverity('minor');
    setStatus('reported');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!institutionId) return;
    if (!learnerId.trim() || !symptoms.trim()) return;
    const caseNum = caseNumber.trim() ||
      `HC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, '0')}`;
    // Payload uses real prod columns. Service DTO has index signature so
    // unknown keys pass through unchanged.
    const payload = {
      institution_id: institutionId,
      learner_id: learnerId.trim(),
      block_id: blockId !== 'all' ? blockId : null,
      case_number: caseNum,
      symptoms: symptoms.trim(),
      severity,
      status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    createMut.mutate(payload, {
      onSuccess: () => {
        onOpenChange(false);
        reset();
      },
    });
  };

  const learnerValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    learnerId.trim()
  );
  const canSubmit =
    Boolean(institutionId) &&
    learnerValid &&
    symptoms.trim().length > 0 &&
    !createMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Log Health Case</DialogTitle>
            <DialogDescription>
              Record a new health case for a resident. Case number is auto-generated
              if blank. Learner UUID and symptoms are required by the live schema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="block">Block (optional)</Label>
              <BlockSelector
                institutionId={institutionId}
                value={blockId}
                onValueChange={setBlockId}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="learner-id">
                Learner UUID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="learner-id"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={learnerId}
                onChange={(e) => setLearnerId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Paste from the resident&apos;s profile URL.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="case-number">Case number (auto-generated if blank)</Label>
              <Input
                id="case-number"
                placeholder="HC-1234"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="symptoms">
                Symptoms <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="symptoms"
                placeholder="Describe what the resident is experiencing…"
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="severity">Severity</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger id="severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Log case
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
