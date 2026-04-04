'use client';
nexport const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useExpoTeamAccess } from '@/hooks/admission/use-expo-capture';
import {
  ArrowLeft,
  Edit,
  MapPin,
  Calendar,
  Users,
  UserCheck,
  IndianRupee,
  Calculator,
  Plus,
  Trash2,
  Loader2,
  Image as ImageIcon,
  XCircle,
  FileText,
  BarChart2,
  QrCode,
  Share2,
  ScanLine,
  Copy,
  Check as CheckIcon,
  Download,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import QRCode from 'qrcode';
import { LeadService } from '@/lib/services/admission/lead-service';
import type { AdmissionLead } from '@/types/admission';
import {
  useExpoEvent,
  useUpdateExpoEventStatus,
  useAddExpoTeamMember,
  useRemoveExpoTeamMember,
  useExpoDailyTrends,
} from '@/hooks/admission/use-expos';
import {
  useFilteredStaffForDropdown,
  useFilteredStudentsForDropdown,
} from '@/hooks/admission/use-referral-dropdowns';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { useAuth } from '@/hooks/use-auth';
import type {
  ExpoEvent,
  ExpoEventTeamMember,
  ExpoDailyReport,
  ExpoTeamMemberType,
  ExpoTeamMemberRole,
} from '@/types/admission';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ─── Status helpers ────────────────────────────────────────────────────────

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    planned: 'bg-blue-100 text-blue-800',
    confirmed: 'bg-indigo-100 text-indigo-800',
    in_progress: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  planned: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: ['planned'],
};

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    planned: 'Planned',
    confirmed: 'Confirmed',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
}

function getMemberTypeColor(type: string): string {
  const colors: Record<string, string> = {
    staff: 'bg-purple-100 text-purple-800',
    student: 'bg-cyan-100 text-cyan-800',
    external: 'bg-orange-100 text-orange-800',
  };
  return colors[type] || 'bg-gray-100 text-gray-800';
}

function getMemberRoleColor(role: string): string {
  const colors: Record<string, string> = {
    team_leader: 'bg-yellow-100 text-yellow-800',
    counselor: 'bg-blue-100 text-blue-800',
    volunteer: 'bg-green-100 text-green-800',
    support: 'bg-gray-100 text-gray-800',
  };
  return colors[role] || 'bg-gray-100 text-gray-800';
}

// ─── QR Code + Share Button ───────────────────────────────────────────────

function QRShareButton({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const captureUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/admission/marketing/expos/${eventId}/capture`
    : '';

  const handleShowQR = async () => {
    try {
      const url = await QRCode.toDataURL(captureUrl, {
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrDataUrl(url);
      setShowQR(true);
    } catch (err) {
      console.error('[expo] QR generation failed:', err);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(captureUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = captureUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `QR-${eventName.replace(/[^a-zA-Z0-9]/g, '-')}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleShowQR}>
        <QrCode className="h-4 w-4 mr-2" />
        QR Code
      </Button>
      <Button variant="outline" size="sm" onClick={handleCopyLink}>
        {copied ? <CheckIcon className="h-4 w-4 mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
        {copied ? 'Copied!' : 'Share Link'}
      </Button>

      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="sm:max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>Capture Form QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-sm text-muted-foreground">{eventName}</p>
            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR Code for capture form" className="w-64 h-64 rounded-lg border" />
            )}
            <p className="text-xs text-muted-foreground break-all px-4">{captureUrl}</p>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-center">
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? <CheckIcon className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
            <Button size="sm" onClick={handleDownloadQR}>
              <Download className="h-4 w-4 mr-2" />
              Download QR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Expo Leads Tab ───────────────────────────────────────────────────────

function getStageColor(stage: string): string {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800',
    contacted: 'bg-cyan-100 text-cyan-800',
    interested: 'bg-emerald-100 text-emerald-800',
    follow_up_scheduled: 'bg-yellow-100 text-yellow-800',
    qualified: 'bg-purple-100 text-purple-800',
    applied: 'bg-indigo-100 text-indigo-800',
    enrolled: 'bg-green-100 text-green-800',
    lost: 'bg-red-100 text-red-800',
    dormant: 'bg-gray-100 text-gray-800',
  };
  return colors[stage] || 'bg-gray-100 text-gray-800';
}

function ExpoLeadsTab({ eventId }: { eventId: string }) {
  const [leads, setLeads] = useState<AdmissionLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await LeadService.getLeads({
        expo_event_id: eventId,
        limit: 100,
        sort_by: 'created_at',
        sort_order: 'desc',
      });
      setLeads(result.data || []);
      setTotal(result.metadata.total);
    } catch (err) {
      console.error('[expo/leads-tab] Failed to fetch leads:', err);
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <UserCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No leads captured for this event yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Leads will appear here when team members capture them via the capture form.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Captured Leads ({total})
          </CardTitle>
          <Link href={`/admission/leads?expo_event_id=${eventId}`}>
            <Button variant="outline" size="sm">View in CRM</Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Counselor</TableHead>
                <TableHead>Captured</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Link
                      href={`/admission/leads/${lead.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {lead.full_name || `${lead.first_name} ${lead.last_name || ''}`}
                    </Link>
                    {lead.email && (
                      <p className="text-xs text-muted-foreground">{lead.email}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{lead.phone}</TableCell>
                  <TableCell>
                    <div className="text-sm">{lead.parent_name || '—'}</div>
                    {lead.parent_phone && (
                      <p className="text-xs text-muted-foreground">{lead.parent_phone}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${getStageColor(lead.funnel_stage)}`}>
                      {(lead.funnel_stage || 'new').replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {lead.counselor?.name || <span className="text-muted-foreground">Unassigned</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(lead.created_at).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {total > 100 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Showing first 100 of {total} leads.{' '}
            <Link href={`/admission/leads?expo_event_id=${eventId}`} className="text-primary hover:underline">
              View all in CRM
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ─── Skeleton ──────────────────────────────────────────────────────────────

function ExpoDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

// ─── Add Team Member Dialog ────────────────────────────────────────────────

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: {
    member_type: ExpoTeamMemberType;
    name: string;
    phone: string;
    role: ExpoTeamMemberRole;
    staff_id?: string;
    student_id?: string;
  }) => void;
  isPending: boolean;
  institutionId: string;
}

function AddMemberDialog({ open, onOpenChange, onAdd, isPending, institutionId }: AddMemberDialogProps) {
  const [memberType, setMemberType] = useState<ExpoTeamMemberType>('staff');
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<ExpoTeamMemberRole>('counselor');
  const [search, setSearch] = useState('');

  // Institution & hierarchy filters — expos are managed centrally,
  // but team members come from any JKKN college
  const { institutions, selectedInstitutionId } = useUserInstitutionAccess();
  const [filterInstitutionId, setFilterInstitutionId] = useState('');
  const [filterDegreeId, setFilterDegreeId] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const [filterProgramId, setFilterProgramId] = useState('');
  const [filterSemesterId, setFilterSemesterId] = useState('');
  const [filterSectionId, setFilterSectionId] = useState('');

  // Pick the first non-admin institution as default (skip "Jicate Solutions" which has no staff/students)
  const effectiveInstitutionId = filterInstitutionId
    || (institutions.length > 1
      ? institutions.find((i) => i.institution_id !== institutionId)?.institution_id ?? institutions[0]?.institution_id
      : selectedInstitutionId)
    || '';

  const isStaff = memberType === 'staff';
  const isStudent = memberType === 'student';
  const isExternal = memberType === 'external';

  // Hierarchy data hooks
  const { data: degreesData } = useDegrees({ institution_id: effectiveInstitutionId || undefined });
  const degrees = degreesData?.data ?? [];

  const { data: departmentsData } = useDepartments({
    institution_id: effectiveInstitutionId || undefined,
    degree_id: filterDegreeId || undefined,
  });
  const departments = departmentsData?.data ?? [];

  const { data: programsData } = usePrograms({
    institution_id: effectiveInstitutionId || undefined,
    degree_id: filterDegreeId || undefined,
    department_id: filterDepartmentId || undefined,
  });
  const programs = programsData?.data ?? [];

  const { data: semestersData } = useSemesters(
    { institution_id: effectiveInstitutionId || undefined, program_id: filterProgramId || undefined },
    { enabled: !!filterProgramId }
  );
  const semesters = semestersData?.data ?? [];

  const { data: sectionsData } = useSections(
    { semester_id: filterSemesterId || undefined },
    { enabled: !!filterSemesterId }
  );
  const sections = sectionsData?.data ?? [];

  // Person list hooks filtered by hierarchy
  const { data: staffList = [], isLoading: staffLoading } = useFilteredStaffForDropdown({
    institution_id: effectiveInstitutionId || undefined,
    department_id: filterDepartmentId || undefined,
    search: search || undefined,
  });

  const { data: studentList = [], isLoading: studentLoading } = useFilteredStudentsForDropdown({
    institution_id: effectiveInstitutionId || undefined,
    degree_id: filterDegreeId || undefined,
    department_id: filterDepartmentId || undefined,
    program_id: filterProgramId || undefined,
    semester_id: filterSemesterId || undefined,
    section_id: filterSectionId || undefined,
    search: search || undefined,
  });

  const personList = isStaff ? staffList : studentList;
  const personLoading = isStaff ? staffLoading : studentLoading;

  function resetHierarchy() {
    setFilterDegreeId('');
    setFilterDepartmentId('');
    setFilterProgramId('');
    setFilterSemesterId('');
    setFilterSectionId('');
    setSelectedId('');
    setSearch('');
  }

  function handleTypeChange(type: ExpoTeamMemberType) {
    setMemberType(type);
    setSelectedId('');
    setName('');
    setSearch('');
    resetHierarchy();
  }

  function handlePersonSelect(personId: string) {
    setSelectedId(personId);
    const found = personList.find((p) => p.id === personId);
    if (found) setName(found.name);
  }

  function handleSubmit() {
    const payload: Parameters<typeof onAdd>[0] = {
      member_type: memberType,
      name: isExternal ? name : (personList.find((p) => p.id === selectedId)?.name || name),
      phone,
      role,
    };
    if (isStaff && selectedId) payload.staff_id = selectedId;
    if (isStudent && selectedId) payload.student_id = selectedId;
    onAdd(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Member Type */}
          <div className="space-y-2">
            <Label>Member Type</Label>
            <Select value={memberType} onValueChange={(v) => handleTypeChange(v as ExpoTeamMemberType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff / Faculty</SelectItem>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="external">External</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Hierarchy Filters for Staff & Student */}
          {!isExternal && (
            <div className="rounded-md border border-dashed p-3 space-y-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground">
                {isStaff ? 'Filter by Institution & Department' : 'Filter by Academic Hierarchy'}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Institution */}
                <div className="space-y-1">
                  <Label className="text-xs">Institution</Label>
                  <Select
                    value={effectiveInstitutionId}
                    onValueChange={(v) => { setFilterInstitutionId(v); resetHierarchy(); }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select institution" />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions.map((inst) => (
                        <SelectItem key={inst.institution_id} value={inst.institution_id}>
                          {inst.institution_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Degree (student only) */}
                {isStudent && (
                  <div className="space-y-1">
                    <Label className="text-xs">Degree</Label>
                    <Select
                      value={filterDegreeId}
                      onValueChange={(v) => { setFilterDegreeId(v); setFilterDepartmentId(''); setFilterProgramId(''); setFilterSemesterId(''); setFilterSectionId(''); setSelectedId(''); }}
                      disabled={!effectiveInstitutionId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Degrees" />
                      </SelectTrigger>
                      <SelectContent>
                        {degrees.map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>{d.degree_name || d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Department */}
                <div className="space-y-1">
                  <Label className="text-xs">Department</Label>
                  <Select
                    value={filterDepartmentId}
                    onValueChange={(v) => { setFilterDepartmentId(v); setFilterProgramId(''); setFilterSemesterId(''); setFilterSectionId(''); setSelectedId(''); }}
                    disabled={!effectiveInstitutionId}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="All Departments" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>{d.department_name || d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Program (student only) */}
                {isStudent && (
                  <div className="space-y-1">
                    <Label className="text-xs">Program</Label>
                    <Select
                      value={filterProgramId}
                      onValueChange={(v) => { setFilterProgramId(v); setFilterSemesterId(''); setFilterSectionId(''); setSelectedId(''); }}
                      disabled={!filterDepartmentId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Programs" />
                      </SelectTrigger>
                      <SelectContent>
                        {programs.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.program_name || p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Semester (student only) */}
                {isStudent && (
                  <div className="space-y-1">
                    <Label className="text-xs">Semester</Label>
                    <Select
                      value={filterSemesterId}
                      onValueChange={(v) => { setFilterSemesterId(v); setFilterSectionId(''); setSelectedId(''); }}
                      disabled={!filterProgramId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Semesters" />
                      </SelectTrigger>
                      <SelectContent>
                        {semesters.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.semester_name || s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Section (student only) */}
                {isStudent && (
                  <div className="space-y-1">
                    <Label className="text-xs">Section</Label>
                    <Select
                      value={filterSectionId}
                      onValueChange={(v) => { setFilterSectionId(v); setSelectedId(''); }}
                      disabled={!filterSemesterId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Sections" />
                      </SelectTrigger>
                      <SelectContent>
                        {sections.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.section_name || s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Search + Person Select */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Search</Label>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name..."
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {isStaff ? 'Select Staff' : 'Select Student'}
                    {personList.length > 0 && (
                      <span className="text-muted-foreground font-normal ml-1">({personList.length})</span>
                    )}
                  </Label>
                  <Select
                    value={selectedId}
                    onValueChange={handlePersonSelect}
                    disabled={personLoading || !effectiveInstitutionId}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue
                        placeholder={
                          personLoading ? 'Loading…'
                            : !effectiveInstitutionId ? 'Select institution first'
                            : personList.length === 0 ? 'No results'
                            : `Select ${isStaff ? 'staff' : 'student'}`
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {personList.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {'role' in p && (p as any).role ? `${p.name} (${(p as any).role})` : p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* External only: Name */}
          {isExternal && (
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input placeholder="Enter name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}

          <div className="space-y-2">
            <Label>Phone</Label>
            <Input placeholder="+91 XXXXX XXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as ExpoTeamMemberRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team_leader">Team Leader</SelectItem>
                <SelectItem value="counselor">Counselor</SelectItem>
                <SelectItem value="volunteer">Volunteer</SelectItem>
                <SelectItem value="support">Support</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isPending ||
              (memberType !== 'external' && !selectedId) ||
              (memberType === 'external' && !name.trim())
            }
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Member'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main content ──────────────────────────────────────────────────────────

function ExpoEventDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const eventId = params.id as string;

  const isValidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId);

  const { event, isLoading, error } = useExpoEvent(isValidId ? eventId : '');
  const { trends, isLoading: trendsLoading } = useExpoDailyTrends(isValidId ? eventId : '');

  const updateStatus = useUpdateExpoEventStatus();
  const addMember = useAddExpoTeamMember();
  const removeMember = useRemoveExpoTeamMember();

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<ExpoEventTeamMember | null>(null);

  const institutionId = event?.institution_id || profile?.institution_id || '';

  function handleStatusChange(newStatus: string) {
    if (!event) return;
    updateStatus.mutate({ id: event.id, status: newStatus });
  }

  function handleAddMember(data: {
    member_type: ExpoTeamMemberType;
    name: string;
    phone: string;
    role: ExpoTeamMemberRole;
    staff_id?: string;
    student_id?: string;
  }) {
    addMember.mutate(
      { eventId, ...data },
      { onSuccess: () => setAddMemberOpen(false) }
    );
  }

  function handleRemoveMember() {
    if (!memberToRemove) return;
    removeMember.mutate(
      { memberId: memberToRemove.id, eventId },
      { onSuccess: () => setMemberToRemove(null) }
    );
  }

  if (isLoading) return <ExpoDetailSkeleton />;

  if (!isValidId || error || !event) {
    return (
      <div className="text-center py-12">
        <XCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
        <h3 className="text-lg font-medium mb-2">Event Not Found</h3>
        <p className="text-muted-foreground mb-4">
          The expo event you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Link href="/admission/marketing/expos">
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Expos
          </Button>
        </Link>
      </div>
    );
  }

  const teamMembers: ExpoEventTeamMember[] = event.team_members || [];
  const dailyReports: ExpoDailyReport[] = (event.daily_reports || []).sort(
    (a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime()
  );

  const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[event.event_status] || [];
  const costPerLead =
    event.total_leads_collected > 0
      ? event.total_expenses / event.total_leads_collected
      : 0;

  const teamLeaderName = event.team_leader?.full_name || null;

  const approvedByName = event.approved_by?.full_name || null;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/admission/marketing/expos')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{event.event_name}</h1>
            {event.organizer_name && (
              <p className="text-muted-foreground mt-0.5">Organised by {event.organizer_name}</p>
            )}
            <Badge className={`mt-2 ${getStatusColor(event.event_status)}`}>
              {getStatusLabel(event.event_status)}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {event.event_status !== 'cancelled' && event.event_status !== 'completed' && (
            <Link href={`/admission/marketing/expos/${event.id}/capture`}>
              <Button variant="default" size="sm">
                <ScanLine className="h-4 w-4 mr-2" />
                Capture Leads
              </Button>
            </Link>
          )}
          <QRShareButton eventId={event.id} eventName={event.event_name} />
          <Link href={`/admission/marketing/expos/${event.id}/edit`}>
            <Button variant="outline" size="sm">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{event.total_team_members}</div>
            <p className="text-xs text-muted-foreground">People attending</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads Collected</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{event.total_leads_collected}</div>
            <p className="text-xs text-muted-foreground">Across all days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(event.total_expenses)}</div>
            <p className="text-xs text-muted-foreground">All categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost per Lead</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {event.total_leads_collected > 0 ? formatCurrency(costPerLead) : '—'}
            </div>
            <p className="text-xs text-muted-foreground">Expenses ÷ leads</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">
            Team
            {teamMembers.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {teamMembers.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports">
            Daily Reports
            {dailyReports.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {dailyReports.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="leads">
            Leads
            {event.total_leads_collected > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {event.total_leads_collected}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Overview ── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Location & Dates */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Location &amp; Schedule</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{event.city}</p>
                    {event.venue_name && (
                      <p className="text-sm text-muted-foreground">{event.venue_name}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">
                      {format(new Date(event.start_date), 'PPP')}
                      {' → '}
                      {format(new Date(event.end_date), 'PPP')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.ceil(
                        (new Date(event.end_date).getTime() - new Date(event.start_date).getTime()) /
                          (1000 * 60 * 60 * 24)
                      ) + 1}{' '}
                      day(s)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Logistics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Logistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {event.travel_mode && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">Travel Mode</span>
                    <span className="font-medium capitalize">
                      {event.travel_mode.replace('_', ' ')}
                    </span>
                  </div>
                )}
                {event.accommodation_details && (
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground text-sm">Accommodation</span>
                    <span className="font-medium text-right max-w-[60%]">
                      {event.accommodation_details}
                    </span>
                  </div>
                )}
                {teamLeaderName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">Team Leader</span>
                    <span className="font-medium">{teamLeaderName}</span>
                  </div>
                )}
                {approvedByName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">Approved By</span>
                    <span className="font-medium">{approvedByName}</span>
                  </div>
                )}
                {!event.travel_mode && !event.accommodation_details && !teamLeaderName && !approvedByName && (
                  <p className="text-sm text-muted-foreground">No logistics details available.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Notes */}
          {event.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{event.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Status transitions */}
          {allowedTransitions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Change Status</CardTitle>
                <CardDescription>Move this event to the next stage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {allowedTransitions.map((nextStatus) => (
                    <Button
                      key={nextStatus}
                      variant="outline"
                      size="sm"
                      disabled={updateStatus.isPending}
                      onClick={() => handleStatusChange(nextStatus)}
                    >
                      {updateStatus.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : null}
                      Mark as {getStatusLabel(nextStatus)}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 2: Team ── */}
        <TabsContent value="team" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>People attending this expo event</CardDescription>
              </div>
              <Button size="sm" onClick={() => setAddMemberOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            </CardHeader>
            <CardContent>
              {teamMembers.length === 0 ? (
                <div className="text-center py-10">
                  <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No team members assigned yet.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setAddMemberOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Member
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>
                          <Badge className={getMemberTypeColor(member.member_type)}>
                            {member.member_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.phone || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={getMemberRoleColor(member.role)}>
                            {member.role.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setMemberToRemove(member)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Daily Reports ── */}
        <TabsContent value="reports" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold">Daily Reports</h3>
              <p className="text-sm text-muted-foreground">
                Expense and engagement data per day
              </p>
            </div>
            <Link href={`/admission/marketing/expos/${eventId}/report/new`}>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Report
              </Button>
            </Link>
          </div>

          {dailyReports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-4">No daily reports submitted yet.</p>
                <Link href={`/admission/marketing/expos/${eventId}/report/new`}>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Submit First Report
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            dailyReports.map((report) => (
              <Card key={report.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {format(new Date(report.report_date), 'EEEE, PPP')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Expense breakdown */}
                  <div>
                    <p className="text-sm font-medium mb-2 text-muted-foreground">
                      Expense Breakdown
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
                      {report.stall_fee > 0 && (
                        <>
                          <span className="text-muted-foreground">Stall Fee</span>
                          <span className="font-medium">{formatCurrency(report.stall_fee)}</span>
                        </>
                      )}
                      {report.travel_expense > 0 && (
                        <>
                          <span className="text-muted-foreground">Travel</span>
                          <span className="font-medium">
                            {formatCurrency(report.travel_expense)}
                          </span>
                        </>
                      )}
                      {report.accommodation_expense > 0 && (
                        <>
                          <span className="text-muted-foreground">Accommodation</span>
                          <span className="font-medium">
                            {formatCurrency(report.accommodation_expense)}
                          </span>
                        </>
                      )}
                      {report.food_expense > 0 && (
                        <>
                          <span className="text-muted-foreground">Food</span>
                          <span className="font-medium">
                            {formatCurrency(report.food_expense)}
                          </span>
                        </>
                      )}
                      {report.printing_materials > 0 && (
                        <>
                          <span className="text-muted-foreground">Printing / Materials</span>
                          <span className="font-medium">
                            {formatCurrency(report.printing_materials)}
                          </span>
                        </>
                      )}
                      {report.miscellaneous_expense > 0 && (
                        <>
                          <span className="text-muted-foreground">Miscellaneous</span>
                          <span className="font-medium">
                            {formatCurrency(report.miscellaneous_expense)}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t flex justify-between text-sm">
                      <span className="font-semibold">Total Expense</span>
                      <span className="font-bold">{formatCurrency(report.total_expense)}</span>
                    </div>
                  </div>

                  {/* Engagement metrics */}
                  <div>
                    <p className="text-sm font-medium mb-2 text-muted-foreground">
                      Engagement Metrics
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {[
                        { label: 'Visitors', value: report.total_visitors },
                        { label: 'Counselling', value: report.counselling_done },
                        { label: 'Brochures', value: report.brochures_distributed },
                        { label: 'Interested', value: report.interested_students },
                        { label: 'Leads', value: report.leads_collected },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-muted/50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold">{value}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Photos */}
                  {(report.stall_photos.length > 0 ||
                    report.event_photos.length > 0 ||
                    report.visitor_photos.length > 0) && (
                    <div>
                      <p className="text-sm font-medium mb-2 text-muted-foreground">Photos</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          ...report.stall_photos,
                          ...report.event_photos,
                          ...report.visitor_photos,
                        ].map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Photo ${idx + 1}`}
                              className="h-16 w-16 object-cover rounded border hover:opacity-80 transition-opacity"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {report.notes && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap border-t pt-3">
                      {report.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Tab 4: Leads Captured ── */}
        <TabsContent value="leads" className="mt-4">
          <ExpoLeadsTab eventId={event.id} />
        </TabsContent>

        {/* ── Tab 5: Analytics ── */}
        <TabsContent value="analytics" className="space-y-4 mt-4">
          {trendsLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : trends.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No data available yet. Submit daily reports to see analytics.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Visitor & lead trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Daily Visitor &amp; Lead Trends</CardTitle>
                  <CardDescription>Visitors, leads and counselling sessions per day</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={trends} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => {
                          try {
                            return format(new Date(v), 'dd MMM');
                          } catch {
                            return v;
                          }
                        }}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        labelFormatter={(label) => {
                          try {
                            return format(new Date(label as string), 'PPP');
                          } catch {
                            return label as string;
                          }
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="total_visitors"
                        name="Visitors"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="leads_collected"
                        name="Leads"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="counselling_done"
                        name="Counselling"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Expense summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Expense Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold">{formatCurrency(event.total_expenses)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Total Expenses</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold">{event.total_leads_collected}</p>
                      <p className="text-xs text-muted-foreground mt-1">Total Leads</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold">
                        {event.total_leads_collected > 0 ? formatCurrency(costPerLead) : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Cost per Lead</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Add member dialog */}
      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        onAdd={handleAddMember}
        isPending={addMember.isPending}
        institutionId={institutionId}
      />

      {/* Remove member confirmation */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => { if (!open) setMemberToRemove(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <span className="font-medium">{memberToRemove?.name}</span> from this event?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMember.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={removeMember.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMember.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Page wrapper ──────────────────────────────────────────────────────────

export default function ExpoEventDetailPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { canViewExpo, isLoading: teamAccessLoading } = useExpoTeamAccess(eventId);

  // Allow access via permission OR team membership
  return (
    <PermissionGuard
      module="admission.marketing.expos"
      action="view"
      fallback={
        // If PermissionGuard fails, check team membership as fallback
        teamAccessLoading ? null : canViewExpo ? (
          <ExpoDetailLayout eventId={eventId} />
        ) : null
      }
    >
      <ExpoDetailLayout eventId={eventId} />
    </PermissionGuard>
  );
}

function ExpoDetailLayout({ eventId }: { eventId: string }) {
  return (
    <ContentLayout title="Expo Event Details">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/marketing/expos">Expos</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Event Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="mt-6">
        <AdmissionErrorBoundary>
          <ExpoEventDetailContent />
        </AdmissionErrorBoundary>
      </div>
    </ContentLayout>
  );
}
