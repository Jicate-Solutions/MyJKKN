import { describe, it, expect } from 'vitest';
import { parsePastedEmails } from '@/lib/utils/service-requests/parse-pasted-emails';

describe('parsePastedEmails', () => {
  it('splits an Excel column (newlines) and row (tabs)', () => {
    expect(parsePastedEmails('a@jkkn.ac.in\r\nb@jkkn.ac.in\n')).toEqual(['a@jkkn.ac.in', 'b@jkkn.ac.in']);
    expect(parsePastedEmails('a@jkkn.ac.in\tb@jkkn.ac.in')).toEqual(['a@jkkn.ac.in', 'b@jkkn.ac.in']);
  });
  it('handles commas/semicolons, angle brackets, case and duplicates', () => {
    expect(parsePastedEmails('A@jkkn.ac.in, <b@jkkn.ac.in>; a@jkkn.ac.in')).toEqual(['a@jkkn.ac.in', 'b@jkkn.ac.in']);
  });
  it('drops non-email tokens', () => {
    expect(parsePastedEmails('John Doe\nnot-an-email\nx@y.z')).toEqual(['x@y.z']);
  });
});
