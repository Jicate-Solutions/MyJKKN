'use client';

// ============================================================================
// TemplateSelection — ONE template list + ONE selected template shared by every
// tab of the ID-card template editor (Card design, Back side, Institution,
// Field mappings). Created: 2026-09-05.
//
// Before this each tab loaded its own list and kept its own selection, so the
// template being edited could differ from tab to tab, badges went stale after
// an activation toggle until reload, and every picker labelled rows differently.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import toast from 'react-hot-toast';

import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  fetchTemplatesWithLayout,
  type TemplateDesignRow
} from '@/lib/services/id-cards/template-design-client';
import { pickPreferredAdminTemplateId } from '@/lib/services/id-cards/template-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus } from 'lucide-react';
import {
  createTemplate,
  fetchInstitutionDefaults,
  purposeOf,
  uploadCardAsset,
  type TemplateInstitutionBlock
} from '@/lib/services/id-cards/template-design-client';
import { Textarea } from '@/components/ui/textarea';
import { ImageField, INSTITUTION_TEXT_FIELDS } from '@/components/admin/id-cards/institution-fields';
import {
  SUGGESTED_PURPOSES,
  slugifyPurposeKey,
  type TemplateAudience
} from '@/lib/id-cards/template-purpose';

export interface TemplateSelectionValue {
  /** null = loading, [] = none exist. Full list — inactive templates stay editable. */
  templates: TemplateDesignRow[] | null;
  selectedId: string;
  selected: TemplateDesignRow | null;
  setSelectedId: (id: string) => void;
  /** Re-fetch after any write so every tab's badges update together. */
  reload: () => Promise<void>;
  /** institutions.id → display name (for labels). */
  institutionName: (id: string | null | undefined) => string | null;
  institutions: Array<{ id: string; name: string }>;
  institutionsLoading: boolean;
}

const Ctx = createContext<TemplateSelectionValue | null>(null);

export function TemplateSelectionProvider({ children }: { children: ReactNode }) {
  const [templates, setTemplates] = useState<TemplateDesignRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    entityType: 'all'
  });

  const reload = useCallback(async () => {
    try {
      const rows = await fetchTemplatesWithLayout();
      setTemplates(rows);
      setSelectedId((prev) => pickPreferredAdminTemplateId(rows, prev));
    } catch (err) {
      console.error('[id-cards/template-editor] template load failed:', err);
      setTemplates([]);
      toast.error('Could not load templates');
    }
  }, []);

  useEffect(() => {
    // Deferred a tick so the initial fetch is not a synchronous setState in the
    // effect body (react-hooks/set-state-in-effect).
    const t = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(t);
  }, [reload]);

  const institutionName = useCallback(
    (id: string | null | undefined) =>
      id ? institutions.find((i) => i.id === id)?.name ?? null : null,
    [institutions]
  );

  const value = useMemo<TemplateSelectionValue>(
    () => ({
      templates,
      selectedId,
      selected: templates?.find((t) => t.id === selectedId) ?? null,
      setSelectedId,
      reload,
      institutionName,
      institutions: institutions.map((i) => ({ id: i.id, name: i.name })),
      institutionsLoading
    }),
    [templates, selectedId, reload, institutionName, institutions, institutionsLoading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTemplateSelection(): TemplateSelectionValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useTemplateSelection must be used inside TemplateSelectionProvider');
  }
  return v;
}

/** The ONE label format every picker uses: name · institution · purpose · (inactive). */
export function templateOptionLabel(
  t: TemplateDesignRow,
  institutionName: string | null
): string {
  const parts = [t.name ?? 'Untitled template'];
  parts.push(institutionName ?? (t.institution_id ? 'assigned' : 'no institution'));
  const purpose = purposeOf(t);
  parts.push(purpose.is_default ? `${purpose.label} (default)` : purpose.label);
  if (!t.active) parts.push('inactive');
  return parts.join(' · ');
}

/**
 * "New template" — name, institution, purpose, Active/Inactive. Creating an
 * active template never touches any other template's status.
 */
export function NewTemplateButton() {
  const { institutions, institutionsLoading, reload, setSelectedId } = useTemplateSelection();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [institutionId, setInstitutionId] = useState<string>('');
  const [purposeLabel, setPurposeLabel] = useState('Learners');
  const [audience, setAudience] = useState<TemplateAudience>('learner');
  const [isDefault, setIsDefault] = useState(false);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  // Institution details captured here too (one UI for the whole template).
  const [block, setBlock] = useState<TemplateInstitutionBlock>({});
  const [uploading, setUploading] = useState<'logo' | 'signature' | null>(null);
  const logoRef = useRef<HTMLInputElement | null>(null);
  const signatureRef = useRef<HTMLInputElement | null>(null);
  // Reserve the template id up front so logo/signature uploads have a path
  // before the row exists; the INSERT then uses the same id.
  const [draftId, setDraftId] = useState<string>(() => crypto.randomUUID());

  const setField = (key: keyof TemplateInstitutionBlock, value: string) =>
    setBlock((prev) => ({ ...prev, [key]: value }));

  // Choosing an institution prefills header/contacts/logo from its record —
  // editable here, saved on the template.
  const onInstitutionChange = async (id: string) => {
    setInstitutionId(id);
    if (!id) return;
    try {
      const defaults = await fetchInstitutionDefaults(id);
      setBlock((prev) => ({ ...defaults, ...Object.fromEntries(Object.entries(prev).filter(([, v]) => (v ?? '').trim() !== '')) }));
    } catch (err) {
      console.warn('[id-cards] institution defaults lookup failed:', err);
    }
  };

  const onUpload = async (kind: 'logo' | 'signature', file: File | undefined) => {
    if (!file) return;
    setUploading(kind);
    try {
      const url = await uploadCardAsset(draftId, kind, file);
      setField(kind === 'logo' ? 'logo_image' : 'principal_signature_image', url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
      if (kind === 'logo' && logoRef.current) logoRef.current.value = '';
      if (kind === 'signature' && signatureRef.current) signatureRef.current.value = '';
    }
  };

  const applySuggestion = (key: string) => {
    const s = SUGGESTED_PURPOSES.find((p) => p.key === key);
    if (!s) return;
    setPurposeLabel(s.label);
    setAudience(s.audience);
  };

  const onCreate = async () => {
    if (name.trim() === '') {
      toast.error('Give the template a name');
      return;
    }
    setBusy(true);
    try {
      const id = await createTemplate({
        id: draftId,
        name,
        institutionId: institutionId || null,
        purpose: {
          key: slugifyPurposeKey(purposeLabel),
          label: purposeLabel.trim() || 'Learners',
          audience,
          is_default: isDefault
        },
        active,
        institution: block
      });
      toast.success(active ? 'Template created and active' : 'Template created (inactive)');
      setOpen(false);
      setName('');
      setBlock({});
      setDraftId(crypto.randomUUID());
      await reload();
      setSelectedId(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create template');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        New template
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New ID-card template</DialogTitle>
            <DialogDescription>
              Everything for the template in one place: name, institution, purpose, status and
              the institution details printed on its cards. Artwork, back side and field
              mappings follow on the tabs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nt-name">Template name</Label>
              <Input
                id="nt-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Engineering Senior Learner — Tall (2026)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Institution</Label>
              <Select value={institutionId} onValueChange={(v) => void onInstitutionChange(v)} disabled={institutionsLoading}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={institutionsLoading ? 'Loading…' : 'Select institution'} />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Purpose (suggestions)</Label>
                <Select onValueChange={applySuggestion}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pick a common purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUGGESTED_PURPOSES.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nt-purpose">Purpose label</Label>
                <Input
                  id="nt-purpose"
                  value={purposeLabel}
                  onChange={(e) => setPurposeLabel(e.target.value)}
                  placeholder="Senior Learners"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Card audience</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as TemplateAudience)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="learner">Learners (roll no, course, study period)</SelectItem>
                  <SelectItem value="team_member">Team members (ID code, designation)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Institution details — prefilled from the institution record, saved on the template */}
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Institution details (printed on the card)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {INSTITUTION_TEXT_FIELDS.map((f) => (
                  <div key={f.key} className={`space-y-1 ${f.multiline ? 'sm:col-span-2' : ''}`}>
                    <Label htmlFor={`nt-inst-${f.key}`}>{f.label}</Label>
                    {f.multiline ? (
                      <Textarea
                        id={`nt-inst-${f.key}`}
                        rows={2}
                        value={block[f.key] ?? ''}
                        placeholder={f.placeholder}
                        onChange={(e) => setField(f.key, e.target.value)}
                      />
                    ) : (
                      <Input
                        id={`nt-inst-${f.key}`}
                        value={block[f.key] ?? ''}
                        placeholder={f.placeholder}
                        onChange={(e) => setField(f.key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ImageField
                  label="Institution logo"
                  url={block.logo_image}
                  busy={uploading === 'logo'}
                  disabled={busy || uploading !== null}
                  inputRef={logoRef}
                  onPick={(file) => void onUpload('logo', file)}
                  onClear={() => setField('logo_image', '')}
                  hint="Transparent PNG, square, at least 300×300."
                />
                <ImageField
                  label="Principal signature"
                  url={block.principal_signature_image}
                  busy={uploading === 'signature'}
                  disabled={busy || uploading !== null}
                  inputRef={signatureRef}
                  onPick={(file) => void onUpload('signature', file)}
                  onClear={() => setField('principal_signature_image', '')}
                  hint="Transparent PNG, wide (about 3:1), dark ink on nothing."
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Default for this audience</p>
                <p className="text-xs text-muted-foreground">
                  Used when the operator does not pick a purpose at print time.
                </p>
              </div>
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{active ? 'Active' : 'Inactive'}</p>
                <p className="text-xs text-muted-foreground">
                  Active templates are offered for ID-card generation. Inactive ones stay for
                  reference. Other templates are never changed by this.
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onCreate} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Shared picker rendered once above the tabs. */
export function TemplatePicker() {
  const { templates, selectedId, selected, setSelectedId, institutionName } =
    useTemplateSelection();
  if (templates === null) {
    return <span className="text-sm text-muted-foreground">Loading templates…</span>;
  }
  if (templates.length === 0) {
    return (
      <span className="flex items-center gap-3 text-sm text-muted-foreground">
        No templates exist yet.
        <NewTemplateButton />
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-muted-foreground">Template:</span>
      <Select value={selectedId} onValueChange={setSelectedId}>
        <SelectTrigger className="w-[26rem] max-w-full">
          <SelectValue placeholder="Choose a template" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {templateOptionLabel(t, institutionName(t.institution_id))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && !selected.active && (
        <Badge variant="destructive">Not switched on — will not be offered for printing</Badge>
      )}
      {selected && !selected.institution_id && (
        <Badge variant="outline">No institution assigned</Badge>
      )}
      <NewTemplateButton />
    </div>
  );
}
