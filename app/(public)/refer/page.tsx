'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckCircle2, Loader2, GraduationCap, AlertCircle } from 'lucide-react';

interface FormData {
  student_name: string;
  student_phone: string;
  student_email: string;
  interested_program: string;
  agent_name: string;
  agent_phone: string;
  notes: string;
}

const INITIAL_FORM: FormData = {
  student_name: '',
  student_phone: '',
  student_email: '',
  interested_program: '',
  agent_name: '',
  agent_phone: '',
  notes: '',
};

export default function AgentReferralPage() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; reference?: string; error?: string; is_duplicate?: boolean } | null>(null);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/admission/leads/refer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        setForm(INITIAL_FORM);
      }
    } catch {
      setResult({ success: false, error: 'Network error. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (result?.success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold">
              {result.is_duplicate ? 'Student Already Registered' : 'Referral Submitted!'}
            </h2>
            <p className="text-muted-foreground">
              {result.is_duplicate
                ? 'This student is already in our system. Our team will follow up.'
                : 'Thank you for the referral. Our admissions team will contact the student shortly.'}
            </p>
            {result.reference && (
              <div className="bg-muted rounded-lg p-3">
                <p className="text-sm text-muted-foreground">Reference Number</p>
                <p className="text-lg font-mono font-semibold">{result.reference}</p>
              </div>
            )}
            <Button onClick={() => setResult(null)} className="mt-4">
              Submit Another Referral
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto bg-primary/10 rounded-full p-3 w-fit mb-2">
            <GraduationCap className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl">JKKN — Refer a Student</CardTitle>
          <CardDescription>
            Submit a student referral in 30 seconds. No login needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Student Details */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Student Details</h3>
              <div>
                <Label htmlFor="student_name">Student Name *</Label>
                <Input
                  id="student_name"
                  value={form.student_name}
                  onChange={(e) => handleChange('student_name', e.target.value)}
                  placeholder="Full name"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="student_phone">Phone Number *</Label>
                <Input
                  id="student_phone"
                  type="tel"
                  value={form.student_phone}
                  onChange={(e) => handleChange('student_phone', e.target.value)}
                  placeholder="10-digit mobile number"
                  required
                  pattern="[6-9][0-9]{9}"
                  title="Enter a valid 10-digit Indian mobile number"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="student_email">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="student_email"
                  type="email"
                  value={form.student_email}
                  onChange={(e) => handleChange('student_email', e.target.value)}
                  placeholder="student@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="interested_program">Interested Program <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="interested_program"
                  value={form.interested_program}
                  onChange={(e) => handleChange('interested_program', e.target.value)}
                  placeholder="e.g., B.Tech CSE, BSc Nursing"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Agent Details */}
            <div className="space-y-3 pt-2 border-t">
              <h3 className="text-sm font-medium text-muted-foreground">Your Details (Agent/Consultant)</h3>
              <div>
                <Label htmlFor="agent_name">Your Name *</Label>
                <Input
                  id="agent_name"
                  value={form.agent_name}
                  onChange={(e) => handleChange('agent_name', e.target.value)}
                  placeholder="Your full name"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="agent_phone">Your Phone *</Label>
                <Input
                  id="agent_phone"
                  type="tel"
                  value={form.agent_phone}
                  onChange={(e) => handleChange('agent_phone', e.target.value)}
                  placeholder="Your mobile number"
                  required
                  pattern="[6-9][0-9]{9}"
                  title="Enter a valid 10-digit Indian mobile number"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  placeholder="Any additional information..."
                  rows={2}
                  className="mt-1 resize-none"
                />
              </div>
            </div>

            {/* Error */}
            {result?.error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {result.error}
              </div>
            )}

            {/* Submit */}
            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
              ) : (
                'Submit Referral'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
