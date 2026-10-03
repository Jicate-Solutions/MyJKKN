'use client';

// Report an issue — laid out exactly as the standalone InstaSolver form
// (C:\jkkn_instasolver app/(app)/issues/new/_components/issue-form.tsx):
//
//   1 Reporter         who it is filed as, institution and mobile from MyJKKN
//   2 What and where   category, short title, issue location, what is happening
//   3 How serious is it severity (starts at Medium), and the optional "what you
//                       think caused it / would fix it"
//   4 Photographs
//   Before you submit  the 7-item checklist and Submit report
//
// Severity IS asked, because the reporter is the only one who has seen the
// fault. Priority is not — that is the CAO's decision at triage.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PhotoUploader } from '@/components/instasolver/photo-uploader';
import { FormStepTitle, RequiredMark, ReporterSection } from '@/components/instasolver/reporter-section';
import { FormSubmitPanel } from '@/components/instasolver/form-submit-panel';
import { useCategories, useInstaSolverMutation } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverIssueService } from '@/lib/services/instasolver/issue-service';
import { SEVERITY_META, SEVERITY_VALUES } from '@/lib/instasolver/constants';
import type { CreateIssueDto } from '@/types/instasolver';

const phoneRule = /^\+?[0-9][0-9\s-]{6,14}$/;

const schema = z.object({
  institution_id: z.string().min(1, 'Choose the institution'),
  contact_phone: z
    .string()
    .trim()
    .min(1, 'A mobile number is required, so the team can reach you')
    .refine((v) => phoneRule.test(v), 'Enter a valid mobile number'),
  alternate_phone: z
    .string()
    .trim()
    .refine((v) => v === '' || phoneRule.test(v), 'Enter a valid phone number'),
  category_id: z.string().min(1, 'Choose a category'),
  title: z.string().trim().min(5, 'Give it a short title of at least 5 characters').max(160, 'Keep the title under 160 characters'),
  location: z.string().trim().min(2, 'Say where it is').max(200),
  details: z.string().trim().min(10, 'Describe what is happening in at least 10 characters').max(4000),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  suspected_reason: z.string().trim().max(2000),
  resolution_suggestion: z.string().trim().max(2000)
});

type FormValues = z.infer<typeof schema>;

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

export function IssueForm() {
  const router = useRouter();
  const { data: categories, isLoading: loadingCategories } = useCategories('issue');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      institution_id: '',
      contact_phone: '',
      alternate_phone: '',
      category_id: '',
      title: '',
      location: '',
      details: '',
      // Starts at Medium — the most common answer — so the reporter changes it
      // only when the fault is worse (or milder) than usual.
      severity: 'medium',
      suspected_reason: '',
      resolution_suggestion: ''
    }
  });

  const create = useInstaSolverMutation(
    (dto: CreateIssueDto) => InstaSolverIssueService.create(dto),
    (r) => `Reported — reference ${r.reference_no}`
  );

  const onSubmit = handleSubmit((v) => {
    create.mutate(
      {
        institution_id: v.institution_id,
        category_id: Number(v.category_id),
        severity: v.severity,
        title: v.title,
        details: v.details,
        location: v.location,
        suspected_reason: v.suspected_reason || null,
        resolution_suggestion: v.resolution_suggestion || null,
        contact_phone: v.contact_phone || null,
        alternate_phone: v.alternate_phone || null,
        image_urls: photos
      },
      { onSuccess: (r) => router.push(`/instasolver/issues/${r.id}`) }
    );
  });

  const values = watch();
  const checklist = [
    { label: 'Institution', done: !!values.institution_id },
    { label: 'Mobile number', done: !!values.contact_phone?.trim() },
    { label: 'Category', done: !!values.category_id },
    { label: 'Short title', done: !!values.title?.trim() },
    { label: 'Issue location', done: !!values.location?.trim() },
    { label: 'What is happening', done: !!values.details?.trim() },
    { label: 'A photograph', done: photos.length > 0 }
  ];

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div className="min-w-0 space-y-6">
        <ReporterSection
          kind="issue"
          values={{
            institution_id: values.institution_id,
            contact_phone: values.contact_phone,
            alternate_phone: values.alternate_phone
          }}
          onChange={(field, value) => setValue(field, value, { shouldValidate: true, shouldDirty: true })}
          errors={{
            institution_id: errors.institution_id?.message,
            contact_phone: errors.contact_phone?.message,
            alternate_phone: errors.alternate_phone?.message
          }}
        />

        <Card>
          <CardHeader className="pb-3">
            <FormStepTitle step={2}>What and where</FormStepTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category_id">
                Category
                <RequiredMark />
              </Label>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange} disabled={loadingCategories}>
                    <SelectTrigger id="category_id" aria-invalid={!!errors.category_id}>
                      <SelectValue placeholder="What kind of fault is it?" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.category_id?.message} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">
                Short title
                <RequiredMark />
              </Label>
              <Input
                id="title"
                maxLength={160}
                placeholder="e.g. Ceiling fan not working"
                aria-invalid={!!errors.title}
                {...register('title')}
              />
              <FieldError message={errors.title?.message} />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="location">
                Issue location
                <RequiredMark />
              </Label>
              <Input
                id="location"
                placeholder="Block, floor and learning studio — e.g. Main block, 2nd floor, Learning studio 204"
                aria-invalid={!!errors.location}
                {...register('location')}
              />
              <FieldError message={errors.location?.message} />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="details">
                What is happening
                <RequiredMark />
              </Label>
              <Textarea
                id="details"
                rows={4}
                placeholder="What you see, since when, and who it affects"
                aria-invalid={!!errors.details}
                {...register('details')}
              />
              <FieldError message={errors.details?.message} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <FormStepTitle step={3}>How serious is it</FormStepTitle>
            <CardDescription>
              What you observed. The CAO sets the priority separately when deciding who fixes it.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="severity">
                Severity
                <RequiredMark />
              </Label>
              <Controller
                control={control}
                name="severity"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_VALUES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SEVERITY_META[s].label} — {SEVERITY_META[s].description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="suspected_reason">
                What you think caused it <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="suspected_reason" rows={2} {...register('suspected_reason')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resolution_suggestion">
                What you think would fix it <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="resolution_suggestion" rows={2} {...register('resolution_suggestion')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <FormStepTitle step={4}>Photographs</FormStepTitle>
            <CardDescription>
              A photograph lets the team see the fault before they walk there. Up to five.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoUploader
              value={photos}
              onChange={setPhotos}
              kind="issue"
              institutionId={values.institution_id || undefined}
              onBusyChange={setUploading}
              disabled={create.isPending}
            />
          </CardContent>
        </Card>
      </div>

      <FormSubmitPanel
        items={checklist}
        submitLabel="Submit report"
        pendingLabel="Submitting…"
        isPending={create.isPending}
        disabled={uploading}
        onCancel={() => router.push('/instasolver/issues')}
        note={
          uploading
            ? 'Photographs are still uploading.'
            : 'You get a reference number straight away. Priority and who fixes it are decided at triage.'
        }
      />
    </form>
  );
}
