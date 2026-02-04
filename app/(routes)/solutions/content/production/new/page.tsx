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
  Video,
  Building2,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';

export default function NewContentProductionPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      router.push('/solutions/content/production');
    }, 1000);
  };

  return (
    <ContentLayout title="New Production Order">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Content', href: '/solutions/content' },
          { label: 'Production', href: '/solutions/content/production' },
          { label: 'New Order' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">New Production Order</h1>
            <p className="text-sm text-muted-foreground">
              Create a new content production order
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
                  Client & Project
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="client">Client *</Label>
                  <select id="client" className="w-full rounded-md border p-2" required>
                    <option value="">Select client</option>
                    <option value="1">ABC University</option>
                    <option value="2">XYZ Corp</option>
                    <option value="3">DEF Institute</option>
                    <option value="internal">Internal Project</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project_name">Project Name *</Label>
                  <Input
                    id="project_name"
                    placeholder="Enter project name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact">Client Contact</Label>
                  <Input
                    id="contact"
                    placeholder="Contact person name"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Production Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Video className="h-5 w-5" />
                  Production Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="content_type">Content Type *</Label>
                  <select id="content_type" className="w-full rounded-md border p-2" required>
                    <option value="">Select type</option>
                    <option value="video">Video Production</option>
                    <option value="podcast">Podcast</option>
                    <option value="animation">Animation</option>
                    <option value="graphics">Graphics Design</option>
                    <option value="photography">Photography</option>
                    <option value="document">Document Design</option>
                    <option value="social_media">Social Media Content</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity / Duration</Label>
                  <Input
                    id="quantity"
                    placeholder="e.g., 5 videos, 30 minutes"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <select id="priority" className="w-full rounded-md border p-2">
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    defaultValue={format(new Date(), 'yyyy-MM-dd')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deadline">Deadline *</Label>
                  <Input
                    id="deadline"
                    type="date"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="review_date">Internal Review Date</Label>
                  <Input
                    id="review_date"
                    type="date"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Budget */}
            <Card>
              <CardHeader>
                <CardTitle>Budget & Resources</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget (₹)</Label>
                  <Input
                    id="budget"
                    type="number"
                    placeholder="Estimated budget"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="team_lead">Assigned Team Lead</Label>
                  <select id="team_lead" className="w-full rounded-md border p-2">
                    <option value="">Select team lead</option>
                    <option value="1">John Doe</option>
                    <option value="2">Jane Smith</option>
                    <option value="3">Mike Johnson</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="equipment">Equipment Required</Label>
                  <Input
                    id="equipment"
                    placeholder="e.g., Studio, Camera, Green screen"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Requirements */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Requirements & Brief</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="description">Project Description *</Label>
                  <Textarea
                    id="description"
                    placeholder="Detailed description of what needs to be produced"
                    rows={4}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="requirements">Specific Requirements</Label>
                  <Textarea
                    id="requirements"
                    placeholder="Any specific requirements, branding guidelines, formats needed"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deliverables">Deliverables</Label>
                  <Textarea
                    id="deliverables"
                    placeholder="List expected deliverables"
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
              {isSubmitting ? 'Creating...' : 'Create Order'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
