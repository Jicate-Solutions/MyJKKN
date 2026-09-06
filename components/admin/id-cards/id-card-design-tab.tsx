'use client';

// ============================================================================
// IdCardDesignTab — "Card design" tab of the template editor.
// Created: 2026-07-24 — Canva-background workflow.
//
// Design the card artwork in any tool (Canva recommended), export 1014x638,
// upload here. The render engine prints the learner's name, photo, roll
// number and QR code ON TOP of the artwork. No artwork = the standard green
// JKKN design.
//
// Writes go straight to id_card_templates.front_layout_json.background_image
// via the session client (RLS: id_cards.templates.edit) — unlike the other
// two tabs, nothing here is stubbed.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  backgroundImageUrlOf,
  currentProfileId,
  fetchTemplatesWithLayout,
  setTemplateActive,
  setTemplateBackground,
  uploadCardBackground,
  type TemplateDesignRow
} from '@/lib/services/id-cards/template-design-client';
import { pickPreferredAdminTemplateId } from '@/lib/services/id-cards/template-picker';

export function IdCardDesignTab() {
  const [templates, setTemplates] = useState<TemplateDesignRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [busy, setBusy] = useState<
    'upload' | 'remove' | 'preview' | 'activate' | null
  >(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchTemplatesWithLayout();
      setTemplates(rows);
      // Admin keeps every template, dark ones included — you cannot design a
      // template you are not allowed to open. Only the DEFAULT prefers an
      // active one, so a test template no longer opens the tab by sort order.
      setSelectedId((prev) => pickPreferredAdminTemplateId(rows, prev));
    } catch (err) {
      console.error('[id-cards/design] template load failed:', err);
      setTemplates([]);
      toast.error('Could not load templates');
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Revoke stale blob URLs so previews don't leak memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selected = templates?.find((t) => t.id === selectedId) ?? null;
  const artworkUrl = selected ? backgroundImageUrlOf(selected) : null;

  const onUploadClick = () => fileInputRef.current?.click();

  const onFileChosen = async (file: File | null) => {
    if (!file || !selected) return;
    setBusy('upload');
    try {
      const url = await uploadCardBackground(selected.id, file);
      await setTemplateBackground(selected, url);
      toast.success('Card artwork saved — new prints use it immediately');
      setPreviewUrl(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onRemove = async () => {
    if (!selected) return;
    setBusy('remove');
    try {
      await setTemplateBackground(selected, null);
      toast.success('Artwork removed — cards use the standard design again');
      setPreviewUrl(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove artwork');
    } finally {
      setBusy(null);
    }
  };

  const onToggleActive = async (next: boolean) => {
    if (!selected) return;
    setBusy('activate');
    try {
      await setTemplateActive(selected, next);
      toast.success(
        next
          ? 'Template switched on — it now appears in every print picker'
          : 'Template switched off — it is no longer offered for printing'
      );
      await reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not change availability'
      );
    } finally {
      setBusy(null);
    }
  };

  const onPreview = async () => {
    if (!selected) return;
    setBusy('preview');
    try {
      const profileId = await currentProfileId();
      if (!profileId) throw new Error('No signed-in session found');
      const res = await fetch(
        `/api/id-cards/templates/${selected.id}/render?profile_id=${profileId}&format=png`
      );
      if (!res.ok) throw new Error(`Preview failed (HTTP ${res.status})`);
      const blob = await res.blob();
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(null);
    }
  };

  if (templates === null) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        No templates exist yet. Templates are created when the first card is
        set up — once one exists, its artwork is managed here.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Template picker */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Template:</span>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Choose a template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {(t.name ?? 'Untitled template') + (t.active ? '' : ' (inactive)')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && (
          <Badge variant={artworkUrl ? 'secondary' : 'outline'}>
            {artworkUrl ? 'Custom artwork' : 'Standard design'}
          </Badge>
        )}
        {selected && !selected.active && (
          <Badge variant="destructive">
            Not switched on — will not be offered for printing
          </Badge>
        )}
      </div>

      {/* Availability for printing */}
      <div className="flex items-center gap-3 rounded-md border p-4">
        <Switch
          checked={selected?.active ?? false}
          onCheckedChange={onToggleActive}
          disabled={busy !== null || !selected}
        />
        <div className="text-sm">
          <div className="font-medium">Available for printing</div>
          <div className="text-muted-foreground">
            Off = this template is hidden from every print picker — the office
            cannot choose it and cards cannot be queued against it. Design and
            preview keep working while it is off, so leave it off until the
            verification print looks right, then switch it on.
          </div>
        </div>
      </div>

      {/* Current artwork */}
      {artworkUrl ? (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Current artwork:</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artworkUrl}
            alt="Current card artwork"
            className="w-full max-w-xl rounded-lg border shadow-sm"
          />
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No artwork uploaded — cards print with the standard green JKKN
          design. Upload artwork to give this template its own look.
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
        />
        <Button onClick={onUploadClick} disabled={busy !== null || !selected}>
          {busy === 'upload' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-2 h-4 w-4" />
          )}
          {artworkUrl ? 'Replace artwork' : 'Upload artwork'}
        </Button>
        {artworkUrl && (
          <Button variant="outline" onClick={onRemove} disabled={busy !== null}>
            {busy === 'remove' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Remove artwork
          </Button>
        )}
        <Button variant="secondary" onClick={onPreview} disabled={busy !== null || !selected}>
          {busy === 'preview' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Eye className="mr-2 h-4 w-4" />
          )}
          Preview with my data
        </Button>
      </div>

      {/* Live preview */}
      {previewUrl && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            Preview (rendered exactly as the printer receives it):
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Card preview"
            className="w-full max-w-xl rounded-lg border shadow-sm"
          />
        </div>
      )}

      {/* Designer guidance */}
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <div className="mb-1 font-medium text-foreground">
          Designing artwork (Canva or any tool)
        </div>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Export exactly <strong>1014 × 638 pixels</strong> (credit-card
            landscape at print quality). PNG, JPEG or WebP, up to 6 MB.
          </li>
          <li>
            Keep these zones clear — data prints on top of the artwork:
            <strong> photo</strong> — left side, roughly the area from 36 px in
            and 28 px down, 300 wide × 380 tall; <strong>name and details</strong> —
            the upper-right half; <strong>QR code</strong> — bottom-right,
            150 × 150; <strong>valid-until</strong> — bottom-left.
          </li>
          <li>
            Use light backgrounds behind the text zones — the printed details
            are dark.
          </li>
        </ul>
      </div>
    </div>
  );
}
