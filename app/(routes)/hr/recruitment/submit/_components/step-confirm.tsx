'use client';

import { Loader2, Paperclip, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ApplicantDetails } from './step-applicant-details';

function ConfirmRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b last:border-b-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

interface StepConfirmProps {
  resumeFilename: string;
  resumeSizeBytes: number;
  details: ApplicantDetails;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  isUploading?: boolean;
  submitted: boolean;
  onDone: () => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepConfirm({
  resumeFilename, resumeSizeBytes, details,
  onBack, onSubmit, isSubmitting, isUploading, submitted, onDone,
}: StepConfirmProps) {
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
          <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">Application Submitted!</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Your application has been received. The hiring team will review it and reach out to you.
          </p>
        </div>
        <Button onClick={onDone} className="mt-2">
          Back to Jobs
        </Button>
      </div>
    );
  }

  const expYears = details.experienceMonths
    ? `${details.experienceMonths} months${parseInt(details.experienceMonths) >= 12
        ? ` (${Math.floor(parseInt(details.experienceMonths) / 12)} yr${Math.floor(parseInt(details.experienceMonths) / 12) !== 1 ? 's' : ''})`
        : ''}`
    : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Review your application before submitting. Click <strong>Back</strong> to make changes.
      </p>

      {/* Resume */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resume</h3>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
          <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground">
            <Paperclip className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{resumeFilename}</span>
          <span className="flex-shrink-0 text-xs text-muted-foreground">{formatBytes(resumeSizeBytes)}</span>
        </div>
      </div>

      {/* Personal Info */}
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Personal Information
        </h3>
        <dl className="rounded-lg border px-4">
          <ConfirmRow label="Full Name" value={`${details.firstName} ${details.lastName}`} />
          <ConfirmRow label="Email Address" value={details.email} />
          <ConfirmRow label="Mobile Number" value={details.phone} />
        </dl>
      </div>

      {/* Professional Details */}
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Professional Details
        </h3>
        <dl className="rounded-lg border px-4">
          <ConfirmRow label="Current Job Title" value={details.currentJobTitle || '—'} />
          <ConfirmRow label="Current Company" value={details.currentCompany || '—'} />
          <ConfirmRow
            label="Current Job Duration"
            value={details.currentJobDurationMonths ? `${details.currentJobDurationMonths} months` : '—'}
          />
          <ConfirmRow label="Total Experience" value={expYears || '—'} />
          <ConfirmRow label="Qualification" value={details.qualification} />
          <ConfirmRow label="Worked in Cities" value={details.workedCities || '—'} />
        </dl>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button type="button" className="flex-1" onClick={onSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{isUploading ? 'Uploading Resume…' : 'Submitting…'}</>
          ) : (
            'Submit Application'
          )}
        </Button>
      </div>
    </div>
  );
}
