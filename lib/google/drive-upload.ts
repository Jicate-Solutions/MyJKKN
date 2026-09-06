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

export interface ResumeUploadOptions {
  jobTitle: string;
  jobCode?: string | null;
  jobId: string;
  file: File;
}

export interface ResumeUploadResult {
  url: string;
  driveFileId: string;
}

/**
 * Upload a resume file to HR Recruitment / {Job Title} [{code}] / {timestamp}-{filename}.
 * The folder path is auto-created on first upload and cached per server process.
 * Returns the Drive webViewLink to store as resume_url.
 */
export async function uploadResumeToJobFolder(opts: ResumeUploadOptions): Promise<ResumeUploadResult> {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured for this server.');
  const drive = createDriveClient();

  const jobLabel = (opts.jobCode?.trim() || opts.jobId.slice(0, 8)).toUpperCase();
  const jobFolderName = `${opts.jobTitle.slice(0, 80).trim()} [${jobLabel}]`;

  const folderId = await ensureFolderPath(drive, ['HR Recruitment', jobFolderName]);

  const buffer = Buffer.from(await opts.file.arrayBuffer());
  const safeName = (opts.file.name || 'resume').replace(/[\r\n]/g, ' ').slice(0, 200);
  const storedName = `${Date.now()}-${safeName}`;

  const created = await drive.files.create({
    requestBody: { name: storedName, parents: [folderId] },
    media: { mimeType: opts.file.type || 'application/octet-stream', body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error('Drive upload returned no file id.');

  // No public permission — resumes contain PII. Access is via the service account
  // only; HR staff view resumes through the authenticated /resume proxy route.

  return {
    url: `https://drive.google.com/file/d/${fileId}/view`,
    driveFileId: fileId,
  };
}

/**
 * Permanently delete a Drive file (skips the trash — a trashed resume is still a
 * readable resume). Used by the super-admin purge of a rejected applicant.
 *
 * Returns false instead of throwing when the file is already gone (404) or Drive
 * isn't configured, so a purge is never blocked by the storage side. The caller
 * keeps the file id in hr_recruitment_purge_log until this returns true.
 */
export async function deleteDriveFile(fileId: string): Promise<boolean> {
  if (!isDriveConfigured() || !fileId) return false;

  try {
    await createDriveClient().files.delete({ fileId, supportsAllDrives: true });
    return true;
  } catch (err) {
    const status = (err as { code?: number; status?: number })?.code
      ?? (err as { status?: number })?.status;
    // Already deleted — the desired end state either way.
    if (status === 404) return true;
    console.error(`[drive] delete failed for file ${fileId}`, err);
    return false;
  }
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

export interface ProcurementQuotationUploadOptions {
  institutionName: string;
  rfqNumber: string;
  file: File;
}

export interface ProcurementQuotationUploadResult {
  name: string;
  driveFileId: string;
  url: string;
}

/**
 * Upload a vendor quotation document to
 *   <ROOT> / Procurement / <Institution> / Quotations / <RFQ>
 * and grant anyone-with-link read (staff view via the stored URL). Returns the
 * metadata to persist on procurement_quotations.document_url / document_file_id.
 */
export async function uploadProcurementQuotation(
  opts: ProcurementQuotationUploadOptions
): Promise<ProcurementQuotationUploadResult> {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured.');
  const drive = createDriveClient();

  const folderId = await ensureFolderPath(drive, [
    'Procurement',
    opts.institutionName,
    'Quotations',
    opts.rfqNumber,
  ]);

  const buffer = Buffer.from(await opts.file.arrayBuffer());
  const safeName = (opts.file.name || 'quotation').replace(/[\r\n]/g, ' ').slice(0, 200);
  const storedName = `${Date.now()}-${safeName}`;

  const created = await drive.files.create({
    requestBody: { name: storedName, parents: [folderId] },
    media: { mimeType: opts.file.type || 'application/octet-stream', body: Readable.from(buffer) },
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

export interface RefundAttachmentUploadOptions {
  institutionName: string;
  requestRef: string; // request_number, or 'draft-<studentId>' before initiation
  file: File;
}

/** Upload a refund supporting document to <ROOT>/Billing Refunds/<Institution>/<RequestRef>. */
export async function uploadRefundAttachment(
  opts: RefundAttachmentUploadOptions
): Promise<{ name: string; driveFileId: string; url: string }> {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured.');
  const drive = createDriveClient();
  const folderId = await ensureFolderPath(drive, ['Billing Refunds', opts.institutionName, opts.requestRef]);
  const buffer = Buffer.from(await opts.file.arrayBuffer());
  const safeName = (opts.file.name || 'file').replace(/[\r\n]/g, ' ').slice(0, 200);
  const storedName = `${Date.now()}-${safeName}`;
  const created = await drive.files.create({
    requestBody: { name: storedName, parents: [folderId] },
    media: { mimeType: opts.file.type || 'application/octet-stream', body: Readable.from(buffer) },
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

export interface RoomConditionPhotoUploadOptions {
  blockName: string;
  roomNumber: string;
  file: File;
}

export interface RoomConditionPhotoUploadResult {
  name: string;
  driveFileId: string;
  url: string;
}

/**
 * Upload a room condition-check photo to
 *   <ROOT> / Campus Living / Room Condition Photos / <Block> / <Room>
 * No anyone:reader permission — access is gated by hostel_room_condition_photos
 * RLS plus the authenticated image proxy route, not public link-sharing.
 * blockName/roomNumber (not an institution name) key the folder path since a
 * block can serve multiple institutions via hostel_block_institutions.
 */
export async function uploadRoomConditionPhoto(
  opts: RoomConditionPhotoUploadOptions
): Promise<RoomConditionPhotoUploadResult> {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured.');
  const drive = createDriveClient();
  const folderId = await ensureFolderPath(drive, [
    'Campus Living', 'Room Condition Photos', opts.blockName, opts.roomNumber,
  ]);
  const buffer = Buffer.from(await opts.file.arrayBuffer());
  const safeName = (opts.file.name || 'photo').replace(/[\r\n]/g, ' ').slice(0, 200);
  const storedName = `${Date.now()}-${safeName}`;
  const created = await drive.files.create({
    requestBody: { name: storedName, parents: [folderId] },
    media: { mimeType: opts.file.type || 'application/octet-stream', body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  const fileId = created.data.id;
  if (!fileId) throw new Error('Drive upload returned no file id.');
  return {
    name: opts.file.name || storedName,
    driveFileId: fileId,
    url: created.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
  };
}

export interface ProcurementInvoiceUploadOptions {
  institutionName: string;
  poNumber: string;
  file: File;
}

export interface ProcurementInvoiceUploadResult {
  name: string;
  driveFileId: string;
  url: string;
}

/**
 * Upload a supplier invoice document to
 *   <ROOT> / Procurement / <Institution> / Invoices / <PO>
 * and grant anyone-with-link read. Returns the metadata to persist on
 * procurement_grn.invoice_document_url.
 */
export async function uploadProcurementInvoice(
  opts: ProcurementInvoiceUploadOptions
): Promise<ProcurementInvoiceUploadResult> {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured.');
  const drive = createDriveClient();

  const folderId = await ensureFolderPath(drive, [
    'Procurement',
    opts.institutionName,
    'Invoices',
    opts.poNumber,
  ]);

  const buffer = Buffer.from(await opts.file.arrayBuffer());
  const safeName = (opts.file.name || 'invoice').replace(/[\r\n]/g, ' ').slice(0, 200);
  const storedName = `${Date.now()}-${safeName}`;

  const created = await drive.files.create({
    requestBody: { name: storedName, parents: [folderId] },
    media: { mimeType: opts.file.type || 'application/octet-stream', body: Readable.from(buffer) },
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

export interface LeaveDocumentUploadOptions {
  /** HR organisation the applicant belongs to — the top grouping in Drive. */
  organizationName: string;
  /** Leave start date (yyyy-mm-dd). Only the yyyy-mm is used, for the folder. */
  startDate: string;
  /** staff.staff_id, the human-facing code. Goes in the filename. */
  staffCode: string | null;
  /** e.g. 'OD'. Goes in the filename so a folder listing is readable. */
  leaveTypeCode: string;
  file: File;
}

export interface LeaveDocumentUploadResult {
  name: string;
  driveFileId: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Upload a leave supporting document to
 *   HR Leave / {Organisation} / {yyyy-mm} / {ts}-{staffCode}-{TYPE}-{filename}
 *
 * WHY MONTH FOLDERS AND NOT PER-STAFF. These are read through the approval
 * screen, by application, not by browsing Drive — the folder tree only has to
 * stay navigable for the occasional audit. A folder per staff member would
 * create 658 of them and grow with every hire; a folder per month tops out at
 * twelve a year per organisation. The staff code goes in the FILENAME instead,
 * so one glance at a month folder still tells you whose document is whose.
 *
 * NO PUBLIC PERMISSION, deliberately. Medical certificates and duty orders are
 * PII; every other upload helper in this file that calls permissions.create is
 * handling something already public. The bytes reach an approver through
 * /api/hr/leave/documents/[fileId], which authorises the viewer against the
 * application first. The returned `url` is a convenience for someone who
 * already has Drive access — it is NOT a shareable link, and nothing in the UI
 * should treat it as one.
 */
export async function uploadLeaveDocument(
  opts: LeaveDocumentUploadOptions,
): Promise<LeaveDocumentUploadResult> {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured for this server.');
  const drive = createDriveClient();

  // Slice rather than parse: the value is already a yyyy-mm-dd date column, and
  // new Date() here would drag the server's timezone into a folder name.
  const monthFolder = /^\d{4}-\d{2}/.test(opts.startDate)
    ? opts.startDate.slice(0, 7)
    : 'undated';

  const folderId = await ensureFolderPath(drive, [
    'HR Leave',
    opts.organizationName,
    monthFolder,
  ]);

  const buffer = Buffer.from(await opts.file.arrayBuffer());
  const safeName = (opts.file.name || 'document').replace(/[\r\n]/g, ' ').slice(0, 160);
  const who = (opts.staffCode || 'unknown').replace(/[\r\n/]/g, '').slice(0, 32);
  const storedName = `${Date.now()}-${who}-${opts.leaveTypeCode}-${safeName}`;

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

  return {
    name: opts.file.name || safeName,
    driveFileId: fileId,
    url: created.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
    mimeType: opts.file.type || 'application/octet-stream',
    sizeBytes: buffer.byteLength,
  };
}

export interface BillCancellationAttachmentUploadOptions {
  institutionName: string;
  billRef: string; // bill id, or a short human ref for the folder name
  file: File;
}

/**
 * Upload a bill-cancellation supporting document to
 * <ROOT>/Bill Cancellations/<Institution>/<BillRef>.
 *
 * Cancelling a bill writes off money, so the evidence has to outlive the
 * session that raised it: fn_cancel_student_bill refuses to cancel without at
 * least one of these. Shared-readable like refund attachments, because the
 * links are opened straight from the audit strip by whoever reviews the
 * cancellation later.
 */
export async function uploadBillCancellationAttachment(
  opts: BillCancellationAttachmentUploadOptions
): Promise<{ name: string; driveFileId: string; url: string }> {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured.');
  const drive = createDriveClient();
  const folderId = await ensureFolderPath(drive, [
    'Bill Cancellations',
    opts.institutionName,
    opts.billRef,
  ]);
  const buffer = Buffer.from(await opts.file.arrayBuffer());
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
