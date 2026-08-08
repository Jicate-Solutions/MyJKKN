'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  Loader2,
  ArrowLeft,
  ExternalLink,
  Mail,
  Phone,
  Star,
  Pencil,
  Check,
} from 'lucide-react';
import {
  useIndustryMentor,
  useUpdateIndustryMentor,
} from '@/hooks/cdc/use-cdc-industry-mentors';
import type { UpdateIndustryMentorInput } from '@/types/cdc/industry-mentors';
import { IndustryMenteesCard } from '@/components/cdc/industry-mentees-card';

type Props = { params: Promise<{ id: string }> };

export default function IndustryMentorDetailPage(props: Props) {
  return (
    <PermissionGuard module="cdc.industry_mentors" action="view">
      <IndustryMentorDetailContent {...props} />
    </PermissionGuard>
  );
}

function IndustryMentorDetailContent({ params }: Props) {
  const { id } = use(params);
  const { mentor, loading, error } = useIndustryMentor(id);
  const { updateMentor, loading: saving, error: saveError } = useUpdateIndustryMentor(id);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState<UpdateIndustryMentorInput>({});

  function startEdit() {
    if (!mentor) return;
    setForm({
      designation: mentor.designation ?? '',
      company_name: mentor.company_name ?? '',
      bio: mentor.bio ?? '',
      linkedin_url: mentor.linkedin_url ?? '',
      phone: mentor.phone ?? '',
      industry_experience_years: mentor.industry_experience_years ?? undefined,
      expertise_areas: [...(mentor.expertise_areas ?? [])],
      is_active: mentor.is_active,
    });
    setEditing(true);
    setSaved(false);
  }

  async function handleSave() {
    await updateMentor(form);
    setSaved(true);
    setEditing(false);
  }

  if (loading) {
    return (
      <ContentLayout title="Industry Mentor">
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !mentor) {
    return (
      <ContentLayout title="Industry Mentor">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error ?? 'Mentor not found'}</AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const initials = mentor.mentor_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <ContentLayout title={mentor.mentor_name}>
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
              <BreadcrumbPage>{mentor.mentor_name}</BreadcrumbPage>
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
        </div>

        {/* Profile header */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16 shrink-0">
                {mentor.profile_photo_url && (
                  <AvatarImage src={mentor.profile_photo_url} alt={mentor.mentor_name} />
                )}
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h1 className="text-xl font-semibold">{mentor.mentor_name}</h1>
                    {mentor.designation && (
                      <p className="text-sm text-muted-foreground">
                        {mentor.designation}
                        {mentor.company_name && ` · ${mentor.company_name}`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!mentor.is_active && (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                    {mentor.is_verified && (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                        Verified
                      </Badge>
                    )}
                    {!editing && (
                      <PermissionGuard module="cdc.industry_mentors" action="edit" fallback={null}>
                        <Button size="sm" variant="outline" onClick={startEdit}>
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                      </PermissionGuard>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
                  <a
                    href={`mailto:${mentor.email}`}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {mentor.email}
                  </a>
                  {mentor.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {mentor.phone}
                    </span>
                  )}
                  {mentor.linkedin_url && (
                    <a
                      href={mentor.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      LinkedIn
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  {mentor.industry_experience_years != null && (
                    <span>{mentor.industry_experience_years} years experience</span>
                  )}
                  {mentor.average_rating != null && (
                    <span className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      {mentor.average_rating.toFixed(1)} avg rating
                    </span>
                  )}
                  {mentor.total_sessions_conducted != null && (
                    <span>{mentor.total_sessions_conducted} sessions conducted</span>
                  )}
                </div>

                {mentor.expertise_areas && mentor.expertise_areas.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {mentor.expertise_areas.map((area) => (
                      <Badge key={area} variant="outline" className="text-xs">
                        {area}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {mentor.bio && !editing && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bio</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{mentor.bio}</p>
            </CardContent>
          </Card>
        )}

        {/* Edit form */}
        {editing && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Edit Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Designation</Label>
                  <Input
                    value={form.designation ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Company</Label>
                  <Input
                    value={form.company_name ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input
                    value={form.phone ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>LinkedIn URL</Label>
                  <Input
                    value={form.linkedin_url ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Years of Experience</Label>
                  <Input
                    type="number"
                    value={form.industry_experience_years ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        industry_experience_years: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Expertise Areas (comma-separated)</Label>
                  <Input
                    value={(form.expertise_areas ?? []).join(', ')}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        expertise_areas: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Bio</Label>
                <Textarea
                  rows={4}
                  value={form.bio ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                />
              </div>

              {saveError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              )}

              <Separator />
              <div className="flex gap-3">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {saved && !editing && (
          <Alert>
            <Check className="h-4 w-4" />
            <AlertDescription>Changes saved successfully.</AlertDescription>
          </Alert>
        )}

        {/* Mentee stats */}
        {(mentor.current_mentees != null || mentor.total_mentees_all_time != null) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mentoring Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-semibold">
                    {mentor.current_mentees ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Current mentees</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {mentor.max_mentees ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">Max mentees</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {mentor.total_mentees_all_time ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">All-time mentees</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Assigned mentees + per-mentee sessions (BUG-004198) */}
        <IndustryMenteesCard mentorId={id} />
      </div>
    </ContentLayout>
  );
}
