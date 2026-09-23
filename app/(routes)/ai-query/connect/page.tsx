/**
 * Connect an outside AI
 * A person makes, copies once, lists and turns off their OWN keys for the
 * MyJKKN MCP door, so Claude, ChatGPT, Gemini or Zoho Zia can read what they
 * can read in MyJKKN. Gated ai_query.view (inherits /ai-query in MENU_PERMISSIONS).
 */

import { Metadata } from 'next';
import { ConnectOutsideAi } from './_components/connect-outside-ai';

// Chip label on the AI Assistant page (read by scripts/generate-route-manifest.ts).
export const navMeta = { label: 'Connect an outside AI', icon: 'KeyRound' };

export const metadata: Metadata = {
  title: 'Connect an outside AI',
  description: 'Use MyJKKN from Claude, ChatGPT, Gemini or Zoho Zia with your own key',
};

export default function ConnectOutsideAiPage() {
  return <ConnectOutsideAi />;
}
