import { createHash } from 'crypto';

const PEPPER = process.env.IP_HASH_PEPPER ?? 'myjkkn-default-pepper-do-not-use-in-prod';

function dailySalt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${PEPPER}|${today}`;
}

export function hashIp(ipRaw: string | null | undefined): string {
  if (!ipRaw) return '';
  const ip = ipRaw.split(',')[0].trim();
  if (!ip) return '';
  return createHash('sha256').update(`${dailySalt()}|${ip}`).digest('hex');
}
