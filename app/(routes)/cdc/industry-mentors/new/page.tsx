'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { useCreateIndustryMentor } from '@/hooks/cdc/use-cdc-industry-mentors';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';

export default function NewIndustryMentorPage() {
  const router = useRouter();
  const { createMentor, loading, error } = useCreateIndustryMentor();
  const { selectedInstitutionId: institutionId } = useUserInstitutionAccess();

  const [form, setForm] = useState({
    mentor_name: '',
    email: '',
    designation: '',
    company_name: '',
    bio: '',
    linkedin_url: '',
    phone: '',
    industry_experience_years: '',
    expertise_areas_text: '',
  });

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!institutionId) return;

    const expertise_areas = form.expertise_areas_text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const mentor = await createMentor({
      institution_id: institutionId,
      mentor_name: form.mentor_name,
      email: form.email,
      designation: form.designation || undefined,
      company_name: form.company_name || undefined,
      bio: form.bio || undefined,
      linkedin_url: form.linkedin_url || undefined,
      phone: form.phone || undefined,
      industry_experience_years: form.industry_experience_years
        ? parseInt(form.industry_experience_years)
        : undefined,
      expertise_areas: expertise_areas.length > 0 ? expertise_areas : undefined,
    });

    router.push(`/cdc/industry-mentors/${mentor.id}`);
  }

  return (
    <ContentLayout title="CDC — Add Industry Mentor">
      <div className="space-y-6 max-w-2xl">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/cdc/industry-mentors">Industry Mentors</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Add Mentor</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/cdc/industry-mentors">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">Add Industry Mentor</h1>
        </div>

        <Separator />

        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="mentor_name">Full Name *</Label>
                  <Input
                    id="mentor_name"
                    value={form.mentor_name}
                    onChange={set('mentor_name')}
                    required
                    placeholder="Dr. Ramesh Kumar"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={set('email')}
                    required
                    placeholder="ramesh@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="designation">Designation</Label>
                  <Input
                    id="designation"
                    value={form.designation}
                    onChange={set('designation')}
                    placeholder="VP Engineering"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="company_name">Company</Label>
                  <Input
                    id="company_name"
                    value={form.company_name}
                    onChange={set('company_name')}
                    placeholder="Infosys Ltd."
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={set('phone')}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                  <Input
                    id="linkedin_url"
                    value={form.linkedin_url}
                    onChange={set('linkedin_url')}
                    placeholder="https://linkedin.com/in/ramesh"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="industry_experience_years">Years of Experience</Label>
                  <Input
                    id="industry_experience_years"
                    type="number"
                    min={0}
                    max={60}
                    value={form.industry_experience_years}
                    onChange={set('industry_experience_years')}
                    placeholder="15"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="expertise_areas_text">Expertise Areas</Label>
                  <Input
                    id="expertise_areas_text"
                    value={form.expertise_areas_text}
                    onChange={set('expertise_areas_text')}
                    placeholder="Machine Learning, Cloud, DevOps"
                  />
                  <p className="text-xs text-muted-foreground">Comma-separated</p>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={form.bio}
                  onChange={set('bio')}
                  rows={4}
                  placeholder="Brief professional background and mentoring focus areas…"
                />
              </div>
            </CardContent>
          </Card>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {loading ? 'Saving…' : 'Add Mentor'}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/cdc/industry-mentors">Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
