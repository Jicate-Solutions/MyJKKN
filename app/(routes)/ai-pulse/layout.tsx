// app/(routes)/ai-pulse/layout.tsx
// ============================================================================
// AI PULSE — module layout.
//
// The smart-guide "? Help" FAB that previously mounted here has been REPLACED by
// the ONE route-aware platform FAB in the root layout
// (components/guide/platform-guide-fab-mount.tsx), so there is exactly one guide
// FAB platform-wide. The AI Pulse guide PAGE (/ai-pulse/guide) is untouched.
//
// This layout is now a plain pass-through; it stays so module-specific chrome
// can be added here later without touching the route tree.
// ============================================================================

export default function AiPulseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
