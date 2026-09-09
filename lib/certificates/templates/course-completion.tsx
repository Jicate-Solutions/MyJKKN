// lib/certificates/templates/course-completion.tsx
// Course Completion Certificate — layout from docs/Course Complete Cert (1).docx,
// wording from the approved 27/08/2026 reference (see wording.ts).

import { LetterDocument } from './letter-layout';
import { courseCompletionParagraph, formatIssueDate, type CertificateData } from '../wording';
import type { CertificateOverrides } from '../registry';

export function CourseCompletionCertificate({
  data,
  overrides,
}: {
  data: CertificateData;
  overrides: CertificateOverrides;
}) {
  return (
    <LetterDocument
      docTitle={`Course Completion Certificate - ${data.learnerName}`}
      dateLine={`Date: ${formatIssueDate(overrides.issueDate)}`}
      heading="COURSE COMPLETION CERTIFICATE"
      paragraphs={[courseCompletionParagraph(data, overrides)]}
    />
  );
}
