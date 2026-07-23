'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Loader2, ArrowLeft, ImagePlus, X } from 'lucide-react';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { useCreateIndustryMentor } from '@/hooks/cdc/use-cdc-industry-mentors';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { createClientSupabaseClient } from '@/lib/supabase/client';

type ConfigMaster = { id: string; display_name: string };

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

  // Engagement category (required, BUG-004059) + structured expertise (optional, BUG-004060)
  const [categoryId, setCategoryId] = useState('');
  const [expertiseIds, setExpertiseIds] = useState<string[]>([]);

  // Config masters read self-contained (no shared lookups hook) under RLS:
  // both tables allow SELECT for any authenticated user.
  const [categories, setCategories] = useState<ConfigMaster[]>([]);
  const [expertiseAreas, setExpertiseAreas] = useState<ConfigMaster[]>([]);
  const [mastersLoading, setMastersLoading] = useState(true);
  const [categoryTouched, setCategoryTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Cast to untyped: the foundation just created these masters, so they
      // are not yet in the generated Database type (types/supabase.ts). The
      // industry-mentor service uses the same `(supabase as any)` pattern.
      const supabase = createClientSupabaseClient() as any;
      const [catRes, expRes] = await Promise.all([
        supabase
          .from('cdc_mentor_categories')
          .select('id,display_name')
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('cdc_expertise_areas')
          .select('id,display_name')
          .eq('is_active', true)
          .order('sort_order'),
      ]);
      if (cancelled) return;
      setCategories((catRes.data ?? []) as ConfigMaster[]);
      setExpertiseAreas((expRes.data ?? []) as ConfigMaster[]);
      setMastersLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleExpertise(id: string) {
    setExpertiseIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  }

  const [photoUrl, setPhotoUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };
  }

  async function uploadImage(
    file: File,
    prefix: 'mentor-photos' | 'company-logos'
  ): Promise<string> {
    const supabase = createClientSupabaseClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${prefix}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from('cdc-docs')
      .upload(path, file, { upsert: false });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('cdc-docs').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingPhoto(true);
      const url = await uploadImage(file, 'mentor-photos');
      setPhotoUrl(url);
      toast.success('Photo uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  }

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLogo(true);
      const url = await uploadImage(file, 'company-logos');
      setLogoUrl(url);
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!institutionId) return;

    // Engagement category is required on new records (BUG-004059).
    if (!categoryId) {
      setCategoryTouched(true);
      toast.error('Please select an engagement category');
      return;
    }

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
      mentor_category_id: categoryId,
      expertise_areas: expertise_areas.length > 0 ? expertise_areas : undefined,
      expertise_area_ids: expertiseIds.length > 0 ? expertiseIds : undefined,
      profile_photo_url: photoUrl || undefined,
      company_logo_url: logoUrl || undefined,
    });

    router.push(`/cdc/industry-mentors/${mentor.id}`);
  }

  const categoryError = categoryTouched && !categoryId;

  return (
    <PermissionGuard module="cdc.industry_mentors" action="create">
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
                  <Label htmlFor="mentor_category">Engagement Category *</Label>
                  <Select
                    value={categoryId}
                    onValueChange={(v) => {
                      setCategoryId(v);
                      setCategoryTouched(true);
                    }}
                    disabled={mastersLoading}
                  >
                    <SelectTrigger
                      id="mentor_category"
                      aria-invalid={categoryError}
                      className={categoryError ? 'border-destructive' : undefined}
                    >
                      <SelectValue
                        placeholder={mastersLoading ? 'Loading…' : 'Select a category'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {categoryError && (
                    <p className="text-xs text-destructive">
                      Engagement category is required
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Expertise Areas</Label>
                <p className="text-xs text-muted-foreground">
                  Select all that apply (optional)
                </p>
                {mastersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading expertise areas…
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {expertiseAreas.map((a) => (
                      <label
                        key={a.id}
                        htmlFor={`expertise-${a.id}`}
                        className="flex items-center gap-2 text-sm cursor-pointer rounded-md border px-3 py-2 hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`expertise-${a.id}`}
                          checked={expertiseIds.includes(a.id)}
                          onCheckedChange={() => toggleExpertise(a.id)}
                        />
                        <span>{a.display_name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="expertise_areas_text">Other Expertise Tags</Label>
                <Input
                  id="expertise_areas_text"
                  value={form.expertise_areas_text}
                  onChange={set('expertise_areas_text')}
                  placeholder="Machine Learning, Cloud, DevOps"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated free text — for anything not in the list above
                </p>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Images</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Mentor Photo</Label>
                  <div className="flex items-center gap-4">
                    {photoUrl ? (
                      <div className="relative w-24 h-24">
                        <Image
                          src={photoUrl}
                          alt="Mentor photo"
                          fill
                          className="object-cover rounded-lg"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6"
                          onClick={() => setPhotoUrl('')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoSelect}
                          disabled={uploadingPhoto}
                          className="hidden"
                          id="mentor-photo-upload"
                        />
                        <label
                          htmlFor="mentor-photo-upload"
                          className="flex flex-col items-center gap-2 cursor-pointer"
                        >
                          <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center">
                            {uploadingPhoto ? (
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            ) : (
                              <ImagePlus className="h-8 w-8 text-muted-foreground" />
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {uploadingPhoto ? 'Uploading…' : 'Upload Photo'}
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Company Logo</Label>
                  <div className="flex items-center gap-4">
                    {logoUrl ? (
                      <div className="relative w-24 h-24">
                        <Image
                          src={logoUrl}
                          alt="Company logo"
                          fill
                          className="object-contain rounded-lg"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6"
                          onClick={() => setLogoUrl('')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoSelect}
                          disabled={uploadingLogo}
                          className="hidden"
                          id="company-logo-upload"
                        />
                        <label
                          htmlFor="company-logo-upload"
                          className="flex flex-col items-center gap-2 cursor-pointer"
                        >
                          <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center">
                            {uploadingLogo ? (
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            ) : (
                              <ImagePlus className="h-8 w-8 text-muted-foreground" />
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {uploadingLogo ? 'Uploading…' : 'Upload Logo'}
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
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
            <Button
              type="submit"
              disabled={loading || uploadingPhoto || uploadingLogo || mastersLoading}
            >
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
    </PermissionGuard>
  );
}
