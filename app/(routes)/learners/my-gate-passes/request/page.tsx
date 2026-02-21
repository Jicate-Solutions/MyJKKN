'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useRequestGatePass } from '@/hooks/campus-living/use-gate-passes';
import {
  ArrowLeft,
  Save,
  Loader2,
  Info,
  Clock,
  AlertTriangle,
} from 'lucide-react';

const passTypeOptions = [
  { value: 'regular_out', label: 'Regular Outing', description: 'Day outing for personal errands, shopping, etc.', maxHours: '12 hours' },
  { value: 'overnight', label: 'Overnight', description: 'Stay out overnight (requires parent notification)', maxHours: '24 hours' },
  { value: 'emergency', label: 'Emergency', description: 'Urgent medical or family emergency', maxHours: 'Flexible' },
  { value: 'visitor_accompanied', label: 'Visitor Accompanied', description: 'Going out with a visiting parent/guardian', maxHours: '8 hours' },
];

export default function RequestGatePassPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const requestGatePass = useRequestGatePass();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    pass_type: 'regular_out',
    destination: '',
    expected_return: '',
    reason: '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const selectedType = passTypeOptions.find((t) => t.value === formData.pass_type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id || !profile?.institution_id) return;

    setIsSubmitting(true);
    try {
      await requestGatePass.mutateAsync({
        institution_id: profile.institution_id,
        learner_id: profile.id,
        pass_type: formData.pass_type,
        expected_return: new Date(formData.expected_return).toISOString(),
        destination: formData.destination,
        reason: formData.reason,
      });
      router.push('/learners/my-gate-passes');
    } catch {
      // Error handled by mutation hook's onError
    } finally {
      setIsSubmitting(false);
    }
  };

  // Minimum return time is 1 hour from now
  const minReturnTime = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);

  return (
    <ContentLayout title="Request Gate Pass">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'My Gate Passes', href: '/learners/my-gate-passes' },
          { label: 'Request' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Request Gate Pass</h1>
            <p className="text-sm text-muted-foreground">
              Submit a gate pass request for warden approval
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pass Details</CardTitle>
                  <CardDescription>Select pass type and provide details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="pass_type">Pass Type *</Label>
                    <select
                      id="pass_type"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.pass_type}
                      onChange={(e) => handleChange('pass_type', e.target.value)}
                      required
                    >
                      {passTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {selectedType && (
                      <p className="text-xs text-muted-foreground">{selectedType.description}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="destination">Destination *</Label>
                    <Input
                      id="destination"
                      placeholder="e.g., City Market, Hospital, Home"
                      value={formData.destination}
                      onChange={(e) => handleChange('destination', e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expected_return">Expected Return *</Label>
                    <Input
                      id="expected_return"
                      type="datetime-local"
                      value={formData.expected_return}
                      onChange={(e) => handleChange('expected_return', e.target.value)}
                      min={minReturnTime}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason *</Label>
                    <Textarea
                      id="reason"
                      placeholder="Explain why you need to go out..."
                      value={formData.reason}
                      onChange={(e) => handleChange('reason', e.target.value)}
                      rows={3}
                      required
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Submit Request
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Pass Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max Duration</span>
                      <span className="font-medium">{selectedType?.maxHours ?? '--'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pass Type</span>
                      <span className="font-medium">{selectedType?.label ?? '--'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Approval Workflow
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { step: '1', label: 'You submit the request', active: true },
                      { step: '2', label: 'Warden reviews your request', active: false },
                      { step: '3', label: 'Pass issued with QR code', active: false },
                      { step: '4', label: 'Show QR at gate to exit', active: false },
                    ].map((item) => (
                      <div key={item.step} className="flex items-center gap-3">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          item.active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}>
                          {item.step}
                        </div>
                        <span className={`text-sm ${item.active ? 'font-medium' : 'text-muted-foreground'}`}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {formData.pass_type === 'emergency' && (
                <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-800 dark:text-red-200 text-sm">Emergency Pass</p>
                        <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                          Emergency passes are prioritized for review. Your parents will be notified automatically.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
