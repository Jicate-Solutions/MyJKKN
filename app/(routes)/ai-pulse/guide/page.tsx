// app/(routes)/ai-pulse/guide/page.tsx
// Legacy per-module guide — superseded by the unified platform guide (#1411).
// The AI Pulse lanes are now composed into the canonical /guide; this route
// redirects there (the platform resolver opens the viewer's own lane). Retires
// this page's old client detect-lane usage.
import { redirect } from "next/navigation";

export default function AiPulseGuideRedirect() {
  redirect("/guide");
}
