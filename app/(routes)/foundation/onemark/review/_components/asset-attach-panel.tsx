'use client';

// OneMark Wave 3 Lane D — "Attach diagram", inside the review queue.
//
// Where this lives and why: the Wave 1 item-author dialog is off-limits to
// this lane, and a Physics circuit is attached by the same person who is
// already reading the draft. So the attach step sits on the draft card in the
// review queue — one panel per draft, dropped in with
//
//     <AssetAttachPanel itemId={draft.id} onBlockingChange={setPictureBlocks} />
//
// and nothing else on the card changes.
//
// RULING #4, in three places at once:
//   • ANY holder of foundation.items.manage may attach — this panel is shown
//     to whoever can open the queue, not only to the approver;
//   • the approver still ticks the item afterwards — attaching approves
//     nothing;
//   • alt text is MANDATORY: Attach is disabled without it, the API refuses
//     without it, and `onBlockingChange(true)` tells the card to hold Approve
//     while any attached picture has no description.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ALT_TEXT_BLOCKER, altTextProblem, assetApprovalBlockers } from '@/lib/onemark/assets/approval';
import {
  ONEMARK_ALT_TEXT_MAX_LENGTH,
  ONEMARK_ASSET_MAX_BYTES,
} from '@/lib/onemark/assets/constants';
import type { QuestionAssetRow } from '@/lib/onemark/assets/render';

interface PanelAsset extends QuestionAssetRow {
  storage_path?: string | null;
}

export interface AssetAttachPanelProps {
  /** fp_items.id of the draft on the card. */
  itemId: string;
  /** Fired whenever the blocking state changes, so the card can disable
   *  Approve and name what is missing (ruling #4). */
  onBlockingChange?: (blockers: string[]) => void;
  className?: string;
}

export function AssetAttachPanel({ itemId, onBlockingChange, className }: AssetAttachPanelProps) {
  const [assets, setAssets] = useState<PanelAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const notify = useRef(onBlockingChange);
  notify.current = onBlockingChange;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/foundation/onemark/assets?item_id=${encodeURIComponent(itemId)}`, {
        cache: 'no-store',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `assets ${res.status}`);
      setAssets(Array.isArray(body?.assets) ? body.assets : []);
      setLoadError(null);
    } catch (err) {
      setAssets([]);
      setLoadError(err instanceof Error ? err.message : 'Could not read the pictures on this question.');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    notify.current?.(assetApprovalBlockers(assets));
  }, [assets]);

  const altProblem = altTextProblem(altText);
  const canAttach = !!file && !altProblem && !busy;

  async function attach() {
    if (!file || altProblem) return;
    if (file.size > ONEMARK_ASSET_MAX_BYTES) {
      toast.error('That picture is larger than 2 MB. Export it smaller and try again.');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set('item_id', itemId);
      form.set('alt_text', altText.trim());
      form.set('sort_order', String(assets.length + 1));
      form.set('file', file);
      const res = await fetch('/api/foundation/onemark/assets', { method: 'POST', body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Attach failed (${res.status})`);
      toast.success('Picture attached. The approver still has to tick this question.');
      setFile(null);
      setAltText('');
      if (fileInput.current) fileInput.current.value = '';
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not attach the picture.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(assetId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/foundation/onemark/assets/${assetId}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Remove failed (${res.status})`);
      toast.success('Picture removed from this question.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the picture.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAlt(assetId: string, value: string) {
    const problem = altTextProblem(value);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/foundation/onemark/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt_text: value.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Save failed (${res.status})`);
      toast.success('Description saved.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the description.');
    } finally {
      setBusy(false);
    }
  }

  const blockers = assetApprovalBlockers(assets);

  return (
    <div className={cn('rounded-lg border border-border bg-muted/20 p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Attach diagram</h4>
        <span className="text-xs text-muted-foreground">PNG or SVG, up to 2 MB</span>
      </div>

      {blockers.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            This question cannot be approved until it has {ALT_TEXT_BLOCKER}. Every picture needs a
            sentence saying what it shows.
          </span>
        </p>
      )}

      {loading && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Reading the pictures on this question…
        </p>
      )}

      {loadError && !loading && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          <p>{loadError}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !loadError && assets.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          No picture on this question yet.
        </p>
      )}

      {assets.length > 0 && (
        <ul className="mt-3 space-y-3">
          {assets.map((a) => (
            <AttachedAsset
              key={a.id}
              asset={a}
              busy={busy}
              onSaveAlt={(v) => void saveAlt(a.id, v)}
              onRemove={() => void remove(a.id)}
            />
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2 border-t border-border pt-4">
        <Label htmlFor={`asset-file-${itemId}`} className="text-xs">
          Picture
        </Label>
        <Input
          id={`asset-file-${itemId}`}
          ref={fileInput}
          type="file"
          accept="image/png,image/svg+xml"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Label htmlFor={`asset-alt-${itemId}`} className="text-xs">
          What the picture shows (required)
        </Label>
        <Textarea
          id={`asset-alt-${itemId}`}
          value={altText}
          maxLength={ONEMARK_ALT_TEXT_MAX_LENGTH}
          disabled={busy}
          placeholder="A circuit with two resistors in parallel across a 6 V cell, joined to a third in series."
          onChange={(e) => setAltText(e.target.value)}
          className="min-h-[64px] text-sm"
        />
        {file && altProblem && <p className="text-xs text-muted-foreground">{altProblem}</p>}
        <Button type="button" size="sm" disabled={!canAttach} onClick={() => void attach()}>
          {busy ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          )}
          Attach
        </Button>
      </div>
    </div>
  );
}

function AttachedAsset({
  asset,
  busy,
  onSaveAlt,
  onRemove,
}: {
  asset: PanelAsset;
  busy: boolean;
  onSaveAlt: (value: string) => void;
  onRemove: () => void;
}) {
  const [draftAlt, setDraftAlt] = useState(asset.alt_text ?? '');
  useEffect(() => {
    setDraftAlt(asset.alt_text ?? '');
  }, [asset.alt_text]);
  const dirty = draftAlt.trim() !== (asset.alt_text ?? '').trim();
  const problem = altTextProblem(draftAlt);

  return (
    <li className="flex gap-3 rounded-md border border-border bg-background p-3">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded border border-border bg-white">
        {asset.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a 60-second
          // signed URL on a private bucket cannot go through the optimiser.
          <img src={asset.url} alt={asset.alt_text ?? ''} className="h-full w-full object-contain" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
            no preview
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <Textarea
          value={draftAlt}
          maxLength={ONEMARK_ALT_TEXT_MAX_LENGTH}
          disabled={busy}
          onChange={(e) => setDraftAlt(e.target.value)}
          className="min-h-[56px] text-sm"
        />
        {problem && <p className="text-xs text-amber-600 dark:text-amber-400">{problem}</p>}
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !dirty || !!problem}
            onClick={() => onSaveAlt(draftAlt)}
          >
            Save description
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
            <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Remove
          </Button>
        </div>
      </div>
    </li>
  );
}

export default AssetAttachPanel;
