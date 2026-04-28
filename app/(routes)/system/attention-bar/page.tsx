/**
 * /system/attention-bar — Admin UI for the Attention Bar 5-layer system.
 *
 * Spec: specs/attention-bar-5-layer-system.md §6
 * 7 tabs, URL-driven via ?tab= searchParam.
 *
 * Tab structure (permission-gated — hidden if user lacks permission):
 *   1. overview       — attention_bar.audit.view
 *   2. defaults       — attention_bar.rules.view
 *   3. rules          — attention_bar.rules.manage
 *   4. behavior       — attention_bar.audit.view
 *   5. ai             — attention_bar.config.manage
 *   6. audit          — attention_bar.audit.view
 *   7. sandbox        — attention_bar.test_sandbox.use
 */

import { AttentionBarAdminClient } from './_components/attention-bar-admin-client';

export const metadata = {
  title: 'Attention Bar Admin — MyJKKN System',
  description: 'Configure, monitor, and test the Attention Bar 5-layer system.',
};

export default function AttentionBarAdminPage() {
  return <AttentionBarAdminClient />;
}
