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
import { ArrowLeft, Save, Upload, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useCreateHostelIncident } from '@/hooks/campus-living/use-hostel-incidents';

export default function NewIncidentPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const createIncident = useCreateHostelIncident();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    incident_type: '',
    severity: '',
    incident_date: '',
    location: '',
    reporter: '',
    involved_parties: '',
    description: '',
    immediate_action: '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile?.institution_id || !profile?.id) return;

    setIsSubmitting(true);
    try {
      await createIncident.mutateAsync({
        institution_id: profile.institution_id,
        block_id: '', // Will be enriched later if block selection is added
        incident_type: formData.incident_type as any,
        severity: formData.severity as any,
        title: formData.title,
        description: formData.description,
        location: formData.location,
        incident_date: new Date(formData.incident_date).toISOString(),
        reported_by: profile.id,
        reported_at: new Date().toISOString(),
        involved_students: null,
        involved_staff: null,
        witness_ids: null,
        evidence_urls: null,
        immediate_action: formData.immediate_action || null,
        police_complaint_filed: false,
        police_complaint_number: null,
        parent_notified: false,
        parent_notified_at: null,
        status: 'reported' as any,
      });
      router.push('/campus-living/safety/incidents');
    } catch {
      // Error handled by mutation hook
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title="Report Incident">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/campus-living/safety/incidents">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Report New Incident</h1>
            <p className="text-muted-foreground">Document a safety incident or concern</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Incident Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="title">Incident Title *</Label>
                <Input
                  id="title"
                  placeholder="Brief description of the incident"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Incident Type *</Label>
                <Select value={formData.incident_type} onValueChange={(v) => handleChange('incident_type', v)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unauthorized_entry">Security Breach</SelectItem>
                    <SelectItem value="medical_emergency">Medical Emergency</SelectItem>
                    <SelectItem value="fire">Fire / Fire Alarm</SelectItem>
                    <SelectItem value="theft">Theft / Loss</SelectItem>
                    <SelectItem value="ragging">Ragging</SelectItem>
                    <SelectItem value="harassment">Harassment</SelectItem>
                    <SelectItem value="fight">Fight / Assault</SelectItem>
                    <SelectItem value="property_damage">Property Damage</SelectItem>
                    <SelectItem value="substance_abuse">Substance Abuse</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="severity">Severity *</Label>
                <Select value={formData.severity} onValueChange={(v) => handleChange('severity', v)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical - Immediate danger</SelectItem>
                    <SelectItem value="major">Major - Serious concern</SelectItem>
                    <SelectItem value="moderate">Moderate - Needs attention</SelectItem>
                    <SelectItem value="minor">Minor - Low impact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date & Time of Incident *</Label>
                <Input
                  id="date"
                  type="datetime-local"
                  value={formData.incident_date}
                  onChange={(e) => handleChange('incident_date', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  placeholder="e.g., Block A - Room 101"
                  value={formData.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Description & Evidence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">Detailed Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what happened in detail..."
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={5}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="immediate_action">Immediate Action Taken</Label>
                <Textarea
                  id="immediate_action"
                  placeholder="What was done immediately after the incident?"
                  value={formData.immediate_action}
                  onChange={(e) => handleChange('immediate_action', e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Evidence / Photos</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Upload photos or documents</p>
                  <Input type="file" accept="image/*,.pdf" multiple className="mt-2" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/campus-living/safety/incidents">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
