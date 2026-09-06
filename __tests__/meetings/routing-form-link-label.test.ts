// __tests__/meetings/routing-form-link-label.test.ts
//
// The copy for the routing-form link that now sits above the purpose cards on
// /meet/[handle]. It is built from the form's real question count, so the one
// thing worth pinning is that the wording and the number can never disagree —
// the link must not promise "one question" on a three-question form.
//
// The surrounding lookup (activeRoutingFormFor) is I/O and is exercised by the
// page integration, not here — same split as meeting-embed-service.test.ts.

import { describe, expect, it } from 'vitest';
import { routingFormLinkLabel } from '@/lib/services/meetings/public-host-service';

describe('routingFormLinkLabel', () => {
  it('says "one question" in the singular case', () => {
    expect(routingFormLinkLabel(1)).toBe(
      'Not sure which one you need? Answer one question',
    );
  });

  it('carries the real count, and pluralises, for a longer form', () => {
    expect(routingFormLinkLabel(3)).toBe(
      'Not sure which one you need? Answer 3 questions',
    );
    expect(routingFormLinkLabel(2)).toContain('2 questions');
  });

  it('never promises a count the form does not ask', () => {
    for (const n of [1, 2, 5, 12]) {
      const label = routingFormLinkLabel(n);
      expect(label).toContain(String(n === 1 ? 'one' : n));
      expect(label.startsWith('Not sure which one you need?')).toBe(true);
    }
  });
});
