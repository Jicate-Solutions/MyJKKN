'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import {
  Save,
  ArrowLeft,
  UserPlus,
  Briefcase,
} from 'lucide-react';
import { useCreateProductionLearner } from '@/hooks/solutions';
import type { ContentDivision, SkillLevel } from '@/lib/services/solutions/types';
import { toast } from 'sonner';

const DIVISIONS: { value: ContentDivision; label: string }[] = [
  { value: 'video', label: 'Video Production' },
  { value: 'design', label: 'Graphic Design' },
  { value: 'writing', label: 'Content Writing' },
  { value: 'animation', label: 'Animation' },
  { value: 'social', label: 'Social Media' },
  { value: 'other', label: 'Other' },
];

const SKILL_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
];

export default function NewContentProductionPage() {
  const router = useRouter();
  const createLearner = useCreateProductionLearner();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [division, setDivision] = useState<ContentDivision>('video');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('beginner');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    try {
      await createLearner.mutateAsync({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        division,
        skill_level: skillLevel,
      });
      toast.success('Production learner created successfully');
      router.push('/solutions/content/production');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to create production learner'
      );
    }
  };

  return (
    <ContentLayout title="Add Production Learner">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Content', href: '/solutions/content' },
          { label: 'Production', href: '/solutions/content/production' },
          { label: 'Add Learner' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Add Production Learner</h1>
            <p className="text-sm text-muted-foreground">
              Register a new learner for content production assignments
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Personal Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Personal Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    placeholder="Enter learner's full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="learner@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    placeholder="+91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Skills & Division */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Skills & Division
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="division">Content Division *</Label>
                  <select
                    id="division"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={division}
                    onChange={(e) => setDivision(e.target.value as ContentDivision)}
                    required
                  >
                    {DIVISIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="skill_level">Skill Level *</Label>
                  <select
                    id="skill_level"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={skillLevel}
                    onChange={(e) => setSkillLevel(e.target.value as SkillLevel)}
                    required
                  >
                    {SKILL_LEVELS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 mt-6">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={createLearner.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {createLearner.isPending ? 'Creating...' : 'Add Learner'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
