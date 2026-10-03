'use client';

// The requirement form, shared by "Request an item" and the requester's edit
// dialog.
//
// Create (no `initial`) is laid out exactly as the standalone InstaSolver form
// (C:\jkkn_instasolver app/(app)/requirements/new/_components/requirement-form.tsx):
//
//   1 Requester                  institution and mobile from MyJKKN
//   2 What is needed             category, item, quantity, cost, specifications
//   3 Where and when             locations, dates, why it is needed, usage
//   4 Supplier and attachments   vendor, contact person, photographs
//   Before you submit            the 8-item checklist and Submit request
//
// Edit (`initial` given) keeps a compact single-column dialog layout with a
// plain institution select and phone inputs, and is lenient about details that
// older records may not have (mobile number, reason).
//
// Validation here is for the person filling it in; the database CHECKs are the
// real rules and its refusals are shown as they come.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PhotoUploader } from '@/components/instasolver/photo-uploader';
import { FormStepTitle, RequiredMark, ReporterSection } from '@/components/instasolver/reporter-section';
import { FormSubmitPanel } from '@/components/instasolver/form-submit-panel';
import { useCategories, useInstitutions } from '@/hooks/instasolver/use-instasolver';
import type { CreateRequirementDto, Requirement } from '@/types/instasolver';

const phoneRule = /^\+?[0-9][0-9\s-]{6,14}$/;

// `strict` is the create form. Edit relaxes the two details older records may
// lack (a mobile number, a reason) so a requester can still fix a typo.
function buildSchema(strict: boolean) {
  return z.object({
    institution_id: z.string().min(1, 'Choose the institution'),
    contact_phone: z
      .string()
      .trim()
      .refine((v) => (strict ? v !== '' : true), 'A mobile number is required, so the team can reach you')
      .refine((v) => v === '' || phoneRule.test(v), 'Enter a valid mobile number'),
    alternate_phone: z
      .string()
      .trim()
      .refine((v) => v === '' || phoneRule.test(v), 'Enter a valid phone number'),
    category_id: z.string().min(1, 'Choose a category'),
    item_requested: z
      .string()
      .trim()
      .min(3, 'Name the item you need')
      .max(160, 'Keep the item name under 160 characters'),
    specifications: z.string().trim().max(4000),
    quantity_needed: z
      .string()
      .trim()
      .refine((v) => v !== '' && Number.isInteger(Number(v)) && Number(v) > 0, 'Quantity must be a whole number, at least 1'),
    cost_estimate: z
      .string()
      .trim()
      .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0), 'A cost estimate cannot be negative'),
    needed_by: z.string(),
    last_ordered: z.string(),
    usage_location: z.string().trim().min(3, 'Say where this will be used').max(240),
    delivery_location: z.string().trim().min(3, 'Say where it should be delivered').max(240),
    usage_details: z.string().trim().max(2000),
    reason_needed: strict
      ? z.string().trim().min(10, 'Say why this is needed, in at least 10 characters').max(2000)
      : z.string().trim().max(2000),
    preferred_vendor: z.string().trim().max(240),
    contact_person: z.string().trim().max(160),
    image_urls: z.array(z.string())
  });
}

export type RequirementFormValues = z.infer<ReturnType<typeof buildSchema>>;

const EMPTY: RequirementFormValues = {
  institution_id: '',
  category_id: '',
  item_requested: '',
  specifications: '',
  quantity_needed: '',
  cost_estimate: '',
  needed_by: '',
  last_ordered: '',
  usage_location: '',
  delivery_location: '',
  usage_details: '',
  reason_needed: '',
  preferred_vendor: '',
  contact_person: '',
  contact_phone: '',
  alternate_phone: '',
  image_urls: []
};

export function valuesFromRequirement(r: Requirement): RequirementFormValues {
  return {
    institution_id: r.institution_id,
    category_id: String(r.category_id),
    item_requested: r.item_requested,
    specifications: r.specifications ?? '',
    quantity_needed: r.quantity_needed === null ? '' : String(r.quantity_needed),
    cost_estimate: r.cost_estimate === null ? '' : String(r.cost_estimate),
    needed_by: r.needed_by ?? '',
    last_ordered: r.last_ordered ?? '',
    usage_location: r.usage_location,
    delivery_location: r.delivery_location,
    usage_details: r.usage_details ?? '',
    reason_needed: r.reason_needed ?? '',
    preferred_vendor: r.preferred_vendor ?? '',
    contact_person: r.contact_person ?? '',
    contact_phone: r.contact_phone ?? '',
    alternate_phone: r.alternate_phone ?? '',
    image_urls: r.image_urls ?? []
  };
}

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

function toDto(v: RequirementFormValues): CreateRequirementDto {
  return {
    institution_id: v.institution_id,
    category_id: Number(v.category_id),
    item_requested: v.item_requested.trim(),
    specifications: orNull(v.specifications),
    quantity_needed: Number(v.quantity_needed),
    cost_estimate: v.cost_estimate.trim() === '' ? null : Number(v.cost_estimate),
    needed_by: orNull(v.needed_by),
    last_ordered: orNull(v.last_ordered),
    usage_location: v.usage_location.trim(),
    delivery_location: v.delivery_location.trim(),
    usage_details: orNull(v.usage_details),
    reason_needed: orNull(v.reason_needed),
    preferred_vendor: orNull(v.preferred_vendor),
    contact_person: orNull(v.contact_person),
    contact_phone: orNull(v.contact_phone),
    alternate_phone: orNull(v.alternate_phone),
    image_urls: v.image_urls
  };
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="text-xs text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

function Optional() {
  return <span className="font-normal text-muted-foreground">(optional)</span>;
}

interface RequirementFormProps {
  initial?: Requirement;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (dto: CreateRequirementDto) => void;
  onCancel?: () => void;
  /** Kept for existing callers; the create layout always shows the checklist. */
  showChecklist?: boolean;
}

export function RequirementForm({ initial, submitLabel, submitting, onSubmit, onCancel }: RequirementFormProps) {
  const router = useRouter();
  const isEdit = !!initial;
  const { data: institutions } = useInstitutions();
  const { data: categories, isLoading: loadingCategories } = useCategories('requirement', true);
  const [uploading, setUploading] = useState(false);

  const schema = useMemo(() => buildSchema(!isEdit), [isEdit]);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm<RequirementFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial ? valuesFromRequirement(initial) : EMPTY,
    mode: 'onTouched'
  });

  const values = watch();
  const busy = submitting || uploading;

  // A category that was deactivated after the record was made must stay visible.
  const categoryOptions = categories ?? [];

  const categoryField = (
    <Controller
      control={control}
      name="category_id"
      render={({ field }) => (
        <Select value={field.value || undefined} onValueChange={field.onChange} disabled={loadingCategories}>
          <SelectTrigger id="category_id" aria-invalid={!!errors.category_id}>
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
            {initial?.category && !categoryOptions.some((c) => c.id === initial.category_id) && (
              <SelectItem value={String(initial.category_id)}>{initial.category.name}</SelectItem>
            )}
          </SelectContent>
        </Select>
      )}
    />
  );

  const photoField = (
    <Controller
      control={control}
      name="image_urls"
      render={({ field }) => (
        <PhotoUploader
          kind="requirement"
          institutionId={values.institution_id || undefined}
          value={field.value}
          onChange={field.onChange}
          disabled={submitting}
          onBusyChange={setUploading}
        />
      )}
    />
  );

  // The fields of sections 2-4, shared by both layouts.
  const whatIsNeeded = (
    <>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="category_id">
          Category
          <RequiredMark />
        </Label>
        {categoryField}
        <FieldError message={errors.category_id?.message} />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="item_requested">
          Item
          <RequiredMark />
        </Label>
        <Input
          id="item_requested"
          maxLength={160}
          placeholder="What do you need?"
          aria-invalid={!!errors.item_requested}
          {...register('item_requested')}
        />
        <FieldError message={errors.item_requested?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="quantity_needed">
          Quantity
          <RequiredMark />
        </Label>
        <Input
          id="quantity_needed"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          aria-invalid={!!errors.quantity_needed}
          {...register('quantity_needed')}
        />
        <FieldError message={errors.quantity_needed?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cost_estimate">
          Estimated cost <Optional />
        </Label>
        <Input
          id="cost_estimate"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="In rupees"
          aria-invalid={!!errors.cost_estimate}
          {...register('cost_estimate')}
        />
        <FieldError message={errors.cost_estimate?.message} />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="specifications">
          Specifications <Optional />
        </Label>
        <Textarea
          id="specifications"
          rows={3}
          placeholder="e.g. make, model, size, rating — anything that would make the wrong thing arrive if left out."
          {...register('specifications')}
        />
        <FieldError message={errors.specifications?.message} />
      </div>
    </>
  );

  const whereAndWhen = (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="usage_location">
          Where it will be used
          <RequiredMark />
        </Label>
        <Input
          id="usage_location"
          placeholder="e.g. Block B, first floor, learning studio 3"
          aria-invalid={!!errors.usage_location}
          {...register('usage_location')}
        />
        <FieldError message={errors.usage_location?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="delivery_location">
          Where to deliver it
          <RequiredMark />
        </Label>
        <Input
          id="delivery_location"
          placeholder="e.g. Central stores, main gate"
          aria-invalid={!!errors.delivery_location}
          {...register('delivery_location')}
        />
        <FieldError message={errors.delivery_location?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="needed_by">
          Needed by <Optional />
        </Label>
        <Input id="needed_by" type="date" {...register('needed_by')} />
        <FieldError message={errors.needed_by?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="last_ordered">
          Last ordered <Optional />
        </Label>
        <Input id="last_ordered" type="date" {...register('last_ordered')} />
        <p className="text-xs text-muted-foreground">
          Helps whoever reviews this judge whether it is a routine replacement.
        </p>
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="reason_needed">
          Why it is needed
          {!isEdit && <RequiredMark />}
          {isEdit && (
            <>
              {' '}
              <Optional />
            </>
          )}
        </Label>
        <Textarea id="reason_needed" rows={3} aria-invalid={!!errors.reason_needed} {...register('reason_needed')} />
        <FieldError message={errors.reason_needed?.message} />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="usage_details">
          How it will be used <Optional />
        </Label>
        <Textarea id="usage_details" rows={2} {...register('usage_details')} />
        <FieldError message={errors.usage_details?.message} />
      </div>
    </>
  );

  const supplier = (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preferred_vendor">
          Preferred vendor <Optional />
        </Label>
        <Input id="preferred_vendor" {...register('preferred_vendor')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact_person">
          Contact person <Optional />
        </Label>
        <Input id="contact_person" autoComplete="name" {...register('contact_person')} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>
          Photographs <Optional />
        </Label>
        {photoField}
      </div>
    </>
  );

  // ---- Edit: compact dialog layout --------------------------------------
  if (isEdit) {
    const section = (title: string, body: React.ReactNode) => (
      <section className="space-y-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="grid gap-4 sm:grid-cols-2">{body}</div>
      </section>
    );

    return (
      <form onSubmit={handleSubmit((v) => onSubmit(toDto(v)))} className="space-y-6" noValidate>
        {section(
          'Requester',
          <>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="institution_id">
                Institution
                <RequiredMark />
              </Label>
              <Controller
                control={control}
                name="institution_id"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger id="institution_id" aria-invalid={!!errors.institution_id}>
                      <SelectValue placeholder="Choose an institution" />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions?.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.institution_id?.message} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact_phone">
                Mobile number <Optional />
              </Label>
              <Input
                id="contact_phone"
                type="tel"
                autoComplete="tel"
                aria-invalid={!!errors.contact_phone}
                {...register('contact_phone')}
              />
              <FieldError message={errors.contact_phone?.message} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alternate_phone">
                Alternative number <Optional />
              </Label>
              <Input id="alternate_phone" type="tel" aria-invalid={!!errors.alternate_phone} {...register('alternate_phone')} />
              <FieldError message={errors.alternate_phone?.message} />
            </div>
          </>
        )}
        {section('What is needed', whatIsNeeded)}
        {section('Where and when', whereAndWhen)}
        {section('Supplier and attachments', supplier)}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={busy}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {uploading ? 'Uploading photographs…' : submitLabel}
          </Button>
        </div>
      </form>
    );
  }

  // ---- Create: the standalone two-column layout -------------------------
  const checklist = [
    { label: 'Institution', done: !!values.institution_id },
    { label: 'Mobile number', done: !!values.contact_phone?.trim() },
    { label: 'Category', done: !!values.category_id },
    { label: 'Item', done: !!values.item_requested?.trim() },
    { label: 'Quantity', done: Number(values.quantity_needed) > 0 },
    { label: 'Where it will be used', done: !!values.usage_location?.trim() },
    { label: 'Where to deliver it', done: !!values.delivery_location?.trim() },
    { label: 'Why it is needed', done: !!values.reason_needed?.trim() }
  ];

  return (
    <form
      onSubmit={handleSubmit((v) => onSubmit(toDto(v)))}
      noValidate
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div className="min-w-0 space-y-6">
        <ReporterSection
          kind="requirement"
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
            <FormStepTitle step={2}>What is needed</FormStepTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">{whatIsNeeded}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <FormStepTitle step={3}>Where and when</FormStepTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">{whereAndWhen}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <FormStepTitle step={4}>Supplier and attachments</FormStepTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">{supplier}</CardContent>
        </Card>
      </div>

      <FormSubmitPanel
        items={checklist}
        submitLabel={submitLabel}
        pendingLabel="Submitting…"
        isPending={submitting}
        disabled={uploading}
        onCancel={onCancel ?? (() => router.push('/instasolver/requirements'))}
        note={
          uploading
            ? 'Photographs are still uploading.'
            : 'You get a reference number straight away — quote it if you follow up.'
        }
      />
    </form>
  );
}
