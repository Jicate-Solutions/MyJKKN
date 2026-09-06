// @vitest-environment jsdom
/**
 * Notifications — the YouTube preview card recipients see.
 *
 * Director behaviour, chosen 2026-08-13: "thumbnail + title card, taps to
 * YouTube" — not an embedded player, not generic any-URL previews.
 *
 * These assertions pin the parts a screenshot cannot: that the WHOLE card is a
 * new-tab link to the watch page with rel="noopener noreferrer", that the
 * thumbnail is a plain <img> (next/image would reject img.youtube.com — it is
 * absent from next.config.ts's images.remotePatterns, and adding a pattern
 * would change global build config for the whole app), and that a dead
 * thumbnail degrades to a readable text card rather than a broken-image icon.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { YouTubePreviewCard } from '@/components/notifications/youtube-preview-card';

const VIDEO_ID = '1LbkGBuCmpA'; // the Director's reference video

afterEach(() => cleanup());

describe('YouTubePreviewCard — fully resolved preview', () => {
  const preview = {
    videoId: VIDEO_ID,
    title: 'JKKN SCHOOL OF INFLUENCERS',
    author: 'JKKN INSTITUTIONS',
    thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`
  };

  it('makes the whole card one safe new-tab link to the watch page', () => {
    render(<YouTubePreviewCard preview={preview} />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(
      `https://www.youtube.com/watch?v=${VIDEO_ID}`
    );
    expect(link.getAttribute('target')).toBe('_blank');
    // Without noopener the opened tab can reach back via window.opener.
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows the title and author', () => {
    render(<YouTubePreviewCard preview={preview} />);

    expect(screen.getByText('JKKN SCHOOL OF INFLUENCERS')).toBeTruthy();
    expect(screen.getByText('JKKN INSTITUTIONS · YouTube')).toBeTruthy();
  });

  it('renders the thumbnail as a lazy plain <img> with explicit dimensions', () => {
    const { container } = render(<YouTubePreviewCard preview={preview} />);

    const img = container.querySelector('img')!;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe(preview.thumbnailUrl);
    expect(img.getAttribute('loading')).toBe('lazy');
    // Explicit dimensions keep the card from reflowing as the poster loads.
    expect(img.getAttribute('width')).toBe('480');
    expect(img.getAttribute('height')).toBe('360');
    // Decorative: the title beside it already carries the meaning.
    expect(img.getAttribute('alt')).toBe('');
  });
});

describe('YouTubePreviewCard — degraded previews', () => {
  it('renders from the video id ALONE, deriving the poster with no network call', () => {
    // This is the shape stored when the oEmbed lookup failed at compose time.
    const { container } = render(<YouTubePreviewCard preview={{ videoId: VIDEO_ID }} />);

    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      `https://img.youtube.com/vi/${VIDEO_ID}/hqdefault.jpg`
    );
    expect(screen.getByText('Watch on YouTube')).toBeTruthy();
    expect(screen.getByText('YouTube')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      `https://www.youtube.com/watch?v=${VIDEO_ID}`
    );
  });

  it('falls back to a text card when the thumbnail 404s — no broken-image icon', () => {
    const { container } = render(
      <YouTubePreviewCard
        preview={{ videoId: VIDEO_ID, title: 'A deleted poster', thumbnailUrl: 'https://img.youtube.com/vi/x/hqdefault.jpg' }}
      />
    );

    fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('img')).toBeNull();
    // The card is still a working link with a readable title.
    expect(screen.getByText('A deleted poster')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      `https://www.youtube.com/watch?v=${VIDEO_ID}`
    );
  });

  it('renders nothing at all without a video id', () => {
    const { container } = render(<YouTubePreviewCard preview={null} />);
    expect(container.innerHTML).toBe('');

    cleanup();

    const empty = render(<YouTubePreviewCard preview={{ videoId: '' }} />);
    expect(empty.container.innerHTML).toBe('');
  });
});

describe('YouTubePreviewCard — inside the clickable inbox row', () => {
  it('stops the click bubbling when asked, so the row does not also toggle', () => {
    let rowClicks = 0;
    render(
      <div onClick={() => { rowClicks += 1; }}>
        <YouTubePreviewCard preview={{ videoId: VIDEO_ID }} stopPropagation />
      </div>
    );

    fireEvent.click(screen.getByRole('link'));
    expect(rowClicks).toBe(0);
  });

  it('lets the click bubble by default (admin detail view)', () => {
    let rowClicks = 0;
    render(
      <div onClick={() => { rowClicks += 1; }}>
        <YouTubePreviewCard preview={{ videoId: VIDEO_ID }} />
      </div>
    );

    fireEvent.click(screen.getByRole('link'));
    expect(rowClicks).toBe(1);
  });
});
