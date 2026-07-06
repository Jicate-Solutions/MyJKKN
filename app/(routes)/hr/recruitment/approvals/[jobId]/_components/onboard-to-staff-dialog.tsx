'use client';

/**
 * Final pipeline step: create the staff record from a finally-approved
 * candidate. Everything the candidate already told us is pre-filled; the
 * staff table's remaining NOT-NULL fields (gender, DOB, marital status,
 * employment category, department for teaching) are collected here.
 * Login provisioning is intentionally NOT part of this form — enable it
 * later from the Staff module.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useOnboardToStaff } from '@/hooks/hr/use-recruitment';
import type { HRJobApplication, HRRecruitmentCandidate } from '@/types/hr-recruitment';

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];
const MARITAL = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
];

const today = () => new Date().toISOString().split('T')[0];

export function OnboardToStaffDialog({
  open, onOpenChange, candidate, application, jobTitle, institutionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: HRRecruitmentCandidate;
  application: HRJobApplication | null;
  jobTitle: string | null;
  institutionId: string | null;
}) {
  const onboard = useOnboardToStaff();

  // Prefill from application (has first/last split) else split candidate.name.
  const [first = '', ...rest] = candidate.name.trim().split(/\s+/);
  const [firstName, setFirstName] = useState(application?.first_name ?? first);
  const [lastName, setLastName] = useState(application?.last_name ?? (rest.join(' ') || first));
  const [email, setEmail] = useState(candidate.email);
  const [phone, setPhone] = useState(candidate.phone ?? application?.phone ?? '');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [marital, setMarital] = useState('');
  const [joining, setJoining] = useState(today());
  const [designation, setDesignation] = useState(jobTitle ?? candidate.role_title);
  const [categoryId, setCategoryId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [institutionEmail, setInstitutionEmail] = useState('');

  const resolvedInstitutionId = institutionId ?? candidate.institution_id ?? '';

  const { data: categories } = useQuery({
    queryKey: ['employment-categories-active'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('employment_categories')
        .select('id, category_name, is_teaching')
        .order('category_name');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; category_name: string; is_teaching: boolean }>;
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const isTeaching = useMemo(
    () => categories?.find((c) => c.id === categoryId)?.is_teaching === true,
    [categories, categoryId],
  );

  const { data: departments } = useQuery({
    queryKey: ['onboard-departments', resolvedInstitutionId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('departments')
        .select('id, department_name, display_name')
        .eq('institution_id', resolvedInstitutionId)
        .eq('is_active', true)
        .order('department_name');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; department_name: string; display_name: string | null }>;
    },
    enabled: open && isTeaching && !!resolvedInstitutionId,
    staleTime: 5 * 60 * 1000,
  });

  const canSubmit =
    !!firstName.trim() && !!lastName.trim() && !!gender && !!dob && !!marital &&
    !!email.trim() && !!phone.trim() && !!joining && !!designation.trim() &&
    !!categoryId && !!resolvedInstitutionId && (!isTeaching || !!departmentId) &&
    !onboard.isPending;

  const submit = () => {
    onboard.mutate(
      {
        candidate_id: candidate.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        gender,
        date_of_birth: dob,
        marital_status: marital,
        email: email.trim(),
        phone: phone.trim(),
        date_of_joining: joining,
        designation: designation.trim(),
        category_id: categoryId,
        institution_id: resolvedInstitutionId,
        department_id: isTeaching ? departmentId : null,
        institution_email: institutionEmail.trim() || null,
      },
      {
        onSuccess: ({ staff }) => {
          toast.success(
            `${staff.first_name} ${staff.last_name} onboarded — staff record created. ` +
            'Enable login from the Staff module when ready.',
          );
          onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Onboard to Staff — {candidate.name}</DialogTitle>
          <DialogDescription>
            Creates the staff record and marks this candidacy as joined. Details from the
            application are pre-filled — complete the remaining required fields.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="obFirst">First name <Req /></Label>
            <Input id="obFirst" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="obLast">Last name <Req /></Label>
            <Input id="obLast" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <Label>Gender <Req /></Label>
            <Select value={gender || undefined} onValueChange={setGender}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {GENDERS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="obDob">Date of birth <Req /></Label>
            <Input id="obDob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={today()} />
          </div>
          <div>
            <Label>Marital status <Req /></Label>
            <Select value={marital || undefined} onValueChange={setMarital}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {MARITAL.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="obJoin">Date of joining <Req /></Label>
            <Input id="obJoin" type="date" value={joining} onChange={(e) => setJoining(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="obEmail">Personal email <Req /></Label>
            <Input id="obEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="obPhone">Phone <Req /></Label>
            <Input id="obPhone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="obDesignation">Designation <Req /></Label>
            <Input id="obDesignation" value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </div>
          <div>
            <Label>Employment category <Req /></Label>
            <Select value={categoryId || undefined} onValueChange={(v) => { setCategoryId(v); setDepartmentId(''); }}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.category_name}{c.is_teaching ? ' (teaching)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isTeaching && (
            <div>
              <Label>Department <Req /></Label>
              <Select value={departmentId || undefined} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {(departments ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.display_name || d.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className={isTeaching ? 'sm:col-span-2' : ''}>
            <Label htmlFor="obInstEmail">Institution email (optional)</Label>
            <Input
              id="obInstEmail"
              type="email"
              value={institutionEmail}
              onChange={(e) => setInstitutionEmail(e.target.value)}
              placeholder="name@jkkn.ac.in"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {onboard.isPending ? 'Onboarding…' : 'Create Staff Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Req() {
  return <span className="text-destructive">*</span>;
}
