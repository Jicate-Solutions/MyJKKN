'use client';

// ============================================================================
// TemplateSelection — ONE template list + ONE selected template shared by every
// tab of the ID-card template editor (Card design, Back side, Institution,
// Field mappings). Created: 2026-09-05.
//
// Before this each tab loaded its own list and kept its own selection, so the
// template being edited could differ from tab to tab, badges went stale after
// an activation toggle until reload, and every picker labelled rows differently.
//
// 2026-09-28 — institution first. The in-charge picks an INSTITUTION, and the
// template tiles, the selected template and therefore every tab (Card design,
// Back side, Institution, Field mappings) are scoped to that institution's
// templates only. When a template is re-assigned to another institution (on
// the Institution tab) or created for one, the filter follows it so the
// template being edited never disappears from view.
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
import { Building2, Check, Loader2, Plus } from 'lucide-react';
import {
  createTemplate,
  fetchInstitutionDefaults,
  purposeOf,
  setTemplateActive,
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

/** Institution filter values besides a real institutions.id. */
export const ALL_INSTITUTIONS = '__all__';
export const UNASSIGNED_INSTITUTION = '__none__';
const FILTER_STORAGE_KEY = 'id-cards.template-editor.institution';

/** Templates the institution filter lets through. (Exported for unit tests.) */
export function templatesForInstitution<T extends { institution_id: string | null }>(
  rows: readonly T[],
  filter: string
): T[] {
  if (!filter || filter === ALL_INSTITUTIONS) return [...rows];
  if (filter === UNASSIGNED_INSTITUTION) return rows.filter((r) => !r.institution_id);
  return rows.filter((r) => r.institution_id === filter);
}

/** The filter value a template belongs under. (Exported for unit tests.) */
export function filterValueOf(row: { institution_id: string | null }): string {
  return row.institution_id ?? UNASSIGNED_INSTITUTION;
}

function readStoredFilter(): string {
  try {
    return window.localStorage.getItem(FILTER_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
function storeFilter(value: string): void {
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, value);
  } catch {
    // private window / blocked storage — the filter still works for this visit
  }
}

export interface TemplateSelectionValue {
  /** null = loading, [] = none exist. Full list — inactive templates stay editable. */
  templates: TemplateDesignRow[] | null;
  /** The templates of the chosen institution (what the picker shows). */
  visibleTemplates: TemplateDesignRow[] | null;
  /** institutions.id, ALL_INSTITUTIONS or UNASSIGNED_INSTITUTION ('' = not chosen yet). */
  institutionFilter: string;
  setInstitutionFilter: (value: string) => void;
  selectedId: string;
  selected: TemplateDesignRow | null;
  /** Select a template; the institution filter follows it when needed. */
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
  const [selectedId, setSelectedIdRaw] = useState<string>('');
  const [institutionFilter, setFilterRaw] = useState<string>('');
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    entityType: 'all'
  });
  // Latest values for the async reload, without re-creating it.
  const rowsRef = useRef<TemplateDesignRow[]>([]);
  const filterRef = useRef('');
  const selectedRef = useRef('');

  const applyFilter = useCallback((value: string) => {
    filterRef.current = value;
    setFilterRaw(value);
    if (value) storeFilter(value);
  }, []);
  const applySelected = useCallback((id: string) => {
    selectedRef.current = id;
    setSelectedIdRaw(id);
  }, []);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchTemplatesWithLayout();
      rowsRef.current = rows;
      setTemplates(rows);

      let filter = filterRef.current;
      const prev = selectedRef.current;
      const prevRow = rows.find((r) => r.id === prev);

      if (!filter) {
        // First load: the remembered institution, else the one the preferred
        // template belongs to.
        const stored = readStoredFilter();
        const storedOk =
          stored === ALL_INSTITUTIONS ||
          stored === UNASSIGNED_INSTITUTION ||
          rows.some((r) => r.institution_id === stored);
        if (storedOk) filter = stored;
        else {
          const preferred = rows.find((r) => r.id === pickPreferredAdminTemplateId(rows, prev));
          filter = preferred ? filterValueOf(preferred) : ALL_INSTITUTIONS;
        }
      } else if (
        prevRow &&
        filter !== ALL_INSTITUTIONS &&
        filterValueOf(prevRow) !== filter
      ) {
        // The template being edited moved to another institution — follow it.
        filter = filterValueOf(prevRow);
      }
      if (filter !== filterRef.current) applyFilter(filter);

      applySelected(pickPreferredAdminTemplateId(templatesForInstitution(rows, filter), prev));
    } catch (err) {
      console.error('[id-cards/template-editor] template load failed:', err);
      setTemplates([]);
      toast.error('Could not load templates');
    }
  }, [applyFilter, applySelected]);

  const setInstitutionFilter = useCallback(
    (value: string) => {
      applyFilter(value);
      applySelected(
        pickPreferredAdminTemplateId(
          templatesForInstitution(rowsRef.current, value),
          selectedRef.current
        )
      );
    },
    [applyFilter, applySelected]
  );

  const setSelectedId = useCallback(
    (id: string) => {
      const row = rowsRef.current.find((r) => r.id === id);
      const filter = filterRef.current;
      if (row && filter !== ALL_INSTITUTIONS && filterValueOf(row) !== filter) {
        applyFilter(filterValueOf(row));
      }
      applySelected(id);
    },
    [applyFilter, applySelected]
  );

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

  const visibleTemplates = useMemo(
    () => (templates ? templatesForInstitution(templates, institutionFilter) : null),
    [templates, institutionFilter]
  );

  const value = useMemo<TemplateSelectionValue>(
    () => ({
      templates,
      visibleTemplates,
      institutionFilter,
      setInstitutionFilter,
      selectedId,
      selected: visibleTemplates?.find((t) => t.id === selectedId) ?? null,
      setSelectedId,
      reload,
      institutionName,
      institutions: institutions
        .map((i) => ({ id: i.id, name: i.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      institutionsLoading
    }),
    [
      templates,
      visibleTemplates,
      institutionFilter,
      setInstitutionFilter,
      selectedId,
      setSelectedId,
      reload,
      institutionName,
      institutions,
      institutionsLoading
    ]
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
export function NewTemplateButton({ variant = 'button' }: { variant?: 'button' | 'tile' }) {
  const { institutions, institutionsLoading, reload, setSelectedId, institutionFilter } =
    useTemplateSelection();
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

  // Open pre-set to the institution being viewed (its details prefilled).
  const openDialog = () => {
    setOpen(true);
    const current =
      institutionFilter &&
      institutionFilter !== ALL_INSTITUTIONS &&
      institutionFilter !== UNASSIGNED_INSTITUTION
        ? institutionFilter
        : '';
    if (current && current !== institutionId) {
      // Fresh prefill for the institution being viewed — no leftovers from a
      // cancelled draft for another institution.
      setBlock({});
      void onInstitutionChange(current);
    }
  };

  return (
    <>
      {variant === 'tile' ? (
        <button
          type="button"
          onClick={openDialog}
          className="flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="h-5 w-5" />
          New template
        </button>
      ) : (
        <Button variant="outline" size="sm" onClick={openDialog}>
          <Plus className="mr-2 h-4 w-4" />
          New template
        </Button>
      )}
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

/**
 * Shared picker rendered once above the tabs: INSTITUTION first, then that
 * institution's templates as tiles, with the selected template's Active switch
 * — so a template can be switched on from ANY tab (2026-09-08). `trailing`
 * renders at the right of the header (the printer-sides badge).
 */
export function TemplatePicker({ trailing }: { trailing?: ReactNode }) {
  const {
    templates,
    visibleTemplates,
    institutionFilter,
    setInstitutionFilter,
    selectedId,
    selected,
    setSelectedId,
    institutionName,
    institutions,
    institutionsLoading,
    reload
  } = useTemplateSelection();
  const [activeBusy, setActiveBusy] = useState(false);

  const counts = useMemo(() => {
    const m = new Map<string, { total: number; active: number }>();
    for (const t of templates ?? []) {
      const key = filterValueOf(t);
      const c = m.get(key) ?? { total: 0, active: 0 };
      c.total += 1;
      if (t.active) c.active += 1;
      m.set(key, c);
    }
    return m;
  }, [templates]);
  const unassigned = counts.get(UNASSIGNED_INSTITUTION)?.total ?? 0;

  const onToggleActive = async (next: boolean) => {
    if (!selected) return;
    setActiveBusy(true);
    try {
      await setTemplateActive(selected, next);
      toast.success(
        next
          ? 'Template switched on — it now appears in every print picker'
          : 'Template switched off — it is no longer offered for printing'
      );
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change availability');
    } finally {
      setActiveBusy(false);
    }
  };

  const filterLabel =
    institutionFilter === ALL_INSTITUTIONS
      ? 'all institutions'
      : institutionFilter === UNASSIGNED_INSTITUTION
        ? 'templates with no institution'
        : institutionName(institutionFilter) ?? 'this institution';
  const shown = visibleTemplates ?? [];
  const shownActive = shown.filter((t) => t.active).length;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b bg-muted/30 px-4 py-3">
        <div className="min-w-[260px] flex-1 space-y-1.5 sm:max-w-md">
          <Label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" /> Institution
          </Label>
          <Select
            value={institutionFilter || undefined}
            onValueChange={setInstitutionFilter}
            disabled={institutionsLoading || templates === null}
          >
            <SelectTrigger className="h-10 bg-background">
              <SelectValue placeholder={institutionsLoading ? 'Loading institutions…' : 'Select institution'} />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((i) => {
                const c = counts.get(i.id);
                return (
                  <SelectItem key={i.id} value={i.id}>
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="truncate">{i.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c ? `${c.total} template${c.total === 1 ? '' : 's'}` : 'none yet'}
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
              {unassigned > 0 && (
                <SelectItem value={UNASSIGNED_INSTITUTION}>
                  No institution assigned ({unassigned})
                </SelectItem>
              )}
              <SelectItem value={ALL_INSTITUTIONS}>All institutions</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {templates !== null && (
            <span className="rounded-full border bg-background px-2.5 py-1 tabular-nums">
              {shown.length} template{shown.length === 1 ? '' : 's'} · {shownActive} active
            </span>
          )}
          {trailing}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {templates === null ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[92px] animate-pulse rounded-xl border bg-muted/40" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((t) => {
              const purpose = purposeOf(t);
              const isSel = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  aria-pressed={isSel}
                  className={`relative flex min-h-[92px] flex-col justify-between gap-2 rounded-xl border p-3 text-left transition-all hover:border-primary/50 hover:shadow-sm ${
                    isSel ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : 'bg-background'
                  }`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-medium leading-snug">
                      {t.name ?? 'Untitled template'}
                    </span>
                    {isSel && (
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                        t.active
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${t.active ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
                      {t.active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                      {purpose.label}
                      {purpose.is_default ? ' · default' : ''}
                    </span>
                    {institutionFilter === ALL_INSTITUTIONS && (
                      <span className="truncate text-muted-foreground">
                        {institutionName(t.institution_id) ?? 'No institution'}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            <NewTemplateButton variant="tile" />
          </div>
        )}

        {templates !== null && shown.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No templates for {filterLabel} yet. Use <strong>New template</strong> to create one —
            its details are prefilled from the institution record.
          </p>
        )}

        {selected && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Editing</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {templateOptionLabel(selected, institutionName(selected.institution_id))}
            </span>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={selected.active}
                onCheckedChange={(v) => void onToggleActive(v)}
                disabled={activeBusy}
                aria-label="Template active"
              />
              <span className="font-medium">{selected.active ? 'Active' : 'Inactive'}</span>
              {activeBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </label>
            {!selected.active && (
              <Badge variant="destructive">Not switched on — will not be offered for printing</Badge>
            )}
            {!selected.institution_id && <Badge variant="outline">No institution assigned</Badge>}
          </div>
        )}
      </div>
    </div>
  );
}
