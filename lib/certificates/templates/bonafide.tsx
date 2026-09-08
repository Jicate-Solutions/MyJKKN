// lib/certificates/templates/bonafide.tsx
// Bonafide Certificate — same letterhead geometry as the Course Completion
// template; wording mirrors the college's pre-printed bonafide form.

import { LetterDocument } from './letter-layout';
import { bonafideParagraphs, formatIssueDate, type CertificateData } from '../wording';
import type { CertificateOverrides } from '../registry';

export function BonafideCertificate({
  data,
  overrides,
}: {
  data: CertificateData;
  overrides: CertificateOverrides;
}) {
  return (
    <LetterDocument
      docTitle={`Bonafide Certificate - ${data.learnerName}`}
      dateLine={`Date: ${formatIssueDate(overrides.issueDate)}`}
      heading="BONAFIDE CERTIFICATE"
      paragraphs={bonafideParagraphs(data, overrides)}
    />
  );
}
