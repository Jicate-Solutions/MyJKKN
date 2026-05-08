'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Loader2,
  User,
  GraduationCap,
  Check,
  Users,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface AddCounselorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId?: string;
  onSuccess?: () => void;
}

interface LearnerResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  student_email: string | null;
  college_email: string | null;
  roll_number: string | null;
}

interface FacilitatorResult {
  id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  role: string;
}

type SelectedUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

type UserType = 'learner' | 'facilitator';

// Counsellor role options exposed in the Add Counselor dialog. Mirrors the
// allowlist enforced by assign_counselor_role(p_role_key) — health_counselor
// is intentionally excluded (its confidentiality contract means it should
// only be granted via Role Management, not a generic admin UI).
type CounselorRoleKey =
  | 'admission_counselor'
  | 'expo_counselor'
  | 'learner_counselor'
  | 'staff_counselor';

const COUNSELOR_ROLE_OPTIONS: { value: CounselorRoleKey; label: string; hint: string }[] = [
  { value: 'admission_counselor', label: 'Admission Counsellor', hint: 'Lead follow-up, communication, conversion tracking' },
  { value: 'expo_counselor',      label: 'Expo Counsellor',      hint: 'Expo / field event lead capture and follow-up' },
  { value: 'learner_counselor',   label: 'Learner Counsellor',   hint: 'Enrolled-learner academic and well-being support' },
  { value: 'staff_counselor',     label: 'Staff Counsellor',     hint: 'Employee workplace wellness and grievance support' },
];

export function AddCounselorDialog({
  open,
  onOpenChange,
  institutionId: propInstitutionId,
  onSuccess,
}: AddCounselorDialogProps) {
  const { institutions } = useInstitutionsWithAccess();
  const supabase = createClientSupabaseClient();

  // Assigns the counsellor role via the SECURITY DEFINER RPC introduced
  // 2026-04-27, extended 2026-04-30 to accept a role_key, and corrected
  // 2026-05-08 to preserve the user's existing primary role. A direct
  // user_roles INSERT from the browser is RLS-blocked for admission/
  // admission_staff users (user_roles INSERT policy needs roles.create,
  // which those roles intentionally lack). The RPC bypasses RLS but re-
  // checks authorization internally — the caller must have
  // admission.counselors.create, the target must already have an
  // admission_counselors row, and p_role_key must be one of the four
  // allowlisted counsellor keys.
  //
  // We pass p_is_primary: false explicitly so the new counsellor role is
  // ALWAYS additive. Without this the SQL DEFAULT would have flipped the
  // user's primary role and the AFTER-INSERT sync_primary_role_to_profile
  // trigger would mirror it into profiles.role, overwriting their prior
  // identity (e.g. 'student' → 'learner_counselor'). The v3 RPC defaults
  // already auto-detect this case, but sending false is belt-and-braces.
  //
  // Two counsellors created on 2026-04-27 04:37 UTC ended up with NO user_roles
  // entry because the previous "non-blocking best-effort" implementation never
  // destructured {error} from .insert(). Returns {ok, message} so the submit
  // handler can surface failures via toast.
  const assignCounselorRole = async (
    profileId: string,
    roleKey: CounselorRoleKey,
  ): Promise<{ ok: boolean; message?: string }> => {
    const { error } = await (supabase as any).rpc('assign_counselor_role', {
      p_user_id: profileId,
      p_role_key: roleKey,
      p_is_primary: false,
    });
    if (error) {
      console.error('[admission/counselors] assign_counselor_role RPC failed:', error);
      return { ok: false, message: error.message ?? String(error) };
    }
    return { ok: true };
  };

  // ---------- State ----------
  const [userType, setUserType] = useState<UserType>('learner');
  const [roleKey, setRoleKey] = useState<CounselorRoleKey>('admission_counselor');

  // Hierarchy filter state
  const [existInstitutionId, setExistInstitutionId] = useState(propInstitutionId || '');
  const [degreeId, setDegreeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [sectionId, setSectionId] = useState('');

  // User list state
  const [userResults, setUserResults] = useState<(LearnerResult | FacilitatorResult)[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearchFilter, setUserSearchFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);

  // Counselor settings
  const [maxLeads, setMaxLeads] = useState(50);
  const [specializations, setSpecializations] = useState('');

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---------- Organization hooks for cascading filters ----------
  const { data: degreesData, isLoading: isLoadingDegrees } = useDegrees({
    institution_id: existInstitutionId || undefined,
  });
  const degrees = degreesData?.data ?? [];

  const { data: departmentsData, isLoading: isLoadingDepartments } = useDepartments({
    institution_id: existInstitutionId || undefined,
    degree_id: userType === 'learner' ? degreeId || undefined : undefined,
    limit: 100,
  });
  const departments = departmentsData?.data ?? [];

  const { data: programsData, isLoading: isLoadingPrograms } = usePrograms({
    institution_id: existInstitutionId || undefined,
    degree_id: degreeId || undefined,
    department_id: departmentId || undefined,
  });
  const programs = programsData?.data ?? [];

  const { data: semestersData, isLoading: isLoadingSemesters } = useSemesters({
    institution_id: existInstitutionId || undefined,
    degree_id: degreeId || undefined,
    department_id: departmentId || undefined,
    program_id: programId || undefined,
  });
  const semesters = semestersData?.data ?? [];

  const { data: sectionsData, isLoading: isLoadingSections } = useSections({
    institution_id: existInstitutionId || undefined,
    degree_id: degreeId || undefined,
    department_id: departmentId || undefined,
    program_id: programId || undefined,
    semester_id: semesterId || undefined,
    limit: 1000,
  });
  const sections = sectionsData?.data ?? [];

  // ---------- Pre-select institution from prop ----------
  useEffect(() => {
    if (propInstitutionId) {
      setExistInstitutionId(propInstitutionId);
    }
  }, [propInstitutionId]);

  // ---------- Reset form when dialog closes ----------
  useEffect(() => {
    if (!open) {
      setUserType('learner');
      setRoleKey('admission_counselor');
      setExistInstitutionId(propInstitutionId || '');
      setDegreeId('');
      setDepartmentId('');
      setProgramId('');
      setSemesterId('');
      setSectionId('');
      setUserResults([]);
      setUserSearchFilter('');
      setSelectedUser(null);
      setMaxLeads(50);
      setSpecializations('');
    }
  }, [open, propInstitutionId]);

  // ---------- Cascading resets ----------

  // When user type changes, reset all hierarchy filters except institution
  useEffect(() => {
    setDegreeId('');
    setDepartmentId('');
    setProgramId('');
    setSemesterId('');
    setSectionId('');
    setUserResults([]);
    setSelectedUser(null);
    setUserSearchFilter('');
  }, [userType]);

  // When institution changes, reset everything below
  const handleExistInstitutionChange = (value: string) => {
    setExistInstitutionId(value);
    setDegreeId('');
    setDepartmentId('');
    setProgramId('');
    setSemesterId('');
    setSectionId('');
    setUserResults([]);
    setSelectedUser(null);
    setUserSearchFilter('');
  };

  const handleDegreeChange = (value: string) => {
    setDegreeId(value);
    setDepartmentId('');
    setProgramId('');
    setSemesterId('');
    setSectionId('');
    setUserResults([]);
    setSelectedUser(null);
    setUserSearchFilter('');
  };

  const handleDepartmentChange = (value: string) => {
    setDepartmentId(value);
    setProgramId('');
    setSemesterId('');
    setSectionId('');
    setUserResults([]);
    setSelectedUser(null);
    setUserSearchFilter('');
  };

  const handleProgramChange = (value: string) => {
    setProgramId(value);
    setSemesterId('');
    setSectionId('');
    setUserResults([]);
    setSelectedUser(null);
    setUserSearchFilter('');
  };

  const handleSemesterChange = (value: string) => {
    setSemesterId(value);
    setSectionId('');
    setUserResults([]);
    setSelectedUser(null);
    setUserSearchFilter('');
  };

  const handleSectionChange = (value: string) => {
    setSectionId(value);
    setUserResults([]);
    setSelectedUser(null);
    setUserSearchFilter('');
  };

  // ---------- Determine if we can fetch users ----------
  const canFetchUsers = useMemo(() => {
    if (userType === 'facilitator') {
      return !!existInstitutionId;
    }
    // Learner needs at least semester
    return !!existInstitutionId && !!semesterId;
  }, [userType, existInstitutionId, semesterId]);

  // ---------- Fetch users based on filters ----------
  const fetchUsers = useCallback(async () => {
    if (!canFetchUsers) return;

    setIsLoadingUsers(true);
    setUserResults([]);

    try {
      if (userType === 'learner') {
        let query = supabase
          .from('learners_profiles')
          .select('id, first_name, last_name, student_email, college_email, roll_number')
          .eq('institution_id', existInstitutionId)
          .eq('lifecycle_status', 'active');

        if (semesterId) query = query.eq('semester_id', semesterId);
        if (sectionId) query = query.eq('section_id', sectionId);

        const { data, error } = await query.order('first_name').limit(200);

        if (error) {
          console.error('[admission/counselors] Learner query failed:', error);
          toast.error('Failed to load learners');
          return;
        }

        setUserResults((data as LearnerResult[]) || []);
      } else {
        // BUG (2026-04-21): Pre-registered profiles have a `profiles` row but no
        // corresponding `auth.users` row, so selecting them caused
        // `admission_counselors_user_id_fkey` (profiles.user_id -> auth.users.id)
        // to fail at insert time. Filter them out of the picker: a user who has
        // not yet activated their account cannot be assigned as a counselor.
        // `is_pre_registered` flips to false on first OAuth/email login.
        // Using `.not('is_pre_registered', 'is', true)` matches both `false` and
        // `NULL`, which is defensive given the column is nullable.
        let query = supabase
          .from('profiles')
          .select('id, full_name, email, phone_number, role')
          .eq('institution_id', existInstitutionId)
          .in('role', ['faculty', 'hod', 'staff', 'digital_coordinator', 'admission_counselor', 'expo_counselor'])
          .not('is_pre_registered', 'is', true);

        if (departmentId) query = query.eq('department_id', departmentId);

        const { data, error } = await query.order('full_name').limit(200);

        if (error) {
          console.error('[admission/counselors] Facilitator query failed:', error);
          toast.error('Failed to load facilitators');
          return;
        }

        setUserResults((data as FacilitatorResult[]) || []);
      }
    } catch (err) {
      console.error('[admission/counselors] Fetch users error:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [canFetchUsers, userType, existInstitutionId, semesterId, sectionId, departmentId, supabase]);

  // Auto-fetch users when filters change and conditions are met
  useEffect(() => {
    if (canFetchUsers) {
      fetchUsers();
    }
  }, [canFetchUsers, fetchUsers]);

  // ---------- Client-side search filter on loaded results ----------
  const filteredUsers = useMemo(() => {
    if (!userSearchFilter.trim()) return userResults;
    const q = userSearchFilter.toLowerCase();
    return userResults.filter((u) => {
      const name = getUserName(u).toLowerCase();
      if (userType === 'learner') {
        const learner = u as LearnerResult;
        const collegeEmail = (learner.college_email || '').toLowerCase();
        const personalEmail = (learner.student_email || '').toLowerCase();
        const roll = (learner.roll_number || '').toLowerCase();
        return name.includes(q) || collegeEmail.includes(q) || personalEmail.includes(q) || roll.includes(q);
      } else {
        const fac = u as FacilitatorResult;
        const email = (fac.email || '').toLowerCase();
        return name.includes(q) || email.includes(q);
      }
    });
  }, [userResults, userSearchFilter, userType]);

  // ---------- Select a user from the list ----------
  const handleSelectUser = async (user: LearnerResult | FacilitatorResult) => {
    if (userType === 'learner') {
      const learner = user as LearnerResult;
      // Prefer college email (matches profiles.email which is the auth email)
      const learnerEmail = learner.college_email || learner.student_email || '';
      const learnerName = [learner.first_name, learner.last_name].filter(Boolean).join(' ') || '';

      // Look up profiles.id via email -- check both college and personal email.
      // Skip pre-registered profiles (profile exists but no auth.users row yet);
      // otherwise admission_counselors.user_id FK to auth.users fires a 23503
      // violation on insert. When no activated profile is found we fall back to
      // user_id = null below via the _hasProfile flag.
      let profileId: string | null = null;
      const emailsToCheck = [learner.college_email, learner.student_email].filter(Boolean) as string[];
      if (emailsToCheck.length > 0) {
        const orFilter = emailsToCheck.map(e => `email.eq.${e}`).join(',');
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .or(orFilter)
          .not('is_pre_registered', 'is', true)
          .limit(1)
          .maybeSingle();
        profileId = profile?.id || null;
      }

      setSelectedUser({
        id: profileId || learner.id, // prefer profiles.id, fallback to learner id
        name: learnerName,
        email: learnerEmail,
        phone: '',
        _hasProfile: !!profileId, // track if we found a matching profile
      } as any);
    } else {
      const fac = user as FacilitatorResult;
      setSelectedUser({
        id: fac.id, // profiles.id -- already correct for facilitators
        name: fac.full_name || '',
        email: fac.email || '',
        phone: fac.phone_number || '',
      });
    }
  };

  const handleChangeUser = () => {
    setSelectedUser(null);
  };

  // ---------- Submit ----------
  const handleSubmit = async () => {
    if (!selectedUser) {
      toast.error('Please select a user');
      return;
    }
    if (!existInstitutionId) {
      toast.error('Please select an institution');
      return;
    }

    const specs = specializations
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setIsSubmitting(true);
    try {
      // user_id must reference profiles.id -- set null if learner has no profile
      const userId = (selectedUser as any)._hasProfile === false ? null : selectedUser.id;

      // BUG-003265 fix: `specializations` column does not exist on admission_counselors
      // in production (schema: id, name, email, institution_id, created_at, user_id,
      // is_active, phone, designation, current_leads, max_leads). Sending it caused every
      // insert to fail with a Postgres "column does not exist" / PGRST204 schema-cache error,
      // which the toast surfaced as "error message". Drop it from the payload until a
      // migration adds the column (TODO: add `specializations text[]` via
      // supabase/setup/01_tables.sql if this feature is wanted).
      // Also guard against the documented FK violation: when a learner has no matching
      // profiles row we already set user_id = null, but if we DID find a profile we must
      // confirm it still exists in auth.users at insert time — skip the role assignment
      // cleanly rather than 23503 the whole insert.
      const { error } = await supabase
        .from('admission_counselors')
        .insert({
          user_id: userId,
          institution_id: existInstitutionId,
          name: selectedUser.name,
          email: selectedUser.email,
          phone: selectedUser.phone || null,
          max_leads: maxLeads,
          is_active: true,
        })
        .select()
        .single();

      // The `specs` array is parsed for future use but intentionally not sent —
      // keeps the existing UI input functional without breaking the insert.
      void specs;

      if (error) {
        toast.error(error.message || 'Failed to add counselor');
        return;
      }

      // Auto-assign the chosen counsellor role if user has a profile. We
      // surface failures via toast — no longer a silent best-effort. The
      // counsellor record stays (it's a successful partial create) so the
      // admin can retry role assignment from the Manage tab without re-
      // entering the form.
      if (userId) {
        const roleResult = await assignCounselorRole(userId, roleKey);
        if (!roleResult.ok) {
          toast.error(
            `Counselor created, but role assignment failed: ${roleResult.message ?? 'unknown error'}. Ask an admin to assign the role manually.`,
          );
          onSuccess?.();
          onOpenChange(false);
          return;
        }
      }

      toast.success('Counselor added successfully');
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error('[admission/counselors] Add counselor error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------- Helpers ----------
  const getUserName = (user: LearnerResult | FacilitatorResult) => {
    if (userType === 'learner') {
      const learner = user as LearnerResult;
      return [learner.first_name, learner.last_name].filter(Boolean).join(' ') || '';
    }
    return (user as FacilitatorResult).full_name || '';
  };

  const getUserSubtext = (user: LearnerResult | FacilitatorResult) => {
    if (userType === 'learner') {
      const learner = user as LearnerResult;
      const email = learner.college_email || learner.student_email || '';
      const parts = [email, learner.roll_number].filter(Boolean);
      return parts.join(' | ');
    }
    const fac = user as FacilitatorResult;
    const parts = [fac.email, fac.role].filter(Boolean);
    return parts.join(' | ');
  };

  // Whether the user has set enough filters to show the "select filters" empty state vs "no results"
  const hasMinFilters = userType === 'facilitator' ? !!existInstitutionId : !!existInstitutionId && !!semesterId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[550px] max-h-[85vh] sm:max-h-[90vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="p-4 pb-3">
          <DialogTitle className="text-base">Add Counselor</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Select an existing user to add as a counselor.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
          {/* User type selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">User Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={userType === 'learner' ? 'default' : 'outline'}
                className={cn(
                  'h-9 text-sm gap-2',
                  userType === 'learner'
                    ? ''
                    : 'text-muted-foreground'
                )}
                onClick={() => setUserType('learner')}
              >
                <GraduationCap className="h-4 w-4" />
                Learner
              </Button>
              <Button
                type="button"
                variant={userType === 'facilitator' ? 'default' : 'outline'}
                className={cn(
                  'h-9 text-sm gap-2',
                  userType === 'facilitator'
                    ? ''
                    : 'text-muted-foreground'
                )}
                onClick={() => setUserType('facilitator')}
              >
                <User className="h-4 w-4" />
                Facilitator
              </Button>
            </div>
          </div>

          {/* Counsellor role selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Counsellor Role <span className="text-red-500">*</span>
            </Label>
            <Select value={roleKey} onValueChange={(v) => setRoleKey(v as CounselorRoleKey)}>
              <SelectTrigger className="w-full h-9 text-sm">
                <SelectValue placeholder="Select counsellor role" />
              </SelectTrigger>
              <SelectContent>
                {COUNSELOR_ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span className="text-sm">{opt.label}</span>
                      <span className="text-[11px] text-muted-foreground">{opt.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Hierarchy filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Institution -- always full width */}
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">
                Institution <span className="text-red-500">*</span>
              </Label>
              <Select value={existInstitutionId} onValueChange={handleExistInstitutionChange}>
                <SelectTrigger className="w-full h-9 text-sm">
                  <SelectValue placeholder="Select institution" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Learner hierarchy: Degree, Department, Program, Semester, Section */}
            {userType === 'learner' && (
              <>
                {/* Degree */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Degree</Label>
                  <Select
                    value={degreeId}
                    onValueChange={handleDegreeChange}
                    disabled={!existInstitutionId}
                  >
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue
                        placeholder={isLoadingDegrees ? 'Loading...' : 'Select degree'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {degrees.map((d: { id: string; degree_name: string }) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.degree_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Department */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Department</Label>
                  <Select
                    value={departmentId}
                    onValueChange={handleDepartmentChange}
                    disabled={!degreeId}
                  >
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue
                        placeholder={isLoadingDepartments ? 'Loading...' : 'Select department'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        new Map(
                          departments.map((d: { id: string; department_name: string }) => [
                            d.department_name,
                            d,
                          ])
                        ).values()
                      ).map((d: { id: string; department_name: string }) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.department_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Program */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Program</Label>
                  <Select
                    value={programId}
                    onValueChange={handleProgramChange}
                    disabled={!departmentId}
                  >
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue
                        placeholder={isLoadingPrograms ? 'Loading...' : 'Select program'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        new Map(
                          programs.map((p: { id: string; program_name: string }) => [
                            p.program_name,
                            p,
                          ])
                        ).values()
                      ).map((p: { id: string; program_name: string }) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.program_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Semester */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Semester <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={semesterId}
                    onValueChange={handleSemesterChange}
                    disabled={!programId}
                  >
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue
                        placeholder={isLoadingSemesters ? 'Loading...' : 'Select semester'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        new Map(
                          semesters.map((s: { id: string; semester_name: string }) => [
                            s.semester_name,
                            s,
                          ])
                        ).values()
                      ).map((s: { id: string; semester_name: string }) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.semester_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Section (optional) -- full width */}
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Section (optional)
                  </Label>
                  <Select
                    value={sectionId}
                    onValueChange={handleSectionChange}
                    disabled={!semesterId}
                  >
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue
                        placeholder={isLoadingSections ? 'Loading...' : 'Select section'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        new Map(
                          sections.map((s: { id: string; section_name: string }) => [
                            s.section_name,
                            s,
                          ])
                        ).values()
                      ).map((s: { id: string; section_name: string }) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.section_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Facilitator hierarchy: just Department */}
            {userType === 'facilitator' && (
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">
                  Department (optional)
                </Label>
                <Select
                  value={departmentId}
                  onValueChange={handleDepartmentChange}
                  disabled={!existInstitutionId}
                >
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue
                      placeholder={isLoadingDepartments ? 'Loading...' : 'Select department'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(
                      new Map(
                        departments.map((d: { id: string; department_name: string }) => [
                          d.department_name,
                          d,
                        ])
                      ).values()
                    ).map((d: { id: string; department_name: string }) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.department_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* User list section */}
          {canFetchUsers ? (
            <div className="space-y-2">
              {/* Header row: count badge + search */}
              <div className="flex items-center gap-2">
                {!isLoadingUsers && userResults.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-muted px-2 py-0.5 rounded-full whitespace-nowrap">
                    {filteredUsers.length}
                    {filteredUsers.length !== userResults.length
                      ? ` / ${userResults.length}`
                      : ''}{' '}
                    found
                  </span>
                )}
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, or roll number..."
                    value={userSearchFilter}
                    onChange={(e) => setUserSearchFilter(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              </div>

              {/* Selected user card */}
              {selectedUser && (
                <div className="p-3 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex-shrink-0 h-7 w-7 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                        <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{selectedUser.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[selectedUser.email, selectedUser.phone].filter(Boolean).join(' | ')}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs flex-shrink-0 h-7"
                      onClick={handleChangeUser}
                    >
                      Change
                    </Button>
                  </div>
                </div>
              )}

              {/* User list */}
              {!selectedUser && (
                <div className="border rounded-lg overflow-hidden">
                  {isLoadingUsers ? (
                    <div className="space-y-0">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="px-3 py-2 border-b last:border-b-0">
                          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                          <div className="h-3 w-48 bg-muted animate-pulse rounded mt-1.5" />
                        </div>
                      ))}
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Users className="h-8 w-8 mb-2 opacity-40" />
                      <p className="text-sm">
                        {userResults.length === 0
                          ? 'No users found matching the selected filters'
                          : 'No users match your search'}
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-40 sm:max-h-48 overflow-y-auto divide-y">
                      {filteredUsers.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          className={cn(
                            'w-full text-left py-2 px-3 hover:bg-accent transition-colors focus:bg-accent focus:outline-none',
                            selectedUser?.id === user.id &&
                              'border-l-2 border-l-green-500 bg-green-50/50 dark:bg-green-950/20'
                          )}
                          onClick={() => handleSelectUser(user)}
                        >
                          <p className="font-medium text-sm truncate">{getUserName(user)}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {getUserSubtext(user)}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Empty state: no filters set yet */
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Search className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm text-center">
                {userType === 'learner'
                  ? 'Select institution and semester above to find learners'
                  : 'Select an institution above to find facilitators'}
              </p>
            </div>
          )}

          {/* Counselor settings (after user selection) */}
          {selectedUser && (
            <div className="space-y-2 pt-3 border-t">
              <Label className="text-xs font-medium text-muted-foreground">Counselor Settings</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="max-leads" className="text-xs font-medium text-muted-foreground">
                    Max Leads
                  </Label>
                  <Input
                    id="max-leads"
                    type="number"
                    min={1}
                    value={maxLeads}
                    onChange={(e) => setMaxLeads(parseInt(e.target.value) || 50)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="specializations"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Specializations
                  </Label>
                  <Input
                    id="specializations"
                    placeholder="e.g. Engineering, Medical"
                    value={specializations}
                    onChange={(e) => setSpecializations(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Enter specializations as comma-separated values
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1 sm:flex-none h-9 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedUser}
            className="flex-1 sm:flex-none h-9 text-sm"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Counselor
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
