'use client';

// Registration form on the public campus-drive page (/dr/<token>). Plain
// controlled inputs; the server route re-validates everything.

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CdcDriveTargetGender } from '@/types/cdc';

const SEMESTERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Passed out'];

export function PublicDriveRegistration({
  token,
  institutions,
  gender: driveGender,
}: {
  token: string;
  institutions: Array<{ id: string; name: string }>;
  gender: CdcDriveTargetGender;
}) {
  const fixedGender = driveGender === 'male' ? 'Male' : driveGender === 'female' ? 'Female' : null;
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState(fixedGender ?? '');
  const [institutionId, setInstitutionId] = useState(institutions.length === 1 ? institutions[0].id : '');
  const [institutionOther, setInstitutionOther] = useState('');
  const [program, setProgram] = useState('');
  const [semester, setSemester] = useState('');
  const [registerNumber, setRegisterNumber] = useState('');
  const [cgpa, setCgpa] = useState('');
  const [arrears, setArrears] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!gender) return setError('Please select your gender');
    if (!institutionId) return setError('Please select your institution');
    if (institutionId === 'other' && institutionOther.trim().length < 2) return setError('Please enter your institution');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/cdc/drives/${token}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          mobile,
          email,
          gender,
          institution_id: institutionId,
          institution_name: institutionId === 'other' ? institutionOther : '',
          program_name: program,
          semester,
          register_number: registerNumber,
          cgpa,
          arrears,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not submit your registration. Please try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-white p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">Registration received</h2>
        <p className="mt-1 text-sm text-slate-600">
          Thank you, {fullName.trim()}. The Career Development Centre will contact you with the next steps.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Register for this drive</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="dr-name">Full name *</Label>
          <Input id="dr-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={150} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-mobile">Mobile number *</Label>
          <Input
            id="dr-mobile"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
            required
            inputMode="numeric"
            pattern="[6-9][0-9]{9}"
            title="10-digit mobile number"
            autoComplete="tel-national"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-email">Email *</Label>
          <Input id="dr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-gender">Gender *</Label>
          <Select value={gender} onValueChange={setGender} disabled={!!fixedGender}>
            <SelectTrigger id="dr-gender">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              {(fixedGender ? [fixedGender] : ['Male', 'Female', 'Other']).map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-reg">Register number</Label>
          <Input id="dr-reg" value={registerNumber} onChange={(e) => setRegisterNumber(e.target.value)} maxLength={40} placeholder="If you have one" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="dr-inst">Institution *</Label>
          <Select value={institutionId} onValueChange={setInstitutionId}>
            <SelectTrigger id="dr-inst">
              <SelectValue placeholder="Select your institution" />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
              <SelectItem value="other">Other institution</SelectItem>
            </SelectContent>
          </Select>
          {institutionId === 'other' ? (
            <Input
              className="mt-2"
              value={institutionOther}
              onChange={(e) => setInstitutionOther(e.target.value)}
              placeholder="Institution name"
              maxLength={200}
              required
            />
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-program">Program / branch *</Label>
          <Input id="dr-program" value={program} onChange={(e) => setProgram(e.target.value)} required maxLength={200} placeholder="e.g. B.E. Computer Science" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-sem">Semester</Label>
          <Select value={semester} onValueChange={setSemester}>
            <SelectTrigger id="dr-sem">
              <SelectValue placeholder="Select semester" />
            </SelectTrigger>
            <SelectContent>
              {SEMESTERS.map((s) => (
                <SelectItem key={s} value={s}>{/^\d+$/.test(s) ? `Semester ${s}` : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-cgpa">CGPA</Label>
          <Input id="dr-cgpa" value={cgpa} onChange={(e) => setCgpa(e.target.value)} inputMode="decimal" placeholder="0 – 10" maxLength={5} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-arrears">Current arrears</Label>
          <Input id="dr-arrears" value={arrears} onChange={(e) => setArrears(e.target.value.replace(/[^\d]/g, '').slice(0, 2))} inputMode="numeric" placeholder="0 if none" />
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Submit registration
      </Button>
      <p className="text-xs text-slate-500">
        Your details are shared only with the JKKN Career Development Centre for this drive.
      </p>
    </form>
  );
}
