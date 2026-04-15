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
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useCreateHostelInspection } from '@/hooks/campus-living/use-hostel-inspections';

export default function NewInspectionPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const createInspection = useCreateHostelInspection();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    inspection_type: '',
    inspection_date: '',
    inspector: '',
    location: '',
    contact: '',
    findings: '',
    notes: '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile?.institution_id || !profile?.id) return;

    setIsSubmitting(true);
    try {
      await createInspection.mutateAsync({
        institution_id: profile.institution_id,
        block_id: '', // Will be enriched later if block selection is added
        inspection_type: formData.inspection_type as any,
        inspector_id: profile.id,
        inspection_date: formData.inspection_date,
        rooms_inspected: null,
        findings: formData.findings || formData.notes || 'Scheduled inspection',
        score: null,
        issues_found: null,
        follow_up_required: false,
        follow_up_deadline: null,
        report_url: null,
      });
      router.push('/campus-living/safety/inspections');
    } catch {
      // Error handled by mutation hook
    } finally {
      setIsSubmitting(false);
    }
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
              <div className="space-y-2">
                <Label htmlFor="type">Inspection Type *</Label>
                <Select value={formData.inspection_type} onValueChange={(v) => handleChange('inspection_type', v)} required>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fire_safety">Fire Safety</SelectItem>
                    <SelectItem value="hygiene">Hygiene</SelectItem>
                    <SelectItem value="health">Health</SelectItem>
                    <SelectItem value="routine">Routine</SelectItem>
                    <SelectItem value="surprise">Surprise</SelectItem>
                    <SelectItem value="anti_ragging">Anti-Ragging</SelectItem>
                    <SelectItem value="cctv_check">CCTV Check</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Scheduled Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.inspection_date}
                  onChange={(e) => handleChange('inspection_date', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inspector">Inspector / Agency *</Label>
                <Input
                  id="inspector"
                  placeholder="Inspector name or agency"
                  value={formData.inspector}
                  onChange={(e) => handleChange('inspector', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location / Area</Label>
                <Input
                  id="location"
                  placeholder="e.g., All blocks, Block A only"
                  value={formData.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact">Inspector Contact</Label>
                <Input
                  id="contact"
                  placeholder="Phone or email"
                  value={formData.contact}
                  onChange={(e) => handleChange('contact', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="findings">Findings / Notes</Label>
                <Textarea
                  id="findings"
                  placeholder="Any preparation notes, findings, or special requirements"
                  value={formData.findings}
                  onChange={(e) => handleChange('findings', e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/campus-living/safety/inspections">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSubmitting ? 'Scheduling...' : 'Schedule Inspection'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
