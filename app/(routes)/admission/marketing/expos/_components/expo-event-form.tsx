'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save, Loader2, Filter, Search, FileWarning } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useFormDraftObject, clearFormDraft } from '@/hooks/use-form-draft';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import {
  useExpoMasters,
  useCreateExpoEvent,
  useUpdateExpoEvent,
} from '@/hooks/admission/use-expos';
import {
  useUsersByRolesForDropdown,
  useFilteredStaffForDropdown,
  useFilteredStudentsForDropdown,
} from '@/hooks/admission/use-referral-dropdowns';
import { TeamMemberPicker } from './team-member-picker';
import type {
  ExpoEvent,
  CreateExpoEventInput,
  UpdateExpoEventInput,
  CreateExpoTeamMemberInput,
  TravelMode,
  ExpoEventStatus,
} from '@/types/admission';

interface ExpoEventFormProps {
  mode: 'create' | 'edit';
  initialData?: ExpoEvent;
}

const TRAVEL_MODE_OPTIONS: { value: TravelMode; label: string }[] = [
  { value: 'bus', label: 'Bus' },
  { value: 'train', label: 'Train' },
  { value: 'flight', label: 'Flight' },
  { value: 'own_vehicle', label: 'Own Vehicle' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS: { value: ExpoEventStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'confirmed', label: 'Confirmed' },
];

export function ExpoEventForm({ mode, initialData }: ExpoEventFormProps) {
  const router = useRouter();
  const { profile } = useAuth();

  // institution_id resolved after useUserInstitutionAccess() hook below
  let institutionId: string | null = null;

  // ── Form draft persistence (survives route navigation) ───────────────────
  const draftKey = mode === 'edit' && initialData?.id
    ? `expo-event-edit-${initialData.id}`
    : 'expo-event-create';

  const { values: draft, setValue: setDraft, setValues: setDraftValues, clearDraft, isDraft } =
    useFormDraftObject(draftKey, {
      selectedMasterId: initialData?.expo_master_id ?? '',
      eventName: initialData?.event_name ?? '',
      organizerName: initialData?.organizer_name ?? '',
      city: initialData?.city ?? '',
      venueName: initialData?.venue_name ?? '',
      startDate: initialData?.start_date ?? '',
      endDate: initialData?.end_date ?? '',
      travelMode: (initialData?.travel_mode ?? '') as TravelMode | '',
      accommodationDetails: initialData?.accommodation_details ?? '',
      teamLeaderId: initialData?.team_leader_id ?? '',
      approvedById: initialData?.approved_by_id ?? '',
      eventStatus: initialData?.event_status ?? 'planned' as ExpoEventStatus,
      notes: initialData?.notes ?? '',
      teamMembers: [] as CreateExpoTeamMemberInput[],
    });

  // Convenience aliases for readability
  const selectedMasterId = draft.selectedMasterId;
  const eventName = draft.eventName;
  const organizerName = draft.organizerName;
  const city = draft.city;
  const venueName = draft.venueName;
  const startDate = draft.startDate;
  const endDate = draft.endDate;
  const travelMode = draft.travelMode;
  const accommodationDetails = draft.accommodationDetails;
  const teamLeaderId = draft.teamLeaderId;
  const teamMembers = draft.teamMembers;

  const { data: masters, isLoading: mastersLoading } = useExpoMasters({
    is_active: true,
  });

  // ── Team Leader hierarchy filter state ──────────────────────────────────
  const [leaderType, setLeaderType] = useState<'staff' | 'student'>('staff');
  const [leaderSearch, setLeaderSearch] = useState('');
  const { institutions, selectedInstitutionId } = useUserInstitutionAccess();
  // Resolve institution_id: use selectedInstitutionId for all roles (including super_admin)
  institutionId = initialData?.institution_id ?? selectedInstitutionId ?? profile?.institution_id ?? null;
  const [leaderInstitutionId, setLeaderInstitutionId] = useState('');
  const [leaderDegreeId, setLeaderDegreeId] = useState('');
  const [leaderDepartmentId, setLeaderDepartmentId] = useState('');
  const [leaderProgramId, setLeaderProgramId] = useState('');
  const [leaderSemesterId, setLeaderSemesterId] = useState('');
  const [leaderSectionId, setLeaderSectionId] = useState('');

  const leaderInstId = leaderInstitutionId || selectedInstitutionId || '';

  // Team leader hierarchy data
  const { data: leaderDegreesData } = useDegrees({
    institution_id: leaderInstId || undefined,
  });
  const leaderDegrees = leaderDegreesData?.data ?? [];

  const { data: leaderDepartmentsData } = useDepartments({
    institution_id: leaderInstId || undefined,
    degree_id: leaderDegreeId || undefined,
  });
  const leaderDepartments = leaderDepartmentsData?.data ?? [];

  const { data: leaderProgramsData } = usePrograms({
    institution_id: leaderInstId || undefined,
    degree_id: leaderDegreeId || undefined,
    department_id: leaderDepartmentId || undefined,
  });
  const leaderPrograms = leaderProgramsData?.data ?? [];

  const { data: leaderSemestersData } = useSemesters(
    { program_id: leaderProgramId || undefined },
    { enabled: !!leaderProgramId }
  );
  const leaderSemesters = leaderSemestersData?.data ?? [];

  const { data: leaderSectionsData } = useSections(
    { semester_id: leaderSemesterId || undefined },
    { enabled: !!leaderSemesterId }
  );
  const leaderSections = leaderSectionsData?.data ?? [];

  // Team leader filtered person lists
  const { data: leaderStaffList = [], isLoading: leaderStaffLoading } =
    useFilteredStaffForDropdown({
      institution_id: leaderInstId || undefined,
      department_id: leaderDepartmentId || undefined,
      search: leaderSearch || undefined,
    });

  const { data: leaderStudentList = [], isLoading: leaderStudentLoading } =
    useFilteredStudentsForDropdown({
      institution_id: leaderInstId || undefined,
      degree_id: leaderDegreeId || undefined,
      department_id: leaderDepartmentId || undefined,
      program_id: leaderProgramId || undefined,
      semester_id: leaderSemesterId || undefined,
      section_id: leaderSectionId || undefined,
      search: leaderSearch || undefined,
    });

  const leaderList = leaderType === 'staff' ? leaderStaffList : leaderStudentList;
  const leaderLoading = leaderType === 'staff' ? leaderStaffLoading : leaderStudentLoading;

  // ── Approval & Notes (from draft) ────────────────────────────────────────
  const approvedById = draft.approvedById;
  const eventStatus = draft.eventStatus;
  const notes = draft.notes;

  // ── Approver: role filter + search ─────────────────────────────────────
  const [approverRole, setApproverRole] = useState('');
  const [approverSearch, setApproverSearch] = useState('');

  const approverRoles = approverRole ? [approverRole] : [];
  const { data: approverListRaw = [], isLoading: approverLoading } =
    useUsersByRolesForDropdown(approverRoles);

  // Client-side search filter on the approver list
  const approverList = approverSearch
    ? approverListRaw.filter((u) =>
        u.name.toLowerCase().includes(approverSearch.toLowerCase())
      )
    : approverListRaw;

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useCreateExpoEvent();
  const updateMutation = useUpdateExpoEvent();

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // ── Auto-fill from expo master ────────────────────────────────────────────
  useEffect(() => {
    if (!selectedMasterId) return;
    const master = masters.find((m) => m.id === selectedMasterId);
    if (!master) return;
    setDraftValues({
      eventName: master.event_name,
      organizerName: master.organizer_name ?? '',
      city: master.city ?? '',
      venueName: master.venue_name ?? '',
    });
  }, [selectedMasterId, masters]);

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!eventName.trim()) return 'Event name is required.';
    if (!city.trim()) return 'City is required.';
    if (!startDate) return 'Start date is required.';
    if (!endDate) return 'End date is required.';
    if (endDate < startDate) return 'End date must be on or after start date.';
    return null;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (mode === 'create') {
      const input: CreateExpoEventInput = {
        institution_id: institutionId ?? undefined,
        event_name: eventName.trim(),
        city: city.trim(),
        start_date: startDate,
        end_date: endDate,
        ...(selectedMasterId ? { expo_master_id: selectedMasterId } : {}),
        ...(organizerName.trim()
          ? { organizer_name: organizerName.trim() }
          : {}),
        ...(venueName.trim() ? { venue_name: venueName.trim() } : {}),
        ...(travelMode ? { travel_mode: travelMode } : {}),
        ...(accommodationDetails.trim()
          ? { accommodation_details: accommodationDetails.trim() }
          : {}),
        ...(teamLeaderId ? { team_leader_id: teamLeaderId } : {}),
        ...(approvedById ? { approved_by_id: approvedById } : {}),
        event_status: eventStatus,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(teamMembers.length > 0 ? { team_members: teamMembers } : {}),
      };

      createMutation.mutate(input, {
        onSuccess: () => {
          clearDraft();
          router.push('/admission/marketing/expos');
        },
      });
    } else {
      if (!initialData?.id) return;

      const input: UpdateExpoEventInput & { id: string } = {
        id: initialData.id,
        event_name: eventName.trim(),
        city: city.trim(),
        start_date: startDate,
        end_date: endDate,
        ...(organizerName.trim()
          ? { organizer_name: organizerName.trim() }
          : {}),
        ...(venueName.trim() ? { venue_name: venueName.trim() } : {}),
        ...(travelMode ? { travel_mode: travelMode } : {}),
        ...(accommodationDetails.trim()
          ? { accommodation_details: accommodationDetails.trim() }
          : {}),
        ...(teamLeaderId ? { team_leader_id: teamLeaderId } : {}),
        ...(approvedById ? { approved_by_id: approvedById } : {}),
        event_status: eventStatus,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };

      updateMutation.mutate(input, {
        onSuccess: () => {
          clearDraft();
          router.push(`/admission/marketing/expos/${initialData.id}`);
        },
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Back link */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => {
            clearDraft();
            router.push('/admission/marketing/expos');
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Expos
        </Button>
      </div>

      {/* ── Section 1: Expo Master Selection ── */}
      <Card>
        <CardHeader>
          <CardTitle>Expo Master</CardTitle>
          <CardDescription>
            Select an existing expo master to auto-fill details, or enter them
            manually below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="expo-master">Expo Master (optional)</Label>
            <Select
              value={selectedMasterId}
              onValueChange={(v) =>
                setDraft('selectedMasterId', v === '__none__' ? '' : v)
              }
              disabled={mastersLoading}
            >
              <SelectTrigger id="expo-master">
                <SelectValue
                  placeholder={
                    mastersLoading ? 'Loading…' : 'Select expo master'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  — Enter details manually —
                </SelectItem>
                {masters.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.event_name}
                    {m.city ? ` — ${m.city}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Event Details ── */}
      <Card>
        <CardHeader>
          <CardTitle>Event Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="event-name">
              Event Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="event-name"
              value={eventName}
              onChange={(e) => setDraft('eventName', e.target.value)}
              placeholder="e.g. Engineering Expo 2026"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="organizer-name">Organizer Name</Label>
            <Input
              id="organizer-name"
              value={organizerName}
              onChange={(e) => setDraft('organizerName', e.target.value)}
              placeholder="Organizing body or contact"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="city">
              City <span className="text-destructive">*</span>
            </Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setDraft('city', e.target.value)}
              placeholder="e.g. Chennai"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venue-name">Venue Name</Label>
            <Input
              id="venue-name"
              value={venueName}
              onChange={(e) => setDraft('venueName', e.target.value)}
              placeholder="e.g. Convention Centre Hall A"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Schedule & Logistics ── */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule &amp; Logistics</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="start-date">
              Start Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setDraft('startDate', e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="end-date">
              End Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setDraft('endDate', e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="travel-mode">Travel Mode</Label>
            <Select
              value={travelMode}
              onValueChange={(v) =>
                setDraft('travelMode', v === '__none__' ? '' : (v as TravelMode))
              }
            >
              <SelectTrigger id="travel-mode">
                <SelectValue placeholder="Select travel mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Not specified —</SelectItem>
                {TRAVEL_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="accommodation">Accommodation Details</Label>
            <Textarea
              id="accommodation"
              value={accommodationDetails}
              onChange={(e) => setDraft('accommodationDetails', e.target.value)}
              placeholder="Hotel name, address, booking reference…"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Section 4: Team Assignment ── */}
      <Card>
        <CardHeader>
          <CardTitle>Team Assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Team Leader with hierarchy filters */}
          <div className="rounded-md border p-4 space-y-4">
            <Label className="text-sm font-semibold">Team Leader</Label>

            {/* Row 1: Member Type */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Member Type</Label>
                <Select
                  value={leaderType}
                  onValueChange={(v) => {
                    setLeaderType(v as 'staff' | 'student');
                    setDraft('teamLeaderId', '');
                    setLeaderSearch('');
                    setLeaderDegreeId('');
                    setLeaderDepartmentId('');
                    setLeaderProgramId('');
                    setLeaderSemesterId('');
                    setLeaderSectionId('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="student">Student</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Hierarchy Filters */}
            <div className="rounded-md border border-dashed p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                {leaderType === 'staff'
                  ? 'Filter by Institution & Department'
                  : 'Filter by Academic Hierarchy'}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {/* Institution */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Institution</Label>
                  <Select
                    value={leaderInstId}
                    onValueChange={(v) => {
                      setLeaderInstitutionId(v);
                      setLeaderDegreeId('');
                      setLeaderDepartmentId('');
                      setLeaderProgramId('');
                      setLeaderSemesterId('');
                      setLeaderSectionId('');
                      setDraft('teamLeaderId', '');
                    }}
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

                {/* Degree — student only */}
                {leaderType === 'student' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Degree</Label>
                    <Select
                      value={leaderDegreeId}
                      onValueChange={(v) => {
                        setLeaderDegreeId(v);
                        setLeaderDepartmentId('');
                        setLeaderProgramId('');
                        setLeaderSemesterId('');
                        setLeaderSectionId('');
                        setDraft('teamLeaderId', '');
                      }}
                      disabled={!leaderInstId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Degrees" />
                      </SelectTrigger>
                      <SelectContent>
                        {leaderDegrees.map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.degree_name || d.display_name || d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Department */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Department</Label>
                  <Select
                    value={leaderDepartmentId}
                    onValueChange={(v) => {
                      setLeaderDepartmentId(v);
                      setLeaderProgramId('');
                      setLeaderSemesterId('');
                      setLeaderSectionId('');
                      setDraft('teamLeaderId', '');
                    }}
                    disabled={!leaderInstId}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="All Departments" />
                    </SelectTrigger>
                    <SelectContent>
                      {leaderDepartments.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.department_name || d.display_name || d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Program — student only */}
                {leaderType === 'student' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Program</Label>
                    <Select
                      value={leaderProgramId}
                      onValueChange={(v) => {
                        setLeaderProgramId(v);
                        setLeaderSemesterId('');
                        setLeaderSectionId('');
                        setDraft('teamLeaderId', '');
                      }}
                      disabled={!leaderDepartmentId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Programs" />
                      </SelectTrigger>
                      <SelectContent>
                        {leaderPrograms.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.program_name || p.display_name || p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Semester — student only */}
                {leaderType === 'student' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Semester</Label>
                    <Select
                      value={leaderSemesterId}
                      onValueChange={(v) => {
                        setLeaderSemesterId(v);
                        setLeaderSectionId('');
                        setDraft('teamLeaderId', '');
                      }}
                      disabled={!leaderProgramId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Semesters" />
                      </SelectTrigger>
                      <SelectContent>
                        {leaderSemesters.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.semester_name || s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Section — student only */}
                {leaderType === 'student' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Section</Label>
                    <Select
                      value={leaderSectionId}
                      onValueChange={(v) => {
                        setLeaderSectionId(v);
                        setDraft('teamLeaderId', '');
                      }}
                      disabled={!leaderSemesterId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Sections" />
                      </SelectTrigger>
                      <SelectContent>
                        {leaderSections.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.section_name || s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Row 3: Search + Person Select */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={leaderSearch}
                    onChange={(e) => setLeaderSearch(e.target.value)}
                    placeholder="Search by name..."
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">
                  {leaderType === 'staff' ? 'Select Staff' : 'Select Student'}
                  {leaderList.length > 0 && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({leaderList.length})
                    </span>
                  )}
                </Label>
                <Select
                  value={teamLeaderId}
                  onValueChange={(v) =>
                    setDraft('teamLeaderId', v === '__none__' ? '' : v)
                  }
                  disabled={leaderLoading || !leaderInstId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        leaderLoading
                          ? 'Loading…'
                          : !leaderInstId
                            ? 'Select institution first'
                            : leaderList.length === 0
                              ? 'No results'
                              : 'Select team leader'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {leaderList.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {'role' in u && (u as any).role
                          ? `${u.name} (${(u as any).role})`
                          : u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {mode === 'create' && (
            <TeamMemberPicker
              members={teamMembers}
              onChange={(members) => setDraft('teamMembers', members)}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Section 5: Approval & Notes ── */}
      <Card>
        <CardHeader>
          <CardTitle>Approval &amp; Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Approved By — with role filter + search */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={approverRole}
                onValueChange={(v) => {
                  setApproverRole(v);
                  setDraft('approvedById', '');
                  setApproverSearch('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="administrator">Administrator</SelectItem>
                  <SelectItem value="principal">Principal</SelectItem>
                  <SelectItem value="hod">HOD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={approverSearch}
                  onChange={(e) => setApproverSearch(e.target.value)}
                  placeholder="Search by name..."
                  className="pl-9"
                  disabled={!approverRole}
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>
                Approved By
                {approverList.length > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">
                    ({approverList.length})
                  </span>
                )}
              </Label>
              <Select
                value={approvedById}
                onValueChange={(v) =>
                  setDraft('approvedById', v === '__none__' ? '' : v)
                }
                disabled={approverLoading || !approverRole}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !approverRole
                        ? 'Select role first'
                        : approverLoading
                          ? 'Loading…'
                          : approverList.length === 0
                            ? 'No results'
                            : 'Select approver'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {approverList.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === 'edit' && (
            <div className="space-y-1.5">
              <Label htmlFor="event-status">Event Status</Label>
              <Select
                value={eventStatus}
                onValueChange={(v) => setDraft('eventStatus', v as ExpoEventStatus)}
              >
                <SelectTrigger id="event-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setDraft('notes', e.target.value)}
              placeholder="Additional notes or instructions…"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Submit ── */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            clearDraft();
            router.push('/admission/marketing/expos');
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {mode === 'create' ? 'Creating…' : 'Saving…'}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {mode === 'create' ? 'Create Event' : 'Save Changes'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
