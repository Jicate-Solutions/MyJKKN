'use client';

import { useRef, useState } from 'react';
import { UploadCloud, UserCircle, ClipboardCheck, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApplyForJob } from '@/hooks/hr/use-recruitment';
import type { HRRecruitmentJob } from '@/types/hr-recruitment';
import { toast } from 'sonner';
import { StepUploadResume } from './step-upload-resume';
import { StepApplicantDetails, type ApplicantDetails } from './step-applicant-details';
import { StepConfirm } from './step-confirm';

const STEPS = [
  { id: 1, label: 'Upload Resume', icon: UploadCloud },
  { id: 2, label: 'Applicant Details', icon: UserCircle },
  { id: 3, label: 'Confirm', icon: ClipboardCheck },
] as const;

const EMPTY_DETAILS: ApplicantDetails = {
  firstName: '', lastName: '', email: '', phone: '',
  currentJobTitle: '', currentCompany: '', currentJobDurationMonths: '',
  experienceMonths: '', qualification: '', workedCities: '',
};

interface ApplyWizardProps {
  job: HRRecruitmentJob;
  onCancel: () => void;
}

export function ApplyWizard({ job, onCancel }: ApplyWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [details, setDetails] = useState<ApplicantDetails>(EMPTY_DETAILS);
  const [submitted, setSubmitted] = useState(false);
  // Upload result cached per File so a retry after a failed submit doesn't
  // create a duplicate Drive file.
  const uploadedRef = useRef<{ file: File; url: string; driveFileId: string } | null>(null);

  const applyMutation = useApplyForJob();

  const handleResumeNext = (file: File) => {
    setResumeFile(file);
    setStep(2);
  };

  const uploadResume = async (file: File) => {
    const cached = uploadedRef.current;
    if (cached && cached.file === file) return cached;

    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/hr/recruitment/jobs/${job.id}/resume-upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Resume upload failed. Please try again.');
    }
    const data = await res.json() as { url: string; driveFileId: string };
    const uploaded = { file, url: data.url, driveFileId: data.driveFileId };
    uploadedRef.current = uploaded;
    return uploaded;
  };

  const handleDetailsNext = (d: ApplicantDetails) => {
    setDetails(d);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!resumeFile) {
      toast.error('Please select a resume file.');
      setStep(1);
      return;
    }
    try {
      setUploading(true);
      let uploaded: { url: string; driveFileId: string };
      try {
        uploaded = await uploadResume(resumeFile);
      } finally {
        setUploading(false);
      }
      await applyMutation.mutateAsync({
        job_id: job.id,
        institution_id: job.institution_id ?? null,
        first_name: details.firstName.trim(),
        last_name: details.lastName.trim(),
        email: details.email.trim().toLowerCase(),
        phone: details.phone.trim(),
        current_job_title: details.currentJobTitle.trim() || null,
        current_company: details.currentCompany.trim() || null,
        current_job_duration_months: details.currentJobDurationMonths
          ? parseInt(details.currentJobDurationMonths) || null
          : null,
        experience_months: parseInt(details.experienceMonths) || 0,
        qualification: details.qualification.trim(),
        worked_cities: details.workedCities
          ? details.workedCities.split(',').map((c) => c.trim()).filter(Boolean)
          : [],
        resume_url: uploaded.url,
        resume_filename: resumeFile.name,
        resume_size_bytes: resumeFile.size,
        drive_file_id: uploaded.driveFileId || null,
      });
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    }
  };

  return (
    <div className="mx-auto max-w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-foreground">Apply for {job.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Complete the steps below to submit your application.</p>
      </div>

      {/* Step bar */}
      {!submitted && (
        <div className="mb-8 flex items-center justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = s.id === step;
            const isDone = s.id < step;
            return (
              <div key={s.id} className="flex flex-1 items-center">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                      isDone
                        ? 'border-primary bg-primary text-primary-foreground'
                        : isActive
                        ? 'border-primary bg-background text-primary'
                        : 'border-border bg-background text-muted-foreground',
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={cn(
                      'hidden text-xs font-medium sm:inline',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn('mx-2 flex-1 h-px', isDone ? 'bg-primary' : 'bg-border')} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Step content */}
      {step === 1 && (
        <StepUploadResume
          initialFile={resumeFile}
          onNext={handleResumeNext}
          onCancel={onCancel}
        />
      )}
      {step === 2 && (
        <StepApplicantDetails
          initial={details}
          onNext={handleDetailsNext}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <StepConfirm
          resumeFilename={resumeFile?.name ?? ''}
          resumeSizeBytes={resumeFile?.size ?? 0}
          details={details}
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
          isSubmitting={uploading || applyMutation.isPending}
          isUploading={uploading}
          submitted={submitted}
          onDone={onCancel}
        />
      )}
    </div>
  );
}
