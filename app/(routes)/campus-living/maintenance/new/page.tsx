'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ArrowLeft, Save, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCreateHostelMaintenance } from '@/hooks/campus-living/use-hostel-maintenance';
import type { CreateHostelMaintenanceRequestDTO } from '@/types/campus-living';

export default function NewMaintenanceRequestPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const createMutation = useCreateHostelMaintenance();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const payload: CreateHostelMaintenanceRequestDTO = {
      institution_id: profile?.institution_id || '',
      learner_id: profile?.id || '',
      block_id: formData.get('block') as string || '',
      room_id: formData.get('room') as string || null,
      category: (formData.get('category') as string || 'other') as CreateHostelMaintenanceRequestDTO['category'],
      subcategory: null,
      title: formData.get('title') as string || '',
      description: formData.get('description') as string || '',
      priority: (formData.get('priority') as string || 'medium') as CreateHostelMaintenanceRequestDTO['priority'],
      photo_urls_before: null,
      status: 'open' as CreateHostelMaintenanceRequestDTO['status'],
      sla_hours: 24,
      sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      cost_estimate: null,
    };

    await createMutation.mutateAsync(payload);
    router.push('/campus-living/maintenance');
  };

  return (
    <ContentLayout title="New Maintenance Request">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/campus-living/maintenance">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">New Maintenance Request</h1>
            <p className="text-muted-foreground">Submit a maintenance or repair request</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Request Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" name="title" placeholder="Brief description of the issue" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select name="category" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="civil">Civil / Structural</SelectItem>
                    <SelectItem value="carpentry">Carpentry</SelectItem>
                    <SelectItem value="painting">Painting</SelectItem>
                    <SelectItem value="pest_control">Pest Control</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority *</Label>
                <Select name="priority" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical - Safety hazard</SelectItem>
                    <SelectItem value="high">High - Major inconvenience</SelectItem>
                    <SelectItem value="medium">Medium - Needs attention</SelectItem>
                    <SelectItem value="low">Low - Cosmetic / Minor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Location</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="block">Block *</Label>
                <Select name="block" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select block" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block_a">Block A</SelectItem>
                    <SelectItem value="block_b">Block B</SelectItem>
                    <SelectItem value="block_c">Block C</SelectItem>
                    <SelectItem value="block_d">Block D</SelectItem>
                    <SelectItem value="block_e">Block E</SelectItem>
                    <SelectItem value="common">Common Area</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="floor">Floor</Label>
                <Select name="floor">
                  <SelectTrigger>
                    <SelectValue placeholder="Select floor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ground">Ground Floor</SelectItem>
                    <SelectItem value="1">1st Floor</SelectItem>
                    <SelectItem value="2">2nd Floor</SelectItem>
                    <SelectItem value="3">3rd Floor</SelectItem>
                    <SelectItem value="4">4th Floor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="room">Room Number</Label>
                <Input id="room" name="room" placeholder="e.g., 101" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Description & Photos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">Detailed Description *</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Describe the issue in detail. Include when it started, severity, etc."
                  rows={4}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Photos (optional)</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drag and drop photos here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum 5 photos, 5MB each
                  </p>
                  <Input type="file" accept="image/*" multiple className="mt-2" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/campus-living/maintenance">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {createMutation.isPending ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
