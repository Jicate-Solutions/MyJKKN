/**
 * Move event registration-form files from Supabase Storage to Google Drive.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until 2026-10-08 the two event upload routes wrote to Supabase Storage:
 *
 *   event-registration-uploads (private)  registrants' files — the answer in
 *                                         events_registrations.custom_fields is
 *                                         { path, name, size, mime }
 *   event-form-media (public)             banners (events.hero_image_url) and
 *                                         'image_display' pictures
 *                                         (event_registration_form_fields.media_url)
 *
 * Both routes now write to Drive. This script moves what was already stored, so
 * the storage quota is actually freed, WITHOUT changing what an old event shows:
 *
 *   - a registrant file is copied to
 *       Event Registrations / <Event> [<id8>] / <Form> / <file>
 *     (no sharing permission) and `driveFileId` is ADDED to the answer. `path`
 *     is left as it was, so code deployed before the Drive change still reads
 *     the answer as an upload.
 *   - a banner / display image is copied to Event Form Media / <Event> [<id8>],
 *     shared anyone:reader, fetched once over its public URL to prove it
 *     renders, and only then is the stored URL swapped.
 *   - a file nothing points at (picked on a form that was never submitted, or a
 *     banner that was replaced) goes to an "_Unattached" sub-folder, unshared.
 *     Nothing is discarded.
 *
 * USAGE
 * -----
 *   node scripts/migrate-event-uploads-to-drive.mjs            # dry run: plan only
 *   node scripts/migrate-event-uploads-to-drive.mjs --apply    # copy + repoint
 *   node scripts/migrate-event-uploads-to-drive.mjs --apply --delete
 *                                                              # ...and free Supabase
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the GOOGLE_DRIVE_*
 * variables from .env / .env.local.
 *
 * SAFE TO RE-RUN. Every Drive copy is tagged appProperties.srcObject = the
 * Supabase object's filename, so a second run finds the copy instead of making
 * another, and finishes whatever a failed run left half-done.
 *
 * --delete removes a Supabase object ONLY when all of these hold:
 *   1. its Drive copy exists and is byte-for-byte the same size (the md5 was
 *      compared when the copy was made; a mismatch aborts that file);
 *   2. everything that referenced it now points at the Drive copy;
 *   3. for public media, the new URL answered 200 with an image.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const DELETE = process.argv.includes('--delete');
if (DELETE && !APPLY) {
  console.error('--delete needs --apply: nothing is deleted before its copy is confirmed.');
  process.exit(1);
}

const REG_BUCKET = 'event-registration-uploads';
const MEDIA_BUCKET = 'event-form-media';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ── env ──────────────────────────────────────────────────────────────────────

for (const file of ['.env', '.env.local']) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[m[1]] = value;
  }
}

function need(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} in .env / .env.local`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = need('NEXT_PUBLIC_SUPABASE_URL');
const supabase = createClient(SUPABASE_URL, need('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});
const DRIVE_ROOT = need('GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID');

// Same two auth paths as lib/google/drive-client.ts.
function buildDrive() {
  if (
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN &&
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
  ) {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth: oauth2 });
  }
  const auth = new google.auth.JWT({
    email: need('GOOGLE_DRIVE_CLIENT_EMAIL'),
    key: need('GOOGLE_DRIVE_PRIVATE_KEY').replace(/\\n/g, '\n').trim(),
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: process.env.GOOGLE_DRIVE_IMPERSONATE_SUBJECT || undefined,
  });
  return google.drive({ version: 'v3', auth });
}
const drive = buildDrive();

// ── Drive helpers ────────────────────────────────────────────────────────────

const folderCache = new Map();
const escapeQ = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function ensureFolder(parentId, name) {
  const clean = (name || 'Unknown').trim().slice(0, 120) || 'Unknown';
  const key = `${parentId}/${clean}`;
  if (folderCache.has(key)) return folderCache.get(key);
  const { data } = await drive.files.list({
    q: `name = '${escapeQ(clean)}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  let id = data.files?.[0]?.id;
  if (!id) {
    const created = await drive.files.create({
      requestBody: { name: clean, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: 'id',
      supportsAllDrives: true,
    });
    id = created.data.id;
  }
  if (!id) throw new Error(`Could not resolve Drive folder "${clean}"`);
  folderCache.set(key, id);
  return id;
}

async function ensureFolderPath(segments) {
  let parent = DRIVE_ROOT;
  for (const segment of segments) parent = await ensureFolder(parent, segment);
  return parent;
}

/** The copy an earlier run made of this Supabase object, if any. */
async function findDriveCopy(kind, srcObject) {
  const { data } = await drive.files.list({
    q:
      `appProperties has { key='srcObject' and value='${escapeQ(srcObject)}' } and ` +
      `appProperties has { key='kind' and value='${kind}' } and trashed = false`,
    fields: 'files(id, size, md5Checksum)',
    pageSize: 2,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return data.files?.[0] ?? null;
}

const cleanName = (s, max) => (s || '').replace(/[\r\n/\\]/g, ' ').trim().slice(0, max);
const eventFolderName = (name, id) => `${cleanName(name, 80) || 'Event'} [${id.slice(0, 8)}]`;
const mediaUrl = (fileId) => `https://lh3.googleusercontent.com/d/${fileId}=w1600`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Supabase helpers ─────────────────────────────────────────────────────────

/** Every file in a bucket laid out as <eventId>/<formId>/<file>. */
async function listBucket(bucket) {
  const out = [];
  async function walk(prefix, depth) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
      for (const entry of data) {
        const full = prefix ? `${prefix}/${entry.name}` : entry.name;
        // A folder has no id; a file does.
        if (entry.id === null) {
          if (depth < 4) await walk(full, depth + 1);
        } else {
          out.push({
            name: full,
            size: Number(entry.metadata?.size ?? 0),
            mime: entry.metadata?.mimetype || 'application/octet-stream',
          });
        }
      }
      if (data.length < 1000) break;
    }
  }
  await walk('', 0);
  return out;
}

async function selectAll(table, columns, build) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(supabase.from(table).select(columns)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function namesById(table, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const rows = await selectAll(table, 'id, name', (q) => q.in('id', ids));
  for (const row of rows) map.set(row.id, row.name);
  return map;
}

/**
 * Copy one Supabase object into Drive (or find the copy an earlier run made).
 * Returns { fileId } — or null on a dry run when no copy exists yet.
 */
async function copyToDrive({ bucket, kind, object, folderSegments, storedName, eventId, formId }) {
  const srcObject = object.name.split('/').pop();
  const existing = await findDriveCopy(kind, srcObject);
  if (existing) {
    if (Number(existing.size) !== object.size) {
      throw new Error(`Drive copy ${existing.id} is ${existing.size} bytes, Supabase has ${object.size}`);
    }
    return { fileId: existing.id, reused: true };
  }
  if (!APPLY) return null;

  const { data: blob, error } = await supabase.storage.from(bucket).download(object.name);
  if (error) throw new Error(`download: ${error.message}`);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const md5 = createHash('md5').update(buffer).digest('hex');

  const folderId = await ensureFolderPath(folderSegments);
  const created = await drive.files.create({
    requestBody: {
      name: storedName,
      parents: [folderId],
      appProperties: { kind, eventId, ...(formId ? { formId } : {}), srcObject },
    },
    media: { mimeType: object.mime, body: Readable.from(buffer) },
    fields: 'id, md5Checksum, size',
    supportsAllDrives: true,
  });
  const fileId = created.data.id;
  if (!fileId) throw new Error('Drive upload returned no file id.');
  if (created.data.md5Checksum !== md5) {
    await drive.files.delete({ fileId, supportsAllDrives: true }).catch(() => {});
    throw new Error(`md5 mismatch after upload (${created.data.md5Checksum} vs ${md5})`);
  }
  return { fileId, reused: false };
}

async function removeFromSupabase(bucket, name) {
  const { error } = await supabase.storage.from(bucket).remove([name]);
  if (error) throw new Error(`remove: ${error.message}`);
}

const stats = { copied: 0, reused: 0, repointed: 0, deleted: 0, failed: 0, bytesFreed: 0 };
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// ── 1. registrants' files ────────────────────────────────────────────────────

async function migrateRegistrationUploads() {
  const objects = await listBucket(REG_BUCKET);
  console.log(`\n== ${REG_BUCKET}: ${objects.length} objects, ${mb(objects.reduce((s, o) => s + o.size, 0))}`);
  if (!objects.length) return;

  const eventIds = [...new Set(objects.map((o) => o.name.split('/')[0]))];
  const formIds = [...new Set(objects.map((o) => o.name.split('/')[1]))];
  const [eventNames, formNames, registrations] = await Promise.all([
    namesById('events', eventIds),
    namesById('event_registration_forms', formIds),
    selectAll('events_registrations', 'id, event_id, custom_fields', (q) =>
      q.in('event_id', eventIds).not('custom_fields', 'is', null)
    ),
  ]);

  // storage path → every answer that points at it.
  const refs = new Map();
  for (const reg of registrations) {
    for (const [fieldKey, value] of Object.entries(reg.custom_fields ?? {})) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      if (typeof value.path !== 'string' || !value.path) continue;
      if (!refs.has(value.path)) refs.set(value.path, []);
      refs.get(value.path).push({ regId: reg.id, fieldKey, answer: value });
    }
  }
  const attached = objects.filter((o) => refs.has(o.name)).length;
  console.log(`   attached to a registration: ${attached} · unattached: ${objects.length - attached}`);

  for (const object of objects) {
    const [eventId, formId, fileName] = object.name.split('/');
    const objectRefs = refs.get(object.name) ?? [];
    const eventFolder = eventFolderName(eventNames.get(eventId), eventId);
    const formFolder = cleanName(formNames.get(formId), 80) || 'Form';
    try {
      const copy = await copyToDrive({
        bucket: REG_BUCKET,
        kind: 'event-registration-upload',
        object,
        folderSegments: objectRefs.length
          ? ['Event Registrations', eventFolder, formFolder]
          : ['Event Registrations', eventFolder, formFolder, '_Unattached'],
        // The registrant's own filename where we know it; the uuid keeps it unique.
        storedName: objectRefs.length
          ? `${fileName.slice(0, 8)}-${cleanName(objectRefs[0].answer.name, 160) || fileName}`
          : fileName,
        eventId,
        formId,
      });
      if (!copy) {
        console.log(`   plan  ${object.name} (${mb(object.size)}) → Drive${objectRefs.length ? '' : ' [_Unattached]'}`);
        continue;
      }
      copy.reused ? stats.reused++ : stats.copied++;

      let repointed = true;
      for (const ref of objectRefs) {
        if (ref.answer.driveFileId === copy.fileId) continue;
        if (!APPLY) {
          repointed = false;
          continue;
        }
        // Re-read the row: another answer on the same registration may have
        // been repointed a moment ago, and writing the stale copy would undo it.
        const { data: fresh, error: readError } = await supabase
          .from('events_registrations')
          .select('custom_fields')
          .eq('id', ref.regId)
          .single();
        if (readError) throw new Error(`read registration ${ref.regId}: ${readError.message}`);
        const fields = { ...(fresh.custom_fields ?? {}) };
        const current = fields[ref.fieldKey];
        if (!current || typeof current !== 'object' || current.path !== object.name) {
          throw new Error(`registration ${ref.regId} field ${ref.fieldKey} changed underneath the migration`);
        }
        fields[ref.fieldKey] = { ...current, driveFileId: copy.fileId };
        const { error: writeError } = await supabase
          .from('events_registrations')
          .update({ custom_fields: fields })
          .eq('id', ref.regId);
        if (writeError) throw new Error(`update registration ${ref.regId}: ${writeError.message}`);
        stats.repointed++;
      }

      if (DELETE && repointed) {
        await removeFromSupabase(REG_BUCKET, object.name);
        stats.deleted++;
        stats.bytesFreed += object.size;
      }
      console.log(
        `   ok    ${object.name} → ${copy.fileId}${copy.reused ? ' (already copied)' : ''}` +
          `${objectRefs.length ? '' : ' [_Unattached]'}${DELETE && repointed ? ' · removed from Supabase' : ''}`
      );
    } catch (err) {
      stats.failed++;
      console.error(`   FAIL  ${object.name}: ${err.message}`);
    }
  }
}

// ── 2. banners + display images ──────────────────────────────────────────────

/** True once the public URL answers 200 with an image. Sharing takes a moment. */
async function rendersPublicly(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok && (res.headers.get('content-type') || '').startsWith('image/')) return true;
    } catch {
      // retry
    }
    await sleep(2000);
  }
  return false;
}

async function migrateFormMedia() {
  const objects = await listBucket(MEDIA_BUCKET);
  console.log(`\n== ${MEDIA_BUCKET}: ${objects.length} objects, ${mb(objects.reduce((s, o) => s + o.size, 0))}`);
  if (!objects.length) return;

  const marker = `/${MEDIA_BUCKET}/`;
  const [events, fields] = await Promise.all([
    selectAll('events', 'id, name, hero_image_url', (q) => q.like('hero_image_url', `%${marker}%`)),
    selectAll('event_registration_form_fields', 'id, media_url', (q) => q.like('media_url', `%${marker}%`)),
  ]);
  const eventNames = await namesById('events', [...new Set(objects.map((o) => o.name.split('/')[0]))]);

  for (const object of objects) {
    const [eventId, , fileName] = object.name.split('/');
    const suffix = `${marker}${object.name}`;
    const heroRefs = events.filter((e) => e.hero_image_url.endsWith(suffix));
    const fieldRefs = fields.filter((f) => f.media_url.endsWith(suffix));
    const used = heroRefs.length + fieldRefs.length > 0;
    const eventFolder = eventFolderName(eventNames.get(eventId), eventId);
    try {
      const copy = await copyToDrive({
        bucket: MEDIA_BUCKET,
        kind: 'event-form-media',
        object,
        folderSegments: used
          ? ['Event Form Media', eventFolder]
          : ['Event Form Media', eventFolder, '_Unattached'],
        storedName: fileName,
        eventId,
        formId: null,
      });
      if (!copy) {
        console.log(`   plan  ${object.name} (${mb(object.size)}) → Drive${used ? '' : ' [_Unattached]'}`);
        continue;
      }
      copy.reused ? stats.reused++ : stats.copied++;

      if (used) {
        const url = mediaUrl(copy.fileId);
        // Idempotent: Drive keeps one anyone:reader permission however often asked.
        await drive.permissions.create({
          fileId: copy.fileId,
          requestBody: { role: 'reader', type: 'anyone' },
          supportsAllDrives: true,
        });
        // Prove the new URL renders BEFORE any live page is pointed at it.
        if (!(await rendersPublicly(url))) throw new Error(`${url} did not serve an image`);

        for (const event of heroRefs) {
          const { error } = await supabase
            .from('events')
            .update({ hero_image_url: url })
            .eq('id', event.id)
            .eq('hero_image_url', event.hero_image_url);
          if (error) throw new Error(`update event ${event.id}: ${error.message}`);
          stats.repointed++;
        }
        for (const field of fieldRefs) {
          const { error } = await supabase
            .from('event_registration_form_fields')
            .update({ media_url: url })
            .eq('id', field.id)
            .eq('media_url', field.media_url);
          if (error) throw new Error(`update field ${field.id}: ${error.message}`);
          stats.repointed++;
        }
      }

      if (DELETE) {
        await removeFromSupabase(MEDIA_BUCKET, object.name);
        stats.deleted++;
        stats.bytesFreed += object.size;
      }
      console.log(
        `   ok    ${object.name} → ${copy.fileId}${copy.reused ? ' (already copied)' : ''}` +
          `${used ? '' : ' [_Unattached]'}${DELETE ? ' · removed from Supabase' : ''}`
      );
    } catch (err) {
      stats.failed++;
      console.error(`   FAIL  ${object.name}: ${err.message}`);
    }
  }
}

// ── run ──────────────────────────────────────────────────────────────────────

console.log(
  `Project ${new URL(SUPABASE_URL).hostname.split('.')[0]} · mode: ` +
    (APPLY ? (DELETE ? 'APPLY + DELETE' : 'APPLY (copy + repoint, Supabase objects kept)') : 'DRY RUN')
);
await migrateRegistrationUploads();
await migrateFormMedia();
console.log(
  `\nDone. copied ${stats.copied} · already in Drive ${stats.reused} · references repointed ${stats.repointed}` +
    ` · removed from Supabase ${stats.deleted} (${mb(stats.bytesFreed)}) · failed ${stats.failed}`
);
if (stats.failed) process.exit(1);
