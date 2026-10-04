// Repair round 1 Oct (#4153): the front door never links to a missing page,
// and the purchase card sends people to someone who can really raise it.
import { existsSync } from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChooserClient } from '@/app/(routes)/instasolver/_components/chooser-client';
import {
  MY_COMPLAINTS_HREF,
  hasMyComplaintsPage,
  routeInManifest,
} from '@/lib/instasolver/follow-up-links';
import { GUIDES } from '@/lib/instasolver/guide/content';
import type { RouteNode } from '@/lib/navigation/route-manifest.generated';

const node = (p: string, children: RouteNode[] = []): RouteNode => ({
  path: p,
  label: p,
  iconName: 'FileText',
  children,
});

describe('routeInManifest', () => {
  it('finds a nested page', () => {
    const manifest = [node('/instasolver', [node('/instasolver/my-complaints')])];
    expect(routeInManifest(MY_COMPLAINTS_HREF, manifest)).toBe(true);
  });

  it('says no when the page is absent', () => {
    const manifest = [node('/instasolver', [node('/instasolver/my-reports')])];
    expect(routeInManifest(MY_COMPLAINTS_HREF, manifest)).toBe(false);
  });

  it('matches the page files actually in this tree', () => {
    const pageFile = path.join(
      process.cwd(),
      'app/(routes)/instasolver/my-complaints/page.tsx'
    );
    expect(hasMyComplaintsPage()).toBe(existsSync(pageFile));
  });
});

describe('ChooserClient follow-up links', () => {
  const render = (showMyComplaints: boolean, canRaisePurchase = false) =>
    renderToStaticMarkup(
      createElement(ChooserClient, { canRaisePurchase, showMyComplaints })
    );

  it('hides My complaints when its page is not in the build', () => {
    const html = render(false);
    expect(html).not.toContain(`href="${MY_COMPLAINTS_HREF}"`);
    expect(html).not.toContain('My complaints');
    expect(html).toContain('href="/instasolver/my-reports"');
  });

  it('shows My complaints when its page is in the build', () => {
    const html = render(true);
    expect(html).toContain(`href="${MY_COMPLAINTS_HREF}"`);
    expect(html).toContain('My complaints');
  });
});

describe('purchase card for people who cannot raise a request', () => {
  it('names the real holders and makes no timing promise', () => {
    const html = renderToStaticMarkup(
      createElement(ChooserClient, { canRaisePurchase: false, showMyComplaints: false })
    );
    expect(html).toContain('Store Administrator');
    expect(html).toContain('Procurement team');
    expect(html).not.toMatch(/HOD/);
    expect(html).not.toMatch(/same day/i);
    expect(html).not.toContain('href="/procurement/requests/new"');
  });

  it('links straight to Procurement for people who can', () => {
    const html = renderToStaticMarkup(
      createElement(ChooserClient, { canRaisePurchase: true, showMyComplaints: false })
    );
    expect(html).toContain('href="/procurement/requests/new"');
  });
});

describe('guide wording', () => {
  const text = JSON.stringify(GUIDES);

  it('does not promise a report can be moved between kinds', () => {
    expect(text).not.toMatch(/moved later/i);
  });

  it('sends purchases to the Store Administrator or Procurement team, not a HOD', () => {
    expect(text).toContain('Store Administrator or the Procurement team');
    expect(text).not.toMatch(/ask your HOD/i);
  });
});
