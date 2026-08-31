'use client';

// ============================================================================
// IdCardBackDesignTab — "Back side" tab of the template editor.
// Created: 2026-07-25. Wired into IdCardTemplateEditor: 2026-08-25.
//
// It shipped export-only — no caller anywhere in the repo — so for a month
// the back of a card could not be seen or edited from any screen, even after
// templates started carrying a back layout. It is now the editor's third tab
// and is always shown; the printer policy's `sides` value does not gate it
// (nothing in the render or print path reads `sides` — the render route and
// /jobs/[id]/pickup both key off this template's own back_layout_json).
//
// Mirrors IdCardDesignTab exactly (session client + RLS, same bucket), plus
// an enable/disable control: back_layout_json null = off, {} = on with the
// default back design (blood group, date of birth, guardian, address,
// Code 39 barcode of the roll number / team-member id, green footer band).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  backEnabledOf,
  backImageUrlOf,
  currentProfileId,
  fetchTemplatesWithLayout,
  setTemplateBackEnabled,
  setTemplateBackBackground,
  uploadCardBackBackground,
  type TemplateDesignRow
} from '@/lib/services/id-cards/template-design-client';
import { pickPreferredAdminTemplateId } from '@/lib/services/id-cards/template-picker';

export function IdCardBackDesignTab() {
  const [templates, setTemplates] = useState<TemplateDesignRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [busy, setBusy] = useState<'toggle' | 'upload' | 'remove' | 'preview' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchTemplatesWithLayout();
      setTemplates(rows);
      // Full list stays (dark templates must be designable); only the default
      // prefers an active template.
      setSelectedId((prev) => pickPreferredAdminTemplateId(rows, prev));
    } catch (err) {
      console.error('[id-cards/back-design] template load failed:', err);
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
  const backEnabled = selected ? backEnabledOf(selected) : false;
  const artworkUrl = selected ? backImageUrlOf(selected) : null;

  const onToggleBack = async (enabled: boolean) => {
    if (!selected) return;
    setBusy('toggle');
    try {
      await setTemplateBackEnabled(selected, enabled);
      toast.success(
        enabled
          ? 'Back side turned on — new prints of this template can render a back'
          : 'Back side turned off — its back configuration was discarded'
      );
      setPreviewUrl(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the template');
    } finally {
      setBusy(null);
    }
  };

  const onUploadClick = () => fileInputRef.current?.click();

  const onFileChosen = async (file: File | null) => {
    if (!file || !selected) return;
    setBusy('upload');
    try {
      const url = await uploadCardBackBackground(selected.id, file);
      await setTemplateBackBackground(selected, url);
      toast.success('Back artwork saved');
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
      await setTemplateBackBackground(selected, null);
      toast.success('Back artwork removed — the standard back design is used again');
      setPreviewUrl(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove artwork');
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
        `/api/id-cards/templates/${selected.id}/render?profile_id=${profileId}&format=png&side=back`
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
        set up — once one exists, its back side is managed here.
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
          <Badge variant={backEnabled ? 'secondary' : 'outline'}>
            {backEnabled ? 'Back side on' : 'Back side off'}
          </Badge>
        )}
        {selected && !selected.active && (
          <Badge variant="destructive">
            Not switched on — will not be offered for printing
          </Badge>
        )}
      </div>

      {/* Enable / disable */}
      <div className="flex items-center gap-3 rounded-md border p-4">
        <Switch
          checked={backEnabled}
          onCheckedChange={onToggleBack}
          disabled={busy !== null || !selected}
        />
        <div className="text-sm">
          <div className="font-medium">Print a back side for this template</div>
          <div className="text-muted-foreground">
            Off = cards stay front-only (today&apos;s behavior). Turning it off
            again discards the back configuration below.
          </div>
        </div>
      </div>

      {backEnabled && (
        <>
          {/* Current artwork */}
          {artworkUrl ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Current back artwork:</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={artworkUrl}
                alt="Current back artwork"
                className="w-full max-w-xl rounded-lg border shadow-sm"
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No back artwork uploaded — the back prints the standard design:
              blood group, date of birth, guardian, address, the learner&apos;s
              roll number as a scannable barcode (team members: their id
              code), and the green footer band.
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
              {artworkUrl ? 'Replace back artwork' : 'Upload back artwork'}
            </Button>
            {artworkUrl && (
              <Button variant="outline" onClick={onRemove} disabled={busy !== null}>
                {busy === 'remove' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Remove back artwork
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={onPreview}
              disabled={busy !== null || !selected}
            >
              {busy === 'preview' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Preview back with my data
            </Button>
          </div>

          {/* Live preview */}
          {previewUrl && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Back preview (rendered exactly as the printer would receive it):
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Card back preview"
                className="w-full max-w-xl rounded-lg border shadow-sm"
              />
            </div>
          )}

          {/* Designer guidance */}
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">
              Designing back artwork (Canva or any tool)
            </div>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Export exactly <strong>1014 × 638 pixels</strong>. PNG, JPEG or
                WebP, up to 6 MB.
              </li>
              <li>
                With artwork present the green footer band is not drawn — the
                artwork is the full design. Data blocks still print on top,
                so keep the upper-left area (details) and the lower-middle
                (barcode) clear.
              </li>
              <li>
                Printing itself is still front-only today — the back renders
                for preview and future duplex support.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
