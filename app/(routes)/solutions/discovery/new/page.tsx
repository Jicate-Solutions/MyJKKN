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
  Building2,
  Calendar,
  Users,
  MapPin
} from 'lucide-react';
import { format } from 'date-fns';

export default function NewDiscoveryVisitPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Placeholder - would submit to API
    setTimeout(() => {
      router.push('/solutions/discovery');
    }, 1000);
  };

  return (
    <ContentLayout title="Log Discovery Visit">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Discovery', href: '/solutions/discovery' },
          { label: 'New Visit' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Log Discovery Visit</h1>
            <p className="text-sm text-muted-foreground">
              Record a client site visit or discovery session
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Client Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Client Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="client">Client / Organization *</Label>
                  <Input
                    id="client"
                    placeholder="Enter client name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department / Unit</Label>
                  <Input
                    id="department"
                    placeholder="e.g., IT Department, HR"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact">Contact Person</Label>
                  <Input
                    id="contact"
                    placeholder="Primary contact name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Contact Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="contact@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Contact Phone</Label>
                  <Input
                    id="phone"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Visit Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Visit Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="visit_date">Visit Date *</Label>
                  <Input
                    id="visit_date"
                    type="date"
                    defaultValue={format(new Date(), 'yyyy-MM-dd')}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <div className="flex gap-2">
                    <MapPin className="h-4 w-4 mt-3 text-muted-foreground" />
                    <Input
                      id="location"
                      placeholder="Visit location or address"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="visitors">Visitors (our team)</Label>
                  <Textarea
                    id="visitors"
                    placeholder="List team members who attended, one per line"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="attendees">Client Attendees</Label>
                  <Textarea
                    id="attendees"
                    placeholder="List client attendees with their roles"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Discovery Notes */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Discovery Notes</CardTitle>
                <CardDescription>
                  Capture pain points, opportunities, and insights
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pain_points">Pain Points & Challenges</Label>
                  <Textarea
                    id="pain_points"
                    placeholder="What problems is the client facing? What are their current challenges?"
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="opportunities">Opportunities Identified</Label>
                  <Textarea
                    id="opportunities"
                    placeholder="What solutions can we offer? What are the potential projects?"
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any other observations, insights, or follow-up items"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Follow-up */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Follow-up Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="follow_up" className="rounded" />
                    <Label htmlFor="follow_up">Follow-up required</Label>
                  </div>
                  <div className="flex-1">
                    <Input
                      type="date"
                      placeholder="Follow-up date"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="follow_up_notes">Follow-up Notes</Label>
                  <Textarea
                    id="follow_up_notes"
                    placeholder="What needs to be done next?"
                    rows={2}
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
              {isSubmitting ? 'Saving...' : 'Save Visit'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
