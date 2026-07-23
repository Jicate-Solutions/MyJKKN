'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export interface ApplicantDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  currentJobTitle: string;
  currentCompany: string;
  currentJobDurationMonths: string;
  experienceMonths: string;
  qualification: string;
  workedCities: string;
}

interface StepApplicantDetailsProps {
  initial: ApplicantDetails;
  onNext: (details: ApplicantDetails) => void;
  onBack: () => void;
}

export function StepApplicantDetails({ initial, onNext, onBack }: StepApplicantDetailsProps) {
  const [d, setD] = useState<ApplicantDetails>(initial);

  const set = (key: keyof ApplicantDetails) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD((prev) => ({ ...prev, [key]: e.target.value }));

  const handleNext = () => {
    const missing: string[] = [];
    if (!d.firstName.trim()) missing.push('First Name');
    if (!d.lastName.trim()) missing.push('Last Name');
    if (!d.email.trim()) missing.push('Email Address');
    if (!d.phone.trim()) missing.push('Mobile Number');
    if (!d.qualification.trim()) missing.push('Qualification');
    if (!d.experienceMonths.trim()) missing.push('Experience');
    if (missing.length) {
      toast.error(`Please fill in: ${missing.join(', ')}`);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    onNext(d);
  };

  return (
    <div className="space-y-6">
      {/* Personal Information */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Personal Information</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First Name <span className="text-destructive">*</span></Label>
            <Input id="firstName" value={d.firstName} onChange={set('firstName')} placeholder="First name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last Name <span className="text-destructive">*</span></Label>
            <Input id="lastName" value={d.lastName} onChange={set('lastName')} placeholder="Last name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email Address <span className="text-destructive">*</span></Label>
            <Input id="email" type="email" value={d.email} onChange={set('email')} placeholder="you@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Mobile Number <span className="text-destructive">*</span></Label>
            <Input id="phone" type="tel" value={d.phone} onChange={set('phone')} placeholder="+91 XXXXX XXXXX" />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* Professional Details */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Professional Details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="currentJobTitle">Current Job Title</Label>
            <Input
              id="currentJobTitle"
              value={d.currentJobTitle}
              onChange={set('currentJobTitle')}
              placeholder="e.g. Assistant Professor"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currentCompany">Current Company / Institution</Label>
            <Input
              id="currentCompany"
              value={d.currentCompany}
              onChange={set('currentCompany')}
              placeholder="e.g. ABC College"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currentJobDurationMonths">Current Job Duration (months)</Label>
            <Input
              id="currentJobDurationMonths"
              type="number"
              min="0"
              value={d.currentJobDurationMonths}
              onChange={set('currentJobDurationMonths')}
              placeholder="e.g. 24"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="experienceMonths">
              Total Experience (months) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="experienceMonths"
              type="number"
              min="0"
              value={d.experienceMonths}
              onChange={set('experienceMonths')}
              placeholder="e.g. 60"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="qualification">
              Qualification <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qualification"
              value={d.qualification}
              onChange={set('qualification')}
              placeholder="e.g. M.E. Computer Science, Ph.D. (pursuing)"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="workedCities">Worked in Cities</Label>
            <Input
              id="workedCities"
              value={d.workedCities}
              onChange={set('workedCities')}
              placeholder="e.g. Chennai, Coimbatore, Bangalore (comma-separated)"
            />
            <p className="text-xs text-muted-foreground">Separate multiple cities with commas.</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button type="button" className="flex-1" onClick={handleNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
