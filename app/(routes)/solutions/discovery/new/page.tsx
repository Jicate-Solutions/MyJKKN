'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Save,
  ArrowLeft,
  Building2,
  Calendar,
  Users,
  MapPin,
} from 'lucide-react';
import { format } from 'date-fns';
import { useCreateDiscoveryVisit } from '@/hooks/solutions/use-discovery';
import { useClients } from '@/hooks/solutions/use-clients';

interface FormState {
  client_id: string;
  department_id: string;
  visit_date: string;
  visit_time: string;
  location: string;
  visit_type: string;
  visitors_text: string;
  client_attendees_text: string;
  observations: string;
  current_systems: string;
  pain_points: string;
  opportunities: string;
  budget_indication: string;
  timeline_indication: string;
  follow_up_required: boolean;
  follow_up_date: string;
  follow_up_notes: string;
  notes: string;
}

const initialFormState: FormState = {
  client_id: '',
  department_id: '',
  visit_date: format(new Date(), 'yyyy-MM-dd'),
  visit_time: '',
  location: '',
  visit_type: 'on_site',
  visitors_text: '',
  client_attendees_text: '',
  observations: '',
  current_systems: '',
  pain_points: '',
  opportunities: '',
  budget_indication: '',
  timeline_indication: '',
  follow_up_required: false,
  follow_up_date: '',
  follow_up_notes: '',
  notes: '',
};

function parseTextToArray(text: string): Array<{ name: string; role?: string }> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split('-').map((s) => s.trim());
      return {
        name: parts[0],
        role: parts[1] || undefined,
      };
    });
}

export default function NewDiscoveryVisitPage() {
  const router = useRouter();
  const createVisit = useCreateDiscoveryVisit();
  const { data: clientsData } = useClients({ limit: 100 });
  const clients = clientsData?.data || [];

  const [form, setForm] = useState<FormState>(initialFormState);

  const updateField = (field: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.client_id) {
      toast.error('Please select a client');
      return;
    }

    if (!form.visit_date) {
      toast.error('Please enter a visit date');
      return;
    }

    try {
      await createVisit.mutateAsync({
        client_id: form.client_id,
        department_id: form.department_id || form.client_id,
        visit_date: form.visit_date,
        visit_time: form.visit_time || undefined,
        location: form.location || undefined,
        visit_type: form.visit_type || undefined,
        visitors: parseTextToArray(form.visitors_text),
        client_attendees: parseTextToArray(form.client_attendees_text),
        observations: form.observations || undefined,
        current_systems: form.current_systems || undefined,
        pain_points: form.pain_points || undefined,
        opportunities: form.opportunities || undefined,
        budget_indication: form.budget_indication || undefined,
        timeline_indication: form.timeline_indication || undefined,
        follow_up_required: form.follow_up_required,
        follow_up_date: form.follow_up_date || undefined,
        follow_up_notes: form.follow_up_notes || undefined,
        notes: form.notes || undefined,
        created_by: 'current-user',
      });

      toast.success('Discovery visit logged successfully');
      router.push('/solutions/discovery');
    } catch (error) {
      console.error('Failed to create discovery visit:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save visit'
      );
    }
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
                  <Label htmlFor="client_id">Client / Organization *</Label>
                  {clients.length > 0 ? (
                    <Select
                      value={form.client_id}
                      onValueChange={(val) => updateField('client_id', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="client_id"
                      placeholder="Enter client ID"
                      value={form.client_id}
                      onChange={(e) => updateField('client_id', e.target.value)}
                      required
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department_id">Department / Unit</Label>
                  <Input
                    id="department_id"
                    placeholder="e.g., IT Department, HR"
                    value={form.department_id}
                    onChange={(e) => updateField('department_id', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="visit_type">Visit Type</Label>
                  <Select
                    value={form.visit_type}
                    onValueChange={(val) => updateField('visit_type', val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select visit type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on_site">On-site Visit</SelectItem>
                      <SelectItem value="virtual">Virtual Meeting</SelectItem>
                      <SelectItem value="phone">Phone Call</SelectItem>
                      <SelectItem value="demo">Demo Session</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="budget_indication">Budget Indication</Label>
                  <Input
                    id="budget_indication"
                    placeholder="e.g., 5-10 lakhs, TBD"
                    value={form.budget_indication}
                    onChange={(e) => updateField('budget_indication', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeline_indication">Timeline Indication</Label>
                  <Input
                    id="timeline_indication"
                    placeholder="e.g., 3 months, Q2 2026"
                    value={form.timeline_indication}
                    onChange={(e) => updateField('timeline_indication', e.target.value)}
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
                <div className="grid gap-4 grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="visit_date">Visit Date *</Label>
                    <Input
                      id="visit_date"
                      type="date"
                      value={form.visit_date}
                      onChange={(e) => updateField('visit_date', e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="visit_time">Visit Time</Label>
                    <Input
                      id="visit_time"
                      type="time"
                      value={form.visit_time}
                      onChange={(e) => updateField('visit_time', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <div className="flex gap-2">
                    <MapPin className="h-4 w-4 mt-3 text-muted-foreground flex-shrink-0" />
                    <Input
                      id="location"
                      placeholder="Visit location or address"
                      value={form.location}
                      onChange={(e) => updateField('location', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="visitors">
                    <Users className="inline h-4 w-4 mr-1" />
                    Our Team (one per line, format: Name - Role)
                  </Label>
                  <Textarea
                    id="visitors"
                    placeholder={"John Doe - Lead\nJane Smith - Tech"}
                    rows={3}
                    value={form.visitors_text}
                    onChange={(e) => updateField('visitors_text', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="attendees">
                    Client Attendees (one per line, format: Name - Role)
                  </Label>
                  <Textarea
                    id="attendees"
                    placeholder={"Mr. Client - CTO\nMs. Manager - IT Head"}
                    rows={3}
                    value={form.client_attendees_text}
                    onChange={(e) => updateField('client_attendees_text', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Discovery Notes */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Discovery Notes</CardTitle>
                <CardDescription>
                  Capture pain points, opportunities, and insights from the visit
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="observations">Observations</Label>
                  <Textarea
                    id="observations"
                    placeholder="General observations from the visit"
                    rows={3}
                    value={form.observations}
                    onChange={(e) => updateField('observations', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="current_systems">Current Systems</Label>
                  <Textarea
                    id="current_systems"
                    placeholder="What systems or tools are they currently using?"
                    rows={2}
                    value={form.current_systems}
                    onChange={(e) => updateField('current_systems', e.target.value)}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pain_points">Pain Points & Challenges</Label>
                    <Textarea
                      id="pain_points"
                      placeholder="What problems is the client facing?"
                      rows={4}
                      value={form.pain_points}
                      onChange={(e) => updateField('pain_points', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="opportunities">Opportunities Identified</Label>
                    <Textarea
                      id="opportunities"
                      placeholder="What solutions can we offer?"
                      rows={4}
                      value={form.opportunities}
                      onChange={(e) => updateField('opportunities', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any other observations, insights, or notes"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
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
                    <Checkbox
                      id="follow_up"
                      checked={form.follow_up_required}
                      onCheckedChange={(checked) =>
                        updateField('follow_up_required', checked === true)
                      }
                    />
                    <Label htmlFor="follow_up">Follow-up required</Label>
                  </div>
                  {form.follow_up_required && (
                    <div className="flex-1">
                      <Input
                        type="date"
                        placeholder="Follow-up date"
                        value={form.follow_up_date}
                        onChange={(e) => updateField('follow_up_date', e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {form.follow_up_required && (
                  <div className="space-y-2">
                    <Label htmlFor="follow_up_notes">Follow-up Notes</Label>
                    <Textarea
                      id="follow_up_notes"
                      placeholder="What needs to be done next?"
                      rows={2}
                      value={form.follow_up_notes}
                      onChange={(e) => updateField('follow_up_notes', e.target.value)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 mt-6">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={createVisit.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {createVisit.isPending ? 'Saving...' : 'Save Visit'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
