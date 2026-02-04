'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import {
  Save,
  ArrowLeft,
  Users,
  Calendar,
  BookOpen
} from 'lucide-react';
import { format, addMonths } from 'date-fns';

export default function NewCohortPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      router.push('/solutions/training/cohort');
    }, 1000);
  };

  return (
    <ContentLayout title="Create Cohort">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Training', href: '/solutions/training' },
          { label: 'Cohort', href: '/solutions/training/cohort' },
          { label: 'New Cohort' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Create New Cohort</h1>
            <p className="text-sm text-muted-foreground">
              Set up a new training cohort for a program
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Cohort Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Cohort Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Cohort Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Batch 2026-A"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="program">Training Program *</Label>
                  <select id="program" className="w-full rounded-md border p-2" required>
                    <option value="">Select program</option>
                    <option value="1">Web Development Bootcamp</option>
                    <option value="2">Data Analytics Certification</option>
                    <option value="3">Leadership Development</option>
                    <option value="4">Digital Marketing</option>
                    <option value="5">Project Management</option>
                  </select>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="min_size">Min Participants</Label>
                    <Input
                      id="min_size"
                      type="number"
                      placeholder="10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max_size">Max Participants *</Label>
                    <Input
                      id="max_size"
                      type="number"
                      placeholder="30"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mode">Delivery Mode</Label>
                  <select id="mode" className="w-full rounded-md border p-2">
                    <option value="online">Online</option>
                    <option value="offline">Offline (In-person)</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Schedule */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    defaultValue={format(addMonths(new Date(), 1), 'yyyy-MM-dd')}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    defaultValue={format(addMonths(new Date(), 4), 'yyyy-MM-dd')}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schedule_pattern">Session Schedule</Label>
                  <Input
                    id="schedule_pattern"
                    placeholder="e.g., Mon-Wed-Fri, 6-8 PM"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <select id="timezone" className="w-full rounded-md border p-2">
                    <option value="IST">IST (India Standard Time)</option>
                    <option value="UTC">UTC</option>
                    <option value="EST">EST (Eastern US)</option>
                    <option value="PST">PST (Pacific US)</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Trainers & Pricing */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Trainers & Pricing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="lead_trainer">Lead Trainer *</Label>
                  <select id="lead_trainer" className="w-full rounded-md border p-2" required>
                    <option value="">Select trainer</option>
                    <option value="1">Dr. Kumar</option>
                    <option value="2">Prof. Sharma</option>
                    <option value="3">Ms. Priya</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="co_trainers">Co-Trainers</Label>
                  <Input
                    id="co_trainers"
                    placeholder="Select additional trainers"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">Price per Participant (₹)</Label>
                  <Input
                    id="price"
                    type="number"
                    placeholder="e.g., 25000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="early_bird">Early Bird Discount (%)</Label>
                  <Input
                    id="early_bird"
                    type="number"
                    placeholder="e.g., 10"
                    max="50"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Additional Info */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="venue">Venue / Platform</Label>
                  <Input
                    id="venue"
                    placeholder="e.g., Conference Hall B, Zoom"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prerequisites">Prerequisites</Label>
                  <Textarea
                    id="prerequisites"
                    placeholder="Any prerequisites for joining this cohort"
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of this cohort"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 mt-6">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Creating...' : 'Create Cohort'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
