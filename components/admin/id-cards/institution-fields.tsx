'use client';

// ============================================================================
// Institution-block form pieces shared by the Institution tab and the
// New-template dialog: ONE field list (same labels, same order) and the
// logo/signature upload control. Kept separate so the two screens do not
// import each other.
// ============================================================================

import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { TemplateInstitutionBlock } from '@/lib/services/id-cards/template-design-client';

export type InstitutionTextKey = Exclude<keyof TemplateInstitutionBlock, 'logo_image' | 'principal_signature_image'>;

export const INSTITUTION_TEXT_FIELDS: Array<{ key: InstitutionTextKey; label: string; placeholder: string; multiline?: boolean }> = [
  { key: 'header_text', label: 'Header / college name (as printed)', placeholder: 'JKKN COLLEGE OF ENGINEERING & TECHNOLOGY (AUTONOMOUS)' },
  { key: 'email', label: 'Email', placeholder: 'engg@jkkn.ac.in' },
  { key: 'phone', label: 'Contact number(s)', placeholder: '99659 39333, 99653 63999' },
  { key: 'website', label: 'Website', placeholder: 'www.engg.jkkn.ac.in' },
  { key: 'address', label: 'Address', placeholder: 'Natrajapuram, Kumarapalayam - 638183', multiline: true },
  { key: 'principal_name', label: 'Principal name', placeholder: 'Dr. ...' },
  { key: 'principal_designation', label: 'Principal designation', placeholder: 'PRINCIPAL' }
];

export function ImageField({
  label,
  url,
  busy,
  disabled,
  inputRef,
  onPick,
  onClear,
  hint
}: {
  label: string;
  url: string | undefined;
  busy: boolean;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File | undefined) => void;
  onClear: () => void;
  hint: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-start gap-3">
        <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
              Upload
            </Button>
            {url && (
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onClear}>
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}
