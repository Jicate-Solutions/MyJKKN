#!/usr/bin/env node
// Diagnose a BoS "All N sends failed … 535-5.7.8 Username and Password not accepted"
// for one meeting. Reproduces EXACTLY what notify-members does:
//   meeting → institutions_id/board_id
//         → smtp_configuration (by counselling_code)
//         → bos_board_senders (per-board Model-3 override)
//         → mergeBoardSmtpConfig()  → nodemailer transporter → verify()
// Prints the effective credentials (password shape only, never the secret)
// and the raw SMTP handshake result.
//
// Usage: node scripts/diagnose-bos-smtp-auth.mjs <meetingId>

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { readFileSync } from 'node:fs';

for (const rawLine of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const SUPA = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const MEETING_ID = process.argv[2];
if (!MEETING_ID) { console.error('Usage: node scripts/diagnose-bos-smtp-auth.mjs <meetingId>'); process.exit(1); }

const PASSWORD_MASK = '••••••••';

/** Describe a secret without printing it. */
function describeSecret(pw) {
  if (pw == null) return '(NULL — no password stored)';
  if (pw === '') return '(empty string)';
  const hasMask = pw.includes('•');
  const inner = pw.trim();
  return [
    `len=${pw.length}`,
    `stripped_len=${inner.replace(/\s/g, '').length}`,
    `leading/trailing_ws=${pw !== inner}`,
    `inner_spaces=${/\s/.test(inner)}`,
    hasMask ? '  *** CONTAINS THE UI MASK “•” — the literal mask was saved as the password ***' : '',
    inner.replace(/\s/g, '').length === 16 ? '  (16 chars — looks like a Gmail App Password)' : '',
  ].filter(Boolean).join('  ');
}

const { data: meeting, error: mErr } = await SUPA
  .from('bos_meetings')
  .select('id, meeting_title, meeting_type, status, institutions_id, board_id, committee_id')
  .eq('id', MEETING_ID)
  .maybeSingle();
if (mErr) { console.error('meeting query error:', mErr); process.exit(1); }
if (!meeting) { console.error('Meeting not found:', MEETING_ID); process.exit(1); }

console.log('\n── Meeting ────────────────────────────────────────────');
console.log('  title          :', meeting.meeting_title);
console.log('  meeting_type   :', meeting.meeting_type);
console.log('  institutions_id:', meeting.institutions_id);
console.log('  board_id       :', meeting.board_id ?? '(none)');

const { data: inst } = await SUPA
  .from('institutions')
  .select('id, name, counselling_code')
  .eq('id', meeting.institutions_id)
  .maybeSingle();
console.log('\n── Institution ────────────────────────────────────────');
console.log('  name             :', inst?.name);
console.log('  counselling_code :', inst?.counselling_code);

const { data: smtp, error: sErr } = await SUPA
  .from('smtp_configuration')
  .select('*')
  .eq('institution_code', inst?.counselling_code ?? '__none__')
  .eq('is_active', true)
  .maybeSingle();
if (sErr) console.error('  smtp_configuration query error:', sErr);

console.log('\n── smtp_configuration (institution account) ───────────');
if (!smtp) {
  console.log('  (no active row — notify-members would 400 before sending)');
} else {
  console.log('  host/port/secure :', `${smtp.smtp_host}:${smtp.smtp_port}  secure=${smtp.smtp_secure}`);
  console.log('  smtp_user        :', smtp.smtp_user);
  console.log('  password         :', describeSecret(smtp.smtp_password_encrypted));
  console.log('  sender_email     :', smtp.sender_email);
  console.log('  sender_name      :', smtp.sender_name);
  console.log('  ac_sender_email  :', smtp.ac_sender_email ?? '(none)');
}

const { data: boardSender } = meeting.board_id
  ? await SUPA
      .from('bos_board_senders')
      .select('*')
      .eq('institutions_id', meeting.institutions_id)
      .eq('board_id', meeting.board_id)
      .eq('is_active', true)
      .maybeSingle()
  : { data: null };

console.log('\n── bos_board_senders (per-board override) ────────────');
if (!boardSender) {
  console.log('  (none — institution account is used, From-only defaults apply)');
} else {
  console.log('  sender_email     :', boardSender.sender_email);
  console.log('  sender_name      :', boardSender.sender_name ?? '(none)');
  console.log('  smtp_host/port   :', `${boardSender.smtp_host ?? '(inherit)'}:${boardSender.smtp_port ?? '(inherit)'}  secure=${boardSender.smtp_secure ?? '(inherit)'}`);
  console.log('  smtp_user        :', boardSender.smtp_user ?? '(none — From-only override)');
  console.log('  password         :', describeSecret(boardSender.smtp_password_encrypted));
}

// mergeBoardSmtpConfig — verbatim from lib/services/bos-email-sender.ts
function mergeBoardSmtpConfig(base, board) {
  const user = board?.smtp_user?.trim();
  const pass = board?.smtp_password_encrypted?.trim();
  if (!board || !user || !pass) return { cfg: base, usesBoardAuth: false };
  return {
    usesBoardAuth: true,
    cfg: {
      ...base,
      smtp_host: board.smtp_host?.trim() || base.smtp_host,
      smtp_port: board.smtp_port ?? base.smtp_port,
      smtp_secure: board.smtp_secure ?? base.smtp_secure,
      smtp_user: user,
      smtp_password_encrypted: pass,
    },
  };
}

if (!smtp) process.exit(0);
const { cfg, usesBoardAuth } = mergeBoardSmtpConfig(smtp, boardSender);

console.log('\n── EFFECTIVE account this meeting authenticates as ────');
console.log('  auth model     :', usesBoardAuth ? 'Model 3 — board mailbox' : 'Model 1/2 — institution mailbox');
console.log('  host:port      :', `${cfg.smtp_host}:${cfg.smtp_port}`);
console.log('  AUTH user      :', cfg.smtp_user, '  ← this is what Gmail rejected if 535');
console.log('  password       :', describeSecret(cfg.smtp_password_encrypted));

// Reproduce the live handshake — same transporter options as getTransporter().
const transporter = nodemailer.createTransport({
  host: cfg.smtp_host,
  port: cfg.smtp_port,
  secure: cfg.smtp_secure && cfg.smtp_port === 465,
  auth: { user: cfg.smtp_user, pass: cfg.smtp_password_encrypted },
  requireTLS: cfg.smtp_port === 587,
});

console.log('\n── Live SMTP verify() ─────────────────────────────────');
try {
  await transporter.verify();
  console.log('  ✅ AUTH SUCCEEDED — credentials are valid.');
  console.log('     If sends still fail, the cause is per-recipient, not login.');
} catch (err) {
  console.log('  ❌ AUTH FAILED');
  console.log('     code     :', err.code);
  console.log('     response :', err.response);
  console.log('     message  :', err.message);
}

// Same check, with all whitespace stripped from the password — tells us whether
// a space-formatted Gmail App Password ("abcd efgh ijkl mnop") is the culprit.
const stripped = (cfg.smtp_password_encrypted ?? '').replace(/\s/g, '');
if (stripped && stripped !== cfg.smtp_password_encrypted) {
  console.log('\n── Retry with whitespace stripped from password ───────');
  try {
    await nodemailer
      .createTransport({
        host: cfg.smtp_host,
        port: cfg.smtp_port,
        secure: cfg.smtp_secure && cfg.smtp_port === 465,
        auth: { user: cfg.smtp_user, pass: stripped },
        requireTLS: cfg.smtp_port === 587,
      })
      .verify();
    console.log('  ✅ SUCCEEDS once whitespace is removed → stored password has spaces.');
  } catch (err2) {
    console.log('  ❌ still fails:', err2.response ?? err2.message);
  }
}

process.exit(0);
