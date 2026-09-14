// lib/certificates/render.ts
// ============================================================================
// Server-only: turn (template key, data, overrides) into a PDF buffer with
// @react-pdf/renderer. Standard PDF Times fonts are used (metrically the same
// as Times New Roman in the Word original), so no font files and no Chromium.
// ============================================================================

import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import type { CertificateOverrides, CertificateTemplateKey } from './registry';
import type { CertificateData } from './wording';
import { BonafideCertificate } from './templates/bonafide';
import { CourseCompletionCertificate } from './templates/course-completion';

type TemplateComponent = (props: {
  data: CertificateData;
  overrides: CertificateOverrides;
}) => ReactElement;

const RENDERERS: Record<CertificateTemplateKey, TemplateComponent> = {
  bonafide: BonafideCertificate,
  course_completion: CourseCompletionCertificate,
};

export async function renderCertificatePdf(
  template: CertificateTemplateKey,
  data: CertificateData,
  overrides: CertificateOverrides = {}
): Promise<Buffer> {
  const Component = RENDERERS[template];
  const element = createElement(Component, { data, overrides }) as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

/** Safe, descriptive download filename: "Bonafide-Certificate-C24JPGCHE006.pdf". */
export function certificateFileName(template: CertificateTemplateKey, data: CertificateData): string {
  const label = template === 'bonafide' ? 'Bonafide-Certificate' : 'Course-Completion-Certificate';
  const id = (data.registerNumber || data.learnerName).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${label}-${id || 'learner'}.pdf`;
}
