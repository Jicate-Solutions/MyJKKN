'use client';

// app/(routes)/meetings/embed/_components/embed-manager.tsx
//
// Universal Booking M7 — interactive client for the admin "Embed & Theming"
// page. Two cards:
//   1. Brand color — native color input + hex field + 6 swatches + live
//      preview rule; Save persists via the saveMyThemeColor server action.
//   2. Embed code — copy-paste <iframe> + popup-button snippets built from
//      window.location.origin (so the URL is always right for this env) and
//      the host's handle.
//
// Hooks-order safety: every hook is declared unconditionally at the top,
// before any early return (feedback memory hooks_order_runtime_crash_passes_ci).

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Check, Copy, ExternalLink, Loader2, Palette } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_THEME_COLOR,
  HEX_COLOR_RE,
  buildEmbedSnippets,
} from '@/lib/services/meetings/meeting-embed-service';

import { getMyEmbedState, saveMyThemeColor, type MyEmbedState } from '../actions';

// A few on-brand presets to make picking effortless.
const PRESETS = ['#0E4D34', '#1D4ED8', '#7C3AED', '#B91C1C', '#B45309', '#0F766E'];

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Could not copy — please select and copy manually.');
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
      {copied ? 'Copied' : `Copy ${label}`}
    </Button>
  );
}

export function EmbedManager() {
  const [state, setState] = useState<MyEmbedState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [color, setColor] = useState<string>(DEFAULT_THEME_COLOR);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState('');

  // Load the host's saved embed state once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getMyEmbedState();
      if (!alive) return;
      if (!res.success || !res.data) {
        setLoadError(res.error ?? 'Could not load your embed settings.');
      } else {
        setState(res.data);
        setColor(res.data.themeColor ?? DEFAULT_THEME_COLOR);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Resolve the deployment origin client-side so the snippet is always correct
  // for whatever environment the host is viewing (prod / preview / local).
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const handle = state?.handle ?? null;
  const validColor = HEX_COLOR_RE.test(color);
  const snippets = useMemo(
    () => (handle && origin ? buildEmbedSnippets(origin, handle) : null),
    [handle, origin],
  );

  async function save() {
    if (!validColor) {
      toast.error('Please enter a valid color like #0E4D34.');
      return;
    }
    setSaving(true);
    const res = await saveMyThemeColor(color);
    setSaving(false);
    if (!res.success || !res.data) {
      toast.error(res.error ?? 'Could not save your brand color.');
      return;
    }
    setState(res.data);
    setColor(res.data.themeColor ?? DEFAULT_THEME_COLOR);
    toast.success('Brand color saved.');
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" aria-hidden />
          Loading your embed settings…
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive/60" aria-hidden />
          <h3 className="text-sm font-medium">Couldn&apos;t load your embed settings</h3>
          <p className="max-w-md text-xs text-muted-foreground">{loadError}</p>
        </CardContent>
      </Card>
    );
  }

  // No public page row yet → can't theme or embed until the host opts in.
  if (!handle) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/50" aria-hidden />
          <h3 className="text-sm font-medium">Set up your booking page first</h3>
          <p className="max-w-md text-xs text-muted-foreground">
            Create your public booking page in{' '}
            <strong>Meetings → My Availability</strong> (choose a handle and turn it
            public). Once it&apos;s live you can choose a brand color and grab your
            embed code here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Brand color ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" aria-hidden /> Brand color
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            This color is used on your public booking widget — buttons, the
            selected time, and the header rule.
          </p>

          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Pick brand color"
              value={validColor ? color : DEFAULT_THEME_COLOR}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-12 cursor-pointer rounded border border-input bg-background p-0.5"
            />
            <div className="flex-1">
              <Label htmlFor="hex" className="sr-only">
                Hex color
              </Label>
              <Input
                id="hex"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#0E4D34"
                maxLength={7}
                spellCheck={false}
                className={validColor ? '' : 'border-destructive focus-visible:ring-destructive'}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                aria-label={`Use ${p}`}
                onClick={() => setColor(p)}
                className="h-7 w-7 rounded-full border border-black/10 transition-transform hover:scale-110"
                style={{ backgroundColor: p, outline: color.toLowerCase() === p.toLowerCase() ? '2px solid #1C2B24' : 'none', outlineOffset: '2px' }}
              />
            ))}
          </div>

          {/* Live preview rule + button */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-3 h-2 w-full rounded-full" style={{ backgroundColor: validColor ? color : DEFAULT_THEME_COLOR }} />
            <span
              className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold text-white"
              style={{ backgroundColor: validColor ? color : DEFAULT_THEME_COLOR }}
            >
              Confirm booking
            </span>
            <p className="mt-2 text-[11px] text-muted-foreground">Preview</p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setColor(DEFAULT_THEME_COLOR)}>
              Reset to default
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving || !validColor}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Save color
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Embed code ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ExternalLink className="h-4 w-4" aria-hidden /> Embed on your website
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!state?.isPublic && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Your booking page isn&apos;t public yet, so the embed will show a
                &ldquo;not found&rdquo; page to visitors. Make it public in{' '}
                <strong>My Availability</strong> first.
              </span>
            </div>
          )}

          {snippets && (
            <>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-xs font-medium">Public link</Label>
                  <CopyButton label="link" value={snippets.embedUrl} />
                </div>
                <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs">
                  {snippets.embedUrl}
                </code>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-xs font-medium">Inline iframe</Label>
                  <CopyButton label="iframe" value={snippets.iframe} />
                </div>
                <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-[11px] leading-relaxed">
                  {snippets.iframe}
                </pre>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-xs font-medium">Popup button</Label>
                  <CopyButton label="button" value={snippets.popupButton} />
                </div>
                <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-[11px] leading-relaxed">
                  {snippets.popupButton}
                </pre>
              </div>

              <a
                href={snippets.embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Preview the embed
              </a>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
