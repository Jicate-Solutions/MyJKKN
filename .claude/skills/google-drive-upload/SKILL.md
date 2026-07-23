---
name: google-drive-upload
description: >
  Implement Google Drive file storage for any MyJKKN module as a replacement
  for Supabase Storage. Use when a feature needs to upload files (resumes,
  documents, images, attachments) and store a Drive link in the DB instead of
  consuming Supabase storage quota. Covers: adding a new upload function to
  lib/google/drive-upload.ts, creating a multipart/form-data API route, wiring
  a client-side component to POST to that route, and storing the Drive URL + 
  file ID in the database. Triggers: "store file in Drive", "upload to Google
  Drive", "avoid Supabase storage", "Drive file upload", or any request to add
  file upload to a module where Supabase Storage is not desired.
---

# Google Drive Upload — MyJKKN Skill

## Infrastructure overview

All Drive logic lives in two existing files — never recreate them:

- `lib/google/drive-client.ts` — OAuth2 + JWT auth, `isDriveConfigured()`, `createDriveClient()`
- `lib/google/drive-upload.ts` — `ensureFolder()`, `ensureFolderPath()`, upload helpers

Read `references/architecture.md` for env vars, auth paths, and how the folder cache works.

## Adding a new module — 4-step pattern

### Step 1 — Add an upload function to `lib/google/drive-upload.ts`

Export a new typed function following the same shape as `uploadResumeToJobFolder`:

```ts
export async function uploadXxxToFolder(opts: XxxUploadOptions): Promise<{ url: string; driveFileId: string }> {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured.');
  const drive = createDriveClient();

  // Define folder path: top-level module folder / sub-grouping
  const folderId = await ensureFolderPath(drive, ['Module Name', opts.subfolder]);

  const buffer = Buffer.from(await opts.file.arrayBuffer());
  const storedName = `${Date.now()}-${(opts.file.name || 'file').replace(/[\r\n]/g, ' ').slice(0, 200)}`;

  const created = await drive.files.create({
    requestBody: { name: storedName, parents: [folderId] },
    media: { mimeType: opts.file.type || 'application/octet-stream', body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error('Drive upload returned no file id.');

  // Only add permissions.create if the file needs to be publicly accessible.
  // For PII (resumes, medical, HR docs) — NO public permission. Use proxy route instead.

  return {
    url: `https://drive.google.com/file/d/${fileId}/view`,
    driveFileId: fileId,
  };
}
```

Key rules:
- `export const runtime = 'nodejs'` on every API route that calls Drive
- Always import `Readable` from `'node:stream'`
- No `anyone:reader` permission for PII files — store `driveFileId` and serve via authenticated proxy
- `anyone:reader` is acceptable for non-sensitive public content (announcements, homework)

### Step 2 — Create the API route

Path: `app/api/<module>/<resource>/upload/route.ts`

```ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 1. Auth check (getClient() + supabase.auth.getUser())
// 2. isDriveConfigured() guard → 503
// 3. Parse multipart: request.formData() → file = formData.get('file')
// 4. Validate type + size
// 5. Call uploadXxxToFolder()
// 6. Return { url, driveFileId, filename, sizeBytes }
```

Always `await params` before accessing `.id` (Next.js 16 — params is a Promise).

### Step 3 — Update the client component

Replace any Supabase Storage upload with:

```ts
const formData = new FormData();
formData.append('file', file);
const res = await fetch('/api/<module>/<resource>/upload', { method: 'POST', body: formData });
if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
const { url, driveFileId, filename, sizeBytes } = await res.json();
```

### Step 4 — Store in DB

Add a `drive_file_id TEXT` column to the relevant table (migration + `types/supabase.ts` + domain type). Store `url` as the public-facing link and `drive_file_id` as the key for future authenticated download proxy.

## Folder naming conventions

```
<ROOT>/
  ├── HR Recruitment/         ← hr resume uploads
  │    └── Job Title [CODE]/
  ├── Parent Portal/          ← existing announcements/homework
  │    └── Institution/Feature/Program/Section/
  └── <New Module>/           ← add here
       └── <Sub-grouping>/
```

Use `ensureFolderPath(drive, ['Module Folder', subfolder])`. The `folderCache` Map avoids repeat Drive API calls within a server process lifetime.

## Decision: public vs. private files

| File type | Permission | How HR/admin views it |
|---|---|---|
| Non-sensitive (announcements, assets) | `anyone:reader` → store `webViewLink` | Direct link |
| PII / sensitive (resumes, medical, HR) | No permission | Authenticated proxy route that calls `drive.files.get({ alt: 'media' })` |

## Reference files

- `references/architecture.md` — env vars, both auth paths, folderCache details, `isDriveConfigured()` logic
- `references/implementation-guide.md` — full worked checklist with all files to touch
- `references/hr-example.md` — the HR resume upload as a concrete reference implementation
