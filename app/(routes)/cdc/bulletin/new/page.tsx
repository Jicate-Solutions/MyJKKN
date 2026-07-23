'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreateCdcOpportunity } from '@/hooks/cdc/use-cdc-bulletin';
import { ArrowLeft, Loader2, Paperclip, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { BULLETIN_CATEGORIES, BULLETIN_MODES } from '@/types/cdc/bulletin';
import type { CreateOpportunityDto, TargetAudience } from '@/types/cdc/bulletin';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { AudienceMultiSelect } from './_components/audience-multi-select';

export default function NewBulletinOpportunityPage() {
  const router = useRouter();
  const createMutation = useCreateCdcOpportunity();

  const [form, setForm] = useState<CreateOpportunityDto>({
    title: '',
    description: '',
    source_organisation: null,
    category: null,
    mode: 'offline',
    deadline_date: null,
    eligibility_text: null,
    apply_url: null,
    detail_url: null,
    stipend_text: null,
    attachment_url: null,
    target_audience: null,
    is_active: true,
  });
  // Tracks the Select choice separately so 'other' can reveal a custom text input.
  const [categoryChoice, setCategoryChoice] = useState<string>('none');
  const [categoryOther, setCategoryOther] = useState('');
  // Brochure / attachment upload (BUG-004063)
  const [uploading, setUploading] = useState(false);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);

  function set<K extends keyof CreateOpportunityDto>(key: K, value: CreateOpportunityDto[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Target audience (BUG-004080) — load active departments & programs org-wide
  // (STABLE_DATA cached). Both are optional filters; an empty dimension means no
  // restriction. Service does .insert(dto) so widening the DTO carries this through.
  const { data: departmentsData, isLoading: deptsLoading } = useDepartments({ isActive: true, limit: 500 });
  const { data: programsData, isLoading: programsLoading } = usePrograms({ isActive: true, limit: 1000 });

  const departmentOptions = (departmentsData?.data ?? []).map((d) => ({ id: d.id, label: d.department_name }));
  const programOptions = (programsData?.data ?? []).map((p) => ({ id: p.id, label: p.program_name }));

  // Update one dimension of target_audience, collapsing to null when fully empty
  // so we never persist an all-empty object (keeps "no restriction" === null).
  function setAudience(dim: keyof TargetAudience, ids: string[]) {
    setForm((prev) => {
      const next: TargetAudience = { ...(prev.target_audience ?? {}) };
      if (ids.length) next[dim] = ids;
      else delete next[dim];
      const isEmpty = Object.values(next).every((arr) => !arr || arr.length === 0);
      return { ...prev, target_audience: isEmpty ? null : next };
    });
  }

  // Upload a brochure/attachment (PDF or image) to the cdc-docs bucket and store its
  // public URL on the form. Self-contained — no shared storage service (BUG-004063).
  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const supabase = createClientSupabaseClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `bulletin-attachments/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from('cdc-docs').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('cdc-docs').getPublicUrl(path);
      set('attachment_url', data.publicUrl);
      setAttachmentName(file.name);
      toast.success('Attachment uploaded');
    } catch (err) {
      console.error('[cdc/bulletin] attachment upload failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to upload attachment');
    } finally {
      setUploading(false);
      // Reset the input so re-selecting the same file fires onChange again.
      e.target.value = '';
    }
  }

  function removeAttachment() {
    set('attachment_url', null);
    setAttachmentName(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;
    // When 'other' is chosen, submit the typed custom category instead of the literal 'other'.
    const resolvedCategory =
      categoryChoice === 'other' ? categoryOther.trim() || null : form.category;
    const opp = await createMutation.mutateAsync({ ...form, category: resolvedCategory });
    router.push(`/cdc/bulletin/${opp.id}`);
  }

  return (
    <PermissionGuard module="cdc.bulletin" action="create">
    <ContentLayout title="Post Opportunity">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'CDC' },
        { label: 'Opportunities Bulletin', href: '/cdc/bulletin' },
        { label: 'Post New' },
      ]} />

      <div className="max-w-2xl space-y-4 mt-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/cdc/bulletin"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Post Opportunity</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Opportunity Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="e.g. Smart India Hackathon 2025"
                  required
                />
              </div>

              {/* Source / Org */}
              <div className="space-y-1.5">
                <Label htmlFor="source_org">Source / Organisation</Label>
                <Input
                  id="source_org"
                  value={form.source_organisation ?? ''}
                  onChange={(e) => set('source_organisation', e.target.value || null)}
                  placeholder="e.g. Ministry of Education, AICTE"
                />
              </div>

              {/* Description (BUG-004065) — required body describing the opportunity */}
              <div className="space-y-1.5">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Describe the opportunity — what it is, who it's for, and why a learner should apply."
                  rows={4}
                  required
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={categoryChoice}
                  onValueChange={(v) => {
                    setCategoryChoice(v);
                    set('category', v === 'none' ? null : v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {BULLETIN_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categoryChoice === 'other' && (
                  <Input
                    id="category_other"
                    className="mt-2"
                    value={categoryOther}
                    onChange={(e) => setCategoryOther(e.target.value)}
                    placeholder="Enter custom category"
                  />
                )}
              </div>

              {/* Mode of participation (BUG-004067) */}
              <div className="space-y-1.5">
                <Label>Mode of Participation</Label>
                <Select
                  value={form.mode ?? 'offline'}
                  onValueChange={(v) => set('mode', v as CreateOpportunityDto['mode'])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {BULLETIN_MODES.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Deadline */}
              <div className="space-y-1.5">
                <Label htmlFor="deadline_date">Application Deadline</Label>
                <Input
                  id="deadline_date"
                  type="date"
                  value={form.deadline_date ?? ''}
                  onChange={(e) => set('deadline_date', e.target.value || null)}
                />
              </div>

              {/* Apply URL */}
              <div className="space-y-1.5">
                <Label htmlFor="apply_url">Apply URL</Label>
                <Input
                  id="apply_url"
                  type="url"
                  value={form.apply_url ?? ''}
                  onChange={(e) => set('apply_url', e.target.value || null)}
                  placeholder="https://..."
                />
              </div>

              {/* Detail URL */}
              <div className="space-y-1.5">
                <Label htmlFor="detail_url">More Info URL</Label>
                <Input
                  id="detail_url"
                  type="url"
                  value={form.detail_url ?? ''}
                  onChange={(e) => set('detail_url', e.target.value || null)}
                  placeholder="https://..."
                />
              </div>

              {/* Stipend */}
              <div className="space-y-1.5">
                <Label htmlFor="stipend_text">Stipend / Prize / Benefit</Label>
                <Input
                  id="stipend_text"
                  value={form.stipend_text ?? ''}
                  onChange={(e) => set('stipend_text', e.target.value || null)}
                  placeholder="e.g. ₹1 Lakh prize, ₹15,000/month stipend"
                />
              </div>

              {/* Brochure / Attachment (BUG-004063) */}
              <div className="space-y-1.5">
                <Label htmlFor="attachment">Brochure / Attachment</Label>
                {form.attachment_url ? (
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                    <a
                      href={form.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-primary hover:underline"
                    >
                      {attachmentName ?? 'View attachment'}
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-7 w-7 shrink-0"
                      onClick={removeAttachment}
                      aria-label="Remove attachment"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Input
                    id="attachment"
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleAttachmentUpload}
                    disabled={uploading}
                  />
                )}
                {uploading && (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Optional. PDF or image.</p>
              </div>

              {/* Target Audience (BUG-004080) — structured eligibility */}
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-0.5">
                  <Label>Target Audience</Label>
                  <p className="text-xs text-muted-foreground">
                    Optional. Restrict who this opportunity is meant for. Leave blank to target everyone.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-normal text-muted-foreground">Departments</Label>
                  <AudienceMultiSelect
                    options={departmentOptions}
                    selectedIds={form.target_audience?.departments ?? []}
                    onSelectionChange={(ids) => setAudience('departments', ids)}
                    placeholder="All departments"
                    searchPlaceholder="Search departments…"
                    emptyText="No departments found."
                    loading={deptsLoading}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-normal text-muted-foreground">Programs</Label>
                  <AudienceMultiSelect
                    options={programOptions}
                    selectedIds={form.target_audience?.programs ?? []}
                    onSelectionChange={(ids) => setAudience('programs', ids)}
                    placeholder="All programs"
                    searchPlaceholder="Search programs…"
                    emptyText="No programs found."
                    loading={programsLoading}
                  />
                </div>
              </div>

              {/* Eligibility (free-text notes — complements the structured audience above) */}
              <div className="space-y-1.5">
                <Label htmlFor="eligibility_text">Eligibility Notes</Label>
                <Textarea
                  id="eligibility_text"
                  value={form.eligibility_text ?? ''}
                  onChange={(e) => set('eligibility_text', e.target.value || null)}
                  placeholder="Any extra criteria, e.g. 2nd year and above, minimum CGPA 7..."
                  rows={3}
                />
              </div>

              {/* Publish toggle */}
              <div className="flex items-center gap-3">
                <Switch
                  id="is_active"
                  checked={form.is_active ?? true}
                  onCheckedChange={(v) => set('is_active', v)}
                />
                <Label htmlFor="is_active">Publish immediately</Label>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={createMutation.isPending || uploading || !form.title.trim() || !form.description.trim()}>
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Post to Bulletin
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/cdc/bulletin">Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
