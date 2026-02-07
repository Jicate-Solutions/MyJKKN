'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useState } from 'react';
import { Save, ArrowLeft, Users, AlertCircle } from 'lucide-react';
import {
  useCreateCohortMember,
  COHORT_LEVELS,
  TRACK_LABELS,
} from '@/hooks/solutions/use-training';
import type { CohortTrack } from '@/lib/services/solutions/types';

export default function NewCohortMemberPage() {
  const router = useRouter();
  const createMember = useCreateCohortMember();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    level: 0,
    track: '' as CohortTrack | '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'level' ? parseInt(value, 10) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) return;

    createMember.mutate(
      {
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        level: formData.level,
        track: (formData.track || undefined) as CohortTrack | undefined,
      },
      {
        onSuccess: () => {
          router.push('/solutions/training/cohort');
        },
      }
    );
  };

  return (
    <ContentLayout title="Add Cohort Member">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Training', href: '/solutions/training' },
          { label: 'Cohort', href: '/solutions/training/cohort' },
          { label: 'Add Member' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Add Cohort Member</h1>
            <p className="text-sm text-muted-foreground">
              Enroll a new member into the training cohort
            </p>
          </div>
        </div>

        {createMember.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {(createMember.error as Error)?.message || 'Failed to create cohort member. Please try again.'}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Member Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="e.g., Dr. Sarah Wilson"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="e.g., sarah@jkkn.ac.in"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="e.g., +91 98765 43210"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="level">Starting Level</Label>
                  <select
                    id="level"
                    name="level"
                    className="w-full rounded-md border p-2"
                    value={formData.level}
                    onChange={handleChange}
                  >
                    {COHORT_LEVELS.map((l) => (
                      <option key={l.level} value={l.level}>
                        Level {l.level} - {l.title}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {COHORT_LEVELS.find((l) => l.level === formData.level)?.description}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="track">Track</Label>
                  <select
                    id="track"
                    name="track"
                    className="w-full rounded-md border p-2"
                    value={formData.track}
                    onChange={handleChange}
                  >
                    <option value="">Not specified</option>
                    {(Object.entries(TRACK_LABELS) as [CohortTrack, string][]).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMember.isPending || !formData.name.trim()}
            >
              <Save className="mr-2 h-4 w-4" />
              {createMember.isPending ? 'Adding...' : 'Add Member'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
