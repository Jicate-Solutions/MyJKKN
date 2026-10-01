import { describe, expect, it } from 'vitest';
import {
  DOC_MIME,
  DOCX_MIME,
  JPEG_MIME,
  PDF_MIME,
  isZipBytes,
  matchResumeFile,
  safeStorageName,
  sniffResumeMime,
} from '@/lib/hr/intake/resume-files';

const f = (name: string) => ({ name });

describe('matchResumeFile', () => {
  const uploads = [
    f('Image00731.pdf'),
    f('Image00732.pdf'),
    f('DOC_20250830_WA0002pdf.doc'),
    f('Mohan_Demo_Resume.PDF'),
  ];

  it('matches the exact name, ignoring case', () => {
    expect(matchResumeFile('mohan_demo_resume.pdf', uploads)?.name).toBe('Mohan_Demo_Resume.PDF');
  });

  it('tolerates the "<base>_<digits>.pdf" suffix CVViZ adds', () => {
    expect(matchResumeFile('Image00732_1812345678901.pdf', uploads)?.name).toBe('Image00732.pdf');
  });

  it('matches a mangled WhatsApp-style name to the one file that contains it', () => {
    expect(matchResumeFile('DOC_20250830_WA0002pdf.doc-20250830-wa0002pdf', uploads)?.name).toBe('DOC_20250830_WA0002pdf.doc');
  });

  it('returns nothing rather than guessing between two files', () => {
    expect(matchResumeFile('Image0073.pdf', uploads)).toBeNull();
    expect(matchResumeFile(null, uploads)).toBeNull();
    expect(matchResumeFile('cv.pdf', [f('cv.docx'), f('CV.doc')])).toBeNull();
  });

  it('accepts the same name with another extension when it is the only one', () => {
    expect(matchResumeFile('cv.pdf', [f('cv.docx')])?.name).toBe('cv.docx');
  });
});

describe('sniffResumeMime', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  it('reads the type from the bytes, not the name', () => {
    expect(sniffResumeMime(new TextEncoder().encode('%PDF-1.7\n'))).toBe(PDF_MIME);
    expect(sniffResumeMime(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toBe(DOC_MIME);
    expect(sniffResumeMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(JPEG_MIME);
    const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('....word/document.xml')]);
    expect(sniffResumeMime(docx)).toBe(DOCX_MIME);
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('....resumes/a.pdf')]);
    expect(sniffResumeMime(zip)).toBeNull();
    expect(isZipBytes(zip)).toBe(true);
    expect(sniffResumeMime(new TextEncoder().encode('hello'))).toBeNull();
  });
});

describe('safeStorageName', () => {
  it('keeps letters, digits, dot, dash and underscore only', () => {
    expect(safeStorageName('My CV (final).pdf')).toBe('My_CV_final_.pdf');
    expect(safeStorageName('../../etc/passwd')).toBe('etc_passwd');
    expect(safeStorageName('')).toBe('resume');
  });
});
