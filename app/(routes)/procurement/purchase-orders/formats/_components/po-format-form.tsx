'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FormActionBar } from '@/components/procurement/form-action-bar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';
import { HeaderFieldsEditor } from './header-fields-editor';
import { ItemColumnsEditor } from './item-columns-editor';
import { FooterColumnsEditor, DEFAULT_FOOTER_COLUMNS } from './footer-columns-editor';
import type {
  ProcurementPoFormat,
  CreatePoFormatDto,
  PoHeaderFieldDef,
  PoItemColumnDef,
  PoFooterColumnDef,
} from '@/types/procurement';

interface PoFormatFormProps {
  institutionId: string;
  createdBy: string | null;
  initial?: ProcurementPoFormat;
  onSave: (data: CreatePoFormatDto) => Promise<unknown>;
}

export function PoFormatForm({ institutionId, createdBy, initial, onSave }: PoFormatFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [headerFields, setHeaderFields] = useState<PoHeaderFieldDef[]>(initial?.header_fields ?? []);
  const [itemColumns, setItemColumns] = useState<PoItemColumnDef[]>(initial?.item_columns ?? []);
  const [footerColumns, setFooterColumns] = useState<PoFooterColumnDef[]>(
    initial?.footer_columns?.length ? initial.footer_columns : DEFAULT_FOOTER_COLUMNS
  );
  const [termsDefault, setTermsDefault] = useState(initial?.terms_and_conditions_default ?? '');
  const [saving, setSaving] = useState(false);
  const [triedSave, setTriedSave] = useState(false);

  const handleSave = async () => {
    setTriedSave(true);
    if (!name.trim()) {
      toast.error('Please enter a format name');
      return;
    }
    if (itemColumns.length === 0) {
      toast.error('Add at least one item table column');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        institution_id: institutionId,
        name: name.trim(),
        description: description.trim() || null,
        is_default: initial?.is_default ?? false,
        is_active: initial?.is_active ?? true,
        header_fields: headerFields,
        item_columns: itemColumns,
        footer_columns: footerColumns,
        terms_and_conditions_default: termsDefault.trim() || null,
        created_by: initial?.created_by ?? createdBy,
      });
      toast.success(initial ? 'Format updated' : 'Format created');
      router.push('/procurement/purchase-orders/formats');
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to save format'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border bg-background shadow">
        <h2 className="border-b px-5 py-3 text-base font-semibold">Format details</h2>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-2">
            <Label htmlFor="format-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="format-name"
              placeholder="e.g. Dental/General Supplier"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={triedSave && !name.trim()}
            />
            {triedSave && !name.trim() && <p className="text-xs text-destructive">Give the format a name.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="format-description">Description</Label>
            <Input
              id="format-description"
              placeholder="When to use this format"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-background shadow">
        <div className="p-5">
          <HeaderFieldsEditor fields={headerFields} onChange={setHeaderFields} />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-background shadow">
        <div className="p-5">
          <ItemColumnsEditor columns={itemColumns} onChange={setItemColumns} />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-background shadow">
        <div className="p-5">
          <FooterColumnsEditor columns={footerColumns} onChange={setFooterColumns} />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-background shadow">
        <h2 className="border-b px-5 py-3 text-base font-semibold">Default terms &amp; conditions</h2>
        <div className="p-5">
          <Textarea
            placeholder="Free-text terms & conditions shown by default on purchase orders using this format (editable per order)..."
            value={termsDefault}
            onChange={(e) => setTermsDefault(e.target.value)}
            rows={4}
          />
        </div>
      </section>

      <FormActionBar>
        <Button
          variant="ghost"
          className="h-11 sm:h-9"
          onClick={() => router.push('/procurement/purchase-orders/formats')}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button className="h-11 px-5 sm:h-9" onClick={handleSave} disabled={saving}>
          {saving && <BeatLoader color="#fff" size={8} className="mr-2" />}
          {initial ? 'Save changes' : 'Create format'}
        </Button>
      </FormActionBar>
    </div>
  );
}
