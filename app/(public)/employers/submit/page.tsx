'use client';

// PUBLIC employer self-submit portal — a company shares a job vacancy + skills
// requirement with JKKN's CDC. No login. Submissions land in a moderation queue
// (status='pending_review') and are reviewed by CDC staff before anything is
// shown to students. Posts to /api/public/cdc/employer-submit (service-role).

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, Loader2, Briefcase, AlertCircle, Plus, X, Trash2 } from 'lucide-react';
import type { RoleExperienceLevel, RoleWorkMode } from '@/types/cdc/employer-requirements';

interface RoleForm {
  role_title: string;
  skillInput: string;
  skills: string[];
  experience_level: RoleExperienceLevel;
  experience_min_years: string;
  openings_count: string;
  package_lpa: string;
  work_mode: RoleWorkMode | '';
  location: string;
  education_text: string;
  benefits: string;
  description: string;
}

const EMPTY_ROLE: RoleForm = {
  role_title: '', skillInput: '', skills: [], experience_level: 'any',
  experience_min_years: '', openings_count: '1', package_lpa: '', work_mode: '',
  location: '', education_text: '', benefits: '', description: '',
};

export default function EmployerSubmitPage() {
  const [company, setCompany] = useState({
    company_name: '', company_website: '', hq_city: '', hq_state: '',
    primary_contact_name: '', primary_contact_email: '', primary_contact_phone: '',
    secondary_contact_name: '', secondary_contact_phone: '',
  });
  const [roles, setRoles] = useState<RoleForm[]>([{ ...EMPTY_ROLE }]);
  const [companyFax, setCompanyFax] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const setRole = (i: number, patch: Partial<RoleForm>) =>
    setRoles((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addSkill = (i: number) => {
    const r = roles[i];
    const v = r.skillInput.trim();
    if (!v) return;
    if (r.skills.some((s) => s.toLowerCase() === v.toLowerCase())) {
      setRole(i, { skillInput: '' });
      return;
    }
    setRole(i, { skills: [...r.skills, v].slice(0, 30), skillInput: '' });
  };
  const removeSkill = (i: number, s: string) =>
    setRole(i, { skills: roles[i].skills.filter((x) => x !== s) });

  const addRole = () => setRoles((rs) => (rs.length >= 10 ? rs : [...rs, { ...EMPTY_ROLE }]));
  const removeRole = (i: number) => setRoles((rs) => (rs.length <= 1 ? rs : rs.filter((_, idx) => idx !== i)));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!company.company_name.trim()) { setError('Please enter your company name.'); return; }
    if (roles.some((r) => !r.role_title.trim())) { setError('Every role needs a title.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/public/cdc/employer-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...company,
          company_fax: companyFax,
          roles: roles.map((r) => ({
            role_title: r.role_title,
            skills: r.skills,
            experience_level: r.experience_level,
            experience_min_years: r.experience_min_years ? Number(r.experience_min_years) : null,
            openings_count: r.openings_count ? Number(r.openings_count) : 1,
            package_lpa: r.package_lpa ? Number(r.package_lpa) : null,
            work_mode: r.work_mode || null,
            location: r.location,
            education_text: r.education_text,
            benefits: r.benefits,
            description: r.description,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Submission failed. Please try again.'); return; }
      setDone(data.reference || 'RECEIVED');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" />
            <h1 className="text-2xl font-semibold text-slate-900">Thank you!</h1>
            <p className="text-slate-600">
              Your requirement has reached the JKKN Career Development Cell. Our team will review it
              and reach out to you. Roles are shared with students only after review.
            </p>
            <p className="text-xs text-slate-400">Reference: {done}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-indigo-600 p-2.5"><Briefcase className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Hire from JKKN</h1>
            <p className="text-sm text-slate-500">Share your job vacancy and skill requirements with our Career Development Cell.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Honeypot — visually hidden, off-screen, not tab-reachable. */}
          <input
            type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
            value={companyFax} onChange={(e) => setCompanyFax(e.target.value)}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
            name="company_fax"
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your company</CardTitle>
              <CardDescription>Tell us who you are so we can get back to you.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="cn">Company name *</Label>
                <Input id="cn" value={company.company_name}
                  onChange={(e) => setCompany({ ...company, company_name: e.target.value })}
                  placeholder="e.g. MRC Textile Corporation" required />
              </div>
              <div>
                <Label htmlFor="cw">Website</Label>
                <Input id="cw" value={company.company_website}
                  onChange={(e) => setCompany({ ...company, company_website: e.target.value })}
                  placeholder="https://…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={company.hq_city}
                    onChange={(e) => setCompany({ ...company, hq_city: e.target.value })} placeholder="Erode" />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input id="state" value={company.hq_state}
                    onChange={(e) => setCompany({ ...company, hq_state: e.target.value })} placeholder="Tamil Nadu" />
                </div>
              </div>
              <div>
                <Label htmlFor="pcn">Contact name</Label>
                <Input id="pcn" value={company.primary_contact_name}
                  onChange={(e) => setCompany({ ...company, primary_contact_name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pce">Contact email</Label>
                <Input id="pce" type="email" value={company.primary_contact_email}
                  onChange={(e) => setCompany({ ...company, primary_contact_email: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pcp">Contact phone</Label>
                <Input id="pcp" value={company.primary_contact_phone}
                  onChange={(e) => setCompany({ ...company, primary_contact_phone: e.target.value })} placeholder="+91…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="scn">Alt. contact name</Label>
                  <Input id="scn" value={company.secondary_contact_name}
                    onChange={(e) => setCompany({ ...company, secondary_contact_name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="scp">Alt. phone</Label>
                  <Input id="scp" value={company.secondary_contact_phone}
                    onChange={(e) => setCompany({ ...company, secondary_contact_phone: e.target.value })} />
                </div>
              </div>
            </CardContent>
          </Card>

          {roles.map((r, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg">Role {i + 1}</CardTitle>
                {roles.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeRole(i)}
                    className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Role title *</Label>
                  <Input value={r.role_title} onChange={(e) => setRole(i, { role_title: e.target.value })}
                    placeholder="e.g. Senior Marketing Executive" required />
                </div>

                <div className="sm:col-span-2">
                  <Label>Skills required</Label>
                  <div className="flex gap-2">
                    <Input value={r.skillInput} onChange={(e) => setRole(i, { skillInput: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(i); } }}
                      placeholder="Type a skill and press Enter (e.g. SEO/SEM)" />
                    <Button type="button" variant="outline" onClick={() => addSkill(i)}><Plus className="h-4 w-4" /></Button>
                  </div>
                  {r.skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.skills.map((s) => (
                        <Badge key={s} variant="secondary" className="gap-1">
                          {s}
                          <button type="button" onClick={() => removeSkill(i, s)}><X className="h-3 w-3" /></button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Experience level</Label>
                  <Select value={r.experience_level}
                    onValueChange={(v) => setRole(i, { experience_level: v as RoleExperienceLevel })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="fresher">Fresher</SelectItem>
                      <SelectItem value="experienced">Experienced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Min years</Label>
                    <Input type="number" min="0" value={r.experience_min_years}
                      onChange={(e) => setRole(i, { experience_min_years: e.target.value })} placeholder="0" />
                  </div>
                  <div>
                    <Label>Openings</Label>
                    <Input type="number" min="1" value={r.openings_count}
                      onChange={(e) => setRole(i, { openings_count: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Work mode</Label>
                  <Select value={r.work_mode || undefined}
                    onValueChange={(v) => setRole(i, { work_mode: v as RoleWorkMode })}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_person">In person</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="remote">Remote</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={r.location} onChange={(e) => setRole(i, { location: e.target.value })} placeholder="Erode, TN" />
                </div>
                <div>
                  <Label>Package (LPA)</Label>
                  <Input type="number" min="0" step="0.1" value={r.package_lpa}
                    onChange={(e) => setRole(i, { package_lpa: e.target.value })} placeholder="Optional" />
                </div>
                <div>
                  <Label>Education</Label>
                  <Input value={r.education_text} onChange={(e) => setRole(i, { education_text: e.target.value })}
                    placeholder="e.g. Any degree / MBA preferred" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea value={r.description} onChange={(e) => setRole(i, { description: e.target.value })}
                    rows={3} placeholder="Responsibilities, expectations…" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Benefits</Label>
                  <Input value={r.benefits} onChange={(e) => setRole(i, { benefits: e.target.value })}
                    placeholder="e.g. Health insurance, travel allowance" />
                </div>
              </CardContent>
            </Card>
          ))}

          {roles.length < 10 && (
            <Button type="button" variant="outline" onClick={addRole} className="w-full">
              <Plus className="h-4 w-4 mr-2" /> Add another role
            </Button>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full" size="lg">
            {submitting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>) : 'Submit requirement'}
          </Button>
          <p className="text-center text-xs text-slate-400">
            By submitting you agree that JKKN's Career Development Cell may contact you about this requirement.
          </p>
        </form>
      </div>
    </div>
  );
}
