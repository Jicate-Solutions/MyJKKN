// ============================================================================
// lib/services/id-cards/card-preview-client.ts
// Created: 2026-09-05 — ID-card preview-before-print.
//
// Browser-side helpers that turn the render endpoint into preview material:
//   • renderCardSide()        — one side of one card as a PNG data URL; the
//                               front call also carries the per-field
//                               missing-data report + orientation + the
//                               institution provenance (include=fields).
//   • renderLearnerCards()    — front (+ back when the template has it) for a
//                               list of learners, EACH with its own template,
//                               bounded concurrency, progress callback.
//   • resolveLearnerInstitutions() — learners_profiles.id → institution_id so
//                               the dialog can pick each learner's own
//                               institution's template.
//
// The PNG is the SAME bytes the Windows print bridge downloads, so what the
// preview shows is exactly what a printer receives. That canvas is always
// landscape 1014x638; portrait templates are rotated INTO it, so the preview
// and the A4 sheet counter-rotate by `frontRotation` / `backRotation`.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { missingFields, problemFields } from '@/lib/id-cards/field-report';
import type { CardFieldReport } from '@/types/id-cards';

export type CardSide = 'front' | 'back';
export type CardOrientationLabel = 'landscape' | 'portrait' | 'portrait-flipped';

type RenderEnvelope = {
  data?: {
    png_base64: string;
    back_configured?: boolean;
    fields?: CardFieldReport[];
    front_orientation?: CardOrientationLabel;
    back_orientation?: CardOrientationLabel | null;
    template_institution_id?: string | null;
    learner_institution_id?: string | null;
    institution_name?: string | null;
  };
  error?: { message?: string; code?: string };
};

export type RenderSideResult =
  | {
      ok: true;
      pngDataUrl: string;
      fields: CardFieldReport[] | null;
      backConfigured: boolean | null;
      frontOrientation: CardOrientationLabel;
      backOrientation: CardOrientationLabel | null;
      templateInstitutionId: string | null;
      learnerInstitutionId: string | null;
      institutionName: string | null;
    }
  | { ok: false; code: string; message: string };

/**
 * Degrees to turn the landscape render so the card reads upright.
 * 'portrait' composes +90° (clockwise) into the canvas → undo with −90°.
 */
export function rotationFor(orientation: CardOrientationLabel | null | undefined): number {
  if (orientation === 'portrait') return -90;
  if (orientation === 'portrait-flipped') return 90;
  return 0;
}

/**
 * Render one side of one card. `includeFields` asks the server for the
 * missing-data report (front side only — the report covers both sides).
 */
export async function renderCardSide(
  templateId: string,
  profileId: string,
  side: CardSide,
  includeFields = false
): Promise<RenderSideResult> {
  const params = new URLSearchParams({ profile_id: profileId, side });
  if (includeFields) params.set('include', 'fields');
  try {
    const res = await fetch(
      `/api/id-cards/templates/${templateId}/render?${params.toString()}`,
      { cache: 'no-store' }
    );
    let body: RenderEnvelope | null = null;
    try {
      body = (await res.json()) as RenderEnvelope;
    } catch {
      body = null;
    }
    if (!res.ok || !body?.data?.png_base64) {
      return {
        ok: false,
        code: body?.error?.code ?? `http_${res.status}`,
        message: body?.error?.message ?? `Render failed (HTTP ${res.status})`
      };
    }
    const d = body.data;
    return {
      ok: true,
      pngDataUrl: `data:image/png;base64,${d.png_base64}`,
      fields: d.fields ?? null,
      backConfigured: typeof d.back_configured === 'boolean' ? d.back_configured : null,
      frontOrientation: d.front_orientation ?? 'landscape',
      backOrientation: d.back_orientation ?? null,
      templateInstitutionId: d.template_institution_id ?? null,
      learnerInstitutionId: d.learner_institution_id ?? null,
      institutionName: d.institution_name ?? null
    };
  } catch (err) {
    return {
      ok: false,
      code: 'network_error',
      message: err instanceof Error ? err.message : 'Network error'
    };
  }
}

export interface PreviewLearnerInput {
  /** learners_profiles.id — used as the stable key in results. */
  learnerId: string;
  /** profiles.id — what the render endpoint needs. */
  profileId: string;
  /** The template THIS learner renders with (their institution's active one). */
  templateId: string;
  templateName?: string | null;
  name: string;
  rollNumber?: string | null;
}

export interface RenderedCard {
  learnerId: string;
  profileId: string;
  templateId: string;
  templateName: string | null;
  name: string;
  rollNumber: string | null;
  frontDataUrl: string;
  /** null when the template has no back side configured. */
  backDataUrl: string | null;
  /** Degrees to rotate the landscape render so the card reads upright. */
  frontRotation: number;
  backRotation: number;
  fields: CardFieldReport[];
  /** Fields the card would print blank — highlighted red in the preview. */
  missing: CardFieldReport[];
  /**
   * Fields present but flagged wrong (the permanent address per the Address
   * Check rules) — highlighted red like a blank, with the finding named.
   */
  problems: CardFieldReport[];
  /** institutions.id the template belongs to (null = shared template). */
  templateInstitutionId: string | null;
  /** institutions.id the learner's details were read from. */
  learnerInstitutionId: string | null;
  institutionName: string | null;
  /** Template is pinned to a DIFFERENT institution than the learner's. */
  institutionMismatch: boolean;
}

export interface RenderFailure {
  learnerId: string;
  name: string;
  message: string;
}

export interface RenderLearnerCardsResult {
  cards: RenderedCard[];
  failed: RenderFailure[];
  /** True when at least one rendered card has a back side. */
  hasBacks: boolean;
}

// Each render is a server-side composite (~0.3–1 s). Four in flight keeps a
// 60-card class at a few tens of seconds without hammering the function pool.
const RENDER_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Render front (+ back) for every learner with that learner's template. Order
 * of `cards` follows the input order so the sheet layout is stable.
 * `onProgress` fires once per learner finished (success or failure).
 */
export async function renderLearnerCards(
  learners: PreviewLearnerInput[],
  onProgress?: (done: number, total: number) => void
): Promise<RenderLearnerCardsResult> {
  const total = learners.length;
  let done = 0;
  const tick = () => {
    done += 1;
    onProgress?.(done, total);
  };

  const outcomes = await mapWithConcurrency(learners, RENDER_CONCURRENCY, async (learner) => {
    const front = await renderCardSide(learner.templateId, learner.profileId, 'front', true);
    if (!front.ok) {
      tick();
      return { failure: { learnerId: learner.learnerId, name: learner.name, message: front.message } };
    }

    let backDataUrl: string | null = null;
    if (front.backConfigured) {
      const back = await renderCardSide(learner.templateId, learner.profileId, 'back');
      if (back.ok) {
        backDataUrl = back.pngDataUrl;
      } else if (back.code !== 'back_not_configured') {
        tick();
        return {
          failure: { learnerId: learner.learnerId, name: learner.name, message: `Back side: ${back.message}` }
        };
      }
    }

    const fields = front.fields ?? [];
    tick();
    const card: RenderedCard = {
      learnerId: learner.learnerId,
      profileId: learner.profileId,
      templateId: learner.templateId,
      templateName: learner.templateName ?? null,
      name: learner.name,
      rollNumber: learner.rollNumber ?? null,
      frontDataUrl: front.pngDataUrl,
      backDataUrl,
      frontRotation: rotationFor(front.frontOrientation),
      backRotation: rotationFor(front.backOrientation),
      fields,
      missing: missingFields(fields),
      problems: problemFields(fields),
      templateInstitutionId: front.templateInstitutionId,
      learnerInstitutionId: front.learnerInstitutionId,
      institutionName: front.institutionName,
      institutionMismatch:
        front.templateInstitutionId !== null &&
        front.learnerInstitutionId !== null &&
        front.templateInstitutionId !== front.learnerInstitutionId
    };
    return { card };
  });

  const cards: RenderedCard[] = [];
  const failed: RenderFailure[] = [];
  for (const o of outcomes) {
    if ('card' in o) cards.push(o.card);
    else failed.push(o.failure);
  }
  return { cards, failed, hasBacks: cards.some((c) => c.backDataUrl !== null) };
}

const RESOLVE_CHUNK_SIZE = 100;

/**
 * learners_profiles.id → learners_profiles.institution_id (+ the institution
 * name for messages). Chunked like the account lookup to stay within URL
 * limits. Learners with no institution are absent from the map.
 */
export async function resolveLearnerInstitutions(
  learnerIds: string[]
): Promise<Map<string, { institutionId: string; institutionName: string | null }>> {
  const map = new Map<string, { institutionId: string; institutionName: string | null }>();
  if (learnerIds.length === 0) return map;
  const supabase = createClientSupabaseClient();
  for (let i = 0; i < learnerIds.length; i += RESOLVE_CHUNK_SIZE) {
    const chunk = learnerIds.slice(i, i + RESOLVE_CHUNK_SIZE);
    const { data, error } = await (supabase.from('learners_profiles') as any)
      .select('id, institution_id, institution:institutions(name)')
      .in('id', chunk);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{
      id: string;
      institution_id: string | null;
      institution: { name: string | null } | null;
    }>) {
      if (row.institution_id) {
        map.set(row.id, {
          institutionId: row.institution_id,
          institutionName: row.institution?.name ?? null
        });
      }
    }
  }
  return map;
}
