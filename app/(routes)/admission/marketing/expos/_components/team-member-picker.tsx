'use client';

import { useState } from 'react';
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
import { Plus, Trash2, Users } from 'lucide-react';
import {
  useFacultyForDropdown,
  useStudentsForDropdown,
} from '@/hooks/admission/use-referral-dropdowns';
import type {
  CreateExpoTeamMemberInput,
  ExpoTeamMemberType,
  ExpoTeamMemberRole,
} from '@/types/admission';

interface TeamMemberPickerProps {
  institutionId: string;
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
  institutionId,
  members,
  onChange,
}: TeamMemberPickerProps) {
  const [memberType, setMemberType] = useState<ExpoTeamMemberType>('staff');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<ExpoTeamMemberRole>('volunteer');

  const { data: staffList = [], isLoading: staffLoading } =
    useFacultyForDropdown(institutionId);
  const { data: studentList = [], isLoading: studentLoading } =
    useStudentsForDropdown(institutionId);

  function handleMemberTypeChange(type: ExpoTeamMemberType) {
    setMemberType(type);
    // Reset selection state on type switch
    setSelectedStaffId('');
    setSelectedStudentId('');
    setName('');
    setPhone('');
  }

  function handleStaffSelect(staffId: string) {
    setSelectedStaffId(staffId);
    const found = staffList.find((s) => s.id === staffId);
    if (found) {
      setName(found.name);
    }
  }

  function handleStudentSelect(studentId: string) {
    setSelectedStudentId(studentId);
    const found = studentList.find((s) => s.id === studentId);
    if (found) {
      setName(found.name);
    }
  }

  function handleAdd() {
    if (!name.trim() || !role) return;

    const newMember: CreateExpoTeamMemberInput = {
      member_type: memberType,
      name: name.trim(),
      phone: phone.trim() || undefined,
      role,
      ...(memberType === 'staff' && selectedStaffId
        ? { staff_id: selectedStaffId }
        : {}),
      ...(memberType === 'student' && selectedStudentId
        ? { student_id: selectedStudentId }
        : {}),
    };

    onChange([...members, newMember]);

    // Reset form
    setSelectedStaffId('');
    setSelectedStudentId('');
    setName('');
    setPhone('');
    setRole('volunteer');
  }

  function handleRemove(index: number) {
    const updated = members.filter((_, i) => i !== index);
    onChange(updated);
  }

  const canAdd = name.trim().length > 0;

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Member type */}
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

            {/* Staff dropdown */}
            {memberType === 'staff' && (
              <div className="space-y-1.5">
                <Label>Select Staff</Label>
                <Select
                  value={selectedStaffId}
                  onValueChange={handleStaffSelect}
                  disabled={staffLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={staffLoading ? 'Loading…' : 'Select staff'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Student dropdown */}
            {memberType === 'student' && (
              <div className="space-y-1.5">
                <Label>Select Student</Label>
                <Select
                  value={selectedStudentId}
                  onValueChange={handleStudentSelect}
                  disabled={studentLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={studentLoading ? 'Loading…' : 'Select student'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {studentList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Name field — always visible, auto-filled for staff/student */}
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

            {/* Phone — for staff and external */}
            {(memberType === 'staff' || memberType === 'external') && (
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                />
              </div>
            )}

            {/* Role */}
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
