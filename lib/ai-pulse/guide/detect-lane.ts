/**
 * AI Pulse Smart Guide — persona detection (Adapter C, server-side).
 *
 * Resolves the viewer's own lane + which lanes they may switch to, from the
 * app's existing permission system (user_has_permission RPC + is_super_admin),
 * the same surface my-pulse/page.tsx uses. Shared by BOTH the full-page route
 * and the layout FAB so detection happens once per surface, server-side.
 *
 * Fail-CLOSED: a gated lane shows only to super-admins, the viewer's own
 * persona, or a viewer who can() its key. The Student lane has no `requires`,
 * so it's always visible — every viewer (even logged-out) gets at least the
 * participant guide, and `denied` only fires if even that were gated.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { GUIDES } from "./content";
import { GUIDE_PERSONAS, type GuidePersona } from "./types";

export interface DetectedLane {
  persona: GuidePersona;
  scopeId: string | null;
  visible: GuidePersona[];
  denied: boolean;
}

/** Most-specific-first; the viewer's own lane is the first of these they can see. */
const PRIORITY: readonly GuidePersona[] = [
  "admin",
  "champion",
  "faculty",
  "hod",
  "incharge",
  "student",
] as const;

export async function detectLane(): Promise<DetectedLane> {
  try {
    return await detectLaneInner();
  } catch {
    // This runs in the AI Pulse layout on EVERY module page — a detection
    // failure must never take the module down. Fall back to the open Student
    // lane (the participant guide everyone may see).
    const visible = GUIDE_PERSONAS.filter((p) => !GUIDES.lanes[p].requires);
    return { persona: visible[0] ?? "student", scopeId: null, visible, denied: false };
  }
}

async function detectLaneInner(): Promise<DetectedLane> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-out reader still deserves the guide — show open lanes (Student).
  if (!user) {
    const visible = GUIDE_PERSONAS.filter((p) => !GUIDES.lanes[p].requires);
    return { persona: visible[0] ?? "student", scopeId: null, visible, denied: visible.length === 0 };
  }

  let isSuper = false;
  try {
    const { data } = await supabase.rpc("is_super_admin");
    isSuper = data === true;
  } catch {
    isSuper = false;
  }

  const can = async (key: string): Promise<boolean> => {
    try {
      const { data } = await supabase.rpc("user_has_permission", { permission_name: key });
      return data === true;
    } catch {
      return false; // unknown / RPC error → DENY (fail closed)
    }
  };

  // Resolve visibility per lane. Undefined `requires` = open lane.
  const visible: GuidePersona[] = [];
  for (const p of GUIDE_PERSONAS) {
    const req = GUIDES.lanes[p].requires;
    if (isSuper || !req || (await can(req))) visible.push(p);
  }

  // Own lane = the most specific visible lane (PRIORITY order).
  const own = PRIORITY.find((p) => visible.includes(p)) ?? "student";

  return { persona: own, scopeId: null, visible, denied: visible.length === 0 };
}
