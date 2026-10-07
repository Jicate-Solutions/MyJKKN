// @vitest-environment jsdom
/**
 * The "answer ready" notice links to /ai-query?conversation=<id>. Clicked while
 * the person is already on /ai-query, only the query string changes — nothing
 * remounts. The watcher must report the NEW id then, not only on first mount.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

let search = '';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

import { ConversationLinkWatcher } from '@/components/ai-query/ConversationLinkWatcher';

const A = '0b3c9a6e-5d1f-4a7e-9c2b-1f2e3d4c5b6a';
const B = '7d1e2f3a-4b5c-4d6e-8f7a-9b0c1d2e3f4a';

describe('ConversationLinkWatcher', () => {
  it('reports the id on arrival and again when the link changes on the same page', () => {
    const onLink = vi.fn();
    search = `conversation=${A}`;
    const { rerender } = render(<ConversationLinkWatcher onLink={onLink} />);
    expect(onLink).toHaveBeenLastCalledWith(A);

    // Same route, new query string (a second notice clicked from the bell).
    search = `conversation=${B}`;
    rerender(<ConversationLinkWatcher onLink={onLink} />);
    expect(onLink).toHaveBeenLastCalledWith(B);
    expect(onLink).toHaveBeenCalledTimes(2);
  });

  it('reports nothing when there is no conversation in the link', () => {
    const onLink = vi.fn();
    search = '';
    render(<ConversationLinkWatcher onLink={onLink} />);
    expect(onLink).not.toHaveBeenCalled();
  });
});
