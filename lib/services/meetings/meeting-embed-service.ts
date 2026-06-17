// lib/services/meetings/meeting-embed-service.ts
//
// Universal Booking M7 — "Embed + Theming" support layer.
//
// Two responsibilities, both deliberately tiny so this module is FULLY
// self-contained (no edits to the off-limits public read path):
//
//   1. readThemeColor(supabase, handle) — an ADDITIVE service-role read of
//      ONLY meeting_host_pages.theme_color for a handle. The embed page calls
//      PublicHostService.resolveBookableHost() for the authoritative D20
//      bookability decision, then calls this to layer the brand color on top.
//      Returns null when there is no row / no color (caller applies default).
//
//   2. buildEmbedSnippets(origin, handle) — the inline <iframe> and popup-
//      button HTML the admin page hands the host to paste on their website.
//      Pure string building, no I/O — kept here so the snippet shape has one
//      source of truth.
//
// Pattern: PublicHostService (service-role helpers for the public funnel).

import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[meet-embed]';

/** Platform default brand color (evergreen) — used when a host sets none. */
export const DEFAULT_THEME_COLOR = '#0E4D34';

/** Same validation as the DB CHECK — guards anything before it reaches CSS. */
export const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * Service-role read of a single host's theme color by handle.
 *
 * Additive to the existing public read: callers must STILL gate bookability
 * via PublicHostService.resolveBookableHost(). This never decides visibility —
 * it only returns a color (or null) for a handle that has already passed the
 * D20 gate. Fails closed (null) on any error so a read failure simply yields
 * the default color rather than breaking the page.
 */
export async function readThemeColor(
  supabase: SupabaseClient,
  handle: string,
): Promise<string | null> {
  const normalized = (handle ?? '').toLowerCase().trim();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('meeting_host_pages')
    .select('theme_color')
    .eq('handle', normalized)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} theme read failed for ${normalized}:`, error.message);
    return null;
  }

  const color = (data?.theme_color as string | null) ?? null;
  // Belt-and-braces: even though the DB CHECK enforces the format, never let a
  // surprising value flow into a CSS variable.
  return color && HEX_COLOR_RE.test(color) ? color : null;
}

export interface EmbedSnippets {
  /** The public booking URL the iframe points at. */
  embedUrl: string;
  /** Inline responsive iframe — drops the booking widget straight into a page. */
  iframe: string;
  /** A button that opens the booking widget in a centered popup window. */
  popupButton: string;
}

/**
 * Build the copy-paste embed snippets for a handle.
 *
 * `origin` is the deployment origin (e.g. https://www.jkkn.ai) — the admin
 * page passes window.location.origin so the snippet is always correct for the
 * environment the host is looking at, with no env-var dependency.
 */
export function buildEmbedSnippets(origin: string, handle: string): EmbedSnippets {
  const base = (origin || '').replace(/\/+$/, '');
  const safeHandle = (handle ?? '').toLowerCase().trim();
  const embedUrl = `${base}/embed/${safeHandle}`;

  const iframe = [
    `<iframe`,
    `  src="${embedUrl}"`,
    `  title="Book a meeting"`,
    `  width="100%"`,
    `  height="720"`,
    `  frameborder="0"`,
    `  style="border:0;min-width:320px;max-width:480px;"`,
    `  loading="lazy">`,
    `</iframe>`,
  ].join('\n');

  // Self-contained popup: no external script, opens a centered window.
  const popupButton = [
    `<button type="button"`,
    `  onclick="window.open('${embedUrl}','jkknBooking','width=460,height=760,menubar=no,toolbar=no')"`,
    `  style="background:#0E4D34;color:#fff;border:0;border-radius:8px;`,
    `padding:12px 20px;font:600 14px/1 system-ui,sans-serif;cursor:pointer;">`,
    `  Book a meeting`,
    `</button>`,
  ].join('\n');

  return { embedUrl, iframe, popupButton };
}
