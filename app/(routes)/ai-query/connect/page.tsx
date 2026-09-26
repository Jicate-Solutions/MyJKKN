/**
 * Connect an outside AI
 * A person makes, copies once, lists and turns off their OWN keys for the
 * MyJKKN MCP door, so an outside AI that accepts a key (Claude Code, Claude
 * Desktop, Gemini CLI, Zoho Zia where the plan allows) can read what they can
 * read in MyJKKN. ChatGPT and claude.ai in the browser cannot use a key yet.
 * Gated ai_query.view (inherits /ai-query in MENU_PERMISSIONS).
 */

import { Metadata } from 'next';
import { ConnectOutsideAi } from './_components/connect-outside-ai';

// Chip label on the AI Assistant page (read by scripts/generate-route-manifest.ts).
export const navMeta = { label: 'Connect an outside AI', icon: 'KeyRound' };

export const metadata: Metadata = {
  title: 'Connect an outside AI',
  description: 'Use MyJKKN from Claude Code, Claude Desktop, Gemini CLI or Zoho Zia with your own key',
};

export default function ConnectOutsideAiPage() {
  return <ConnectOutsideAi />;
}
