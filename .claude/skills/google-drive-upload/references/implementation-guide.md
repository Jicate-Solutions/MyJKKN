# Implementation Checklist — New Module Drive Upload

Use this for every new module that needs Drive file storage. Each section maps to a file to touch.

## 1. `lib/google/drive-upload.ts` — add upload function

- [ ] Define `XxxUploadOptions` interface (file, plus any grouping fields like jobId, moduleId)
- [ ] Define `XxxUploadResult` interface (`{ url: string; driveFileId: string }`)
- [ ] Export `async function uploadXxxToFolder(opts): Promise<XxxUploadResult>`
- [ ] Choose folder path — e.g. `['Module Name', groupingName]`
- [ ] Call `ensureFolderPath(drive, segments)` to get `folderId`
- [ ] `Buffer.from(await opts.file.arrayBuffer())` → `Readable.from(buffer)`
- [ ] `drive.files.create({ requestBody: { name: storedName, parents: [folderId] }, media: {...}, fields: 'id, webViewLink', supportsAllDrives: true })`
- [ ] Decide PII vs. public — add `drive.permissions.create` only for public files
- [ ] Return `{ url, driveFileId }`

## 2. DB migration

- [ ] `ALTER TABLE <table> ADD COLUMN IF NOT EXISTS drive_file_id TEXT;`
- [ ] Apply via Supabase MCP: `mcp__supabase__apply_migration`
- [ ] Mirror in `supabase/setup/01_tables.sql`

## 3. `types/supabase.ts`

- [ ] Add `drive_file_id: string | null` to Row
- [ ] Add `drive_file_id?: string | null` to Insert
- [ ] Add `drive_file_id?: string | null` to Update

## 4. Domain types (`types/<module>.ts`)

- [ ] Add `drive_file_id: string | null` to the main interface
- [ ] Add `drive_file_id?: string | null` to the Insert/input interface

## 5. API route — `app/api/<module>/<resource>/upload/route.ts`

Required boilerplate:
```ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';   // REQUIRED — googleapis uses Node streams
```

Route body checklist:
- [ ] `await connection()` (Next.js dynamic rendering signal)
- [ ] `isDriveConfigured()` check → return 503 if false
- [ ] Auth: `getClient()` + `supabase.auth.getUser()` → 401 if no user
- [ ] If route has `[id]` param: `const { id } = await params;` (Next.js 16 — params is a Promise)
- [ ] Validate resource exists (e.g. job is 'open') → 404/422
- [ ] `const formData = await request.formData()`
- [ ] `const file = formData.get('file')` — check it's a `File` not string
- [ ] Validate MIME type against allowlist
- [ ] Validate `file.size <= MAX_BYTES`
- [ ] Call `uploadXxxToFolder(...)` → destructure `{ url, driveFileId }`
- [ ] Return `NextResponse.json({ url, driveFileId, filename: file.name, sizeBytes: file.size })`

## 6. Client component

State to track (in addition to file selection UI):
```ts
const [driveFileId, setDriveFileId] = useState('');
```

Upload on "Next"/"Submit":
```ts
const formData = new FormData();
formData.append('file', file);
const res = await fetch('/api/<module>/<resource>/upload', { method: 'POST', body: formData });
if (!res.ok) throw new Error((await res.json() as {error?:string}).error || 'Upload failed');
const data = await res.json() as { url: string; driveFileId: string; filename: string; sizeBytes: number };
// pass data.url, data.driveFileId, data.filename, data.sizeBytes to next step
```

Remove any Supabase Storage imports: `createClientSupabaseClient`, bucket constants, `supabase.storage.from(...).upload(...)`.

## 7. Insert / mutation

In the service or API route that persists the record:
- [ ] Include `drive_file_id: driveFileId ?? null` in the insert payload
- [ ] The `url` (Drive webViewLink) goes into the existing URL/link column

## 8. Authenticated download proxy (for PII files)

When files must NOT be publicly accessible, create:
`app/api/<module>/<resource>/[id]/download/route.ts`

```ts
// 1. Auth + permission check (hr.recruitment.view or equivalent)
// 2. Fetch drive_file_id from DB
// 3. const drive = createDriveClient()
// 4. const stream = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' })
// 5. Pipe stream to NextResponse with Content-Disposition: attachment
```

## Common mistakes

| Mistake | Fix |
|---|---|
| `params.id` without await | `const { id } = await params` (Next.js 16) |
| Missing `runtime = 'nodejs'` | Drive uses Node streams — Edge runtime will crash |
| `anyone:reader` on PII files | No permission + proxy route |
| Service account used with personal Gmail | Ensure OAuth2 env vars set; `isDriveConfigured()` picks OAuth2 first |
| Not returning `driveFileId` from upload route | Always include — needed for proxy route |
| Forgetting to update `types/supabase.ts` | TS build silently ignores the column |
