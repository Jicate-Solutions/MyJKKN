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
import { Loader2, Search, UserPlus, Building2, GraduationCap, Users } from 'lucide-react';
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
  currentActiveCount: number;
  maxTeamSize: number;
}

export function StudentSearchDialog({
  open,
  onOpenChange,
  registrationId,
  eventId,
  defaultInstitutionId,
  currentActiveCount,
  maxTeamSize,
}: StudentSearchDialogProps) {
  const { profile } = useAuth();
  const inviteMember = useInviteTeamMember();

  const [institutionId, setInstitutionId] = useState(defaultInstitutionId || '');
  const [degreeId, setDegreeId]           = useState('');
  const [departmentId, setDepartmentId]   = useState('');
  const [programId, setProgramId]         = useState('');
  const [semesterId, setSemesterId]       = useState('');
  const [search, setSearch]               = useState('');
  const [invitedIds, setInvitedIds]       = useState<Set<string>>(new Set());
  const [invitingId, setInvitingId]       = useState<string | null>(null);

  const isFull = currentActiveCount >= maxTeamSize;
  const slotsLeft = Math.max(0, maxTeamSize - currentActiveCount);

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
    if (!profile?.id || isFull) return;
    setInvitingId(student.learner_id);
    try {
      await inviteMember.mutateAsync({
        registrationId,
        eventId,
        student: {
          learner_id: student.learner_id,
          profile_id: student.profile_id,
          email: student.college_email || student.student_email,
          full_name: `${student.first_name} ${student.last_name || ''}`.trim(),
          roll_number: student.roll_number || undefined,
        },
        invitedByProfileId: profile.id,
      });
      setInvitedIds((prev) => new Set(prev).add(student.learner_id));
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
      <DialogContent className="w-full max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription className="mt-1">
                Search for students to invite. They must accept the invitation to join.
              </DialogDescription>
            </div>
            <Badge
              variant={isFull ? 'destructive' : 'secondary'}
              className="gap-1 shrink-0 mt-0.5"
            >
              <Users className="h-3 w-3" />
              {currentActiveCount}/{maxTeamSize}
            </Badge>
          </div>
        </DialogHeader>

        {isFull ? (
          <div className="flex-1 flex items-center justify-center px-6 pb-6">
            <div className="text-center space-y-2">
              <Users className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="font-medium">Team is full</p>
              <p className="text-sm text-muted-foreground">
                Remove a pending or accepted member to invite someone new.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="px-6 pb-3 shrink-0 space-y-3">
              {/* Institution — full width */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Institution</label>
                <Select
                  value={institutionId}
                  onValueChange={(v) => { setInstitutionId(v); resetFilters(); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select institution" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[200]">
                    {(options?.institutions || []).map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Degree + Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <SelectContent position="popper" className="z-[200]">
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
                    <SelectContent position="popper" className="z-[200]">
                      {(options?.departments || []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.department_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Program + Semester */}
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
                    <SelectContent position="popper" className="z-[200]">
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
                    <SelectContent position="popper" className="z-[200]">
                      {(options?.semesters || []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.semester_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by name or roll number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {slotsLeft > 0 && (
                <p className="text-xs text-muted-foreground">
                  {slotsLeft} slot{slotsLeft !== 1 ? 's' : ''} remaining
                </p>
              )}
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2 min-h-[160px]">
              {!institutionId && (
                <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                  <Building2 className="h-4 w-4 mr-2 shrink-0" /> Select an institution to search students
                </div>
              )}
              {institutionId && studentsLoading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {institutionId && !studentsLoading && students.length === 0 && (
                <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                  <GraduationCap className="h-4 w-4 mr-2 shrink-0" /> No students found
                </div>
              )}
              {students.map((student) => {
                const alreadyInvited = invitedIds.has(student.learner_id);
                const isInviting = invitingId === student.learner_id;
                return (
                  <div
                    key={student.learner_id}
                    className="flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {student.first_name} {student.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {student.college_email || student.student_email}
                      </p>
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
                    {alreadyInvited ? (
                      <Badge variant="secondary" className="shrink-0">Invited</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={isInviting || inviteMember.isPending || isFull}
                        onClick={() => handleInvite(student)}
                      >
                        {isInviting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <><UserPlus className="h-4 w-4 mr-1" /> Invite</>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
