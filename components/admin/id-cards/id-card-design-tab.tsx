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
  sampleLearnerProfileId,
  setTemplateActive,
  setTemplateBackground,
  uploadCardBackground,
  type TemplateDesignRow
} from '@/lib/services/id-cards/template-design-client';
import { useTemplateSelection } from '@/components/admin/id-cards/template-selection';

export function IdCardDesignTab() {
  // Shared with every other tab (one list, one selected template).
  const { templates, selectedId, selected, reload } = useTemplateSelection();
  const [busy, setBusy] = useState<
    'upload' | 'remove' | 'preview' | 'activate' | null
  >(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Revoke stale blob URLs so previews don't leak memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const artworkUrl = selected ? backgroundImageUrlOf(selected) : null;
  const orientation = (selected?.front_layout_json as Record<string, unknown> | null | undefined)?.orientation;
  const isPortraitTemplate = orientation === 'portrait' || orientation === 'portrait-flipped';

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
      await renderPreview(profileId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(null);
    }
  };

  /** Preview with a real learner of the template's institution — shows the
   *  learner-only zones (roll no, study period) an admin account never has. */
  const onPreviewLearner = async () => {
    if (!selected) return;
    setBusy('preview');
    try {
      const profileId = await sampleLearnerProfileId(selected.institution_id);
      if (!profileId) {
        throw new Error(
          selected.institution_id
            ? 'No learner with an account found for this template’s institution'
            : 'Assign the template to an institution first (Institution tab)'
        );
      }
      await renderPreview(profileId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(null);
    }
  };

  const renderPreview = async (profileId: string) => {
    if (!selected) return;
    {
      const res = await fetch(
        `/api/id-cards/templates/${selected.id}/render?profile_id=${profileId}&format=png&upright=1`
      );
      if (!res.ok) throw new Error(`Preview failed (HTTP ${res.status})`);
      const blob = await res.blob();
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
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
        {selected && (
          <Badge variant={artworkUrl ? 'secondary' : 'outline'}>
            {artworkUrl ? 'Custom artwork' : 'Standard design'}
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
        <Button variant="secondary" onClick={onPreviewLearner} disabled={busy !== null || !selected}>
          {busy === 'preview' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Eye className="mr-2 h-4 w-4" />
          )}
          Preview with a learner
        </Button>
      </div>

      {/* Live preview */}
      {previewUrl && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            Preview (upright, exactly as designed — the printer receives the same card turned to its landscape canvas):
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
            Export at the card&apos;s own size —{' '}
            <strong>{isPortraitTemplate ? '638 × 1014' : '1014 × 638'} pixels</strong> (or any
            exact multiple). The artwork is used edge to edge exactly as uploaded: nothing is
            cropped and no frame is added, so draw the border in the artwork itself. An export
            with a different aspect ratio is fitted inside the card with white margins rather
            than cut. PNG, JPEG or WebP, up to 6 MB.
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
