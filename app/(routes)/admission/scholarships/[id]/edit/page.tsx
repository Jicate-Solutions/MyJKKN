'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Save, ArrowLeft, Award } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { ScholarshipService } from '@/lib/services/admission/scholarship-service';
import type { Scholarship } from '@/lib/services/admission/scholarship-service';
import { useAcademicYears } from '@/hooks/use-academic-years';

const SCHOLARSHIP_TYPES = [
  { value: 'merit', label: 'Merit-Based' },
  { value: 'need_based', label: 'Need-Based' },
  { value: 'sports', label: 'Sports Achievement' },
  { value: 'minority', label: 'Minority' },
  { value: 'special', label: 'Special' },
  { value: 'government', label: 'Government' },
  { value: 'single_parent', label: 'Single Parent' },
  { value: 'disability', label: 'Disability' },
  { value: 'alumni_sibling', label: 'Alumni Sibling' },
];

export default function EditScholarshipPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id;

  const [scholarship, setScholarship] = useState<Scholarship | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch academic years for the scholarship's institution
  const { data: academicYearsResult } = useAcademicYears(scholarship?.institution_id);
  const academicYears = academicYearsResult?.data || [];

  // Form state mirrors the editable fields
  const [form, setForm] = useState({
    name: '',
    scholarship_type: '',
    benefit_type: 'fixed',
    benefit_value: '',
    total_slots: '',
    description: '',
    eligibility_criteria: '',
    is_active: true,
    valid_from: '',
    valid_until: '',
    academic_year: '',
  });

  // Load scholarship on mount
  useEffect(() => {
    if (!id) return;
    ScholarshipService.getScholarshipById(id).then((data) => {
      if (!data) {
        toast.error('Scholarship not found');
        router.push('/admission/scholarships');
        return;
      }
      setScholarship(data);
      setForm({
        name: data.name || '',
        scholarship_type: data.scholarship_type || '',
        benefit_type: data.benefit_type || 'fixed',
        benefit_value: String(data.benefit_value ?? ''),
        total_slots: String(data.total_slots ?? ''),
        description: data.description || '',
        eligibility_criteria:
          typeof data.eligibility_criteria === 'object' && data.eligibility_criteria?.raw
            ? data.eligibility_criteria.raw
            : '',
        is_active: data.is_active ?? true,
        valid_from: data.valid_from || '',
        valid_until: data.valid_until || '',
        academic_year: data.academic_year || '',
      });
      setLoading(false);
    });
  }, [id, router]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Scholarship name is required'); return; }
    if (!form.scholarship_type) { toast.error('Please select a type'); return; }
    if (!form.benefit_value) { toast.error('Benefit value is required'); return; }
    if (!form.total_slots) { toast.error('Total slots is required'); return; }

    setSaving(true);
    try {
      await ScholarshipService.updateScholarship(id, {
        name: form.name.trim(),
        scholarship_type: form.scholarship_type,
        benefit_type: form.benefit_type,
        benefit_value: parseFloat(form.benefit_value),
        total_slots: parseInt(form.total_slots),
        description: form.description || undefined,
        eligibility_criteria: form.eligibility_criteria || undefined,
        is_active: form.is_active,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        academic_year: form.academic_year || null,
      });

      // Invalidate the list query so it refreshes immediately
      queryClient.invalidateQueries({ queryKey: ['admission', 'scholarships', institutionId] });

      toast.success('Scholarship updated successfully');
      router.push('/admission/scholarships');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update scholarship');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ContentLayout title="Edit Scholarship">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Edit Scholarship">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/admission">Admission</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/admission/scholarships">Scholarships</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between mt-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link href="/admission/scholarships"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Award className="h-6 w-6 text-yellow-500" />
              Edit Scholarship
            </h1>
            <p className="text-sm text-muted-foreground">
              {scholarship?.code} · Last updated {scholarship?.created_at ? new Date(scholarship.created_at).toLocaleDateString() : '—'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admission/scholarships">Cancel</Link>
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Name, type, and active status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Scholarship Name <span className="text-destructive">*</span></Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Merit Excellence Award"
                />
              </div>
              <div className="space-y-2">
                <Label>Type <span className="text-destructive">*</span></Label>
                <Select value={form.scholarship_type} onValueChange={(v) => setForm((f) => ({ ...f, scholarship_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {SCHOLARSHIP_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of the scholarship"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              <Label>Active (visible to applicants)</Label>
            </div>
          </CardContent>
        </Card>

        {/* Benefit & Slots */}
        <Card>
          <CardHeader>
            <CardTitle>Benefit & Slots</CardTitle>
            <CardDescription>Financial benefit amount and seat allocation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Benefit Type</Label>
                <Select value={form.benefit_type} onValueChange={(v) => setForm((f) => ({ ...f, benefit_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed (₹)</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Benefit Value <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  value={form.benefit_value}
                  onChange={(e) => setForm((f) => ({ ...f, benefit_value: e.target.value }))}
                  placeholder={form.benefit_type === 'percentage' ? '50' : '50000'}
                />
              </div>
              <div className="space-y-2">
                <Label>Total Slots <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  value={form.total_slots}
                  onChange={(e) => setForm((f) => ({ ...f, total_slots: e.target.value }))}
                  placeholder="20"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Validity & Eligibility */}
        <Card>
          <CardHeader>
            <CardTitle>Validity & Eligibility</CardTitle>
            <CardDescription>Date range, academic year, and eligibility criteria</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Valid From</Label>
                <Input
                  type="date"
                  value={form.valid_from}
                  onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Valid Until</Label>
                <Input
                  type="date"
                  value={form.valid_until}
                  onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Select
                  value={form.academic_year}
                  onValueChange={(v) => setForm((f) => ({ ...f, academic_year: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                  <SelectContent>
                    {academicYears.map((y: any) => (
                      <SelectItem key={y.id} value={y.academic_year_name}>{y.academic_year_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Eligibility Criteria</Label>
              <Textarea
                value={form.eligibility_criteria}
                onChange={(e) => setForm((f) => ({ ...f, eligibility_criteria: e.target.value }))}
                placeholder="Minimum academic score, attendance requirements, etc."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
