import * as crypto from 'node:crypto';
import type { VerifyWebhookInput } from '../provider';

export function verifyWebhookSignature(input: VerifyWebhookInput, webhookSecret: string): boolean {
  const secret = webhookSecret;
  if (!secret) return false;
  if (!input.signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(input.rawBody).digest('hex');
  if (expected.length !== input.signatureHeader.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signatureHeader));
  } catch {
    return false;
  }
}
