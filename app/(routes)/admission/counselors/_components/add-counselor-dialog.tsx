'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Loader2,
  User,
  GraduationCap,
  Check,
  UserPlus,
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

interface ProfileSearchResult {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
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

export function AddCounselorDialog({
  open,
  onOpenChange,
  institutionId: propInstitutionId,
  onSuccess,
}: AddCounselorDialogProps) {
  const { institutions } = useInstitutionsWithAccess();
  const supabase = createClientSupabaseClient();

  // Tab state
  const [activeTab, setActiveTab] = useState<'existing' | 'manual'>('existing');

  // ---------- Tab 1: Select Existing User ----------
  const [userType, setUserType] = useState<UserType>('learner');

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

  // Counselor settings (shared between tabs)
  const [maxLeads, setMaxLeads] = useState(50);
  const [specializations, setSpecializations] = useState('');

  // ---------- Tab 2: Manual Entry ----------
  const [manualInstitutionId, setManualInstitutionId] = useState(propInstitutionId || '');
  const [manualSelectedUserId, setManualSelectedUserId] = useState<string | null>(null);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [manualSearchResults, setManualSearchResults] = useState<ProfileSearchResult[]>([]);
  const [isManualSearching, setIsManualSearching] = useState(false);
  const [showManualResults, setShowManualResults] = useState(false);

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
      setManualInstitutionId(propInstitutionId);
    }
  }, [propInstitutionId]);

  // ---------- Reset form when dialog closes ----------
  useEffect(() => {
    if (!open) {
      setActiveTab('existing');
      setUserType('learner');
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
      setManualInstitutionId(propInstitutionId || '');
      setManualSelectedUserId(null);
      setManualName('');
      setManualEmail('');
      setManualPhone('');
      setManualSearchQuery('');
      setManualSearchResults([]);
      setShowManualResults(false);
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

  // When degree changes, reset department and below
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

  // When department changes, reset program and below
  const handleDepartmentChange = (value: string) => {
    setDepartmentId(value);
    setProgramId('');
    setSemesterId('');
    setSectionId('');
    setUserResults([]);
    setSelectedUser(null);
    setUserSearchFilter('');
  };

  // When program changes, reset semester and below
  const handleProgramChange = (value: string) => {
    setProgramId(value);
    setSemesterId('');
    setSectionId('');
    setUserResults([]);
    setSelectedUser(null);
    setUserSearchFilter('');
  };

  // When semester changes, reset section
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
        let query = supabase
          .from('profiles')
          .select('id, full_name, email, phone_number, role')
          .eq('institution_id', existInstitutionId)
          .in('role', ['faculty', 'hod', 'staff', 'digital_coordinator']);

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
        const email = (learner.student_email || learner.college_email || '').toLowerCase();
        const roll = (learner.roll_number || '').toLowerCase();
        return name.includes(q) || email.includes(q) || roll.includes(q);
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
      const learnerEmail = learner.student_email || learner.college_email || '';
      const learnerName = [learner.first_name, learner.last_name].filter(Boolean).join(' ') || '';

      // Look up profiles.id via email — admission_counselors.user_id FK references profiles.id
      let profileId: string | null = null;
      if (learnerEmail) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .or(`email.eq.${learnerEmail}`)
          .single();
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
        id: fac.id, // profiles.id — already correct for facilitators
        name: fac.full_name || '',
        email: fac.email || '',
        phone: fac.phone_number || '',
      });
    }
  };

  const handleChangeUser = () => {
    setSelectedUser(null);
  };

  // ---------- Manual entry: profile search ----------
  const searchProfiles = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setManualSearchResults([]);
        setShowManualResults(false);
        return;
      }

      setIsManualSearching(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone')
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(10);

        if (error) {
          console.error('[admission/counselors] Profile search failed:', error);
          return;
        }

        setManualSearchResults(data || []);
        setShowManualResults(true);
      } catch (err) {
        console.error('[admission/counselors] Profile search error:', err);
      } finally {
        setIsManualSearching(false);
      }
    },
    [supabase]
  );

  // Debounce manual search
  useEffect(() => {
    if (manualSearchQuery.length < 2) {
      setManualSearchResults([]);
      setShowManualResults(false);
      return;
    }

    const timer = setTimeout(() => {
      searchProfiles(manualSearchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [manualSearchQuery, searchProfiles]);

  const handleManualSelectProfile = (profile: ProfileSearchResult) => {
    setManualSelectedUserId(profile.id);
    setManualName(profile.full_name || '');
    setManualEmail(profile.email || '');
    setManualPhone(profile.phone || '');
    setManualSearchQuery(profile.full_name || profile.email || '');
    setShowManualResults(false);
  };

  const handleManualClearProfile = () => {
    setManualSelectedUserId(null);
    setManualSearchQuery('');
    setManualName('');
    setManualEmail('');
    setManualPhone('');
  };

  // ---------- Submit ----------
  const handleSubmit = async () => {
    if (activeTab === 'existing') {
      // Validate existing user tab
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
        // user_id must reference profiles.id — set null if learner has no profile
        const userId = (selectedUser as any)._hasProfile === false ? null : selectedUser.id;

        const { error } = await supabase
          .from('admission_counselors')
          .insert({
            user_id: userId,
            institution_id: existInstitutionId,
            name: selectedUser.name,
            email: selectedUser.email,
            phone: selectedUser.phone || null,
            max_leads: maxLeads,
            specializations: specs,
            is_active: true,
          })
          .select()
          .single();

        if (error) {
          toast.error(error.message || 'Failed to add counselor');
          return;
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
    } else {
      // Manual entry tab
      if (!manualName.trim()) {
        toast.error('Name is required');
        return;
      }
      if (!manualEmail.trim()) {
        toast.error('Email is required');
        return;
      }
      if (!manualInstitutionId) {
        toast.error('Please select an institution');
        return;
      }

      const specs = specializations
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      setIsSubmitting(true);
      try {
        const { error } = await supabase
          .from('admission_counselors')
          .insert({
            user_id: manualSelectedUserId || null,
            institution_id: manualInstitutionId,
            name: manualName.trim(),
            email: manualEmail.trim(),
            phone: manualPhone.trim() || null,
            max_leads: maxLeads,
            specializations: specs,
            is_active: true,
          })
          .select()
          .single();

        if (error) {
          toast.error(error.message || 'Failed to add counselor');
          return;
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
    }
  };

  // ---------- Helper to get display email for a user ----------
  // Helper to get display name — learners use first_name+last_name, facilitators use full_name
  const getUserName = (user: LearnerResult | FacilitatorResult) => {
    if (userType === 'learner') {
      const learner = user as LearnerResult;
      return [learner.first_name, learner.last_name].filter(Boolean).join(' ') || '';
    }
    return (user as FacilitatorResult).full_name || '';
  };

  const getUserEmail = (user: LearnerResult | FacilitatorResult) => {
    if (userType === 'learner') {
      const learner = user as LearnerResult;
      return learner.student_email || learner.college_email || '';
    }
    return (user as FacilitatorResult).email || '';
  };

  const getUserPhone = (user: LearnerResult | FacilitatorResult) => {
    if (userType === 'learner') {
      return ''; // learners_profiles has no phone_number column
    }
    return (user as FacilitatorResult).phone_number || '';
  };

  const getUserSubtext = (user: LearnerResult | FacilitatorResult) => {
    if (userType === 'learner') {
      const learner = user as LearnerResult;
      const email = learner.student_email || learner.college_email || '';
      const parts = [email, learner.roll_number].filter(Boolean);
      return parts.join(' | ');
    }
    const fac = user as FacilitatorResult;
    const parts = [fac.email, fac.role].filter(Boolean);
    return parts.join(' | ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle>Add Counselor</DialogTitle>
          <DialogDescription>
            Select an existing user or manually enter counselor details.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'existing' | 'manual')}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="existing" className="text-xs sm:text-sm gap-1.5">
                <User className="h-3.5 w-3.5 hidden sm:inline" />
                Select Existing User
              </TabsTrigger>
              <TabsTrigger value="manual" className="text-xs sm:text-sm gap-1.5">
                <UserPlus className="h-3.5 w-3.5 hidden sm:inline" />
                Manual Entry
              </TabsTrigger>
            </TabsList>

            {/* ===== Tab 1: Select Existing User ===== */}
            <TabsContent value="existing" className="mt-0 space-y-4">
              {/* Step 1: User type */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">User Type</Label>
                <RadioGroup
                  value={userType}
                  onValueChange={(v) => setUserType(v as UserType)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="learner" id="type-learner" />
                    <Label
                      htmlFor="type-learner"
                      className="flex items-center gap-1.5 cursor-pointer text-sm"
                    >
                      <GraduationCap className="h-4 w-4" />
                      Learner
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="facilitator" id="type-facilitator" />
                    <Label
                      htmlFor="type-facilitator"
                      className="flex items-center gap-1.5 cursor-pointer text-sm"
                    >
                      <User className="h-4 w-4" />
                      Facilitator
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Step 2: Cascading hierarchy filters */}
              <div className="space-y-3">
                {/* Institution */}
                <div className="space-y-1.5">
                  <Label className="text-sm">
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

                {/* Learner-specific hierarchy: Degree → Department → Program → Semester → Section */}
                {userType === 'learner' && (
                  <>
                    {/* Degree */}
                    <div className="space-y-1.5">
                      <Label className="text-sm">Degree</Label>
                      <Select
                        value={degreeId}
                        onValueChange={handleDegreeChange}
                        disabled={!existInstitutionId}
                      >
                        <SelectTrigger className="w-full h-9 text-sm">
                          <SelectValue
                            placeholder={
                              isLoadingDegrees ? 'Loading...' : 'Select degree'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {degrees.map(
                            (d: { id: string; degree_name: string }) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.degree_name}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Department */}
                    <div className="space-y-1.5">
                      <Label className="text-sm">Department</Label>
                      <Select
                        value={departmentId}
                        onValueChange={handleDepartmentChange}
                        disabled={!degreeId}
                      >
                        <SelectTrigger className="w-full h-9 text-sm">
                          <SelectValue
                            placeholder={
                              isLoadingDepartments ? 'Loading...' : 'Select department'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            new Map(
                              departments.map(
                                (d: { id: string; department_name: string }) => [
                                  d.department_name,
                                  d,
                                ]
                              )
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
                    <div className="space-y-1.5">
                      <Label className="text-sm">Program</Label>
                      <Select
                        value={programId}
                        onValueChange={handleProgramChange}
                        disabled={!departmentId}
                      >
                        <SelectTrigger className="w-full h-9 text-sm">
                          <SelectValue
                            placeholder={
                              isLoadingPrograms ? 'Loading...' : 'Select program'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            new Map(
                              programs.map(
                                (p: { id: string; program_name: string }) => [
                                  p.program_name,
                                  p,
                                ]
                              )
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
                    <div className="space-y-1.5">
                      <Label className="text-sm">
                        Semester <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={semesterId}
                        onValueChange={handleSemesterChange}
                        disabled={!programId}
                      >
                        <SelectTrigger className="w-full h-9 text-sm">
                          <SelectValue
                            placeholder={
                              isLoadingSemesters ? 'Loading...' : 'Select semester'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            new Map(
                              semesters.map(
                                (s: { id: string; semester_name: string }) => [
                                  s.semester_name,
                                  s,
                                ]
                              )
                            ).values()
                          ).map((s: { id: string; semester_name: string }) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.semester_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Section (optional) */}
                    <div className="space-y-1.5">
                      <Label className="text-sm">Section (optional)</Label>
                      <Select
                        value={sectionId}
                        onValueChange={handleSectionChange}
                        disabled={!semesterId}
                      >
                        <SelectTrigger className="w-full h-9 text-sm">
                          <SelectValue
                            placeholder={
                              isLoadingSections ? 'Loading...' : 'Select section'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            new Map(
                              sections.map(
                                (s: { id: string; section_name: string }) => [
                                  s.section_name,
                                  s,
                                ]
                              )
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

                {/* Facilitator-specific hierarchy: just Department */}
                {userType === 'facilitator' && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Department (optional)</Label>
                    <Select
                      value={departmentId}
                      onValueChange={handleDepartmentChange}
                      disabled={!existInstitutionId}
                    >
                      <SelectTrigger className="w-full h-9 text-sm">
                        <SelectValue
                          placeholder={
                            isLoadingDepartments ? 'Loading...' : 'Select department'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          new Map(
                            departments.map(
                              (d: { id: string; department_name: string }) => [
                                d.department_name,
                                d,
                              ]
                            )
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

              {/* Step 3: User list */}
              {canFetchUsers && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Matching {userType === 'learner' ? 'Learners' : 'Facilitators'}
                    {userResults.length > 0 && (
                      <span className="text-muted-foreground font-normal ml-1">
                        ({filteredUsers.length}
                        {filteredUsers.length !== userResults.length
                          ? ` of ${userResults.length}`
                          : ''}
                        )
                      </span>
                    )}
                  </Label>

                  {/* Search filter */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, email, or roll number..."
                      value={userSearchFilter}
                      onChange={(e) => setUserSearchFilter(e.target.value)}
                      className="pl-9 h-9 text-sm"
                    />
                  </div>

                  {/* Selected user card */}
                  {selectedUser && (
                    <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {selectedUser.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {[selectedUser.email, selectedUser.phone]
                                .filter(Boolean)
                                .join(' | ')}
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
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          <span className="ml-2 text-sm text-muted-foreground">
                            Loading users...
                          </span>
                        </div>
                      ) : filteredUsers.length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                          {userResults.length === 0
                            ? 'No users found matching the selected filters'
                            : 'No users match your search'}
                        </div>
                      ) : (
                        <ScrollArea className="max-h-48">
                          <div className="divide-y">
                            {filteredUsers.map((user) => (
                              <button
                                key={user.id}
                                type="button"
                                className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors focus:bg-accent focus:outline-none"
                                onClick={() => handleSelectUser(user)}
                              >
                                <p className="text-sm font-medium truncate">
                                  {getUserName(user)}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {getUserSubtext(user)}
                                </p>
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Counselor settings (shown after user selected) */}
              {selectedUser && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="space-y-1.5">
                    <Label htmlFor="exist-max-leads" className="text-sm">
                      Max Leads
                    </Label>
                    <Input
                      id="exist-max-leads"
                      type="number"
                      min={1}
                      value={maxLeads}
                      onChange={(e) => setMaxLeads(parseInt(e.target.value) || 50)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="exist-specializations" className="text-sm">
                      Specializations
                    </Label>
                    <Input
                      id="exist-specializations"
                      placeholder="e.g. Engineering, Medical, Arts (comma-separated)"
                      value={specializations}
                      onChange={(e) => setSpecializations(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter comma-separated values
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ===== Tab 2: Manual Entry ===== */}
            <TabsContent value="manual" className="mt-0 space-y-4">
              {/* Link to existing user */}
              <div className="space-y-2">
                <Label htmlFor="manual-search-user" className="text-sm">
                  Link to Existing User (optional)
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="manual-search-user"
                    placeholder="Search by name or email..."
                    value={manualSearchQuery}
                    onChange={(e) => {
                      setManualSearchQuery(e.target.value);
                      if (manualSelectedUserId) {
                        handleManualClearProfile();
                      }
                    }}
                    className="pl-9 h-9 text-sm"
                  />
                  {isManualSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {showManualResults && manualSearchResults.length > 0 && (
                  <div className="border rounded-md max-h-40 overflow-y-auto bg-popover">
                    {manualSearchResults.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors"
                        onClick={() => handleManualSelectProfile(profile)}
                      >
                        <p className="font-medium">{profile.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {profile.email}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {showManualResults &&
                  manualSearchResults.length === 0 &&
                  !isManualSearching && (
                    <p className="text-xs text-muted-foreground px-1">
                      No users found
                    </p>
                  )}
                {manualSelectedUserId && (
                  <div className="flex items-center justify-between text-xs text-green-600 bg-green-50 dark:bg-green-950/30 rounded px-2 py-1">
                    <span>Linked to existing user profile</span>
                    <button
                      type="button"
                      className="text-red-500 hover:text-red-700 font-medium"
                      onClick={handleManualClearProfile}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="manual-name" className="text-sm">
                  Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="manual-name"
                  placeholder="Full name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="manual-email" className="text-sm">
                  Email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="manual-email"
                  type="email"
                  placeholder="Email address"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label htmlFor="manual-phone" className="text-sm">
                  Phone
                </Label>
                <Input
                  id="manual-phone"
                  placeholder="Phone number (optional)"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              {/* Institution */}
              <div className="space-y-1.5">
                <Label htmlFor="manual-institution" className="text-sm">
                  Institution <span className="text-red-500">*</span>
                </Label>
                <Select value={manualInstitutionId} onValueChange={setManualInstitutionId}>
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

              {/* Max Leads */}
              <div className="space-y-1.5">
                <Label htmlFor="manual-max-leads" className="text-sm">
                  Max Leads
                </Label>
                <Input
                  id="manual-max-leads"
                  type="number"
                  min={1}
                  value={maxLeads}
                  onChange={(e) => setMaxLeads(parseInt(e.target.value) || 50)}
                  className="h-9 text-sm"
                />
              </div>

              {/* Specializations */}
              <div className="space-y-1.5">
                <Label htmlFor="manual-specializations" className="text-sm">
                  Specializations
                </Label>
                <Input
                  id="manual-specializations"
                  placeholder="e.g. Engineering, Medical, Arts (comma-separated)"
                  value={specializations}
                  onChange={(e) => setSpecializations(e.target.value)}
                  className="h-9 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Enter comma-separated values
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="px-4 pb-4 sm:px-6 sm:pb-6 gap-2 sm:gap-0 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="h-9 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="h-9 text-sm"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Counselor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
