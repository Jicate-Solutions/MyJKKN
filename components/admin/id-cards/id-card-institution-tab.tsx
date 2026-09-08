'use client';

// ============================================================================
// IdCardInstitutionTab — assign a template to an institution and maintain the
// institution details printed on that institution's cards.
// Created: 2026-09-05.
//
// Everything here writes id_card_templates.institution_id and
// front_layout_json.institution (header text, logo, email, phone, website,
// address, principal name/designation/signature). The render route reads that
// block FIRST and only falls back to the `institutions` table, so the card
// never mixes another college's details in. Preview and print share the
// same render, so both show exactly this data.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ImagePlus, Loader2, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTemplateSelection } from '@/components/admin/id-cards/template-selection';
import { ImageField, INSTITUTION_TEXT_FIELDS } from '@/components/admin/id-cards/institution-fields';
import {
  institutionBlockOf,
  purposeOf,
  setTemplateInstitution,
  uploadCardAsset,
  type TemplateInstitutionBlock
} from '@/lib/services/id-cards/template-design-client';
import { Switch } from '@/components/ui/switch';
import {
  slugifyPurposeKey,
  type TemplateAudience,
  type TemplatePurpose
} from '@/lib/id-cards/template-purpose';

const NONE = '__none__';



export function IdCardInstitutionTab() {
  const { templates, selectedId, selected, reload, institutions, institutionsLoading, institutionName } =
    useTemplateSelection();
  const [institutionId, setInstitutionId] = useState<string>(NONE);
  const [block, setBlock] = useState<TemplateInstitutionBlock>({});
  const [purpose, setPurpose] = useState<TemplatePurpose>({
    key: 'learner',
    label: 'Learners',
    audience: 'learner',
    is_default: false
  });
  const [busy, setBusy] = useState<'save' | 'logo' | 'signature' | null>(null);
  const [dirty, setDirty] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const signatureInputRef = useRef<HTMLInputElement | null>(null);


  // Load the form from the selected template.
  useEffect(() => {
    if (!selected) return;
    setInstitutionId(selected.institution_id ?? NONE);
    setBlock(institutionBlockOf(selected));
    setPurpose(purposeOf(selected));
    setDirty(false);
  }, [selected]);

  // Several ACTIVE templates per institution are expected (one per purpose).
  // The only thing worth a warning is two DEFAULTS for the same audience.
  const duplicateDefaults = useMemo(() => {
    if (!templates || institutionId === NONE || !purpose.is_default) return [];
    return templates.filter((t) => {
      if (t.id === selectedId || t.institution_id !== institutionId || !t.active) return false;
      const p = purposeOf(t);
      return p.audience === purpose.audience && p.is_default;
    });
  }, [templates, institutionId, selectedId, purpose]);

  const setField = (key: keyof TemplateInstitutionBlock, value: string) => {
    setBlock((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const onSave = async () => {
    if (!selected) return;
    setBusy('save');
    try {
      // ONE write for institution + block + purpose (two writes clobbered each other).
      await setTemplateInstitution(selected, institutionId === NONE ? null : institutionId, block, {
        ...purpose,
        key: slugifyPurposeKey(purpose.label),
        label: purpose.label.trim() || 'Learners'
      });
      toast.success('Institution details and purpose saved to the template');
      setDirty(false);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const onUpload = async (kind: 'logo' | 'signature', file: File | undefined) => {
    if (!selected || !file) return;
    setBusy(kind);
    try {
      const url = await uploadCardAsset(selected.id, kind, file);
      setField(kind === 'logo' ? 'logo_image' : 'principal_signature_image', url);
      toast.success(kind === 'logo' ? 'Logo uploaded — save to apply' : 'Signature uploaded — save to apply');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(null);
      if (kind === 'logo' && logoInputRef.current) logoInputRef.current.value = '';
      if (kind === 'signature' && signatureInputRef.current) signatureInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Assign each template to one institution, give it a purpose (Learners, Senior Learners,
        Administrators…), and keep that institution&apos;s header, contacts and Principal details
        here. An institution may keep several templates active at once; cards pick the template
        from the person&apos;s institution, audience and the purpose chosen at print time.
      </p>

      {/* Template + institution assignment */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Assigned institution</Label>
          <Select
            value={institutionId}
            onValueChange={(v) => {
              setInstitutionId(v);
              setDirty(true);
            }}
            disabled={!selected || institutionsLoading}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={institutionsLoading ? 'Loading…' : 'Select institution'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Not assigned —</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inst-purpose">Purpose / type</Label>
          <Input
            id="inst-purpose"
            value={purpose.label}
            placeholder="Learners · Senior Learners · Administrators"
            onChange={(e) => {
              setPurpose((p) => ({ ...p, label: e.target.value }));
              setDirty(true);
            }}
            disabled={!selected}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Card audience</Label>
          <Select
            value={purpose.audience}
            onValueChange={(v) => {
              setPurpose((p) => ({ ...p, audience: v as TemplateAudience }));
              setDirty(true);
            }}
            disabled={!selected}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="learner">Learners (roll no, course, study period)</SelectItem>
              <SelectItem value="team_member">Team members (ID code, designation)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Default for this audience</p>
            <p className="text-xs text-muted-foreground">
              Used when no purpose is chosen at print time. Several active templates per
              institution are fine — one per purpose.
            </p>
          </div>
          <Switch
            checked={purpose.is_default}
            onCheckedChange={(v) => {
              setPurpose((p) => ({ ...p, is_default: v }));
              setDirty(true);
            }}
            disabled={!selected}
          />
        </div>
      </div>
      {duplicateDefaults.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Another active template is already the default for this audience at this institution (
          {duplicateDefaults.map((t) => t.name ?? t.id).join(', ')}). Only one default is used;
          switch the other off as default or give this one a different purpose.
        </p>
      )}

      {selected && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{selected.name}</span>
          <Badge variant={selected.active ? 'secondary' : 'outline'}>
            {selected.active ? 'Active' : 'Inactive'}
          </Badge>
          {selected.institution_id ? (
            <Badge variant="outline">{institutionName(selected.institution_id) ?? 'Assigned'}</Badge>
          ) : (
            <Badge variant="destructive">No institution assigned</Badge>
          )}
        </div>
      )}

      {/* Institution details */}
      <div className="grid gap-4 sm:grid-cols-2">
        {INSTITUTION_TEXT_FIELDS.map((f) => (
          <div key={f.key} className={`space-y-1.5 ${f.multiline ? 'sm:col-span-2' : ''}`}>
            <Label htmlFor={`inst-${f.key}`}>{f.label}</Label>
            {f.multiline ? (
              <Textarea
                id={`inst-${f.key}`}
                value={block[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setField(f.key, e.target.value)}
                disabled={!selected}
                rows={2}
              />
            ) : (
              <Input
                id={`inst-${f.key}`}
                value={block[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setField(f.key, e.target.value)}
                disabled={!selected}
              />
            )}
          </div>
        ))}
      </div>

      {/* Images */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageField
          label="Institution logo"
          url={block.logo_image}
          busy={busy === 'logo'}
          disabled={!selected || busy !== null}
          inputRef={logoInputRef}
          onPick={(file) => void onUpload('logo', file)}
          onClear={() => setField('logo_image', '')}
          hint="Transparent PNG, square, at least 300×300."
        />
        <ImageField
          label="Principal signature"
          url={block.principal_signature_image}
          busy={busy === 'signature'}
          disabled={!selected || busy !== null}
          inputRef={signatureInputRef}
          onPick={(file) => void onUpload('signature', file)}
          onClear={() => setField('principal_signature_image', '')}
          hint="Transparent PNG, wide (about 3:1), dark ink on nothing."
        />
      </div>

      <div className="flex items-center gap-3">
        {/* Not gated on `dirty`: saving unchanged values is harmless, and a
            disabled Save read as "unable to update" when the tracker missed an edit. */}
        <Button onClick={onSave} disabled={!selected || busy !== null}>
          {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save institution details
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>

      <p className="text-xs text-muted-foreground">
        If a template uses full-bleed artwork, the header, logo and signature baked into that artwork
        still print as pixels. Place <code>institution_logo</code>, <code>principal_signature</code>,
        <code>principal_name</code>, <code>institution_email</code>, <code>institution_phone</code> or{' '}
        <code>institution_address</code> elements in the layout to draw these values dynamically
        instead, or use the default design which places them automatically.
      </p>
    </div>
  );
}

