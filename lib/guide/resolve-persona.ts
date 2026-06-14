/**
 * MyJKKN Smart Guide — canonical persona resolver (server-side, Adapter C).
 *
 * The ONE place that decides, for the current viewer, which canonical guide
 * lanes they may see and which is their default ("own"). Generalises AI Pulse's
 * proven lib/ai-pulse/guide/detect-lane.ts to the 9-persona canonical set, so a
 * single platform Help FAB + the composed guide page can share one resolution.
 * Retires the per-module client `use-guide-lane` hooks (no permissions-load
 * flash, no server/client divergence).
 *
 * FAIL-CLOSED is the whole contract: any error, any unknown, any RPC failure
 * resolves DOWN to the open learner lane — a gated lane is shown only when a
 * rule positively grants it. Mounted in the root layout (runs on EVERY page),
 * so it must never throw and must be cheap (one super-admin check + the distinct
 * permission keys resolved in parallel, all deduped per request via cache()).
 */
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { CANONICAL_PERSONAS, type CanonicalPersona } from "@/lib/guide/types";
import {
  PERSONA_REQUIRES,
  PARENT_ROLE_KEYS,
  EXTERNAL_ROLE_KEYS,
} from "@/lib/guide/registry";

export interface GuideAccess {
  /** Lanes the viewer may open (fail-closed; super-admin sees all). */
  visible: CanonicalPersona[];
  /** Default lane — highest-priority visible lane (route-context can override). */
  own: CanonicalPersona;
  isSuperAdmin: boolean;
  /** True if the viewer holds this permission key (super-admin ⇒ always true). */
  can: (key: string) => boolean;
  /** The viewer's primary role key (profiles.role), for parent/external + student. */
  roleKey: string | null;
  scopeId: string | null;
}

/** Most-specific / highest-altitude first — the viewer's own lane is the first
 *  of these they can see. */
const PRIORITY: readonly CanonicalPersona[] = [
  "platform-admin",
  "module-admin",
  "supervisor",
  "unit-lead",
  "facilitator",
  "coordinator",
  "parent",
  "external",
  "learner",
] as const;

/** The floor every code path falls back to — only the open learner lane. */
const LEARNER_ONLY: GuideAccess = {
  visible: ["learner"],
  own: "learner",
  isSuperAdmin: false,
  can: () => false,
  roleKey: null,
  scopeId: null,
};

/**
 * Deduped per request via React cache() — the root-layout FAB and the guide page
 * both call this within one request and share a single resolution.
 */
export const resolveGuideAccess = cache(async function resolveGuideAccess(): Promise<GuideAccess> {
  try {
    return await resolveInner();
  } catch {
    // Runs in the root layout on EVERY page — a resolver failure must never take
    // the platform down, and must never fail OPEN. Down to the learner lane.
    return LEARNER_ONLY;
  }
});

async function resolveInner(): Promise<GuideAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-out reader still gets the open learner lane (and the overview).
  if (!user) return LEARNER_ONLY;

  // Super-admin: sees every lane, can() everything.
  let isSuperAdmin = false;
  try {
    const { data } = await supabase.rpc("is_super_admin");
    isSuperAdmin = data === true;
  } catch {
    isSuperAdmin = false; // fail closed
  }

  // Primary role — for the student short-circuit + parent/external lanes.
  let roleKey: string | null = null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const r = (data as { role?: string | null } | null)?.role;
    roleKey = typeof r === "string" && r.length > 0 ? r : null;
  } catch {
    roleKey = null;
  }

  // Student short-circuit: a student is a learner, full stop — even if they hold
  // a stray staff permission. Mirrors the retired client hooks' behaviour.
  if (roleKey === "student") {
    return { visible: ["learner"], own: "learner", isSuperAdmin, can: () => false, roleKey, scopeId: null };
  }

  // Resolve the DISTINCT permission keys once, in parallel. Super-admins skip the
  // RPCs entirely (they can() everything). An RPC error on any key → DENY (fail
  // closed) for that key.
  const allKeys = Array.from(new Set(Object.values(PERSONA_REQUIRES).flat()));
  const granted = new Set<string>();
  if (!isSuperAdmin) {
    const results = await Promise.all(
      allKeys.map(async (key) => {
        try {
          const { data } = await supabase.rpc("user_has_permission", { permission_name: key });
          return data === true;
        } catch {
          return false; // fail closed
        }
      })
    );
    allKeys.forEach((key, i) => {
      if (results[i]) granted.add(key);
    });
  }

  const can = (key: string): boolean => isSuperAdmin || granted.has(key);

  // Visibility per canonical persona — fail-closed by construction.
  const visible = CANONICAL_PERSONAS.filter((p) => {
    if (isSuperAdmin) return true; // sees all lanes
    if (p === "learner") return true; // open lane
    if (p === "platform-admin") return false; // super-admin only (handled above)
    if (p === "parent") return roleKey !== null && PARENT_ROLE_KEYS.includes(roleKey);
    if (p === "external") return roleKey !== null && EXTERNAL_ROLE_KEYS.includes(roleKey);
    const keys = PERSONA_REQUIRES[p];
    // Empty key list ⇒ not grantable by permission ⇒ DENY (fail closed).
    return keys.length > 0 && keys.some((k) => granted.has(k));
  });

  // Own lane = the highest-priority lane the viewer can see.
  const own = PRIORITY.find((p) => visible.includes(p)) ?? "learner";

  return { visible, own, isSuperAdmin, can, roleKey, scopeId: null };
}
