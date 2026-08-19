'use client';

// Renders ONE custom registration field by its field_type. Shared by the
// admin builder's live preview and both actual registration surfaces (public
// guest form, organizer Add Entry dialog) — one rendering implementation, no
// drift between "what the organizer designed" and "what a registrant sees."

import { useRef, useState } from 'react';
import { FileText, ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { asFormUpload } from '@/types/tournament';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EventRegistrationFormField, FormFieldCondition } from '@/types/tournament';

/** Whether `field` should be shown given the current answers to ALL fields on the form. */
export function isFieldVisible(
  field: EventRegistrationFormField,
  allValues: Record<string, unknown>
): boolean {
  const condition = field.condition as FormFieldCondition | null;
  if (!condition) return true;
  const dependentValue = allValues[condition.field];
  const asString = dependentValue == null ? '' : String(dependentValue);
  switch (condition.op) {
    case 'eq':
      return asString === condition.value;
    case 'neq':
      return asString !== condition.value;
    case 'contains':
      return asString.includes(condition.value);
    case 'not_empty':
      return asString.trim() !== '';
    case 'empty':
      return asString.trim() === '';
    default:
      return true;
  }
}

/**
 * Where an upload should go. Absent on the BUILDER'S PREVIEW, which renders the
 * same component but must not actually store anything — a designer clicking
 * around their own draft form should not fill the bucket with test files. The
 * upload control renders disabled with an explanatory note in that case.
 */
export interface FieldUploadContext {
  eventId: string;
  formId: string;
}

interface Props {
  field: EventRegistrationFormField;
  value: unknown;
  onChange: (value: unknown) => void;
  uploadContext?: FieldUploadContext;
}

/**
 * The file/image control. Uploads immediately on pick — the registration POST
 * carries JSON, so the bytes have to be in storage before submit, and the
 * answer stored in custom_fields is the returned EventFormUpload object.
 *
 * Its own component, not inline in the switch, because it needs hooks; React
 * forbids calling those from a switch branch.
 */
function UploadField({
  field,
  value,
  onChange,
  uploadContext,
  label,
}: Props & { label: React.ReactNode }) {
  const isImage = field.field_type === 'image';
  const existing = asFormUpload(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rendered from the picked File, so the thumbnail appears instantly instead
  // of waiting on a signed URL round-trip for a private-bucket object.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const accept = isImage
    ? 'image/jpeg,image/png,image/webp,image/gif'
    : 'application/pdf,.doc,.docx,image/jpeg,image/png,image/webp';

  async function handlePick(file: File | undefined) {
    if (!file || !uploadContext) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('form_id', uploadContext.formId);
      body.append('field_key', field.field_key);

      const res = await fetch(
        `/api/events/${uploadContext.eventId}/registration-upload`,
        { method: 'POST', body }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);

      if (isImage) setPreviewUrl(URL.createObjectURL(file));
      onChange(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    // Clears the ANSWER only. The stored object is deliberately left in place:
    // deleting it would need another privileged endpoint, and an orphan in a
    // private bucket is cheaper than an endpoint that can delete by path.
    setPreviewUrl(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
    setError(null);
  }

  return (
    <div className="space-y-1.5">
      {label}

      {existing ? (
        <div className="flex items-center gap-3 rounded-md border p-2.5">
          {isImage && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={existing.name}
              className="h-14 w-14 shrink-0 rounded object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{existing.name}</p>
            <p className="text-xs text-muted-foreground">
              {existing.size > 0 ? `${Math.round(existing.size / 1024)} KB · ` : ''}Uploaded
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={clear} title="Remove">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <Input
            ref={inputRef}
            id={field.id}
            type="file"
            accept={accept}
            disabled={busy || !uploadContext}
            onChange={(e) => handlePick(e.target.files?.[0])}
          />
          {busy && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Uploading…
            </p>
          )}
          {!uploadContext && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Upload className="h-3 w-3" />
              Uploading works on the live form — this is a preview.
            </p>
          )}
        </>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
      {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      {!existing && (
        <p className="text-xs text-muted-foreground">
          {isImage ? 'JPG, PNG, WebP or GIF · max 5 MB' : 'PDF, Word or image · max 10 MB'}
        </p>
      )}
    </div>
  );
}

export function DynamicFieldInput({ field, value, onChange, uploadContext }: Props) {
  const label = (
    <Label htmlFor={field.id}>
      {field.field_label}
      {field.is_required && <span className="text-destructive"> *</span>}
    </Label>
  );

  switch (field.field_type) {
    // Display only — content the organizer published, not a question. Renders
    // no input and never writes to `value`, so it contributes nothing to the
    // answer set. The label doubles as the caption; help_text is the sub-line.
    case 'image_display':
      return (
        <div className="space-y-1.5">
          {field.media_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={field.media_url}
                alt={field.field_label || 'Form image'}
                className="w-full rounded-md border object-contain"
              />
              {field.field_label && (
                <p className="text-sm font-medium">{field.field_label}</p>
              )}
            </>
          ) : (
            // A field the organizer added but never gave an image to. Say so in
            // the builder rather than rendering a broken <img> at registrants.
            <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
              No image chosen yet.
            </div>
          )}
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-1.5">
          {label}
          <Textarea
            id={field.id}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            maxLength={field.max_length ?? undefined}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'select':
    case 'radio':
      return (
        <div className="space-y-1.5">
          {label}
          <Select value={(value as string) ?? ''} onValueChange={onChange}>
            <SelectTrigger id={field.id}>
              <SelectValue placeholder={field.placeholder ?? 'Select…'} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'multi_select': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      return (
        <div className="space-y-1.5">
          {label}
          <div className="space-y-1.5 rounded-md border p-2.5">
            {(field.options ?? []).map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selected.includes(opt.value)} onCheckedChange={() => toggle(opt.value)} />
                {opt.label}
              </label>
            ))}
          </div>
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );
    }

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={field.id}
            checked={!!value}
            onCheckedChange={(checked) => onChange(!!checked)}
          />
          {label}
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    // Both upload types share one control. This branch used to store
    // `e.target.files[0].name` — the FILENAME ONLY — so the file itself was
    // discarded when the tab closed and the answer was a meaningless string.
    case 'file':
    case 'image':
      return (
        <UploadField
          field={field}
          value={value}
          onChange={onChange}
          uploadContext={uploadContext}
          label={label}
        />
      );

    case 'date':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={field.id}
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'number':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={field.id}
            type="number"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            min={field.min_value ?? undefined}
            max={field.max_value ?? undefined}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'phone':
    case 'email':
    case 'text':
    default:
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={field.id}
            type={field.field_type === 'email' ? 'email' : 'text'}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            maxLength={field.max_length ?? undefined}
            pattern={field.pattern ?? undefined}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );
  }
}
