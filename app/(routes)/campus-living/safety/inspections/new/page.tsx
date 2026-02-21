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
import { ArrowLeft, Save } from 'lucide-react';
import { useState } from 'react';

export default function NewInspectionPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      router.push('/campus-living/safety/inspections');
    }, 1000);
  };

  return (
    <ContentLayout title="Schedule Inspection">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/campus-living/safety/inspections">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Schedule New Inspection</h1>
            <p className="text-muted-foreground">Schedule a safety inspection or audit</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Inspection Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="name">Inspection Name *</Label>
                <Input id="name" name="name" placeholder="e.g., Fire Safety Audit Q1 2026" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Inspection Type *</Label>
                <Select name="type" required>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fire_safety">Fire Safety</SelectItem>
                    <SelectItem value="electrical">Electrical Safety</SelectItem>
                    <SelectItem value="health">Health / FSSAI</SelectItem>
                    <SelectItem value="hygiene">Hygiene</SelectItem>
                    <SelectItem value="structural">Structural</SelectItem>
                    <SelectItem value="water_quality">Water Quality</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">Source *</Label>
                <Select name="source" required>
                  <SelectTrigger><SelectValue placeholder="Internal or External" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="external">External</SelectItem>
                    <SelectItem value="regulatory">Regulatory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Scheduled Date *</Label>
                <Input id="date" name="date" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inspector">Inspector / Agency *</Label>
                <Input id="inspector" name="inspector" placeholder="Inspector name or agency" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location / Area</Label>
                <Input id="location" name="location" placeholder="e.g., All blocks, Block A only" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact">Inspector Contact</Label>
                <Input id="contact" name="contact" placeholder="Phone or email" />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" placeholder="Any preparation notes or special requirements" rows={3} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/campus-living/safety/inspections">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Scheduling...' : 'Schedule Inspection'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
