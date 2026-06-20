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
import type { CreateOpportunityDto } from '@/types/cdc/bulletin';

export default function NewBulletinOpportunityPage() {
  const router = useRouter();
  const createMutation = useCreateCdcOpportunity();

  const [form, setForm] = useState<CreateOpportunityDto>({
    title: '',
    source_organisation: null,
    category: null,
    mode: 'offline',
    deadline_date: null,
    eligibility_text: null,
    apply_url: null,
    detail_url: null,
    stipend_text: null,
    attachment_url: null,
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
    if (!form.title.trim()) return;
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

              {/* Eligibility */}
              <div className="space-y-1.5">
                <Label htmlFor="eligibility_text">Eligibility</Label>
                <Textarea
                  id="eligibility_text"
                  value={form.eligibility_text ?? ''}
                  onChange={(e) => set('eligibility_text', e.target.value || null)}
                  placeholder="Open to BE/BTech students, 2nd year and above..."
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
                <Button type="submit" disabled={createMutation.isPending || uploading || !form.title.trim()}>
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
