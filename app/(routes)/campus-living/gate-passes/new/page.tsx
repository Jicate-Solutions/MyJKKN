'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useIssueGatePass } from '@/hooks/campus-living/use-gate-passes';
import { useLearnerHostelites } from '@/hooks/campus-living/use-learner-hostelites';
import { ArrowLeft, Save, Loader2, DoorOpen } from 'lucide-react';

/**
 * navMeta — invoked from the parent listing page via the "Issue Gate Pass"
 * button (BUG-003897). Required by `scripts/assert-nav-coverage.mjs`.
 */
export const navMeta = {
  invokedFrom: '/campus-living/gate-passes',
} as const;

const passTypeOptions = [
  { value: 'regular_out', label: 'Regular (day-out)' },
  { value: 'overnight', label: 'Overnight' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'visitor_accompanied', label: 'Visitor Accompanied' },
];

export default function IssueGatePassPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const issuePass = useIssueGatePass();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const institutionId = profile?.institution_id ?? '';
  const { data: hostelites, isLoading: hostelitesLoading } =
    useLearnerHostelites(institutionId);

  const [formData, setFormData] = useState({
    learner_id: '',
    pass_type: 'regular_out' as
      | 'regular_out'
      | 'overnight'
      | 'emergency'
      | 'visitor_accompanied',
    purpose: '',
    destination: '',
    valid_from: '',
    valid_to: '',
    notes: '',
  });

  const handleChange = (key: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.institution_id) return;
    if (!formData.learner_id) return;
    if (!formData.valid_from || !formData.valid_to) return;

    setIsSubmitting(true);
    try {
      // Service auto-generates pass_number + qr_code; we only supply the
      // user-entered fields. Loose typing keeps this page resilient to the
      // existing `CreateHostelGatePassDTO` reference type that is not
      // actually exported from `@/types/campus-living` (pre-existing tech
      // debt; will resolve when the gate-pass type module is filled in).
      await issuePass.mutateAsync({
        institution_id: profile.institution_id,
        learner_id: formData.learner_id,
        pass_type: formData.pass_type,
        purpose: formData.purpose || null,
        destination: formData.destination || null,
        valid_from: formData.valid_from,
        valid_to: formData.valid_to,
        notes: formData.notes || null,
      } as never);
      router.push('/campus-living/gate-passes');
    } catch {
      // toast handled by the hook's onError
    } finally {
      setIsSubmitting(false);
    }
  };

  const learners = ((hostelites as { data?: unknown[] } | undefined)?.data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    roll_number: string | null;
  }>;

  return (
    <ContentLayout title="Issue Gate Pass">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Gate Passes', href: '/campus-living/gate-passes' },
          { label: 'New' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Issue New Gate Pass</h1>
            <p className="text-sm text-muted-foreground">
              Record a hostel resident leaving the campus. The pass number
              and QR code are generated automatically on submit.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Resident */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resident</CardTitle>
              <CardDescription>
                Pick the hostel resident this pass is for.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="learner_id">Resident *</Label>
                <select
                  id="learner_id"
                  required
                  value={formData.learner_id}
                  onChange={(e) => handleChange('learner_id', e.target.value)}
                  disabled={hostelitesLoading}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  <option value="">
                    {hostelitesLoading
                      ? 'Loading residents…'
                      : learners.length === 0
                        ? 'No residents available — allocate residents first'
                        : 'Select a resident'}
                  </option>
                  {learners.map((l) => {
                    const name =
                      `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() ||
                      'Unnamed';
                    return (
                      <option key={l.id} value={l.id}>
                        {name}
                        {l.roll_number ? ` — ${l.roll_number}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Pass details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pass Details</CardTitle>
              <CardDescription>
                Type, purpose and validity window.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pass_type">Pass Type *</Label>
                <select
                  id="pass_type"
                  required
                  value={formData.pass_type}
                  onChange={(e) => handleChange('pass_type', e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  {passTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="purpose">Purpose</Label>
                <Input
                  id="purpose"
                  placeholder="e.g., Hospital visit, Family event"
                  value={formData.purpose}
                  onChange={(e) => handleChange('purpose', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destination">Destination</Label>
                <Input
                  id="destination"
                  placeholder="e.g., Salem, parental home"
                  value={formData.destination}
                  onChange={(e) => handleChange('destination', e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="valid_from">Valid From *</Label>
                  <Input
                    id="valid_from"
                    type="datetime-local"
                    required
                    value={formData.valid_from}
                    onChange={(e) => handleChange('valid_from', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="valid_to">Valid To *</Label>
                  <Input
                    id="valid_to"
                    type="datetime-local"
                    required
                    value={formData.valid_to}
                    onChange={(e) => handleChange('valid_to', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional context for security or warden."
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.learner_id}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Issuing…
                </>
              ) : (
                <>
                  <DoorOpen className="mr-2 h-4 w-4" />
                  Issue Gate Pass
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
