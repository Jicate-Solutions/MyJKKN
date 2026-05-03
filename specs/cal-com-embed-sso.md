# Cal.com Embed SSO — Research Findings

**Author:** Agent F (Option-4 batch, parallel research-only)
**Date:** 2026-05-03
**Status:** Research recommendation — awaiting Director decision before any v2 implementation
**Companion PRs (parallel batch, code):** A (embed wrapper) · B (`/meetings/manage`) · C (`/meetings/availability`) · D (inbox internal-nav) · E (sidebar children)
**Repo affected (this spec):** `Jicate-Solutions/MyJKKN` (this doc) and `jicate-booking` (any auth changes)

---

## TL;DR

**Recommend Option C — move jicate-booking from `jicate-booking.vercel.app` to `meetings.jkkn.ai` and set `NEXTAUTH_COOKIE_DOMAIN=.jkkn.ai` so the existing NextAuth session cookie is automatically presented when the iframe loads from `www.jkkn.ai`.** That alone does not log a MyJKKN user into Cal.com (the user accounts are independent), but combined with the existing `email` magic-link provider and a one-line custom Credentials provider that accepts a short-lived JWT minted by MyJKKN (Supabase service role), the user’s first-visit login disappears entirely. Implementation effort is ~1 day, no recurring spend, fully reversible by deleting one provider entry. **Do NOT** pursue Option A (Cal.com Platform / `@calcom/atoms`) — it is cloud-only at $299/mo minimum and incompatible with our self-host. Ship Option E (status-quo first-visit login) for v1, schedule Option C+B for v2.

---

## Context

**The problem.** Agents B and C (parallel siblings in this batch) are wiring `/meetings/manage` and `/meetings/availability` inside MyJKKN as iframes pointing at jicate-booking. When a MyJKKN user (already logged in to `www.jkkn.ai` via Supabase) opens those pages for the first time, the iframe will render Cal.com’s `/auth/login` screen because `jicate-booking.vercel.app` has no session cookie for that browser.

**v1 ships with that login** — Agent B’s page already states this in copy ("First-visit: you may see a Cal.com sign-in prompt inside the panel below — sign in once with the same email"). The login is functional (email magic-link works on jicate-booking today; verified earlier in F4–F7 phase via `GET /api/auth/providers` → `{credentials, impersonation-auth, email}`).

**This document evaluates v2 paths to skip that first-visit login** so the embed feels like a native MyJKKN surface.

---

## Verified facts (collected during research)

| Fact | Source | Why it matters |
|---|---|---|
| jicate-booking `/event-types` has **no `X-Frame-Options`** and **no `frame-ancestors` CSP** | `curl -sI https://jicate-booking.vercel.app/event-types` | Embedding is technically allowed; no header-level blocker |
| Active NextAuth providers on jicate-booking: `credentials`, `impersonation-auth`, `email` | `GET https://jicate-booking.vercel.app/api/auth/providers` | No Google / SAML; magic-link works |
| `NEXTAUTH_COOKIE_DOMAIN` env var is wired in `packages/lib/default-cookies.ts` | `defaultCookies(useSecureCookies)` reads `process.env.NEXTAUTH_COOKIE_DOMAIN` and applies it to `domain:` on every cookie | Cross-domain/cross-subdomain cookie sharing is a first-class config knob — not a fork |
| Default cookie config sets `sameSite: "none"` + `secure: true` in production | Same file | iframes will send the cookie cross-site |
| `@calcom/embed-react` is just an iframe loader of `calLink` (the public booking page) — accepts no auth token / session prop | `packages/embeds/embed-react/src/Cal.tsx` | The embed itself cannot authenticate; auth must come from the cookie or a provider login at the iframe origin |
| `impersonation-auth` is gated on PBAC + `MembershipRole.ADMIN`/`OWNER` and writes to `Impersonations` audit table | `packages/features/ee/impersonation/lib/ImpersonationProvider.ts` | Cannot be repurposed as a generic SSO bridge — it’s staff-only and audited |
| Cal.com `CredentialsProvider` is a thin NextAuth wrapper — adding a second one is a ~30 line change | `packages/features/auth/lib/next-auth-options.ts:281` (`providers` array is mutable, providers are pushed conditionally) | Custom provider is a config addition, not a fork |
| Cal.com Platform / `@calcom/atoms` is cloud-only at `api.cal.com/v2`; self-host docs do not cover it | [Atoms README](https://github.com/calcom/cal.com/blob/main/packages/platform/atoms/README.md), [pricing](https://cal.com/platform/pricing) | Killshot for Option A on a self-host |
| Cal.com Platform pricing starts at **$299/mo** (Developer) → $2,499/mo (Scale) | [cal.com/platform/pricing](https://cal.com/platform/pricing) | Recurring spend incompatible with self-host’s zero-marginal-cost thesis |

---

## Options evaluated

### Option A — Cal.com Platform / `@calcom/atoms` + managed users

**How it works.** Replace the iframe entirely with React components from `@calcom/atoms`. MyJKKN provisions a "managed user" per host via `POST https://api.cal.com/v2/oauth-clients/{client_id}/users` and embeds atoms (`<Booker />`, `<EventTypeSettings />`) using the OAuth tokens returned. The user never sees Cal.com login.

**Verdict:** **REJECT.** Three killshots:
1. **Cloud-only** — atoms target `https://api.cal.com/v2` exclusively. The README and Platform Quickstart make zero mention of self-host endpoints. We would have to abandon jicate-booking and route all bookings through Cal.com cloud, surrendering the data sovereignty that justified self-host in the first place.
2. **Cost** — $299/mo Developer minimum, $2,499/mo Scale. For a self-hosted-because-it’s-free system, this is a 100x recurring-cost regression.
3. **Integration delta** — every flow we built (webhooks → mirror table, `/meetings/inbox`, reconcile cron) was wired against jicate-booking. Switching to atoms means re-architecting the whole booking pipeline.

Sources: [Atoms package](https://www.npmjs.com/package/@calcom/atoms), [Quickstart](https://cal.com/docs/platform/quickstart), [Pricing](https://cal.com/platform/pricing).

---

### Option B — Custom NextAuth Credentials provider in jicate-booking that accepts MyJKKN-minted JWT

**How it works.**
1. Add a new `CredentialsProvider` to `packages/features/auth/lib/next-auth-options.ts` with `id: "myjkkn-sso"`. Its `authorize()` accepts a single `token` credential, verifies it against MyJKKN’s Supabase JWT secret (or a dedicated HMAC secret), looks up / lazily-creates the Cal.com user by email, and returns the user object NextAuth needs.
2. MyJKKN exposes `GET /api/jicate-booking/sso-token` — server route, requires authenticated Supabase session, returns `{token: jwt.sign({email, exp: now+60s}, secret)}`.
3. The embed wrapper component (Agent A’s `JicateBookingEmbed`) prepends a one-shot iframe load to `https://jicate-booking…/api/auth/callback/myjkkn-sso?token=…&callbackUrl=/event-types` BEFORE rendering the `<Cal>` component. After successful callback, the session cookie is set on jicate-booking origin and subsequent embed loads are authenticated.

**Pros:**
- Zero recurring spend.
- Cal.com user accounts remain independent → multi-tenant productization (jicate-booking serving non-JKKN customers) stays intact.
- Reversible — delete the provider entry, deploy.
- Pattern mirrors how SAML-IDP and Google providers are added (lines 295–471 of `next-auth-options.ts`); not a fork, just a config addition.

**Cons:**
- Two-roundtrip first load (one to set cookie, one to load embed). Mitigatable via prefetching the SSO endpoint on hover/router-focus.
- Token signing key must be shared securely between MyJKKN’s Vercel project and jicate-booking’s Vercel project — adds one env var (`MYJKKN_SSO_SECRET`) on both sides.
- Custom auth code = security surface. Must be reviewed (Cal.com had GHSA-7hg4-x4pr-3hrg in 2025 — a custom JWT callback that didn’t validate identity was an account-takeover vector). The provider must verify signature, expiry, AND email-domain allow-list.

Sources: [next-auth.js Issue #11295 (custom JWT in CredentialsProvider)](https://github.com/nextauthjs/next-auth/issues/11295), [Cal.com GHSA-7hg4-x4pr-3hrg](https://github.com/calcom/cal.com/security/advisories/GHSA-7hg4-x4pr-3hrg), [next-auth-options.ts](https://github.com/calcom/cal.com/blob/main/packages/features/auth/lib/next-auth-options.ts).

---

### Option C — Subdomain cookie sharing (move jicate-booking to `meetings.jkkn.ai`)

**How it works.**
1. DNS: add `meetings.jkkn.ai` CNAME → cname.vercel-dns.com.
2. Vercel: add `meetings.jkkn.ai` as a domain on the jicate-booking project; assign cert.
3. jicate-booking env: set `WEBAPP_URL=https://meetings.jkkn.ai` and `NEXTAUTH_URL=https://meetings.jkkn.ai`. **Crucially set `NEXTAUTH_COOKIE_DOMAIN=.jkkn.ai`** (note leading dot). Redeploy.
4. MyJKKN: ALSO set the same `NEXTAUTH_COOKIE_DOMAIN=.jkkn.ai` on its Supabase auth cookie OR (preferred) configure a one-line MyJKKN server route that, on first iframe interaction, mints a jicate-booking session cookie scoped to `.jkkn.ai` (uses Option B’s provider underneath but the cookie is automatically shared because of the domain).
5. MyJKKN’s Supabase session cookie is already on `www.jkkn.ai` — so any subdomain (`meetings.jkkn.ai`) can read it. The browser sends BOTH cookies on the iframe request.

**This is the leverage point that the codebase was designed for.** `packages/lib/default-cookies.ts` line 21 explicitly opts into `process.env.NEXTAUTH_COOKIE_DOMAIN`. Cal.com themselves use this pattern for organization subdomains (`acme.cal.com` shares cookies with `cal.com`).

**Pros:**
- Cookie sharing is automatic once domains align.
- Removes a third-party-cookie risk (Safari ITP and Chrome 3PCD don’t apply to first-party subdomain cookies).
- Better branding ("meetings.jkkn.ai" reads as a JKKN product, not a vendor URL).

**Cons:**
- Subdomain change is irreversible-ish (old `jicate-booking.vercel.app` URLs in user emails / calendar invites become broken; need 301 redirects from old origin for ~12 months).
- Slightly weakens multi-tenant productization angle — `meetings.jkkn.ai` reads JKKN-specific. Mitigatable via per-tenant org subdomains (`meetings.acme.com` for client X, configured the same way).
- Doesn’t by itself authenticate the user — still requires Option B’s provider (or magic-link first-visit) to MINT the jicate-booking session. The cookie sharing just keeps it alive once minted and removes 3rd-party-cookie iframe friction.

**Verdict.** Option C alone solves half the problem (keeps the cookie alive cross-subdomain) but needs Option B beneath it to handle the first mint. **Recommendation = C + B as a combined v2 implementation.**

Sources: [Mintlify Cal.com Configuration](https://www.mintlify.com/calcom/cal.com/self-hosting/configuration), [next-auth Discussion #1299](https://github.com/nextauthjs/next-auth/discussions/1299), [packages/lib/default-cookies.ts](https://github.com/calcom/cal.com/blob/main/packages/lib/default-cookies.ts).

---

### Option D — Per-host API key in iframe URL

**How it works.** Cal.com supports per-user API keys. MyJKKN stores each host’s Cal.com API key encrypted in `auth.users` metadata; the embed wrapper appends `?apiKey=…` to the iframe `src`. jicate-booking’s middleware accepts the API key as session auth.

**Verdict:** **REJECT.** Three reasons:
1. **Cal.com middleware does not accept `?apiKey=` for browser session auth** — API keys authenticate `api/v1/*` and `api/v2/*` REST calls, not the dashboard pages (`/event-types`, `/availability`). The dashboard requires an actual NextAuth session cookie.
2. **API keys in URL = leaked in browser history, referrer headers, server access logs.** Even if the key were accepted, this would violate basic credential hygiene.
3. **Per-user key provisioning is operational burden** — every new MyJKKN host (potentially hundreds of staff) needs a key minted, stored, rotated.

This option is included for completeness and to prevent its rediscovery. Don’t pursue it.

---

### Option E — Status quo (no SSO, accept first-visit login)

**How it works.** What v1 ships today. Agent B’s page copy already explains it: "First-visit: you may see a Cal.com sign-in prompt inside the panel below — sign in once with the same email as your MyJKKN account. Subsequent visits load directly into the editor."

**Pros:**
- **Zero new code, zero new env vars, zero new attack surface.**
- Email magic-link already works on jicate-booking — verified.
- Once logged in, the NextAuth JWT cookie has 30-day default lifetime — subsequent visits are seamless until expiry.
- Honest UX — Director sees the Cal.com login UI and understands what’s underneath; no magic that breaks mysteriously.

**Cons:**
- First-visit friction is real — user has to check email, click magic-link, comes back to /meetings/manage.
- Doesn’t feel "native" — clearly two products glued together on first contact.
- If user’s MyJKKN email and their Cal.com user email diverge (e.g. they signed up on jicate-booking with a personal address), their bookings end up under the wrong identity.

**Verdict.** Ship E for v1 (already shipped by Agents B/C). Schedule C+B for v2 once the embed surface has 5–10 days of usage data confirming the friction is worth solving. Don’t pre-optimize.

---

## Recommendation

**v1 (now): Ship Option E** — already done by Agents B and C. No further work needed in this batch.

**v2 (when justified by usage): Ship Option C + Option B together.**
- Order matters: Option B (custom provider) is independent and can ship first as a standalone PR. Option C (subdomain move) ships second once the provider is verified working from `jicate-booking.vercel.app`.

**Justification (5 bullets):**
1. **Implementation effort:** ~1 day for Option B (one provider, one MyJKKN route, one env var on each side, one update to embed wrapper). ~half-day + DNS cutover for Option C.
2. **Operational burden:** Zero recurring spend (vs. $299/mo for Option A). Two new env vars (`MYJKKN_SSO_SECRET` on both projects, `NEXTAUTH_COOKIE_DOMAIN` on jicate-booking).
3. **Security posture:** Custom provider must mirror Cal.com’s own audit pattern (verify signature + expiry + email-domain allow-list, log to `Impersonations` table or equivalent). Cal.com already had GHSA-7hg4-x4pr-3hrg from a similar provider — must be PR-reviewed by a second pair of eyes.
4. **Multi-tenant compatibility:** Custom provider is per-tenant-keyable from day one (different `MYJKKN_SSO_SECRET` per tenant). Subdomain pattern works for any tenant (`meetings.acme.com`).
5. **Reversibility:** Delete the provider entry and the MyJKKN SSO route; system reverts to E. Subdomain DNS can be undone in 24h. No data migration required either way.

---

## Implementation sketch (for v2 — when Director greenlights)

### Phase 1 — Option B (custom Credentials provider)

**Files to touch (jicate-booking):**
- `packages/features/auth/lib/next-auth-options.ts` — add `MyJKKNSSOProvider` after line 281; gate behind `process.env.MYJKKN_SSO_ENABLED === "true"`.
- `apps/web/app/api/auth/[...nextauth]/route.ts` — no change (provider is registered automatically).
- `.env.example` — document `MYJKKN_SSO_SECRET` and `MYJKKN_SSO_EMAIL_DOMAIN_ALLOWLIST=jkkn.ac.in,jkkn.ai`.

**Files to touch (MyJKKN):**
- `app/api/jicate-booking/sso-token/route.ts` (NEW) — `GET` returns `{ token: jwt.sign({ email: user.email, sub: user.id, exp: now+60 }, process.env.MYJKKN_SSO_SECRET) }`. Requires authenticated Supabase session (use `createServerClient` + `getUser()` precondition).
- `components/jicate-booking/embed.tsx` (modify Agent A’s wrapper) — on mount, fetch `/api/jicate-booking/sso-token`, then prime the embed by setting `iframe.src = ${calOrigin}/api/auth/callback/myjkkn-sso?token=${token}&callbackUrl=${embedRoute}` for one tick before swapping to the actual embed `calLink`. Alternative: use a hidden `<img>` ping-style request before the `<Cal>` mounts.

**Env vars to add:**
| Project | Name | Value |
|---|---|---|
| jicate-booking | `MYJKKN_SSO_ENABLED` | `true` (production), `false` (preview) |
| jicate-booking | `MYJKKN_SSO_SECRET` | matches MyJKKN value (32-byte random hex) |
| jicate-booking | `MYJKKN_SSO_EMAIL_DOMAIN_ALLOWLIST` | `jkkn.ac.in,jkkn.ai` |
| MyJKKN | `MYJKKN_SSO_SECRET` | matches jicate-booking value |

**Test plan:**
1. Login to MyJKKN as a host with `@jkkn.ac.in` email.
2. Open `/meetings/manage`.
3. Verify network panel: `GET /api/jicate-booking/sso-token` returns 200 within 50ms.
4. Verify iframe loads `/api/auth/callback/myjkkn-sso?token=…` and 302-redirects to `/event-types`.
5. Verify Cal.com user was lazily created (check `User` table where `email = host.email`).
6. Verify second visit (cookie warm) skips the SSO callback entirely.
7. Negative: token-replay-attack — capture token, wait 90s, replay → 401.
8. Negative: wrong-domain email → provider rejects, falls back to magic-link login.

### Phase 2 — Option C (subdomain cookie sharing)

**DNS:** Add `meetings.jkkn.ai` CNAME → `cname.vercel-dns.com` (or whatever current jicate-booking points at).

**Vercel:** Add `meetings.jkkn.ai` as a domain on the jicate-booking project; let Vercel issue cert.

**jicate-booking env updates:**
| Name | Old | New |
|---|---|---|
| `WEBAPP_URL` | `https://jicate-booking.vercel.app` | `https://meetings.jkkn.ai` |
| `NEXTAUTH_URL` | `https://jicate-booking.vercel.app` | `https://meetings.jkkn.ai` |
| `NEXTAUTH_COOKIE_DOMAIN` | unset | `.jkkn.ai` |
| `ALLOWED_HOSTNAMES` | as-is | add `jkkn.ai` |

**Backwards compat:** Keep `jicate-booking.vercel.app` alias for 12 months; serve a 301 redirect from any non-API path to the equivalent `meetings.jkkn.ai` URL. Booking links in user emails/calendars remain valid.

**MyJKKN env updates:**
| Name | New |
|---|---|
| `NEXT_PUBLIC_JICATE_BOOKING_URL` | `https://meetings.jkkn.ai` |

**Embed wrapper update:** Read `process.env.NEXT_PUBLIC_JICATE_BOOKING_URL` for `calOrigin`; no other change.

**Test plan after subdomain cutover:**
1. Hard-refresh `/meetings/manage` from a previously-logged-in MyJKKN browser.
2. Verify both cookies present in DevTools: `sb-…-auth-token` (domain `.jkkn.ai`) AND `__Secure-next-auth.session-token` (domain `.jkkn.ai`).
3. Verify embed loads directly into `/event-types` editor without any redirect to `/auth/login`.
4. Repeat in Safari (ITP) and Chrome incognito with 3PCD enabled — should still work because both cookies are now first-party `.jkkn.ai`.

---

## Risks

1. **Cal.com auth code changes are a security-critical surface.** GHSA-7hg4-x4pr-3hrg (2025) was an authentication bypass via unvalidated email in a custom JWT callback — exactly the shape of provider we’re proposing in Option B. Mitigation: signature verification MUST be cryptographic (not trust-on-claim), expiry MUST be ≤60s, email-domain allow-list MUST be enforced, code MUST be reviewed by a second person before merge.
2. **Subdomain cutover breaks existing booking links.** Mitigation: 301 redirects from `jicate-booking.vercel.app` for ≥12 months. Document the cutover date.
3. **Lazy user creation can collide on case/encoding.** If MyJKKN’s `user@JKKN.ac.in` and Cal.com’s `user@jkkn.ac.in` are treated as different identities, the host ends up with two unrelated Cal.com accounts. Mitigation: lowercase + trim before lookup; reject if `email_verified = false` on Supabase side.
4. **Option C makes jicate-booking less obviously "vendor-y" and more "JKKN product"** — slightly weakens the multi-tenant productization angle. Mitigation: position `meetings.jkkn.ai` as the JKKN-tenant subdomain; offer `meetings.acme.com` to other tenants identically. The pattern scales.
5. **Browser 3rd-party-cookie deprecation may bite Option E (status quo) before we ship C.** Chrome 3PCD is on-and-off; Safari ITP already blocks. If a user in Safari hits `/meetings/manage` on `www.jkkn.ai` while jicate-booking is still on `jicate-booking.vercel.app`, the `next-auth.session-token` cookie may not be sent inside the iframe even after first login, forcing repeated logins. **This may force C earlier than usage data alone would justify.**

---

## Open questions for Director

1. **Approve Option E for v1?** (Already shipped via Agents B+C — this is asking Director to acknowledge the first-visit-login UX as acceptable for now.)
2. **Greenlight v2 = Option C + B together, or sequence them (B first, observe, C later)?** Recommendation: B-then-C, but C might need to come first if Safari users complain about repeated logins.
3. **Domain choice for v2 Option C — `meetings.jkkn.ai` or `book.jkkn.ai` or `cal.jkkn.ai`?** Recommendation: `meetings.jkkn.ai` (matches existing `/meetings/...` route convention in MyJKKN).
4. **Multi-tenant productization stance — is `meetings.acme.com` for client X (configured identically) the long-term plan, or do we keep jicate-booking single-tenant for JKKN only?** This affects how we structure `MYJKKN_SSO_SECRET` (single secret vs per-tenant secret table).
5. **Who is the second-pair-of-eyes reviewer for the custom Credentials provider PR?** Cal.com auth changes need a security-aware reviewer. (Recommend: pre-flight via the silent-failure-auditor + an explicit GHSA-7hg4 regression test before merge.)

---

## Sources

- [Cal.com Embed Instructions](https://cal.com/docs/core-features/embed/embed-instructions)
- [Cal.com Platform Quickstart](https://cal.com/docs/platform/quickstart)
- [Cal.com Platform Pricing](https://cal.com/platform/pricing) — $299/mo Developer, $2,499/mo Scale
- [@calcom/atoms README](https://github.com/calcom/cal.com/blob/main/packages/platform/atoms/README.md)
- [Cal.com `next-auth-options.ts`](https://github.com/calcom/cal.com/blob/main/packages/features/auth/lib/next-auth-options.ts)
- [Cal.com `default-cookies.ts`](https://github.com/calcom/cal.com/blob/main/packages/lib/default-cookies.ts)
- [Cal.com GHSA-7hg4-x4pr-3hrg — Authentication Bypass via Unvalidated Email in Custom JWT Callback](https://github.com/calcom/cal.com/security/advisories/GHSA-7hg4-x4pr-3hrg)
- [Cal.com Self-host Configuration (Mintlify)](https://www.mintlify.com/calcom/cal.com/self-hosting/configuration) — `NEXTAUTH_COOKIE_DOMAIN` reference
- [Cal.com Org env vars](https://cal.com/docs/self-hosting/guides/organization/understanding-organization-env-variables) — `ALLOWED_HOSTNAMES` reference
- [next-auth Discussion #1299 — subdomain auth service pattern](https://github.com/nextauthjs/next-auth/discussions/1299)
- [next-auth Issue #11295 — Custom JWT in CredentialsProvider](https://github.com/nextauthjs/next-auth/issues/11295)
- [Cal.com Issue #18297 — Operation Fast Embed (RFC)](https://github.com/calcom/cal.com/issues/18297)
- [Cal.com Issue #2221 — RFC: Embedded Bookings](https://github.com/calcom/cal.com/issues/2221)
- [Supabase Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) — alternative if we want to bridge Supabase JWT directly (advanced)

Local source files inspected (jicate-booking working tree at `/Users/omm/PROJECTS/jicate-booking/`):
- `packages/features/auth/lib/next-auth-options.ts` (lines 270–542) — provider registration pattern
- `packages/features/ee/impersonation/lib/ImpersonationProvider.ts` — example of a custom CredentialsProvider that integrates with Cal.com’s session model
- `packages/lib/default-cookies.ts` — `NEXTAUTH_COOKIE_DOMAIN` wiring
- `packages/embeds/embed-react/src/Cal.tsx` — confirmation that the embed accepts no auth prop

Live probes (executed during research):
- `curl -sI https://jicate-booking.vercel.app/event-types` → 200, no `X-Frame-Options`, no `frame-ancestors` CSP
- `curl -s https://jicate-booking.vercel.app/api/auth/providers` → confirms `credentials`, `impersonation-auth`, `email`
