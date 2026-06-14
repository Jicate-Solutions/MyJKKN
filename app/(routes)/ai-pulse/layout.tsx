// app/(routes)/ai-pulse/layout.tsx
// ============================================================================
// AI PULSE — module layout. Hosts the smart-guide "? Help" FAB on every AI
// Pulse screen so help is one tap away wherever a user is in the module. The
// FAB opens an in-context drawer of the VIEWER'S OWN lane (resolved server-side
// via detectLane). Offset bottom-LEFT so it doesn't stack on the global
// bug-reporter FAB (bottom-right, from app/(routes)/layout.tsx).
//
// Installed via the smart-guide skill, 2026-06-14.
// ============================================================================

import { GUIDES } from "@/lib/ai-pulse/guide/content";
import { GuideLauncher } from "@/components/ai-pulse/guide/guide-launcher";
import { detectLane } from "@/lib/ai-pulse/guide/detect-lane";
import { logGuideEvent } from "@/lib/ai-pulse/guide/actions";

export default async function AiPulseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { persona, scopeId } = await detectLane();
  return (
    <>
      {children}
      <GuideLauncher
        guide={GUIDES.lanes[persona]}
        basePath="/ai-pulse/guide"
        scopeId={scopeId}
        variant="fab"
        className="left-4 right-auto"
        onEvent={logGuideEvent}
      />
    </>
  );
}
