'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, UserPlus, Building2, GraduationCap } from 'lucide-react';
import {
  useStudentSearch,
  useStudentSearchFilterOptions,
  useInviteTeamMember,
} from '@/hooks/startup-studio/use-event-registrations';
import { useAuth } from '@/hooks/use-auth';
import type { StudentSearchResult } from '@/types/startup-studio';

interface StudentSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrationId: string;
  eventId: string;
  defaultInstitutionId?: string;
}

export function StudentSearchDialog({
  open,
  onOpenChange,
  registrationId,
  eventId,
  defaultInstitutionId,
}: StudentSearchDialogProps) {
  const { profile } = useAuth();
  const inviteMember = useInviteTeamMember();

  const [institutionId, setInstitutionId] = useState(defaultInstitutionId || '');
  const [degreeId, setDegreeId]           = useState('');
  const [departmentId, setDepartmentId]   = useState('');
  const [programId, setProgramId]         = useState('');
  const [semesterId, setSemesterId]       = useState('');
  const [search, setSearch]               = useState('');
  const [invitingId, setInvitingId]       = useState<string | null>(null);

  const { data: options } = useStudentSearchFilterOptions({
    institution_id: institutionId || undefined,
    degree_id: degreeId || undefined,
    department_id: departmentId || undefined,
    program_id: programId || undefined,
  });

  const { data: students = [], isLoading: studentsLoading } = useStudentSearch({
    event_id: eventId,
    institution_id: institutionId || undefined,
    degree_id: degreeId || undefined,
    department_id: departmentId || undefined,
    program_id: programId || undefined,
    semester_id: semesterId || undefined,
    search: search || undefined,
    enabled: open && !!institutionId,
  });

  const handleInvite = async (student: StudentSearchResult) => {
    if (!profile?.id) return;
    setInvitingId(student.learner_id);
    try {
      await inviteMember.mutateAsync({
        registrationId,
        eventId,
        student: {
          learner_id: student.learner_id,
          profile_id: student.profile_id,
          email: student.student_email,
          full_name: `${student.first_name} ${student.last_name || ''}`.trim(),
          roll_number: student.roll_number || undefined,
        },
        invitedByProfileId: profile.id,
      });
    } finally {
      setInvitingId(null);
    }
  };

  const resetFilters = () => {
    setDegreeId('');
    setDepartmentId('');
    setProgramId('');
    setSemesterId('');
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Search for students by institution, degree, department, program, and semester.
            Members will receive a pending invitation they must accept to join your team.
          </DialogDescription>
        </DialogHeader>

        {/* Cascading Filters */}
        <div className="grid gap-3 grid-cols-2 shrink-0">
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Institution</label>
            <Select
              value={institutionId}
              onValueChange={(v) => { setInstitutionId(v); resetFilters(); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select institution" />
              </SelectTrigger>
              <SelectContent>
                {(options?.institutions || []).map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Degree</label>
            <Select
              value={degreeId}
              onValueChange={(v) => { setDegreeId(v); setDepartmentId(''); setProgramId(''); setSemesterId(''); }}
              disabled={!institutionId || !(options?.degrees?.length)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All degrees" />
              </SelectTrigger>
              <SelectContent>
                {(options?.degrees || []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.degree_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Department</label>
            <Select
              value={departmentId}
              onValueChange={(v) => { setDepartmentId(v); setProgramId(''); setSemesterId(''); }}
              disabled={!degreeId || !(options?.departments?.length)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                {(options?.departments || []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.department_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Program</label>
            <Select
              value={programId}
              onValueChange={(v) => { setProgramId(v); setSemesterId(''); }}
              disabled={!departmentId || !(options?.programs?.length)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All programs" />
              </SelectTrigger>
              <SelectContent>
                {(options?.programs || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Semester</label>
            <Select
              value={semesterId}
              onValueChange={setSemesterId}
              disabled={!programId || !(options?.semesters?.length)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All semesters" />
              </SelectTrigger>
              <SelectContent>
                {(options?.semesters || []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.semester_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Name / roll search */}
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or roll number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px]">
          {!institutionId && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-10">
              <Building2 className="h-4 w-4 mr-2" /> Select an institution to search students
            </div>
          )}
          {institutionId && studentsLoading && (
            <div className="flex items-center justify-center h-full py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {institutionId && !studentsLoading && students.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-10">
              <GraduationCap className="h-4 w-4 mr-2" /> No students found matching your filters
            </div>
          )}
          {students.map((student) => (
            <div
              key={student.learner_id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {student.first_name} {student.last_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{student.student_email}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {student.roll_number && (
                    <Badge variant="outline" className="text-xs">{student.roll_number}</Badge>
                  )}
                  {student.program_name && (
                    <span className="text-xs text-muted-foreground">{student.program_name}</span>
                  )}
                  {student.semester_name && (
                    <span className="text-xs text-muted-foreground">• {student.semester_name}</span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="ml-3 shrink-0"
                disabled={invitingId === student.learner_id || inviteMember.isPending}
                onClick={() => handleInvite(student)}
              >
                {invitingId === student.learner_id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <><UserPlus className="h-4 w-4 mr-1" /> Invite</>
                )}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
