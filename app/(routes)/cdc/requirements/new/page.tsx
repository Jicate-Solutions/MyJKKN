'use client';

// CDC staff — create an employer requirement directly (e.g. from an emailed
// vacancy). Staff entries are trusted → land 'approved'. POSTs to
// /api/cdc/requirements, then opens the new record.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Trash2, Loader2, AlertCircle } from 'lucide-react';
import type { RoleExperienceLevel, RoleWorkMode } from '@/types/cdc/employer-requirements';

interface RoleForm {
  role_title: string; skillInput: string; skills: string[];
  experience_level: RoleExperienceLevel; experience_min_years: string; openings_count: string;
  package_lpa: string; work_mode: RoleWorkMode | ''; location: string; description: string;
  education_text: string; benefits: string;
}
const EMPTY_ROLE: RoleForm = {
  role_title: '', skillInput: '', skills: [], experience_level: 'any', experience_min_years: '',
  openings_count: '1', package_lpa: '', work_mode: '', location: '', description: '', education_text: '', benefits: '',
};

function Content() {
  const router = useRouter();
  const [company, setCompany] = useState({
    company_name: '', company_website: '', hq_city: '', hq_state: '',
    primary_contact_name: '', primary_contact_email: '', primary_contact_phone: '',
    secondary_contact_name: '', secondary_contact_phone: '',
  });
  const [roles, setRoles] = useState<RoleForm[]>([{ ...EMPTY_ROLE }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setRole = (i: number, patch: Partial<RoleForm>) =>
    setRoles((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addSkill = (i: number) => {
    const v = roles[i].skillInput.trim(); if (!v) return;
    if (roles[i].skills.some((s) => s.toLowerCase() === v.toLowerCase())) { setRole(i, { skillInput: '' }); return; }
    setRole(i, { skills: [...roles[i].skills, v].slice(0, 30), skillInput: '' });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!company.company_name.trim()) { setError('Company name is required.'); return; }
    if (roles.some((r) => !r.role_title.trim())) { setError('Every role needs a title.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/cdc/requirements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...company,
          roles: roles.map((r) => ({
            role_title: r.role_title, skills: r.skills, experience_level: r.experience_level,
            experience_min_years: r.experience_min_years ? Number(r.experience_min_years) : null,
            openings_count: r.openings_count ? Number(r.openings_count) : 1,
            package_lpa: r.package_lpa ? Number(r.package_lpa) : null,
            work_mode: r.work_mode || null, location: r.location, description: r.description,
            education_text: r.education_text, benefits: r.benefits,
          })),
        }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || 'Failed to create'); return; }
      router.push(`/cdc/requirements/${j.id}`);
    } finally { setSaving(false); }
  }

  return (
    <ContentLayout title="New Employer Requirement">
      <PageBreadcrumb items={[{ label: 'CDC', href: '/cdc' }, { label: 'Employer Requirements', href: '/cdc/requirements' }, { label: 'New' }]} />
      <form onSubmit={submit} className="space-y-5 max-w-3xl">
        <Card>
          <CardHeader><CardTitle className="text-base">Company</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Company name *</Label>
              <Input value={company.company_name} onChange={(e) => setCompany({ ...company, company_name: e.target.value })} required /></div>
            <div><Label>Website</Label><Input value={company.company_website} onChange={(e) => setCompany({ ...company, company_website: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>City</Label><Input value={company.hq_city} onChange={(e) => setCompany({ ...company, hq_city: e.target.value })} /></div>
              <div><Label>State</Label><Input value={company.hq_state} onChange={(e) => setCompany({ ...company, hq_state: e.target.value })} /></div>
            </div>
            <div><Label>Contact name</Label><Input value={company.primary_contact_name} onChange={(e) => setCompany({ ...company, primary_contact_name: e.target.value })} /></div>
            <div><Label>Contact email</Label><Input type="email" value={company.primary_contact_email} onChange={(e) => setCompany({ ...company, primary_contact_email: e.target.value })} /></div>
            <div><Label>Contact phone</Label><Input value={company.primary_contact_phone} onChange={(e) => setCompany({ ...company, primary_contact_phone: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Alt. contact</Label><Input value={company.secondary_contact_name} onChange={(e) => setCompany({ ...company, secondary_contact_name: e.target.value })} /></div>
              <div><Label>Alt. phone</Label><Input value={company.secondary_contact_phone} onChange={(e) => setCompany({ ...company, secondary_contact_phone: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        {roles.map((r, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Role {i + 1}</CardTitle>
              {roles.length > 1 && (
                <Button type="button" variant="ghost" size="sm" className="text-red-600"
                  onClick={() => setRoles((rs) => rs.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
              )}
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label>Role title *</Label>
                <Input value={r.role_title} onChange={(e) => setRole(i, { role_title: e.target.value })} required /></div>
              <div className="sm:col-span-2"><Label>Skills</Label>
                <div className="flex gap-2">
                  <Input value={r.skillInput} onChange={(e) => setRole(i, { skillInput: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(i); } }}
                    placeholder="Type a skill, press Enter" />
                  <Button type="button" variant="outline" onClick={() => addSkill(i)}><Plus className="h-4 w-4" /></Button>
                </div>
                {r.skills.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.skills.map((s) => (
                      <Badge key={s} variant="secondary" className="gap-1">{s}
                        <button type="button" onClick={() => setRole(i, { skills: r.skills.filter((x) => x !== s) })}><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div><Label>Experience level</Label>
                <Select value={r.experience_level} onValueChange={(v) => setRole(i, { experience_level: v as RoleExperienceLevel })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="fresher">Fresher</SelectItem>
                    <SelectItem value="experienced">Experienced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Min years</Label><Input type="number" min="0" value={r.experience_min_years} onChange={(e) => setRole(i, { experience_min_years: e.target.value })} /></div>
                <div><Label>Openings</Label><Input type="number" min="1" value={r.openings_count} onChange={(e) => setRole(i, { openings_count: e.target.value })} /></div>
              </div>
              <div><Label>Work mode</Label>
                <Select value={r.work_mode || undefined} onValueChange={(v) => setRole(i, { work_mode: v as RoleWorkMode })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_person">In person</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Location</Label><Input value={r.location} onChange={(e) => setRole(i, { location: e.target.value })} /></div>
              <div><Label>Package (LPA)</Label><Input type="number" min="0" step="0.1" value={r.package_lpa} onChange={(e) => setRole(i, { package_lpa: e.target.value })} /></div>
              <div><Label>Education</Label><Input value={r.education_text} onChange={(e) => setRole(i, { education_text: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Description</Label><Textarea rows={2} value={r.description} onChange={(e) => setRole(i, { description: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Benefits</Label><Input value={r.benefits} onChange={(e) => setRole(i, { benefits: e.target.value })} /></div>
            </CardContent>
          </Card>
        ))}

        {roles.length < 10 && (
          <Button type="button" variant="outline" className="w-full" onClick={() => setRoles((rs) => [...rs, { ...EMPTY_ROLE }])}>
            <Plus className="h-4 w-4 mr-2" /> Add another role
          </Button>
        )}
        {error && <div className="flex items-center gap-2 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm"><AlertCircle className="h-4 w-4" /> {error}</div>}
        <Button type="submit" disabled={saving} size="lg">
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : 'Create requirement'}
        </Button>
      </form>
    </ContentLayout>
  );
}

export default function NewCdcRequirementPage() {
  return (
    <PermissionGuard module="cdc.requirements" action="create">
      <Content />
    </PermissionGuard>
  );
}
