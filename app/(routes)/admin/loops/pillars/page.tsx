// ============================================================================
// MISSION PILLARS EDITOR (Super-Admin)
// ============================================================================
// Created: 2026-07-14
// The Director's directive: "make the pillar configurable in the UI so it can be
// changed later in the UI." This page edits the `mission_pillars` config table —
// the mission-pillar map the Loop Control Tower reports coverage against. The
// pillar CONTENT is mid-review, so it ships as editable DATA: statuses reflect the
// current draft and the Director tunes them here without a code change or deploy.
//
// Gated server-side on profiles.is_super_admin (same rule as /admin/loops). The
// fallback is an explicit no-access panel — never a silent redirect (rule #27).
// Reads use the service-role client for a clean first paint; the client editor
// then mutates via the browser (anon-key, session-scoped) client, so every write
// is re-checked by the mission_pillars RLS write policy (is_super_admin/is_admin).
// ============================================================================

export const dynamic = 'force-dynamic';
export const navMeta = { label: 'Mission Pillars', icon: 'Landmark' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import {
  createServiceRoleClient,
  getEnhancedUserProfile,
} from '@/lib/supabase/server';
import { PillarsEditor, type PillarRow } from './_components/pillars-editor';

export default async function MissionPillarsPage() {
  const { profile } = await getEnhancedUserProfile();
  // Canonical super-admin definition (matches /admin/loops and the SuperAdminOnly
  // guard): the boolean flag OR the role.
  const isSuperAdmin =
    profile?.is_super_admin === true || profile?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <ContentLayout>
        <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          This page is restricted to super administrators. It configures the JKKN
          mission-pillar map that the Loop Control Tower reports coverage against.
          If you believe you should have access, contact a platform administrator.
        </div>
      </ContentLayout>
    );
  }

  const admin = createServiceRoleClient();
  const [pillarsRes, loopsRes] = await Promise.all([
    admin
      .from('mission_pillars')
      .select(
        'id, pillar_key, name, anchor_quote, source_url, covering_loops, coverage_status, display_order, is_active, notes'
      )
      .order('display_order', { ascending: true }),
    admin
      .from('loop_registry')
      .select('loop_key, name')
      .order('loop_key', { ascending: true }),
  ]);

  // The table may not exist yet (migration pending apply). Render the editor with
  // an empty list + an explicit banner rather than crashing the page.
  const tableMissing = Boolean(
    pillarsRes.error &&
      /relation .*mission_pillars.* does not exist/i.test(
        pillarsRes.error.message ?? ''
      )
  );

  return (
    <ContentLayout>
      <PillarsEditor
        initialPillars={(pillarsRes.data ?? []) as PillarRow[]}
        loopOptions={(loopsRes.data ?? []) as { loop_key: string; name: string }[]}
        tableMissing={tableMissing}
      />
    </ContentLayout>
  );
}
