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
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useCreateHostelLeave } from '@/hooks/campus-living/use-hostel-leave';
import {
  ArrowLeft,
  Save,
  Loader2,
  CalendarOff,
  Clock,
  Info,
  AlertTriangle
} from 'lucide-react';

const leaveTypeRules: Record<string, { label: string; maxDays: string; parentConsent: string; advanceNotice: string; approver: string }> = {
  home_visit: { label: 'Home Visit', maxDays: '3 days', parentConsent: 'Required', advanceNotice: '48 hours', approver: 'Warden' },
  weekend: { label: 'Weekend', maxDays: '2 days', parentConsent: 'Required', advanceNotice: '24 hours', approver: 'Warden' },
  vacation: { label: 'Vacation', maxDays: 'Per calendar', parentConsent: 'Required', advanceNotice: '1 week', approver: 'Chief Warden' },
  emergency: { label: 'Emergency', maxDays: 'Flexible', parentConsent: 'Auto-notify', advanceNotice: 'None', approver: 'Chief Warden' },
  medical: { label: 'Medical', maxDays: 'Per certificate', parentConsent: 'Auto-notify', advanceNotice: 'None', approver: 'Warden' },
  academic: { label: 'Academic', maxDays: 'Per event', parentConsent: 'Not required', advanceNotice: '48 hours', approver: 'Warden' },
  night_out: { label: 'Night Out', maxDays: '1 night', parentConsent: 'Required', advanceNotice: 'Same day', approver: 'Warden' },
};

export default function NewLeaveRequestPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const createLeave = useCreateHostelLeave();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    leave_type: 'home_visit',
    from_date: '',
    to_date: '',
    from_time: '',
    reason: '',
    destination: '',
    destination_address: '',
    destination_contact: '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const selectedTypeRules = leaveTypeRules[formData.leave_type];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createLeave.mutateAsync({
        institution_id: profile?.institution_id ?? '',
        learner_id: profile?.id ?? '',
        block_id: '',
        leave_type: formData.leave_type as any,
        from_date: formData.from_date,
        to_date: formData.to_date,
        from_time: formData.from_time || null,
        expected_return_time: null,
        reason: formData.reason,
        destination: formData.destination,
        destination_address: formData.destination_address || null,
        destination_contact: formData.destination_contact || null,
        attachment_url: null,
        parent_consent_status: 'pending' as any,
        parent_consent_method: null,
        warden_approval_status: 'pending' as any,
        warden_id: null,
        chief_warden_required: false,
        chief_warden_status: null,
        status: 'pending_parent' as any,
      });
      router.push('/campus-living/leave');
    } catch (error) {
      // Error is handled by the mutation hook's onError callback
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title="New Leave Request">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Leave', href: '/campus-living/leave' },
          { label: 'New Request' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">New Leave Request</h1>
            <p className="text-sm text-muted-foreground">
              Submit a hostel leave request for approval
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Leave Details</CardTitle>
                  <CardDescription>Select leave type and dates</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="leave_type">Leave Type *</Label>
                    <select
                      id="leave_type"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.leave_type}
                      onChange={(e) => handleChange('leave_type', e.target.value)}
                      required
                    >
                      {Object.entries(leaveTypeRules).map(([key, val]) => (
                        <option key={key} value={key}>{val.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="from_date">From Date *</Label>
                      <Input
                        id="from_date"
                        type="date"
                        value={formData.from_date}
                        onChange={(e) => handleChange('from_date', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="to_date">To Date *</Label>
                      <Input
                        id="to_date"
                        type="date"
                        value={formData.to_date}
                        onChange={(e) => handleChange('to_date', e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {(formData.leave_type === 'night_out' || formData.leave_type === 'academic') && (
                    <div className="space-y-2">
                      <Label htmlFor="from_time">Departure Time</Label>
                      <Input
                        id="from_time"
                        type="time"
                        value={formData.from_time}
                        onChange={(e) => handleChange('from_time', e.target.value)}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason *</Label>
                    <Textarea
                      id="reason"
                      placeholder="Explain the reason for leave..."
                      value={formData.reason}
                      onChange={(e) => handleChange('reason', e.target.value)}
                      rows={3}
                      required
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Destination</CardTitle>
                  <CardDescription>Where you will be during the leave</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="destination">Destination *</Label>
                    <Input
                      id="destination"
                      placeholder="e.g., Home - Chennai, Hospital, Industrial visit"
                      value={formData.destination}
                      onChange={(e) => handleChange('destination', e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="destination_address">Destination Address</Label>
                    <Textarea
                      id="destination_address"
                      placeholder="Full address (optional)"
                      value={formData.destination_address}
                      onChange={(e) => handleChange('destination_address', e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="destination_contact">Contact at Destination</Label>
                    <Input
                      id="destination_contact"
                      type="tel"
                      placeholder="Phone number at destination"
                      value={formData.destination_contact}
                      onChange={(e) => handleChange('destination_contact', e.target.value)}
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

            {/* Sidebar - Rules */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Leave Rules
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max Duration</span>
                      <span className="font-medium">{selectedTypeRules?.maxDays}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Parent Consent</span>
                      <Badge variant="outline" className="text-xs">{selectedTypeRules?.parentConsent}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Advance Notice</span>
                      <span className="font-medium">{selectedTypeRules?.advanceNotice}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Approved By</span>
                      <span className="font-medium">{selectedTypeRules?.approver}</span>
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
                      { step: '1', label: 'Student submits request', done: true },
                      { step: '2', label: 'Parent receives OTP/notification', done: false },
                      { step: '3', label: 'Parent approves', done: false },
                      { step: '4', label: 'Warden reviews & approves', done: false },
                      { step: '5', label: selectedTypeRules?.approver === 'Chief Warden' ? 'Chief Warden final approval' : 'Leave approved', done: false },
                    ].map((item) => (
                      <div key={item.step} className="flex items-center gap-3">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          item.done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}>
                          {item.step}
                        </div>
                        <span className={`text-sm ${item.done ? 'font-medium' : 'text-muted-foreground'}`}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {formData.leave_type === 'emergency' && (
                <Card className="border-red-200 bg-red-50/50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-800 text-sm">Emergency Leave</p>
                        <p className="text-xs text-red-600 mt-1">
                          Emergency leaves are processed with priority. Parents will be auto-notified and chief warden approval is required.
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
