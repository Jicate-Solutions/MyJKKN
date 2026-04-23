// app/(routes)/accreditation/naac/grievance/new/page.tsx
// ============================================================================
// PR-A6a — New Grievance form.
//
// Form fields: category, priority, subject, description, raised-by type + name,
// anonymous toggle. SLA deadline derived from chosen category's
// default_sla_hours using wall-clock time (A6b will upgrade to business-day
// calculation via institution_leaves).
// ============================================================================

'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import { useAuth } from '@/hooks/use-auth';
import type {
  GrievancePriority, RaisedByType, GrievanceCategory,
} from '@/lib/types/grievance';

export default function NewGrievancePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';

  const [categoryId, setCategoryId] = useState<string>('');
  const [priority, setPriority] = useState<GrievancePriority>('medium');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [raisedByType, setRaisedByType] = useState<RaisedByType>('learner');
  const [raisedByName, setRaisedByName] = useState('');
  const [raisedByEmail, setRaisedByEmail] = useState('');
  const [raisedByPhone, setRaisedByPhone] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: categories = [], isLoading: catLoading } = useQuery({
    queryKey: ['grievance', 'categories', institutionId],
    queryFn: () => GrievanceService.getCategories(institutionId),
    enabled: !!institutionId,
  });

  const selectedCategory = useMemo<GrievanceCategory | undefined>(
    () => categories.find(c => c.id === categoryId),
    [categories, categoryId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!institutionId) {
      toast.error('No institution detected on your profile.');
      return;
    }
    if (!categoryId) { toast.error('Pick a category.'); return; }
    if (subject.trim().length < 3) { toast.error('Subject must be at least 3 characters.'); return; }
    if (description.trim().length < 10) { toast.error('Description must be at least 10 characters.'); return; }

    const slaHours = selectedCategory?.default_sla_hours ?? 72;

    setSubmitting(true);
    // Business-hour SLA deadline via RPC — skips weekends + institution
    // holidays (hr_public_holidays). Fallback to wall-clock if RPC fails.
    let slaDeadline: string;
    try {
      slaDeadline = await GrievanceService.calculateSlaDeadline(institutionId, slaHours);
    } catch (err) {
      console.warn('[grievance/new] Business-hour SLA RPC failed, falling back to wall-clock:', err);
      slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();
    }

    try {
      const created = await GrievanceService.createTicket({
        institution_id: institutionId,
        category_id: categoryId,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        raised_by_type: raisedByType,
        raised_by_id: !isAnonymous && profile?.id ? profile.id : null,
        raised_by_name: !isAnonymous ? raisedByName.trim() || (profile?.email ?? null) : null,
        raised_by_email: !isAnonymous ? raisedByEmail.trim() || null : null,
        raised_by_phone: !isAnonymous ? raisedByPhone.trim() || null : null,
        is_anonymous: isAnonymous,
        filed_by: profile?.id ?? null,
        is_emergency: !!selectedCategory?.is_emergency,
        is_icc_only: (selectedCategory?.name ?? '').toLowerCase().includes('sexual harassment'),
        sla_hours: slaHours,
        sla_deadline: slaDeadline,
      });
      toast.success(`Ticket ${created.ticket_number} created.`);
      router.push(`/accreditation/naac/grievance/${created.id}`);
    } catch (err) {
      toast.error('Could not create ticket. ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ContentLayout title="New Grievance">
      <PageBreadcrumb
        items={[
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          { label: 'Grievance', href: '/accreditation/naac/grievance' },
          { label: 'New' },
        ]}
      />

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>File a new grievance</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Category *</Label>
              <Select value={categoryId} onValueChange={setCategoryId} disabled={catLoading}>
                <SelectTrigger><SelectValue placeholder={catLoading ? 'Loading…' : 'Select category'} /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.is_emergency ? ' · Emergency' : ''}{c.attachment_required ? ' · Attachment required' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategory && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Default SLA: {selectedCategory.default_sla_hours}h · Auto-assignee: {selectedCategory.default_assignee_role} · NAAC metric: {selectedCategory.default_naac_metric_code ?? '-'}
                </p>
              )}
            </div>

            <div>
              <Label>Subject *</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Short summary (min 3 chars)" maxLength={255} />
            </div>

            <div>
              <Label>Description *</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the grievance in detail (min 10 chars)" rows={5} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Priority</Label>
                <Select value={priority} onValueChange={v => setPriority(v as GrievancePriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Raised by (type)</Label>
                <Select value={raisedByType} onValueChange={v => setRaisedByType(v as RaisedByType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="learner">Learner</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="alumni">Alumni</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input id="is-anon" type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} className="h-4 w-4" />
              <Label htmlFor="is-anon" className="font-normal">File anonymously (identity hidden from assignee, audit trail retained)</Label>
            </div>

            {!isAnonymous && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <Label>Name</Label>
                  <Input value={raisedByName} onChange={e => setRaisedByName(e.target.value)} placeholder="Your name" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={raisedByEmail} onChange={e => setRaisedByEmail(e.target.value)} placeholder="you@example.com" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={raisedByPhone} onChange={e => setRaisedByPhone(e.target.value)} placeholder="Optional" />
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Submitting…' : 'File Ticket'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
