import { customAlphabet } from 'nanoid';

const URL_SAFE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const generate = customAlphabet(URL_SAFE_ALPHABET, 8);

export function generateCampaignToken(): string {
  return generate();
}
