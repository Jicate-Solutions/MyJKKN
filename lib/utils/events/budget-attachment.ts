// lib/utils/events/budget-attachment.ts
// Rules for a budget line's attachment (BUG-004627) — shared by the upload
// route (authoritative) and the board (early feedback before uploading).

export const BUDGET_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** `accept` attribute for the file picker. */
export const BUDGET_ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx';

/** null when the file is acceptable, otherwise the message to show. */
export function budgetAttachmentError(file: { size: number; type: string }): string | null {
  if (file.size === 0) return 'The file is empty.';
  if (file.size > BUDGET_ATTACHMENT_MAX_BYTES) return 'The file is larger than 10 MB.';
  if (!ALLOWED_MIMES.has(file.type)) {
    return 'Attach a PDF, an image (JPG / PNG / WEBP), or a Word / Excel file.';
  }
  return null;
}
