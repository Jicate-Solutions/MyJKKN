#!/usr/bin/env node
// lightpanda-sweep.mjs — "every page as every role", cheaply. The L1-lite sweep shared by W12 stage 5
// (post-deploy, pages the merged PRs touched) and /workflow-test Mode E (many page×role snapshots).
//
// Director 2026-09-06 07:33 ("build Lightpanda into W12 and /workflow-test"), after the experiment:
// 1,144 loads × 4 roles → 1,143 × 200, 0 crashes, 0 JS exceptions, role gating observable, ~17 MB idle.
//
// Sessions are minted exactly like admin-mint-snapshot.mjs (admin magiclink → verifyOtp → cookies): no
// PERSONA_PASSWORD, no UI login. Lightpanda (Zig + V8, CDP) serves ONE page per process, so this spawns
// one `lightpanda serve` per role, drives it with puppeteer-core, restarts it every RESTART_EVERY pages
// (RSS climbs ~126 → ~650 MB over ~300 loads), and kills it when done.
//
// What it can judge: HTTP status, auth bounce (final URL on a login page), JS exceptions, console errors,
// timeouts, crashes, rendered text length. What it CANNOT judge: what a person sees — it has no layout
// engine (hidden menus count as text). Keep Chrome (admin-mint-snapshot.mjs) for anything visual.
//
// usage: node scripts/persona-harness/lightpanda-sweep.mjs --pages "/a,/b" | --pages-file FILE
//          [--roles superadmin,hod,faculty,student] [--out sweep.json] [--base https://www.jkkn.ai]
//          [--lp ~/.local/opt/lightpanda/lightpanda] [--timeout 40000] [--restart-every 100]
// exit 0 done (read sum/flags) · 2 lightpanda binary missing · 3 sessions could not be minted
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const DIR = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', process.env.PERSONA_BASE_URL || 'https://www.jkkn.ai'); const HOST = new URL(BASE).hostname;
const LP = (arg('--lp', process.env.LIGHTPANDA_BIN || `${process.env.HOME}/.local/opt/lightpanda/lightpanda`)).replace(/^~/, process.env.HOME);
const OUT = arg('--out', null); const TIMEOUT = Number(arg('--timeout', 40000)); const RESTART_EVERY = Number(arg('--restart-every', 100));
const ROLES = arg('--roles', 'superadmin,hod,faculty,student').split(',').map((s) => s.trim()).filter(Boolean);
let PAGES = arg('--pages', '').split(',').map((s) => s.trim()).filter(Boolean);
if (arg('--pages-file')) PAGES = readFileSync(arg('--pages-file'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
if (!PAGES.length) { console.error('no pages (--pages or --pages-file)'); process.exit(1); }
if (!existsSync(LP)) { console.log(`L1-lite unavailable: lightpanda not installed at ${LP}`); process.exit(2); }

function readEnv(file, key) {
  let txt; try { txt = readFileSync(resolve(DIR, file), 'utf8'); } catch { return null; }
  const m = txt.match(new RegExp('^' + key + '=(.*)$', 'm')); if (!m) return null;
  let v = m[1].trim().replace(/^["']|["']$/g, ''); if (v.endsWith('\\n')) v = v.slice(0, -2); return v.trim();
}
const URL_ = readEnv('../../.env.local', 'NEXT_PUBLIC_SUPABASE_URL'), ANON = readEnv('../../.env.local', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SVC = readEnv('../../.env.production.local', 'SUPABASE_SERVICE_ROLE_KEY') || readEnv('../../.env.local', 'SUPABASE_SERVICE_ROLE_KEY');
const personas = JSON.parse(readFileSync(resolve(DIR, 'personas.json'), 'utf8'));
const accounts = personas.accounts || personas.personas || {};

async function mint(email) {
  const admin = createClient(URL_, SVC, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email }); if (error) throw new Error(`generateLink: ${error.message}`);
  const store = {}; const sb = createServerClient(URL_, ANON, { cookies: { getAll: () => Object.entries(store).map(([name, value]) => ({ name, value })), setAll: (l) => { for (const c of l) store[c.name] = c.value; } } });
  const { error: v } = await sb.auth.verifyOtp({ type: 'email', token_hash: data.properties.hashed_token }); if (v) throw new Error(`verifyOtp: ${v.message}`);
  const cookies = Object.entries(store).map(([name, value]) => ({ name, value, domain: HOST, path: '/', secure: true }));
  if (!cookies.length) throw new Error('no cookies minted'); return cookies;
}
const freePort = (i) => 9240 + i;
async function startLp(port) {
  const p = spawn(LP, ['serve', '--host', '127.0.0.1', '--port', String(port), '--log-level', 'err'], { env: { ...process.env, LIGHTPANDA_DISABLE_TELEMETRY: 'true' }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); try { const res = await fetch(`http://127.0.0.1:${port}/json/version`); if (res.ok) return p; } catch {} }
  try { p.kill('SIGKILL'); } catch {} throw new Error(`lightpanda did not come up on :${port}`);
}
const rss = (pid) => { try { return Math.round(Number(execSync(`ps -o rss= -p ${pid}`).toString().trim()) / 1024); } catch { return -1; } };

async function sweepRole(role, idx) {
  const rows = []; let cookies;
  try { cookies = await mint(accounts[role]); } catch (e) { return { role, minted: false, error: String(e.message || e), rows }; }
  const port = freePort(idx); let proc = await startLp(port); let browser = await puppeteer.connect({ browserWSEndpoint: `ws://127.0.0.1:${port}/` });
  let page = null, cur = null, n = 0, peak = 0;
  const fresh = async () => { try { if (page) await page.close(); } catch {} page = await browser.newPage(); page.on('console', (m) => { if (cur && m.type() === 'error') cur.cerr++; }); page.on('pageerror', () => { if (cur) cur.perr++; }); await page.setCookie(...cookies); };
  for (const path of PAGES) {
    if (n && n % RESTART_EVERY === 0) { try { await browser.disconnect(); } catch {} try { proc.kill('SIGKILL'); } catch {} proc = await startLp(port); browser = await puppeteer.connect({ browserWSEndpoint: `ws://127.0.0.1:${port}/` }); page = null; }
    if (!page) await fresh();
    const row = { role, path, status: null, final: null, ms: null, textLen: 0, cerr: 0, perr: 0, bounce: false, timeout: false, err: null }; cur = row;
    try {
      const s = Date.now(); const resp = await page.goto(BASE + path, { waitUntil: 'load', timeout: TIMEOUT }); await new Promise((r) => setTimeout(r, 600));
      row.ms = Date.now() - s; row.status = resp ? resp.status() : null; row.final = page.url().replace(BASE, '') || '/';
      row.bounce = /\/login|\/auth\/|\/sign-in/.test(row.final) && !/\/login|\/auth\/|\/sign-in/.test(path);
      row.textLen = await page.evaluate(() => (document.body && document.body.innerText || '').length).catch(() => -1);
    } catch (e) { row.err = String(e && e.message || e).slice(0, 100); row.timeout = /timeout/i.test(row.err); if (/Target|closed|crash|Protocol/i.test(row.err)) page = null; }
    rows.push(row); n++; peak = Math.max(peak, rss(proc.pid));
  }
  try { if (page) await page.close(); } catch {} try { await browser.disconnect(); } catch {} try { proc.kill('SIGKILL'); } catch {}
  return { role, minted: true, rows, peakMB: peak };
}

const t0 = Date.now();
const per = await Promise.all(ROLES.map((r, i) => sweepRole(r, i)));
const rows = per.flatMap((p) => p.rows); const unminted = per.filter((p) => !p.minted);
if (unminted.length === ROLES.length) { console.log(`L1-lite unavailable: no session could be minted (${unminted[0].error})`); process.exit(3); }
const ms = rows.map((r) => r.ms).filter(Boolean).sort((a, b) => a - b);
const flags = {
  s5xx: rows.filter((r) => (r.status || 0) >= 500).map((r) => `${r.role} ${r.path} → ${r.status}`),
  bounces: rows.filter((r) => r.bounce).map((r) => `${r.role} ${r.path} → ${r.final}`),
  jsErr: rows.filter((r) => r.perr > 0).map((r) => `${r.role} ${r.path} (${r.perr})`),
  timeouts: rows.filter((r) => r.timeout).map((r) => `${r.role} ${r.path}`),
  failed: rows.filter((r) => r.err && !r.timeout).map((r) => `${r.role} ${r.path}: ${r.err}`),
};
const sum = { loads: rows.length, ok200: rows.filter((r) => r.status === 200).length, s5xx: flags.s5xx.length, bounces: flags.bounces.length, jsErr: flags.jsErr.length, consoleErr: rows.filter((r) => r.cerr > 0).length, timeouts: flags.timeouts.length, failed: flags.failed.length, unmintedRoles: unminted.map((u) => u.role), medianMs: ms[Math.floor(ms.length / 2)] || null, totalS: Math.round((Date.now() - t0) / 1000), peakMB: Math.max(0, ...per.map((p) => p.peakMB || 0)) };
const result = { at: new Date().toISOString(), base: BASE, roles: ROLES, pages: PAGES, sum, flags, rows };
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(`L1-lite: ${sum.loads} loads (${PAGES.length} pages × ${ROLES.length - unminted.length} roles) · 200=${sum.ok200} · 5xx=${sum.s5xx} · wrong-bounce=${sum.bounces} · js-exceptions=${sum.jsErr} · timeouts=${sum.timeouts} · crashed=${sum.failed} · median ${sum.medianMs} ms · ${sum.totalS}s · peak ${sum.peakMB} MB${unminted.length ? ` · unminted: ${sum.unmintedRoles.join(',')}` : ''}`);
for (const [k, v] of Object.entries(flags)) for (const line of v.slice(0, 12)) console.log(`  ${k}: ${line}`);
process.exit(0);
