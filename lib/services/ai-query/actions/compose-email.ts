/**
 * The exact text of an AI Assistant email: the message, then the "sent on
 * behalf of" line that ai_rpc_propose_action fixed and stored on the proposal.
 *
 * Shared by the card (components/ai-query/PendingActionCards.tsx), which shows
 * the person what will be sent, and the send (execute-action.ts), which sends
 * it — one function, so the two can never differ. No server imports here: the
 * card is a client component.
 */
export const EMAIL_FOOTER_SEPARATOR = '\n\n—\n';

export function composeEmailText(body: string, footer: string | null | undefined): string {
  const line = (footer ?? '').trim();
  return line ? `${body}${EMAIL_FOOTER_SEPARATOR}${line}` : body;
}
