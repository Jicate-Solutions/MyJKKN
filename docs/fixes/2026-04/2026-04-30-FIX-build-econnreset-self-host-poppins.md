# Build ECONNRESET Retry Loop — Self-Host Poppins via `next/font/local` — 2026-04-30

## Symptom

`npm run build` stalled indefinitely after the Serwist service-worker bundling step:

```
✓ (serwist) Bundling the service worker script with the URL '/sw.js' and the scope '/'...
read ECONNRESET

Retrying 1/3...
read ECONNRESET

Retrying 1/3...
... (repeats indefinitely)
```

The build never reached the route summary table.

## Root cause

The retry log line is emitted by `node_modules/next/dist/compiled/@next/font/dist/google/retry.js:13`:

```js
console.error(e.message + `\n\nRetrying ${attempt}/${retries}...`);
```

That code only runs when `next/font/google` fetches a `.woff2` file from `fonts.gstatic.com` at build time and the connection is reset.

`app/layout.tsx` was importing **9 Poppins weights** (`100`-`900`) via `next/font/google`, which translates to 9 separate HTTPS fetches against the same host. Any single dropped connection (Windows AV TLS-inspector, Teredo IPv6 NAT, transient gstatic rate-limit, corporate proxy) put one of the nine fetches into its 3-attempt retry loop. With 9 simultaneous fetches the probability of at least one stalling approaches 1 over enough builds.

Sentry was ruled out as a cause: `SENTRY_AUTH_TOKEN` is not set in `.env.local`, so the guard at `next.config.ts:311` correctly skipped `withSentryConfig`.

## Fix

Switched `app/layout.tsx` from `next/font/google` to `next/font/local`, with the 4 weights actually used by the codebase (400 / 500 / 600 / 700) committed under `public/fonts/poppins/`. Source files originate from `@fontsource/poppins` (OFL-licensed mirror of Google Fonts, latin subset).

```diff
- import { Poppins } from 'next/font/google';
+ import localFont from 'next/font/local';

- const poppins = Poppins({
-   weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
-   subsets: ['latin'],
-   display: 'swap',
-   variable: '--font-poppins'
- });
+ const poppins = localFont({
+   src: [
+     { path: '../public/fonts/poppins/Poppins-Regular.woff2',  weight: '400', style: 'normal' },
+     { path: '../public/fonts/poppins/Poppins-Medium.woff2',   weight: '500', style: 'normal' },
+     { path: '../public/fonts/poppins/Poppins-SemiBold.woff2', weight: '600', style: 'normal' },
+     { path: '../public/fonts/poppins/Poppins-Bold.woff2',     weight: '700', style: 'normal' },
+   ],
+   display: 'swap',
+   variable: '--font-poppins'
+ });
```

The `--font-poppins` CSS variable name and the `font-sans` Tailwind binding at `app/layout.tsx:185` are unchanged. No consumer code required edits.

## Adding a new weight in the future

```bash
# 1. Pull the @fontsource source-of-truth without polluting package.json
npm install --no-save @fontsource/poppins

# 2. Copy the new weight (replace NNN with 100|200|300|800|900 and WEIGHT with Thin|ExtraLight|Light|ExtraBold|Black)
cp node_modules/@fontsource/poppins/files/poppins-latin-NNN-normal.woff2 \
   public/fonts/poppins/Poppins-WEIGHT.woff2

# 3. Remove the temporary install
npm uninstall @fontsource/poppins

# 4. Add a `src` entry to the `localFont({ ... })` call in app/layout.tsx
```

For italics: copy `poppins-latin-NNN-italic.woff2` and add `style: 'italic'` to the `src` entry.

## Why `@fontsource` rather than scraping `fonts.googleapis.com/css2`

`@fontsource/*` packages are an OFL-licensed npm mirror of Google Fonts maintained by [Fontsource](https://fontsource.org). File paths and subset naming are stable and versioned via npm semver. Scraping the `css2` endpoint requires regex-extracting URLs from a generated stylesheet whose contents Google may revise at any time.

## Verification

- Build no longer prints `read ECONNRESET` / `Retrying N/3`.
- `.next/static/media/Poppins-*.woff2` contains 4 content-hashed files after build.
- Runtime: DevTools → Network → Fonts shows 4 same-origin font fetches; zero requests to `fonts.gstatic.com`.

## Rollback

`git revert <commit>` restores the `next/font/google` import. The 4 self-hosted woff2 files are byte-equivalent to what Google's CDN would have served (same OFL Poppins build), so no visual regression risk.
