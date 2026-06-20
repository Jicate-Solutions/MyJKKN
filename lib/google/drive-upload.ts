/**
 * Parent Portal — Google Drive attachment uploads.
 *
 * Folder tree (auto-created, one shared file per upload — no duplicate copies):
 *   <ROOT> / <Institution> / <Feature> / <Program?> / <Section?> / file
 *
 * Program/Section are appended only when the caller resolves an UNAMBIGUOUS
 * single value (see the upload route's smart fallback). Resolved folder ids are
 * cached for the server process so repeat uploads skip the lookup.
 *
 * Node runtime only (uses node:stream + the service-account JWT client).
 */
import { Readable } from 'node:stream';
import { createDriveClient, isDriveConfigured } from './drive-client';
import type { Attachment } from '@/types/parent-portal';

export type PPFeature = 'announcements' | 'homework' | 'achievements';

const FEATURE_FOLDER: Record<PPFeature, string> = {
  announcements: 'Announcements',
  homework: 'Homework',
  achievements: 'Achievements',
};

type Drive = ReturnType<typeof createDriveClient>;

// Cache: `${parentId}/${name}` → folderId. Lives for the server process.
const folderCache = new Map<string, string>();

/** Drive folder names can't contain a single quote unescaped inside the query. */
function escapeQ(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Find-or-create one folder named `name` under `parentId`. */
async function ensureFolder(drive: Drive, parentId: string, name: string): Promise<string> {
  const clean = (name || 'Unknown').trim().slice(0, 120) || 'Unknown';
  const cacheKey = `${parentId}/${clean}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  const { data } = await drive.files.list({
    q: `name = '${escapeQ(clean)}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  let id = data.files?.[0]?.id ?? undefined;
  if (!id) {
    const created = await drive.files.create({
      requestBody: {
        name: clean,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    id = created.data.id ?? undefined;
  }
  if (!id) throw new Error(`Could not resolve Drive folder "${clean}"`);
  folderCache.set(cacheKey, id);
  return id;
}

/** Ensure the full chain and return the leaf folder id. Empty segments skipped. */
async function ensureFolderPath(drive: Drive, segments: Array<string | null | undefined>): Promise<string> {
  const root = process.env.GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new Error('GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID is not set.');
  let parent = root;
  for (const seg of segments) {
    if (!seg || !seg.trim()) continue;
    parent = await ensureFolder(drive, parent, seg);
  }
  return parent;
}

export interface UploadOptions {
  feature: PPFeature;
  institutionName: string;
  programName?: string | null; // appended only when unambiguous
  sectionName?: string | null; // appended only when unambiguous
  file: File;
}

/**
 * Upload one file to <Institution>/<Feature>/<Program?>/<Section?> and grant
 * anyone-with-link read access (parents aren't Google-authenticated). Returns
 * the Attachment metadata to persist in the *_attachment_urls JSONB column.
 */
export async function uploadParentPortalAttachment(opts: UploadOptions): Promise<Attachment> {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured.');
  const drive = createDriveClient();

  const folderId = await ensureFolderPath(drive, [
    opts.institutionName,
    FEATURE_FOLDER[opts.feature],
    opts.programName,
    opts.sectionName,
  ]);

  const buffer = Buffer.from(await opts.file.arrayBuffer());
  // Prefix with a timestamp so same-named files don't collide in a folder.
  const safeName = (opts.file.name || 'file').replace(/[\r\n]/g, ' ').slice(0, 200);
  const storedName = `${Date.now()}-${safeName}`;

  const created = await drive.files.create({
    requestBody: { name: storedName, parents: [folderId] },
    media: {
      mimeType: opts.file.type || 'application/octet-stream',
      body: Readable.from(buffer),
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error('Drive upload returned no file id.');

  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  });

  return {
    name: opts.file.name || storedName,
    driveFileId: fileId,
    url: created.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
  };
}
