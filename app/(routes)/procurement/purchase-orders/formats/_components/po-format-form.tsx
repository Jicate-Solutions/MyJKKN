'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

  const handleSave = async () => {
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
    <div className="space-y-6 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Format Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="format-name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="format-name"
              placeholder="e.g. Dental/General Supplier"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <HeaderFieldsEditor fields={headerFields} onChange={setHeaderFields} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <ItemColumnsEditor columns={itemColumns} onChange={setItemColumns} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FooterColumnsEditor columns={footerColumns} onChange={setFooterColumns} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Terms &amp; Conditions</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Free-text terms & conditions shown by default on POs using this format (editable per PO)..."
            value={termsDefault}
            onChange={(e) => setTermsDefault(e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push('/procurement/purchase-orders/formats')} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <BeatLoader color="#fff" size={8} className="mr-2" />}
          {initial ? 'Update Format' : 'Create Format'}
        </Button>
      </div>
    </div>
  );
}
