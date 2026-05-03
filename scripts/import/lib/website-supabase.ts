import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.import');
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.import not found at ${envPath}. Copy .env.import.example and fill in.`);
  }
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

export function websiteSupabase() {
  loadEnv();
  const url = process.env.WEBSITE_SUPABASE_URL;
  const key = process.env.WEBSITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('WEBSITE_SUPABASE_URL and WEBSITE_SUPABASE_SERVICE_ROLE_KEY must be set in .env.import');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
