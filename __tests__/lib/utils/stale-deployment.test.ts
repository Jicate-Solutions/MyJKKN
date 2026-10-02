import { describe, it, expect } from 'vitest';
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import { isStaleServerActionError } from '@/lib/utils/stale-deployment';

describe('isStaleServerActionError', () => {
  it('recognises the error Next.js throws for an action from another deployment', () => {
    expect(
      isStaleServerActionError(
        new UnrecognizedActionError('Server Action "abc123" was not found on the server.')
      )
    ).toBe(true);
  });

  it('recognises it after the class identity is lost', () => {
    expect(
      isStaleServerActionError({ name: 'UnrecognizedActionError', message: 'x' })
    ).toBe(true);
    expect(
      isStaleServerActionError(
        new Error('Server Action "abc123" was not found on the server. Read more: …')
      )
    ).toBe(true);
    expect(isStaleServerActionError(new Error('Failed to find Server Action "abc"'))).toBe(true);
  });

  it('leaves every other error alone', () => {
    expect(isStaleServerActionError(new Error('Invalid time value'))).toBe(false);
    expect(isStaleServerActionError(new Error('Failed to fetch'))).toBe(false);
    expect(isStaleServerActionError(null)).toBe(false);
    expect(isStaleServerActionError('Server Action was not found on the server')).toBe(false);
  });
});
