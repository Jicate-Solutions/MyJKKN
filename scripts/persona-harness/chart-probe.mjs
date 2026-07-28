// Probe live DOM for the section-comparison chart bar rectangles.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import puppeteer from 'puppeteer';

const DIR = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PERSONA_BASE_URL || 'https://www.jkkn.ai';
const HOST = new URL(BASE).hostname;
function readEnv(file, key) {
  const txt = readFileSync(resolve(DIR, file), 'utf8');
  const m = txt.match(new RegExp('^' + key + '=(.*)$', 'm'));
  let v = m[1].trim().replace(/^["']|["']$/g, '');
  if (v.endsWith('\\n')) v = v.slice(0, -2);
  return v.trim();
}
const URL_ = readEnv('../../.env.local', 'NEXT_PUBLIC_SUPABASE_URL');
const ANON = readEnv('../../.env.local', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SVC = readEnv('../../.env.production.local', 'SUPABASE_SERVICE_ROLE_KEY');
const email = process.argv[2] || 'vidhyalyaprincipal@jkkn.ac.in';

const admin = createClient(URL_, SVC, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: gl } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
const store = {};
const sb = createServerClient(URL_, ANON, { cookies: { getAll: () => Object.entries(store).map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach(({ name, value }) => { store[name] = value; }) } });
await sb.auth.verifyOtp({ type: 'email', token_hash: gl.properties.hashed_token });
const cookies = Object.entries(store).map(([name, value]) => ({ name, value, domain: HOST, path: '/', secure: true, httpOnly: false, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 3600 }));

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200 });
await page.setCookie(...cookies);
await page.goto(BASE + '/rcltp/principal', { waitUntil: 'domcontentloaded', timeout: 45000 });
await new Promise((r) => setTimeout(r, 17000));
const probe = await page.evaluate(() => {
  // find the section-comparison card by its heading text
  const cards = [...document.querySelectorAll('*')].filter((e) => /Class & section comparison/i.test(e.textContent || '') && e.querySelector('svg.recharts-surface'));
  const card = cards[cards.length - 1];
  if (!card) return { error: 'card not found' };
  const svg = card.querySelector('svg.recharts-surface');
  const bars = [...svg.querySelectorAll('.recharts-bar-rectangle path, path.recharts-rectangle')];
  const ticks = [...svg.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value')].map((t) => (t.textContent || '').trim());
  const svgBox = svg.getBoundingClientRect();
  const clips = [...svg.querySelectorAll('clipPath rect')].map((r) => ({ x: +r.getAttribute('x'), w: +r.getAttribute('width'), h: +r.getAttribute('height') }));
  const barG = svg.querySelector('.recharts-bar > g[clip-path], .recharts-bar-rectangles');
  // definitive paint check on the LAST bar
  const last = bars[bars.length - 1];
  let paintCheck = null;
  if (last) {
    const r = last.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const cs = getComputedStyle(last);
    const topEl = document.elementFromPoint(cx, cy);
    paintCheck = {
      cx: Math.round(cx), cy: Math.round(cy),
      fillAttr: last.getAttribute('fill'),
      fill: cs.fill, opacity: cs.opacity, fillOpacity: cs.fillOpacity, visibility: cs.visibility, display: cs.display,
      topElAtCenter: topEl ? (topEl.tagName + '.' + (typeof topEl.className === 'object' ? topEl.className.baseVal : topEl.className)).slice(0, 80) : null,
      topElIsTheBar: topEl === last,
    };
  }
  return {
    svgWidth: Math.round(svgBox.width),
    barCount: bars.length,
    bars: bars.map((b) => { const r = b.getBoundingClientRect(); return { x: Math.round(r.x - svgBox.x), w: Math.round(r.width), h: Math.round(r.height) }; }),
    clipRects: clips,
    barGClipAttr: barG ? barG.getAttribute('clip-path') : null,
    paintCheck,
    xTicks: ticks,
  };
});
console.log(JSON.stringify(probe, null, 2));
await browser.close().catch(() => {});
setTimeout(() => process.exit(0), 500);
