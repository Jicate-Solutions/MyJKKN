'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { useGDPIMutations } from '@/hooks/admission/use-gdpi';
import type { GDPIScoringCriterion, GDPISessionType } from '@/types/admission';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/admission/gd-pi',
} as const;


const DEFAULT_CRITERIA: GDPIScoringCriterion[] = [
  { name: 'Communication Skills', max_score: 10, weight: 25 },
  { name: 'Subject Knowledge', max_score: 10, weight: 25 },
  { name: 'Leadership & Initiative', max_score: 10, weight: 25 },
  { name: 'Analytical Thinking', max_score: 10, weight: 25 },
];

function NewGDPISessionContent() {
  const router = useRouter();
  const { createSession } = useGDPIMutations();

  const [formData, setFormData] = useState({
    session_name: '',
    session_type: 'gd_pi' as GDPISessionType,
    scheduled_date: '',
    start_time: '',
    end_time: '',
    venue: '',
    max_candidates: 30,
    notes: '',
    academic_year: '',
  });

  const [criteria, setCriteria] = useState<GDPIScoringCriterion[]>(DEFAULT_CRITERIA);

  const updateField = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const addCriterion = () => {
    setCriteria((prev) => [...prev, { name: '', max_score: 10, weight: 0 }]);
  };

  const updateCriterion = (index: number, field: keyof GDPIScoringCriterion, value: string | number) => {
    setCriteria((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeCriterion = (index: number) => {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validCriteria = criteria.filter((c) => c.name.trim());
    if (validCriteria.length === 0) return;

    await createSession.mutateAsync({
      ...formData,
      scoring_criteria: validCriteria,
    });

    router.push('/admission/gd-pi');
  };

  const totalWeight = criteria.reduce((sum, c) => sum + (c.weight || 0), 0);

  return (
    <PermissionGuard module="admission" action="create">
      <ContentLayout title="New GD-PI Session">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/gd-pi">GD-PI</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>New Session</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
            {/* Session Details */}
            <Card>
              <CardHeader>
                <CardTitle>Session Details</CardTitle>
                <CardDescription>Configure the GD-PI session scheduling and type</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="session_name">Session Name *</Label>
                    <Input
                      id="session_name"
                      value={formData.session_name}
                      onChange={(e) => updateField('session_name', e.target.value)}
                      placeholder="e.g., GD-PI Round 1 - Engineering"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="session_type">Session Type *</Label>
                    <Select
                      value={formData.session_type}
                      onValueChange={(v) => updateField('session_type', v)}
                    >
                      <SelectTrigger id="session_type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gd">Group Discussion Only</SelectItem>
                        <SelectItem value="pi">Personal Interview Only</SelectItem>
                        <SelectItem value="gd_pi">GD + PI (Both)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="scheduled_date">Date *</Label>
                    <Input
                      id="scheduled_date"
                      type="date"
                      value={formData.scheduled_date}
                      onChange={(e) => updateField('scheduled_date', e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="start_time">Start Time</Label>
                    <Input
                      id="start_time"
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => updateField('start_time', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_time">End Time</Label>
                    <Input
                      id="end_time"
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => updateField('end_time', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="venue">Venue</Label>
                    <Input
                      id="venue"
                      value={formData.venue}
                      onChange={(e) => updateField('venue', e.target.value)}
                      placeholder="e.g., Seminar Hall A"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_candidates">Max Candidates</Label>
                    <Input
                      id="max_candidates"
                      type="number"
                      min={1}
                      max={500}
                      value={formData.max_candidates}
                      onChange={(e) => updateField('max_candidates', parseInt(e.target.value) || 30)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="Any additional notes for this session..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Scoring Criteria */}
            <Card>
              <CardHeader>
                <CardTitle>Scoring Criteria</CardTitle>
                <CardDescription>
                  Define evaluation criteria. Total weight: {totalWeight}%
                  {totalWeight !== 100 && (
                    <span className="text-amber-600 ml-2">(should be 100%)</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {criteria.map((criterion, index) => (
                  <div key={index} className="flex items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">Criterion Name</Label>
                      <Input
                        value={criterion.name}
                        onChange={(e) => updateCriterion(index, 'name', e.target.value)}
                        placeholder="e.g., Communication Skills"
                      />
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-xs text-muted-foreground">Max Score</Label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={criterion.max_score}
                        onChange={(e) => updateCriterion(index, 'max_score', parseInt(e.target.value) || 10)}
                      />
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-xs text-muted-foreground">Weight %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={criterion.weight}
                        onChange={(e) => updateCriterion(index, 'weight', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => removeCriterion(index)}
                      disabled={criteria.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button type="button" variant="outline" size="sm" onClick={addCriterion}>
                  <Plus className="h-4 w-4 mr-1" /> Add Criterion
                </Button>
              </CardContent>
            </Card>

            {/* Submit */}
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={createSession.isPending || !formData.session_name || !formData.scheduled_date}
              >
                {createSession.isPending ? 'Creating...' : 'Create Session'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function NewGDPISessionPage() {
  return (
    <AdmissionErrorBoundary>
      <NewGDPISessionContent />
    </AdmissionErrorBoundary>
  );
}
