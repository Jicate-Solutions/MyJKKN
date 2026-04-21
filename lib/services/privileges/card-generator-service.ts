/**
 * Privilege Card Generator Service
 * Created: 2026-04-21
 *
 * Generates a printable PDF "Privilege Card" for a learner — one card bundles
 * ALL active privileges the learner currently holds. Inspired by Vijay's TVK
 * "Tamil Nadu Citizen Privilege Card" philosophy: physical > digital,
 * bundling > fragmentation, visibility > invisibility.
 *
 * The service is READ-ONLY. No DB mutations. Caller-supplied Supabase client
 * is used so RLS applies (the route wraps this with withAuth + session cookies).
 *
 * Output: PDF bytes as Uint8Array (ready for NextResponse streaming).
 */

import jsPDF from 'jspdf';
import * as QRCode from 'qrcode';
import { logger } from '@/lib/utils/enhanced-logger';

// ── JKKN Brand Colors (RGB) ─────────────────────────────────────────────────
const JKKN_GREEN = { r: 11, g: 109, b: 65 };       // #0b6d41
const JKKN_YELLOW = { r: 255, g: 222, b: 89 };     // #ffde59
const JKKN_CREAM = { r: 251, g: 251, b: 238 };     // #fbfbee
const DARK_TEXT = { r: 30, g: 30, b: 30 };
const MUTED_TEXT = { r: 100, g: 100, b: 100 };
const WHITE = { r: 255, g: 255, b: 255 };

// ── Types ──────────────────────────────────────────────────────────────────

export interface PrivilegeCardMember {
  member_id: string;
  group_id: string;
  group_name: string;
  reference_code: string;
  renewal_status: string;
  start_date: string;
  end_date: string | null;
  privilege_types: Array<{ key: string; name: string }>;
}

export interface PrivilegeCardLearner {
  id: string;
  full_name: string;
  roll_number: string | null;
  photo_url: string | null;
  department_name: string | null;
  program_name: string | null;
  institution_name: string | null;
}

export interface PrivilegeCardData {
  learner: PrivilegeCardLearner;
  memberships: PrivilegeCardMember[];
  verificationUrl: string;
  issuedAt: Date;
}

// ── Data Fetcher ───────────────────────────────────────────────────────────

/**
 * Fetch all active privilege memberships for a learner + learner context.
 * Caller must pass an authenticated Supabase client (RLS enforced).
 */
export async function fetchPrivilegeCardData(
  memberId: string,
  supabase: any,
  verificationBaseUrl: string,
): Promise<PrivilegeCardData | null> {
  // Step 1: Resolve the requested member to get learner_id.
  const { data: member, error: memberErr } = await supabase
    .from('privilege_members')
    .select('learner_id')
    .eq('id', memberId)
    .maybeSingle();

  if (memberErr || !member) {
    logger.error('privileges/card', 'member lookup failed', memberErr);
    return null;
  }

  const learnerId: string = member.learner_id;

  // Step 2: Fetch learner profile (photo, roll number, names).
  const { data: learner, error: learnerErr } = await supabase
    .from('learners_profiles')
    .select(
      'id, first_name, last_name, roll_number, student_photo_url, institution_id, department_id, program_id',
    )
    .eq('id', learnerId)
    .maybeSingle();

  if (learnerErr || !learner) {
    logger.error('privileges/card', 'learner lookup failed', learnerErr);
    return null;
  }

  // Step 3: Fetch institution/department/program names (best effort; any can be null).
  const [instRes, deptRes, progRes] = await Promise.all([
    learner.institution_id
      ? supabase.from('institutions').select('name').eq('id', learner.institution_id).maybeSingle()
      : Promise.resolve({ data: null }),
    learner.department_id
      ? supabase
          .from('departments')
          .select('department_name')
          .eq('id', learner.department_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    learner.program_id
      ? supabase.from('programs').select('program_name').eq('id', learner.program_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Step 4: Fetch ALL active privilege memberships for this learner
  // (one card = all active privileges, not per-privilege).
  const { data: memberships, error: mErr } = await supabase
    .from('privilege_members')
    .select(
      `id,
       group_id,
       status,
       renewal_status,
       start_date,
       end_date,
       group:privilege_groups!privilege_members_group_id_fkey(
         id, name, reference_code, status,
         privilege_group_types(
           privilege_type:privilege_types(key, name)
         )
       )`,
    )
    .eq('learner_id', learnerId)
    .eq('status', 'active')
    .in('renewal_status', ['active', 'pending_report', 'pending_review', 'paused']);

  if (mErr) {
    logger.error('privileges/card', 'memberships fetch failed', mErr);
    return null;
  }

  const activeMemberships: PrivilegeCardMember[] = (memberships ?? [])
    .filter((row: any) => row.group?.status === 'active')
    .map((row: any) => ({
      member_id: row.id,
      group_id: row.group.id,
      group_name: row.group.name,
      reference_code: row.group.reference_code,
      renewal_status: row.renewal_status ?? 'active',
      start_date: row.start_date,
      end_date: row.end_date,
      privilege_types: (row.group.privilege_group_types ?? []).map((gt: any) => ({
        key: gt.privilege_type?.key ?? '',
        name: gt.privilege_type?.name ?? '',
      })),
    }));

  const fullName = [learner.first_name, learner.last_name].filter(Boolean).join(' ').trim() || 'Learner';

  return {
    learner: {
      id: learner.id,
      full_name: fullName,
      roll_number: learner.roll_number,
      photo_url: learner.student_photo_url,
      department_name: (deptRes.data as any)?.department_name ?? null,
      program_name: (progRes.data as any)?.program_name ?? null,
      institution_name: (instRes.data as any)?.name ?? null,
    },
    memberships: activeMemberships,
    verificationUrl: `${verificationBaseUrl.replace(/\/$/, '')}/academic/privileges/verify/${memberId}`,
    issuedAt: new Date(),
  };
}

// ── PDF Renderer ───────────────────────────────────────────────────────────

/**
 * Render the Privilege Card PDF. Returns raw bytes.
 * Card is A5 landscape (210x148mm) — compact, printable on A4 half-sheet.
 */
export async function renderPrivilegeCardPDF(data: PrivilegeCardData): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' });
  const pageWidth = doc.internal.pageSize.getWidth();   // ~210
  const pageHeight = doc.internal.pageSize.getHeight(); // ~148

  // Background
  doc.setFillColor(JKKN_CREAM.r, JKKN_CREAM.g, JKKN_CREAM.b);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Outer border (JKKN Green double)
  doc.setDrawColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.setLineWidth(1.2);
  doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
  doc.setLineWidth(0.4);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

  // Header band (JKKN Green)
  doc.setFillColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.rect(8, 8, pageWidth - 16, 18, 'F');

  // Yellow accent line under header
  doc.setFillColor(JKKN_YELLOW.r, JKKN_YELLOW.g, JKKN_YELLOW.b);
  doc.rect(8, 26, pageWidth - 16, 1.2, 'F');

  // Header text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.text('JKKN INSTITUTIONS', pageWidth / 2, 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Director\'s Privilege Card', pageWidth / 2, 22, { align: 'center' });

  // ── Photo placeholder box ────────────────────────────────────────────────
  const photoX = 14;
  const photoY = 34;
  const photoW = 28;
  const photoH = 34;
  doc.setFillColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setDrawColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.setLineWidth(0.4);
  doc.rect(photoX, photoY, photoW, photoH, 'FD');

  if (data.learner.photo_url) {
    try {
      const photoBytes = await fetchImageAsDataUrl(data.learner.photo_url);
      if (photoBytes) {
        // jsPDF infers format from data URL; addImage accepts data URL directly
        doc.addImage(photoBytes, 'JPEG', photoX + 0.5, photoY + 0.5, photoW - 1, photoH - 1);
      } else {
        drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH);
      }
    } catch (err) {
      logger.warn('privileges/card', 'photo render failed, using placeholder', err);
      drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH);
    }
  } else {
    drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH);
  }

  // ── Learner details (right of photo) ─────────────────────────────────────
  const textX = photoX + photoW + 6;
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(truncate(data.learner.full_name, 38), textX, photoY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  let detailY = photoY + 12;
  if (data.learner.roll_number) {
    doc.text(`Roll No: ${data.learner.roll_number}`, textX, detailY);
    detailY += 5;
  }
  if (data.learner.program_name) {
    doc.text(truncate(`Program: ${data.learner.program_name}`, 50), textX, detailY);
    detailY += 5;
  }
  if (data.learner.department_name) {
    doc.text(truncate(`Dept: ${data.learner.department_name}`, 50), textX, detailY);
    detailY += 5;
  }
  if (data.learner.institution_name) {
    doc.text(truncate(data.learner.institution_name, 50), textX, detailY);
    detailY += 5;
  }

  // ── Active Privileges list ───────────────────────────────────────────────
  const listStartY = photoY + photoH + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.text(
    `ACTIVE PRIVILEGES (${data.memberships.length})`,
    photoX,
    listStartY,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);

  if (data.memberships.length === 0) {
    doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
    doc.text('No active privileges on record.', photoX, listStartY + 6);
  } else {
    let rowY = listStartY + 5;
    const maxListRightX = pageWidth - 55; // leave room for QR on the right
    for (const m of data.memberships) {
      if (rowY > pageHeight - 20) break; // safety — don't overflow
      // Bullet + group name + reference code
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
      doc.text('•', photoX, rowY);
      doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
      doc.text(truncate(m.group_name, 38), photoX + 3.5, rowY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
      const typesLabel = m.privilege_types.map((t) => t.name).filter(Boolean).join(', ');
      if (typesLabel) {
        const typesLine = truncate(typesLabel, 78);
        doc.text(typesLine, photoX + 3.5, rowY + 3.8, { maxWidth: maxListRightX - photoX - 3.5 });
      }
      doc.setFontSize(7);
      doc.text(`Ref: ${m.reference_code} · ${m.renewal_status}`, photoX + 3.5, rowY + 7);
      doc.setFontSize(8.5);
      rowY += 11;
    }
  }

  // ── QR code (bottom right) ───────────────────────────────────────────────
  try {
    const qrDataUrl = await QRCode.toDataURL(data.verificationUrl, {
      width: 200,
      margin: 1,
      color: { dark: '#0b6d41', light: '#ffffff' },
    });
    const qrSize = 28;
    const qrX = pageWidth - 14 - qrSize;
    const qrY = pageHeight - 14 - qrSize - 6;
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
    doc.text('Scan to verify', qrX + qrSize / 2, qrY + qrSize + 3, { align: 'center' });
  } catch (err) {
    logger.warn('privileges/card', 'QR render failed', err);
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.text(
    `Issued ${formatDate(data.issuedAt)} · Valid while all memberships remain active · Verify online`,
    photoX,
    pageHeight - 11,
  );

  // jsPDF returns ArrayBuffer with 'arraybuffer'
  const ab = doc.output('arraybuffer') as ArrayBuffer;
  return new Uint8Array(ab);
}

// ── Convenience: one-shot ───────────────────────────────────────────────────

/**
 * Generate a Privilege Card PDF for a given member ID using the supplied
 * authenticated Supabase client. Returns bytes ready for HTTP streaming.
 */
export async function generatePrivilegeCardPDF(
  memberId: string,
  authClient: any,
  verificationBaseUrl: string,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const data = await fetchPrivilegeCardData(memberId, authClient, verificationBaseUrl);
  if (!data) return null;
  const bytes = await renderPrivilegeCardPDF(data);
  const rollSlug = (data.learner.roll_number || data.learner.id).replace(/[^A-Za-z0-9-_]/g, '_');
  return { bytes, filename: `privilege-card-${rollSlug}.pdf` };
}

// ── helpers ────────────────────────────────────────────────────────────────

function drawPhotoPlaceholder(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  doc.setFillColor(240, 240, 235);
  doc.rect(x + 0.5, y + 0.5, w - 1, h - 1, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.text('PHOTO', x + w / 2, y + h / 2, { align: 'center' });
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Fetch a remote image and return it as a data URL for jsPDF.addImage.
 * Returns null on failure (caller falls back to placeholder).
 */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
