# Google Drive Architecture — MyJKKN

## Env vars (all required)

```bash
# Auth — OAuth2 path (personal Gmail — ACTIVE)
GOOGLE_DRIVE_OAUTH_CLIENT_ID=994268945457-...apps.googleusercontent.com
GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=GOCSPX-...
GOOGLE_DRIVE_REFRESH_TOKEN=1//0g...

# Root folder (shared with service account OR owned by OAuth user)
GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID=1xR8xwYQnEOfhcq1xvBiSp-Y2UAU__wKn

# Auth — JWT service account path (Workspace / Shared Drive — FALLBACK)
GOOGLE_DRIVE_CLIENT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_IMPERSONATE_SUBJECT=   # optional, domain-wide delegation only
```

## `isDriveConfigured()` logic (`lib/google/drive-client.ts`)

```
if REFRESH_TOKEN + OAUTH_CLIENT_ID + OAUTH_CLIENT_SECRET + ROOT_FOLDER_ID → OAuth2 path (active)
else if CLIENT_EMAIL + PRIVATE_KEY (valid PEM) + ROOT_FOLDER_ID            → JWT path (fallback)
else → false → callers return 503
```

Always call `isDriveConfigured()` at the top of every API route before doing anything.

## Auth paths

### Path A — OAuth2 with refresh token (CURRENT)
Files owned by the Gmail user. Uses Gmail's 15 GB storage quota. Required for personal Gmail accounts. `createDriveClient()` returns `google.drive` authenticated via `OAuth2` with `setCredentials({ refresh_token })`. Auto-refreshes access tokens — no manual rotation needed.

### Path B — JWT service account (FALLBACK)
Files owned by the service account. Only works when the SA is a member of a Google Workspace Shared Drive OR domain-wide delegation is configured. Personal Gmail SA uploads fail with 403 "Service Accounts do not have storage quota."

## `lib/google/drive-upload.ts` — key internals

### `folderCache: Map<string, string>`
Module-level in-process cache. Key: `${parentId}/${folderName}`. Avoids repeat `drive.files.list()` calls for the same folder path within one server process. Cold-start (server restart) does one lookup per unique folder, then caches.

### `ensureFolder(drive, parentId, name)`
Find-or-create one folder named `name` under `parentId`. Returns `folderId`. Uses `folderCache`. Folder names truncated to 120 chars, special chars in Drive query escaped via `escapeQ()`.

### `ensureFolderPath(drive, segments)`
Chains `ensureFolder()` from `GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID` through each segment. Empty/null segments skipped. Returns leaf `folderId`.

### `supportsAllDrives: true`
All Drive API calls use this flag. Allows the same code to work with both My Drive folders and Shared (Team) Drives without changes.

## Adding a new upload function

Always follow the existing exports pattern in `drive-upload.ts`:
1. Define `XxxUploadOptions` interface and `XxxUploadResult` interface
2. Export `uploadXxxToFolder(opts): Promise<XxxUploadResult>`
3. Call `ensureFolderPath` with the module's folder segments
4. `Buffer.from(await opts.file.arrayBuffer())` + `Readable.from(buffer)` for streaming
5. Return `{ url: webViewLink ?? fallback, driveFileId: fileId }`

## Root folder

`GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID = 1xR8xwYQnEOfhcq1xvBiSp-Y2UAU__wKn`

This is a folder in the JKKN common Google account's Drive, shared with the service account (Editor). All module subfolders are created inside this root automatically.
