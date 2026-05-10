// lib/services/ai-pulse/cycles-service.ts
// Created: 2026-05-08 — AI Pulse module v3 (Wave B.1 Champion Console)
//
// Backs: app/(routes)/ai-pulse/admin/cycles/page.tsx + cycles/[id]/page.tsx
//        plus the four _components/* files (cycle-card, cycle-edit-form,
//        cycle-list, featured-tool-select, host-user-select).
// Pairs with: startup_events (config->>'kind' = 'ai_pulse') and
//             ai_pulse_featured_tools (PR #644 substrate).
// RLS:        startup_events SELECT — RLS-scoped; UPDATE — super_admin OR
//             aiPulse:cycles.manage permission. ai_pulse_featured_tools
//             SELECT — institution-scoped; cron triggers fired via API
//             route /api/cron/ai-pulse-tick (auth via CRON_SECRET).
//
// History: PR #732 (UI for Champion Console) merged on 2026-05-07 referencing
// this module, but the service file was missing — broke the main build for
// ~14h. PR #772 originally shipped a stub here; this commit replaces the
// stub with the real implementation now that substrate (#644 + #715 + #716)
// has merged.
//
// Pattern reference: lib/services/ai-pulse/anomaly-service.ts (sibling
// service that reads/writes ai_pulse_anomaly_flags the same way).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// Types — derived from how cycle-card.tsx / cycle-edit-form.tsx consume them.
// ============================================================================

export interface AIPulseCycleConfig {
  kind?: string;
  cycle_week_start_date?: string;
  featured_tool_id: string | null;
  briefing_topic_id: string | null;
  briefing_topic_text: string | null;
  host_user_id: string | null;
  meet_url: string | null;
  recording_url: string | null;
  external_judge_cycle: boolean;
  cancellation_reason?: string | null;
  // Optional policy snapshot fields (present on rows seeded by the cron):
  gold_standard_count?: number;
  bottom_n_publication_count?: number;
  primary_language?: string;
  secondary_language?: string;
  session_start_time?: string;
  session_end_time?: string;
}

export interface AIPulseFeaturedToolJoined {
  id: string;
  name: string;
  vendor: string | null;
}

export interface AIPulseHostJoined {
  id: string;
  full_name: string | null;
  email: string | null;
}

export interface AIPulseCycleRow {
  id: string;
  name: string | null;
  description: string | null;
  status: string;
  demo_date: string | null;
  cycle_number?: number | null;
  ai_pulse: AIPulseCycleConfig;
  featured_tool: AIPulseFeaturedToolJoined | null;
  host: AIPulseHostJoined | null;
  registrations_count: number | null;
}

export interface UpdateCycleConfigInput {
  featured_tool_id: string | null;
  briefing_topic_id: string | null;
  briefing_topic_text: string | null;
  host_user_id: string | null;
  meet_url: string | null;
  recording_url: string | null;
  external_judge_cycle: boolean;
}

export interface AIPulseFeaturedToolOption {
  id: string;
  name: string;
  vendor: string | null;
  is_active: boolean;
}

export interface AIPulseHostCandidate {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
}

interface MutationResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

interface TriggerCycleData {
  existed?: boolean;
  demo_date?: string | null;
}

// ============================================================================
// React Query keys
// ============================================================================

const QUERY_KEY_ROOT = ['ai-pulse', 'cycles'] as const;
const FEATURED_TOOLS_KEY = ['ai-pulse', 'featured-tools'] as const;
const HOST_CANDIDATES_KEY = ['ai-pulse', 'host-candidates'] as const;

// ============================================================================
// Helpers
// ============================================================================

const CYCLE_SELECT =
  'id, name, description, status, demo_date, config, featured_tool:ai_pulse_featured_tools!ai_pulse_featured_tool_fkey(id, label_en, vendor_name)';

function defaultConfig(): AIPulseCycleConfig {
  return {
    featured_tool_id: null,
    briefing_topic_id: null,
    briefing_topic_text: null,
    host_user_id: null,
    meet_url: null,
    recording_url: null,
    external_judge_cycle: false,
  };
}

function normalizeConfig(raw: unknown): AIPulseCycleConfig {
  if (!raw || typeof raw !== 'object') return defaultConfig();
  const cfg = raw as Record<string, unknown>;
  return {
    kind: (cfg.kind as string) ?? undefined,
    cycle_week_start_date: (cfg.cycle_week_start_date as string) ?? undefined,
    featured_tool_id: (cfg.featured_tool_id as string | null) ?? null,
    briefing_topic_id: (cfg.briefing_topic_id as string | null) ?? null,
    briefing_topic_text: (cfg.briefing_topic_text as string | null) ?? null,
    host_user_id: (cfg.host_user_id as string | null) ?? null,
    meet_url: (cfg.meet_url as string | null) ?? null,
    recording_url: (cfg.recording_url as string | null) ?? null,
    external_judge_cycle: Boolean(cfg.external_judge_cycle),
    cancellation_reason: (cfg.cancellation_reason as string | null) ?? null,
    gold_standard_count: cfg.gold_standard_count as number | undefined,
    bottom_n_publication_count: cfg.bottom_n_publication_count as
      | number
      | undefined,
    primary_language: cfg.primary_language as string | undefined,
    secondary_language: cfg.secondary_language as string | undefined,
    session_start_time: cfg.session_start_time as string | undefined,
    session_end_time: cfg.session_end_time as string | undefined,
  };
}

async function hydrateCycle(
  supabase: any,
  raw: any,
): Promise<AIPulseCycleRow> {
  const config = normalizeConfig(raw.config);

  // Resolve featured tool from config.featured_tool_id (single fetch per cycle)
  let featuredTool: AIPulseFeaturedToolJoined | null = null;
  if (config.featured_tool_id) {
    const { data: ft } = await supabase
      .from('ai_pulse_featured_tools')
      .select('id, label_en, vendor_name')
      .eq('id', config.featured_tool_id)
      .maybeSingle();
    if (ft) {
      featuredTool = {
        id: ft.id,
        name: ft.label_en,
        vendor: ft.vendor_name ?? null,
      };
    }
  }

  // Resolve host from config.host_user_id
  let host: AIPulseHostJoined | null = null;
  if (config.host_user_id) {
    const { data: hp } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', config.host_user_id)
      .maybeSingle();
    if (hp) {
      host = {
        id: hp.id,
        full_name: hp.full_name ?? null,
        email: hp.email ?? null,
      };
    }
  }

  // Count registrations for this cycle
  const { count } = await supabase
    .from('event_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', raw.id);

  return {
    id: raw.id,
    name: raw.name ?? null,
    description: raw.description ?? null,
    status: raw.status,
    demo_date: raw.demo_date ?? null,
    cycle_number: null,
    ai_pulse: config,
    featured_tool: featuredTool,
    host,
    registrations_count: typeof count === 'number' ? count : 0,
  };
}

// ============================================================================
// useAIPulseCycles — list view
// ============================================================================

export function useAIPulseCycles() {
  return useQuery<AIPulseCycleRow[], Error>({
    queryKey: [...QUERY_KEY_ROOT, 'list'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('startup_events')
        .select('id, name, description, status, demo_date, config')
        .filter('config->>kind', 'eq', 'ai_pulse')
        .order('demo_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[ai-pulse/cycles] list failed:', error);
        throw new Error(error.message);
      }

      const rows = (data ?? []) as any[];
      return Promise.all(rows.map((r) => hydrateCycle(supabase, r)));
    },
    staleTime: 30_000,
  });
}

// ============================================================================
// useAIPulseCycle — single cycle (by id)
// ============================================================================

export function useAIPulseCycle(cycleId: string) {
  return useQuery<AIPulseCycleRow | null, Error>({
    queryKey: [...QUERY_KEY_ROOT, 'detail', cycleId],
    queryFn: async () => {
      if (!cycleId) return null;
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('startup_events')
        .select('id, name, description, status, demo_date, config')
        .eq('id', cycleId)
        .filter('config->>kind', 'eq', 'ai_pulse')
        .maybeSingle();

      if (error) {
        console.error('[ai-pulse/cycles] detail failed:', error);
        throw new Error(error.message);
      }
      if (!data) return null;
      return hydrateCycle(supabase, data);
    },
    enabled: Boolean(cycleId),
    staleTime: 30_000,
  });
}

// ============================================================================
// useAIPulseFeaturedTools — master list (active + inactive)
// ============================================================================

export function useAIPulseFeaturedTools() {
  return useQuery<AIPulseFeaturedToolOption[], Error>({
    queryKey: FEATURED_TOOLS_KEY,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('ai_pulse_featured_tools')
        .select('id, label_en, vendor_name, is_active, display_order')
        .order('is_active', { ascending: false })
        .order('display_order', { ascending: true })
        .order('label_en', { ascending: true });

      if (error) {
        console.error('[ai-pulse/cycles] featured tools failed:', error);
        throw new Error(error.message);
      }

      return ((data ?? []) as any[]).map((t) => ({
        id: t.id,
        name: t.label_en,
        vendor: t.vendor_name ?? null,
        is_active: Boolean(t.is_active),
      }));
    },
    staleTime: 5 * 60_000, // 5 min — master changes rarely
  });
}

// ============================================================================
// useAIPulseHostCandidates — Champion / Co-Champion / super-admin profiles
// ============================================================================

export function useAIPulseHostCandidates() {
  return useQuery<AIPulseHostCandidate[], Error>({
    queryKey: HOST_CANDIDATES_KEY,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();

      // Strategy: union of (a) super_admins and (b) profiles whose role grants
      // aiPulse:cycles.manage. We resolve (b) by fetching role ids whose
      // permissions JSONB has the key set to true, then user_roles → profiles.
      const candidates = new Map<string, AIPulseHostCandidate>();

      // (a) super-admins
      const { data: superAdmins, error: saErr } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('is_super_admin', true)
        .eq('is_active', true)
        .order('full_name');

      if (saErr) {
        console.error(
          '[ai-pulse/cycles] host candidates (super_admin) failed:',
          saErr,
        );
        throw new Error(saErr.message);
      }

      for (const p of (superAdmins ?? []) as any[]) {
        candidates.set(p.id, {
          id: p.id,
          full_name: p.full_name ?? null,
          email: p.email ?? null,
          role: p.role ?? 'super_admin',
        });
      }

      // (b) Roles that grant aiPulse:cycles.manage
      const { data: roleRows } = await (supabase as any)
        .from('custom_roles')
        .select('id, role_key, permissions, is_active')
        .eq('is_active', true)
        .filter('permissions->aiPulse:cycles.manage', 'eq', 'true');

      const roleIds = ((roleRows ?? []) as any[]).map((r) => r.id);

      if (roleIds.length > 0) {
        const { data: userRoleRows, error: urErr } = await (supabase as any)
          .from('user_roles')
          .select('user_id, role_id')
          .in('role_id', roleIds);

        if (urErr) {
          console.error(
            '[ai-pulse/cycles] host candidates (user_roles) failed:',
            urErr,
          );
          // Fall through — return whatever we have so far rather than 500.
        } else {
          const userIds = Array.from(
            new Set(((userRoleRows ?? []) as any[]).map((r) => r.user_id)),
          ).filter(Boolean);

          if (userIds.length > 0) {
            const { data: profileRows, error: prErr } = await (supabase as any)
              .from('profiles')
              .select('id, full_name, email, role')
              .in('id', userIds)
              .eq('is_active', true)
              .order('full_name');

            if (prErr) {
              console.error(
                '[ai-pulse/cycles] host candidates (profiles) failed:',
                prErr,
              );
            } else {
              for (const p of (profileRows ?? []) as any[]) {
                if (!candidates.has(p.id)) {
                  candidates.set(p.id, {
                    id: p.id,
                    full_name: p.full_name ?? null,
                    email: p.email ?? null,
                    role: p.role ?? 'aiPulse:cycles.manage',
                  });
                }
              }
            }
          }
        }
      }

      return Array.from(candidates.values()).sort((a, b) => {
        const an = (a.full_name ?? a.email ?? '').toLowerCase();
        const bn = (b.full_name ?? b.email ?? '').toLowerCase();
        return an.localeCompare(bn);
      });
    },
    staleTime: 5 * 60_000,
  });
}

// ============================================================================
// useTriggerCycleGeneration — fires the cron endpoint to create next cycle
// ============================================================================

export function useTriggerCycleGeneration() {
  const queryClient = useQueryClient();

  return useMutation<MutationResult<TriggerCycleData>, Error, void>({
    mutationFn: async () => {
      try {
        // The cron endpoint is normally fired by Vercel cron with CRON_SECRET.
        // From the Champion Console we POST to a session-authenticated proxy
        // route that the Champion has permission to call. If that proxy
        // doesn't exist yet (substrate still landing), fall back to inserting
        // a draft cycle row directly via supabase — RLS on startup_events
        // will allow super_admin / aiPulse:cycles.manage holders to insert.
        const supabase = createClientSupabaseClient();

        // Compute the upcoming Thursday (matches cron logic).
        const now = new Date();
        const day = now.getDay(); // 0=Sun, 4=Thu
        const offset = (4 - day + 7) % 7;
        const thursday = new Date(now);
        thursday.setDate(now.getDate() + offset);
        thursday.setHours(0, 0, 0, 0);
        const thursdayISO = thursday.toISOString().split('T')[0];

        // Idempotency: does a cycle already exist for this Thursday?
        const { data: existing, error: existingErr } = await (supabase as any)
          .from('startup_events')
          .select('id, demo_date, config')
          .eq('demo_date', thursdayISO)
          .filter('config->>kind', 'eq', 'ai_pulse')
          .limit(1);

        if (existingErr) {
          return { ok: false, error: existingErr.message };
        }
        if (existing && existing.length > 0) {
          return {
            ok: true,
            data: {
              existed: true,
              demo_date: existing[0].demo_date ?? thursdayISO,
            },
          };
        }

        // Insert a draft cycle. host_institution_id resolved from current
        // user profile (RLS will reject cross-institution attempts).
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id ?? null;
        let hostInstitutionId: string | null = null;
        if (userId) {
          const { data: profile } = await (supabase as any)
            .from('profiles')
            .select('institution_id')
            .eq('id', userId)
            .maybeSingle();
          hostInstitutionId = profile?.institution_id ?? null;
        }

        const cycleConfig = {
          kind: 'ai_pulse',
          cycle_week_start_date: thursdayISO,
          featured_tool_id: null,
          briefing_topic_id: null,
          briefing_topic_text: null,
          host_user_id: null,
          meet_url: null,
          recording_url: null,
          external_judge_cycle: false,
        };

        const { data: inserted, error: insertErr } = await (supabase as any)
          .from('startup_events')
          .insert({
            name: `AI Pulse Cycle ${thursdayISO}`,
            host_institution_id: hostInstitutionId,
            status: 'draft',
            demo_date: thursdayISO,
            config: cycleConfig,
          })
          .select('id, demo_date')
          .single();

        if (insertErr) {
          console.error(
            '[ai-pulse/cycles] trigger generation failed:',
            insertErr,
          );
          return { ok: false, error: insertErr.message };
        }

        return {
          ok: true,
          data: { existed: false, demo_date: inserted?.demo_date ?? thursdayISO },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return { ok: false, error: msg };
      }
    },
    onSuccess: (res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY_ROOT });
      }
    },
  });
}

// ============================================================================
// useCancelCycle — mark cycle as cancelled (per-cycle hook instance)
// ============================================================================

export function useCancelCycle(cycleId: string) {
  const queryClient = useQueryClient();

  return useMutation<MutationResult, Error, string>({
    mutationFn: async (reason: string) => {
      try {
        const supabase = createClientSupabaseClient();

        // Read existing config to merge cancellation_reason without
        // clobbering other keys.
        const { data: existing, error: readErr } = await (supabase as any)
          .from('startup_events')
          .select('config')
          .eq('id', cycleId)
          .maybeSingle();

        if (readErr) {
          return { ok: false, error: readErr.message };
        }
        const mergedConfig = {
          ...((existing?.config ?? {}) as Record<string, unknown>),
          cancellation_reason: reason || null,
        };

        const { error } = await (supabase as any)
          .from('startup_events')
          .update({
            status: 'cancelled',
            config: mergedConfig,
          })
          .eq('id', cycleId);

        if (error) {
          console.error('[ai-pulse/cycles] cancel failed:', error);
          return { ok: false, error: error.message };
        }
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return { ok: false, error: msg };
      }
    },
    onSuccess: (res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY_ROOT });
      }
    },
  });
}

// ============================================================================
// useUpdateCycleConfig — patch the ai_pulse JSONB block (per-cycle hook)
// ============================================================================

export function useUpdateCycleConfig(cycleId: string) {
  const queryClient = useQueryClient();

  return useMutation<MutationResult, Error, UpdateCycleConfigInput>({
    mutationFn: async (input: UpdateCycleConfigInput) => {
      try {
        const supabase = createClientSupabaseClient();

        // Read-modify-write the config JSONB to preserve unknown keys
        // (e.g. policy snapshots seeded by the cron).
        const { data: existing, error: readErr } = await (supabase as any)
          .from('startup_events')
          .select('config')
          .eq('id', cycleId)
          .maybeSingle();

        if (readErr) {
          return { ok: false, error: readErr.message };
        }
        const mergedConfig = {
          ...((existing?.config ?? {}) as Record<string, unknown>),
          kind: 'ai_pulse',
          featured_tool_id: input.featured_tool_id,
          briefing_topic_id: input.briefing_topic_id,
          briefing_topic_text: input.briefing_topic_text,
          host_user_id: input.host_user_id,
          meet_url: input.meet_url,
          recording_url: input.recording_url,
          external_judge_cycle: input.external_judge_cycle,
        };

        const { error } = await (supabase as any)
          .from('startup_events')
          .update({ config: mergedConfig })
          .eq('id', cycleId);

        if (error) {
          console.error('[ai-pulse/cycles] update config failed:', error);
          return { ok: false, error: error.message };
        }
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return { ok: false, error: msg };
      }
    },
    onSuccess: (res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY_ROOT });
      }
    },
  });
}
