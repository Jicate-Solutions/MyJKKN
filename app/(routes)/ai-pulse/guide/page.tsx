// app/(routes)/ai-pulse/guide/page.tsx
// ============================================================================
// AI PULSE — SMART GUIDE (full-page route, server component)
//
// Installed via the smart-guide skill (2026-06-14), replacing the hand-built
// role-aware guide. One data model (lib/ai-pulse/guide/content.ts) drives this
// page, the FAB drawer (layout.tsx), and print-to-PDF.
//
//   1. detectLane() resolves the viewer's own lane + visible lanes (Adapter C —
//      user_has_permission RPC, fail-closed).
//   2. ?persona= lets a viewer switch to any lane they're permitted to see.
//   3. Wrapped in the app's ContentLayout + a scoped @media print block so the
//      Download/Print button yields a clean PDF (no app shell).
//
// TRACK_PROGRESS is OFF: the static guide ships now; the DB-backed adoption
// layer (guide_progress / guide_events + actions.ts) is a documented follow-up.
// ============================================================================

import { ContentLayout } from "@/components/layout/content-layout";
import { PageBreadcrumb } from "@/components/navigation";
import { GUIDES } from "@/lib/ai-pulse/guide/content";
import {
  isGuidePersona,
  type GuideBook,
} from "@/lib/ai-pulse/guide/types";
import { GuideView } from "@/components/ai-pulse/guide/GuideView";
import { logGuideEvent } from "@/lib/ai-pulse/guide/actions";
import { detectLane } from "@/lib/ai-pulse/guide/detect-lane";

export const dynamic = "force-dynamic";

const BASE_PATH = "/ai-pulse/guide";

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #ai-pulse-guide-print, #ai-pulse-guide-print * { visibility: visible; }
  #ai-pulse-guide-print {
    position: absolute; left: 0; top: 0; width: 100%;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
}
`;

export default async function AiPulseGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string }>;
}) {
  const { persona: requestedRaw } = await searchParams;
  const { persona: own, scopeId, visible, denied } = await detectLane();

  // Explicit denial — never a silent redirect (rule #27). (With the open Student
  // lane this won't fire, but keep it for defense if every lane were gated.)
  if (denied) {
    return (
      <ContentLayout title="AI Pulse — Guide">
        <div className="mx-auto max-w-2xl px-2 py-16 text-center">
          <h1 className="text-xl font-bold">You don&apos;t have access to AI Pulse yet.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask an admin to enrol you. Once you have access, this guide opens on
            your role automatically.
          </p>
        </div>
      </ContentLayout>
    );
  }

  // Switch only to a lane the viewer is permitted to see.
  const requested = isGuidePersona(requestedRaw) ? requestedRaw : null;
  const persona = requested && visible.includes(requested) ? requested : own;

  return (
    <ContentLayout title="AI Pulse — Guide">
      <style>{PRINT_CSS}</style>
      <PageBreadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "AI Pulse", href: "/ai-pulse" },
          { label: "Guide" },
        ]}
        className="print:hidden"
      />
      <div id="ai-pulse-guide-print" className="mt-4 max-w-4xl">
        <GuideView
          // Remount per lane so progress state + the guide_open/lane_complete
          // refs re-seed (a ?persona= switch is a soft nav otherwise).
          key={persona}
          guides={GUIDES as GuideBook}
          persona={persona}
          visiblePersonas={visible}
          scopeId={scopeId}
          basePath={BASE_PATH}
          trackProgress={false}
          onEvent={logGuideEvent}
        />
      </div>
    </ContentLayout>
  );
}
