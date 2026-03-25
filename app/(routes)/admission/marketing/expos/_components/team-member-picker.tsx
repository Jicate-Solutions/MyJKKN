'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Users, Search, Filter } from 'lucide-react';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import {
  useFilteredStaffForDropdown,
  useFilteredStudentsForDropdown,
} from '@/hooks/admission/use-referral-dropdowns';
import type {
  CreateExpoTeamMemberInput,
  ExpoTeamMemberType,
  ExpoTeamMemberRole,
} from '@/types/admission';

interface TeamMemberPickerProps {
  members: CreateExpoTeamMemberInput[];
  onChange: (members: CreateExpoTeamMemberInput[]) => void;
}

const ROLE_OPTIONS: { value: ExpoTeamMemberRole; label: string }[] = [
  { value: 'team_leader', label: 'Team Leader' },
  { value: 'counselor', label: 'Counselor' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'support', label: 'Support' },
];

const MEMBER_TYPE_OPTIONS: { value: ExpoTeamMemberType; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'student', label: 'Student' },
  { value: 'external', label: 'External' },
];

const ROLE_BADGE_VARIANT: Record<ExpoTeamMemberRole, 'default' | 'secondary' | 'outline'> = {
  team_leader: 'default',
  counselor: 'secondary',
  volunteer: 'outline',
  support: 'outline',
};

const TYPE_BADGE_VARIANT: Record<ExpoTeamMemberType, 'default' | 'secondary' | 'outline'> = {
  staff: 'default',
  student: 'secondary',
  external: 'outline',
};

export function TeamMemberPicker({
  members,
  onChange,
}: TeamMemberPickerProps) {
  // ─── Member form state ────────────────────────────────────────────────
  const [memberType, setMemberType] = useState<ExpoTeamMemberType>('staff');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<ExpoTeamMemberRole>('volunteer');
  const [personSearch, setPersonSearch] = useState('');

  // ─── Hierarchy filter state ───────────────────────────────────────────
  const { institutions, selectedInstitutionId } = useUserInstitutionAccess();
  const [filterInstitutionId, setFilterInstitutionId] = useState(selectedInstitutionId || '');
  const [filterDegreeId, setFilterDegreeId] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const [filterProgramId, setFilterProgramId] = useState('');
  const [filterSemesterId, setFilterSemesterId] = useState('');
  const [filterSectionId, setFilterSectionId] = useState('');

  // Set default institution when it loads
  const institutionId = filterInstitutionId || selectedInstitutionId || '';

  // ─── Hierarchy data hooks ─────────────────────────────────────────────
  const { data: degreesData } = useDegrees({
    institution_id: institutionId || undefined,
  });
  const degrees = degreesData?.data ?? [];

  const { data: departmentsData } = useDepartments({
    institution_id: institutionId || undefined,
    degree_id: filterDegreeId || undefined,
  });
  const departments = departmentsData?.data ?? [];

  const { data: programsData } = usePrograms({
    institution_id: institutionId || undefined,
    degree_id: filterDegreeId || undefined,
    department_id: filterDepartmentId || undefined,
  });
  const programs = programsData?.data ?? [];

  const { data: semestersData } = useSemesters(
    {
      institution_id: institutionId || undefined,
      program_id: filterProgramId || undefined,
    },
    { enabled: !!filterProgramId }
  );
  const semesters = semestersData?.data ?? [];

  const { data: sectionsData } = useSections(
    {
      semester_id: filterSemesterId || undefined,
    },
    { enabled: !!filterSemesterId }
  );
  const sections = sectionsData?.data ?? [];

  // ─── Person list hooks (filtered by hierarchy) ────────────────────────
  const { data: staffList = [], isLoading: staffLoading } =
    useFilteredStaffForDropdown({
      institution_id: institutionId || undefined,
      department_id: filterDepartmentId || undefined,
      search: personSearch || undefined,
    });

  const { data: studentList = [], isLoading: studentLoading } =
    useFilteredStudentsForDropdown({
      institution_id: institutionId || undefined,
      degree_id: filterDegreeId || undefined,
      department_id: filterDepartmentId || undefined,
      program_id: filterProgramId || undefined,
      semester_id: filterSemesterId || undefined,
      section_id: filterSectionId || undefined,
      search: personSearch || undefined,
    });

  // ─── Deduplicated lists for hierarchy dropdowns ───────────────────────
  const uniqueDegrees = useMemo(
    () => Array.from(new Map(degrees.map((d: any) => [d.id, d])).values()),
    [degrees]
  );
  const uniqueDepartments = useMemo(
    () => Array.from(new Map(departments.map((d: any) => [d.id, d])).values()),
    [departments]
  );
  const uniquePrograms = useMemo(
    () => Array.from(new Map(programs.map((p: any) => [p.id, p])).values()),
    [programs]
  );
  const uniqueSemesters = useMemo(
    () => Array.from(new Map(semesters.map((s: any) => [s.id, s])).values()),
    [semesters]
  );
  const uniqueSections = useMemo(
    () => Array.from(new Map(sections.map((s: any) => [s.id, s])).values()),
    [sections]
  );

  // ─── Handlers ─────────────────────────────────────────────────────────
  function resetHierarchyFilters() {
    setFilterDegreeId('');
    setFilterDepartmentId('');
    setFilterProgramId('');
    setFilterSemesterId('');
    setFilterSectionId('');
  }

  function handleMemberTypeChange(type: ExpoTeamMemberType) {
    setMemberType(type);
    setSelectedPersonId('');
    setName('');
    setPhone('');
    setPersonSearch('');
    // Keep institution filter, reset the rest
    setFilterDegreeId('');
    setFilterDepartmentId('');
    setFilterProgramId('');
    setFilterSemesterId('');
    setFilterSectionId('');
  }

  function handleInstitutionChange(value: string) {
    setFilterInstitutionId(value);
    resetHierarchyFilters();
    setSelectedPersonId('');
    setName('');
  }

  function handleDegreeChange(value: string) {
    setFilterDegreeId(value);
    setFilterDepartmentId('');
    setFilterProgramId('');
    setFilterSemesterId('');
    setFilterSectionId('');
    setSelectedPersonId('');
    setName('');
  }

  function handleDepartmentChange(value: string) {
    setFilterDepartmentId(value);
    setFilterProgramId('');
    setFilterSemesterId('');
    setFilterSectionId('');
    setSelectedPersonId('');
    setName('');
  }

  function handleProgramChange(value: string) {
    setFilterProgramId(value);
    setFilterSemesterId('');
    setFilterSectionId('');
    setSelectedPersonId('');
    setName('');
  }

  function handleSemesterChange(value: string) {
    setFilterSemesterId(value);
    setFilterSectionId('');
    setSelectedPersonId('');
    setName('');
  }

  function handleSectionChange(value: string) {
    setFilterSectionId(value);
    setSelectedPersonId('');
    setName('');
  }

  function handlePersonSelect(personId: string) {
    setSelectedPersonId(personId);
    if (memberType === 'staff') {
      const found = staffList.find((s) => s.id === personId);
      if (found) setName(found.name);
    } else if (memberType === 'student') {
      const found = studentList.find((s) => s.id === personId);
      if (found) setName(found.name);
    }
  }

  function handleAdd() {
    if (!name.trim() || !role) return;

    // Prevent duplicate person
    const isDuplicate = members.some(
      (m) =>
        (m.staff_id && m.staff_id === selectedPersonId) ||
        (m.student_id && m.student_id === selectedPersonId) ||
        (m.member_type === 'external' && m.name === name.trim())
    );
    if (isDuplicate) return;

    const newMember: CreateExpoTeamMemberInput = {
      member_type: memberType,
      name: name.trim(),
      phone: phone.trim() || undefined,
      role,
      ...(memberType === 'staff' && selectedPersonId
        ? { staff_id: selectedPersonId }
        : {}),
      ...(memberType === 'student' && selectedPersonId
        ? { student_id: selectedPersonId }
        : {}),
    };

    onChange([...members, newMember]);

    // Reset person selection (keep filters)
    setSelectedPersonId('');
    setName('');
    setPhone('');
    setRole('volunteer');
    setPersonSearch('');
  }

  function handleRemove(index: number) {
    onChange(members.filter((_, i) => i !== index));
  }

  const isStaff = memberType === 'staff';
  const isStudent = memberType === 'student';
  const isExternal = memberType === 'external';
  const canAdd = isExternal ? name.trim().length > 0 : !!selectedPersonId;
  const personList = isStaff ? staffList : studentList;
  const personLoading = isStaff ? staffLoading : studentLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Team Members
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add member form */}
        <div className="rounded-md border p-4 space-y-4">
          {/* Row 1: Member Type */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Member Type</Label>
              <Select
                value={memberType}
                onValueChange={(v) => handleMemberTypeChange(v as ExpoTeamMemberType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {MEMBER_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Hierarchy Filters (Staff/Student only) */}
          {!isExternal && (
            <div className="rounded-md border border-dashed p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                {isStaff ? 'Filter by Institution & Department' : 'Filter by Academic Hierarchy'}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {/* Institution — always shown for staff & student */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Institution</Label>
                  <Select
                    value={institutionId}
                    onValueChange={handleInstitutionChange}
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
                {isStudent && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Degree</Label>
                    <Select
                      value={filterDegreeId}
                      onValueChange={handleDegreeChange}
                      disabled={!institutionId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Degrees" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueDegrees.map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.degree_name || d.display_name || d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Department — staff & student */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Department</Label>
                  <Select
                    value={filterDepartmentId}
                    onValueChange={handleDepartmentChange}
                    disabled={!institutionId}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="All Departments" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueDepartments.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.department_name || d.display_name || d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Program — student only */}
                {isStudent && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Program</Label>
                    <Select
                      value={filterProgramId}
                      onValueChange={handleProgramChange}
                      disabled={!filterDepartmentId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Programs" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniquePrograms.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.program_name || p.display_name || p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Semester — student only */}
                {isStudent && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Semester</Label>
                    <Select
                      value={filterSemesterId}
                      onValueChange={handleSemesterChange}
                      disabled={!filterProgramId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Semesters" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueSemesters.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.semester_name || s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Section — student only */}
                {isStudent && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Section</Label>
                    <Select
                      value={filterSectionId}
                      onValueChange={handleSectionChange}
                      disabled={!filterSemesterId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Sections" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueSections.map((s: any) => (
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
          )}

          {/* Row 3: Search + Person Select (Staff/Student only) */}
          {!isExternal && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={personSearch}
                    onChange={(e) => setPersonSearch(e.target.value)}
                    placeholder="Search by name..."
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>
                  {isStaff ? 'Select Staff' : 'Select Student'}
                  {personList.length > 0 && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({personList.length})
                    </span>
                  )}
                </Label>
                <Select
                  value={selectedPersonId}
                  onValueChange={handlePersonSelect}
                  disabled={personLoading || !institutionId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        personLoading
                          ? 'Loading…'
                          : !institutionId
                            ? 'Select institution first'
                            : personList.length === 0
                              ? 'No results'
                              : `Select ${isStaff ? 'staff' : 'student'}`
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {personList.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {'role' in p && (p as any).role
                          ? `${p.name} (${(p as any).role})`
                          : p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* External only: Name, Phone, Role */}
          {isExternal && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as ExpoTeamMemberRole)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canAdd}
            onClick={handleAdd}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Member
          </Button>
        </div>

        {/* Members list */}
        {members.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell>
                    <Badge variant={TYPE_BADGE_VARIANT[member.member_type]}>
                      {MEMBER_TYPE_OPTIONS.find((o) => o.value === member.member_type)
                        ?.label ?? member.member_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.phone || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ROLE_BADGE_VARIANT[member.role]}>
                      {ROLE_OPTIONS.find((o) => o.value === member.role)?.label ??
                        member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-4">
            No team members added yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
