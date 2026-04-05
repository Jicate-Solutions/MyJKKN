/**
 * Certificate PDF Generator Utility — PDE Phase 1
 * Created: 2026-04-05
 * Purpose: Generate branded JKKN certificate PDFs with QR verification code
 *          and Fink's taxonomy radar chart.
 *
 * Uses jsPDF (already in dependencies) + qrcode for QR generation.
 * JKKN Brand: Cream #fbfbee, Green #0b6d41, Yellow #ffde59
 */

import jsPDF from 'jspdf';
import * as QRCode from 'qrcode';

// ── JKKN Brand Colors (RGB) ─────────────────────────────────────────────────
const JKKN_CREAM = { r: 251, g: 251, b: 238 };     // #fbfbee
const JKKN_GREEN = { r: 11, g: 109, b: 65 };       // #0b6d41
const JKKN_YELLOW = { r: 255, g: 222, b: 89 };     // #ffde59
const DARK_TEXT = { r: 30, g: 30, b: 30 };
const MUTED_TEXT = { r: 100, g: 100, b: 100 };

// ── Fink's Dimension Labels ─────────────────────────────────────────────────
const FINKS_LABELS: Record<string, string> = {
  foundational_knowledge: 'Foundational\nKnowledge',
  application: 'Application',
  integration: 'Integration',
  human_dimension: 'Human\nDimension',
  caring: 'Caring',
  learning_how_to_learn: 'Learning\nHow to Learn',
};

const FINKS_KEYS = [
  'foundational_knowledge',
  'application',
  'integration',
  'human_dimension',
  'caring',
  'learning_how_to_learn',
];

// ── Types ───────────────────────────────────────────────────────────────────
export interface CertificateData {
  certificateNumber: string;
  learnerName: string;
  courseName: string;
  courseCode?: string;
  completionDate: string;        // formatted date string
  finalScore: number;            // 0-100
  completionHours: number;
  finksProfile?: Record<string, number>;  // dimension -> score (0-100)
  verificationUrl: string;       // full URL for QR code
}

// ── Main Generator ──────────────────────────────────────────────────────────

export async function generateCertificatePDF(data: CertificateData): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();   // 297
  const pageHeight = doc.internal.pageSize.getHeight();  // 210

  // ── Background ──────────────────────────────────────────────────────────
  doc.setFillColor(JKKN_CREAM.r, JKKN_CREAM.g, JKKN_CREAM.b);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // ── Outer Border (JKKN Green double border) ─────────────────────────────
  doc.setDrawColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.setLineWidth(1.5);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);
  doc.setLineWidth(0.5);
  doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

  // ── Yellow accent corners ───────────────────────────────────────────────
  doc.setFillColor(JKKN_YELLOW.r, JKKN_YELLOW.g, JKKN_YELLOW.b);
  const cornerSize = 6;
  // Top-left
  doc.rect(12, 12, cornerSize, cornerSize, 'F');
  // Top-right
  doc.rect(pageWidth - 12 - cornerSize, 12, cornerSize, cornerSize, 'F');
  // Bottom-left
  doc.rect(12, pageHeight - 12 - cornerSize, cornerSize, cornerSize, 'F');
  // Bottom-right
  doc.rect(pageWidth - 12 - cornerSize, pageHeight - 12 - cornerSize, cornerSize, cornerSize, 'F');

  // ── Header: "JKKN Institutions" (ALWAYS in JKKN Green) ─────────────────
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.text('JKKN Institutions', pageWidth / 2, 30, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.text("India's First Human-AI AGI Collab Campus", pageWidth / 2, 37, { align: 'center' });

  // ── Yellow decorative line ──────────────────────────────────────────────
  doc.setDrawColor(JKKN_YELLOW.r, JKKN_YELLOW.g, JKKN_YELLOW.b);
  doc.setLineWidth(0.8);
  doc.line(50, 42, pageWidth - 50, 42);

  // ── Title ───────────────────────────────────────────────────────────────
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
  doc.text('CERTIFICATE OF COMPLETION', pageWidth / 2, 54, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.text('Principal-Driven Education Programme', pageWidth / 2, 61, { align: 'center' });

  // ── Body ────────────────────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.text('This is to certify that', pageWidth / 2, 74, { align: 'center' });

  // Learner name
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
  doc.text(data.learnerName, pageWidth / 2, 87, { align: 'center' });

  // Name underline (yellow)
  const nameWidth = doc.getTextWidth(data.learnerName);
  doc.setDrawColor(JKKN_YELLOW.r, JKKN_YELLOW.g, JKKN_YELLOW.b);
  doc.setLineWidth(0.6);
  doc.line(
    (pageWidth - nameWidth) / 2 - 10, 90,
    (pageWidth + nameWidth) / 2 + 10, 90
  );

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.text('has successfully completed the course', pageWidth / 2, 99, { align: 'center' });

  // Course name (in JKKN Green)
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.text(data.courseName, pageWidth / 2, 112, { align: 'center' });

  if (data.courseCode) {
    doc.setFontSize(9);
    doc.setFont('courier', 'normal');
    doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
    doc.text(data.courseCode, pageWidth / 2, 118, { align: 'center' });
  }

  // ── Details Row ─────────────────────────────────────────────────────────
  const detailY = 130;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);

  const detailParts = [
    `Completed: ${data.completionDate}`,
    `Score: ${data.finalScore}%`,
    `Duration: ${data.completionHours} hours`,
  ];
  doc.text(detailParts.join('   |   '), pageWidth / 2, detailY, { align: 'center' });

  // ── Fink's Radar Chart (left side) ──────────────────────────────────────
  if (data.finksProfile && Object.keys(data.finksProfile).length > 0) {
    drawRadarChart(doc, 55, 162, 22, data.finksProfile);
  }

  // ── QR Code (bottom-right) ──────────────────────────────────────────────
  try {
    const qrDataUrl = await QRCode.toDataURL(data.verificationUrl, {
      width: 200,
      margin: 1,
      color: {
        dark: '#0b6d41',
        light: '#fbfbee',
      },
    });
    doc.addImage(qrDataUrl, 'PNG', pageWidth - 52, pageHeight - 52, 30, 30);
    doc.setFontSize(6);
    doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
    doc.text('Scan to verify', pageWidth - 37, pageHeight - 20, { align: 'center' });
  } catch {
    // Fallback: draw a placeholder box
    doc.setDrawColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
    doc.setLineWidth(0.3);
    doc.rect(pageWidth - 52, pageHeight - 52, 30, 30);
    doc.setFontSize(6);
    doc.text('QR', pageWidth - 37, pageHeight - 35, { align: 'center' });
  }

  // ── Signature Lines ─────────────────────────────────────────────────────
  const sigY = pageHeight - 32;
  doc.setDrawColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.setLineWidth(0.3);
  doc.line(35, sigY, 100, sigY);
  doc.line(pageWidth - 120, sigY, pageWidth - 60, sigY);

  doc.setFontSize(8);
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.text('Course Coordinator', 67.5, sigY + 5, { align: 'center' });
  doc.text('Principal', pageWidth - 90, sigY + 5, { align: 'center' });

  // ── Certificate Number (bottom center) ──────────────────────────────────
  doc.setFontSize(7);
  doc.setFont('courier', 'normal');
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.text(`Certificate No: ${data.certificateNumber}`, pageWidth / 2, pageHeight - 16, { align: 'center' });

  // ── Verification URL text ───────────────────────────────────────────────
  doc.setFontSize(6);
  doc.text(data.verificationUrl, pageWidth / 2, pageHeight - 13, { align: 'center' });

  return doc;
}

// ── Radar Chart Drawing ─────────────────────────────────────────────────────

function drawRadarChart(
  doc: jsPDF,
  cx: number,
  cy: number,
  radius: number,
  profile: Record<string, number>
) {
  const n = FINKS_KEYS.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2; // Start from top

  // Draw concentric guide polygons (25%, 50%, 75%, 100%)
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.15);
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    const r = radius * fraction;
    const points: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    for (let i = 0; i < n; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % n];
      doc.line(x1, y1, x2, y2);
    }
  }

  // Draw axis lines
  for (let i = 0; i < n; i++) {
    const angle = startAngle + i * angleStep;
    doc.line(cx, cy, cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  }

  // Draw filled profile polygon
  const profilePoints: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const key = FINKS_KEYS[i];
    const score = (profile[key] || 0) / 100; // normalize to 0-1
    const r = radius * Math.max(score, 0.05); // min 5% so it's visible
    const angle = startAngle + i * angleStep;
    profilePoints.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }

  // Fill with semi-transparent green
  doc.setFillColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.setDrawColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.setLineWidth(0.5);

  // Draw the polygon path manually
  if (profilePoints.length > 0) {
    // Use lines to draw the filled polygon
    const [startX, startY] = profilePoints[0];
    // jsPDF doesn't support arbitrary polygon fill easily, so draw as lines
    // and just outline for now
    for (let i = 0; i < profilePoints.length; i++) {
      const [x1, y1] = profilePoints[i];
      const [x2, y2] = profilePoints[(i + 1) % profilePoints.length];
      doc.line(x1, y1, x2, y2);
    }

    // Draw dots at each vertex
    for (const [px, py] of profilePoints) {
      doc.circle(px, py, 0.8, 'F');
    }
  }

  // Draw labels
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);

  for (let i = 0; i < n; i++) {
    const key = FINKS_KEYS[i];
    const label = FINKS_LABELS[key] || key;
    const angle = startAngle + i * angleStep;
    const labelR = radius + 8;
    const lx = cx + labelR * Math.cos(angle);
    const ly = cy + labelR * Math.sin(angle);

    // Split multiline labels
    const lines = label.split('\n');
    const align: 'center' | 'left' | 'right' =
      Math.abs(Math.cos(angle)) < 0.1 ? 'center' :
      Math.cos(angle) > 0 ? 'left' : 'right';

    lines.forEach((line, idx) => {
      doc.text(line, lx, ly + idx * 3, { align });
    });
  }

  // Title above chart
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(JKKN_GREEN.r, JKKN_GREEN.g, JKKN_GREEN.b);
  doc.text("Fink's Taxonomy Profile", cx, cy - radius - 12, { align: 'center' });
}

// ── Download helper (client-side) ───────────────────────────────────────────

export async function downloadCertificatePDF(data: CertificateData, fileName?: string): Promise<void> {
  const doc = await generateCertificatePDF(data);
  const safeName = fileName || `JKKN-Certificate-${data.certificateNumber}.pdf`;
  doc.save(safeName);
}
