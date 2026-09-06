# Proxy Auth — Full Local HS256 Token Verification (Trust-Model Change)

**Date:** 2026-08-03 · **Status:** SPEC ONLY — nothing implemented, no code in this PR · **Prereq:** dedicated security review sign-off before ANY implementation PR

> **This document is a specification, not a change.** PR #2780 (merged 2026-08-03, commit
> `d82e218bdd`) shipped the smaller, trust-model-preserving fix — a 60-second validation
> cache over the unchanged network check. This spec describes the *follow-up* that PR
> deliberately did not ship, because it changes what we trust to assert a user's identity.
> It must never ride inside a perf PR.

## Why

Even after #2780, the **first sight** of every access token still costs a network round trip
to the Supabase Auth server (`/auth/v1/user`). Measured in #2780's PR body:

| Cost | Where measured |
|---|---|
| 387ms–2.67s TTFB floor | production, fresh connections (pre-#2780, every request) |
| ~55ms per request | warm keep-alive connection, local prod build (pre-#2780) |
| 297ms | cache-miss first sight of a token (post-#2780, local prod build) |
| 2.9ms / 9.0ms | cache-hit middleware-only / full document request (post-#2780 medians, 25 samples) |

The cache is a **per-instance in-memory Map** (`lib/auth/token-validation-cache.ts:88`).
Every new serverless instance starts cold, so under horizontal scale the "first sight" hop
is paid *per token × per instance × per 60s window* — the network dependency is amortised,
not removed. Full local HS256 signature verification removes it entirely: admission becomes
a sub-millisecond CPU operation with **zero** auth-server availability coupling.

## Enabling facts (verified)

1. **The signing secret exists in production.** The project is legacy HS256 — the JWKS
   endpoint returns `{"keys":[]}` — and `SUPABASE_JWT_SECRET` is absent from the local
   `.env.local`, but an adversarial verifier live-checked `vercel env ls production` on
   2026-08-02: the secret **is present** in the Vercel Production environment (recorded in
   the #2780 PR body "Correction" paragraph).
2. **The secret is already load-bearing in this codebase.** `lib/auth/impersonate.ts:21-34`
   *mints* HS256 Supabase-compatible JWTs with `SUPABASE_JWT_SECRET` (jose `SignJWT`,
   `alg: 'HS256'`) for API-key impersonation, and `lib/auth/preview-session.ts:100` prefers
   it for preview-token signing. Local *verification* adds a consumer of the secret, not a
   new class of secret.
3. **The verification library and idiom already exist.** `jose@^6.0.12` is a direct
   dependency (`package.json:146`) and is already used for HS256 verify inside this very
   proxy: `lib/auth/parent-jwt.ts` (`jwtVerify`, Web Crypto, runtime-portable) gates the
   parent portal on every request. The proposed change reuses a proven in-repo pattern.

## Current flow (jicate/main, post-#2780) — cited

All in `proxy.ts` unless noted:

1. `proxy.ts:380-383` — `supabase.auth.getSession()` parses the session cookie **locally**
   (no network) and yields `accessToken`. Expired tokens are refreshed by supabase-js here,
   exactly as before #2780.
2. `proxy.ts:385-387` — consult `tokenValidationCache.get(accessToken)`
   (`lib/auth/token-validation-cache.ts:101-118`): keyed by SHA-256 of the exact token
   string; locally-expired or undecodable tokens are never served from cache.
3. `proxy.ts:390-402` — cache miss → the real `supabase.auth.getUser()` **network**
   validation, with the pre-existing single 200ms mobile-transient retry.
4. `proxy.ts:406-408` — only a *successful* validation is stored
   (`token-validation-cache.ts:125-148`); failures are never cached (fail-closed). Entry
   lifetime = `min(60s TTL, token exp)` (`token-validation-cache.ts:53,130`).
5. `proxy.ts:581-595` — `user.user_metadata.account_disabled === true` → sign out +
   redirect. Under the current flow this flag is at most 60s stale, because a fresh
   `getUser()` re-reads the **live** user record at least once per token per instance per
   60s.

**What the network check actually buys today:** `getUser()` consults auth-server state —
user still exists, not banned, current `user_metadata`. The cache bounds the staleness of
that server-side state to 60s. That bound is the Director-accepted baseline (#2780).

## Proposed flow

Behind a kill-switch env flag (default OFF — see Rollout):

1. `getSession()` cookie parse, unchanged (expired→refresh path untouched).
2. **NEW:** `jwtVerify(accessToken, secret, { algorithms: ['HS256'], ... })` — local
   signature verification via jose, secret from `SUPABASE_JWT_SECRET`, claims checks
   pinned (see Security Analysis §1). On success, construct the `VerifiedTokenUser`
   snapshot (`token-validation-cache.ts:40-44`) from the verified claims
   (`sub` → id, `email`, `user_metadata`).
3. **Revocation bound preserved:** local verification decides *admission*; the existing
   60s validation cache is repurposed as a *re-validation schedule* — at most once per
   token per instance per 60s, a background/inline `getUser()` re-check refreshes the
   server-side verdict (bans, `account_disabled`, deletions). This is the **hybrid**
   design: first sight is local (the hop we are removing), while server-side revocation
   remains bounded by the same 60s the Director already accepted. A pure-local variant
   (no re-check at all) is strictly worse for revocation and is NOT the recommended
   design — see Security Analysis §3 for the full comparison.
4. Any local-verification failure or misconfiguration falls back to the current network
   path (see §6 Failure modes). Flag OFF = byte-for-byte today's behavior.

No database changes. No migrations. One env flag added (plus optionally a previous-secret
variable for rotation, §2).

## SECURITY ANALYSIS (the core of this spec)

The one-sentence trust-model change: **today, identity is asserted per-token-first-sight by
the Supabase Auth *server* (live state); after this change, identity is asserted by an HMAC
*signature* over claims minted at token issuance (state as of issuance).** Every subsection
below is a consequence of that sentence.

### 1. Algorithm pinning — accept HS256 only

- `jwtVerify(token, key, { algorithms: ['HS256'] })` — the allowlist is **mandatory**, not
  advisory. Never derive the algorithm from the token header.
- Rejects `alg: none` (unsigned), and rejects RS256/ES256/PS256 downgrade-confusion attacks
  (an attacker presenting an asymmetric-signed or unsigned token cannot steer verification
  to a weaker path; jose additionally hard-rejects `none` when a key is supplied — the
  allowlist makes it explicit and audit-visible).
- Pin claims, not just the algorithm: `issuer` = this project's
  `https://<project-ref>.supabase.co/auth/v1`, `audience` = `authenticated`. A token signed
  with the same secret but minted for another purpose (e.g. the 60s impersonation tokens
  from `lib/auth/impersonate.ts:26-34`, which set `iss: 'supabase'` and no `aud`) must NOT
  admit a browser session — the issuer/audience pins are what stop cross-purpose token
  reuse inside our own secret domain.
- `typ` header, if checked, only ever tightens; absence of `typ` must not loosen anything.

### 2. Secret rotation story

- **What rotation breaks today (pre-this-spec):** rotating the Supabase JWT secret in the
  Supabase dashboard immediately invalidates every outstanding access token (the auth
  server signs and verifies with the new secret), forcing refresh-token round trips for all
  active sessions. It also breaks `lib/auth/impersonate.ts` and preview-session signing
  until the Vercel env var is updated **and a redeploy occurs** — Vercel env changes do not
  reach running instances without a redeploy. Rotation is *already* a coordinated
  operational event; this spec adds one more consumer with the same dependency.
- **New failure this spec introduces:** a window where the auth server signs with the new
  secret while deployed instances still verify with the old one → locally-rejected valid
  tokens. With the fallback of §6 in place, those tokens fall through to the network path
  and still work (degraded to today's latency, not an outage). This makes the fallback a
  rotation-safety feature, not just an error handler.
- **Dual-secret grace window (required for clean rotation):** support
  `SUPABASE_JWT_SECRET` (current) + `SUPABASE_JWT_SECRET_PREVIOUS` (optional). Verify
  against current first, then previous; both attempts HS256-pinned with identical claim
  pins. Rotation runbook: set PREVIOUS=old, CURRENT=new → redeploy → rotate in Supabase
  dashboard → after max token lifetime elapses, unset PREVIOUS → redeploy. The previous
  secret must never be accepted beyond the rotation window.
- Rotation must be exercised in staging as part of the test plan before the flag ever
  defaults ON in production.

### 3. Revocation semantics — the deliberate cost, bounded

**Stated plainly: pure local verification makes revocation STRICTLY WORSE than the accepted
60s cache.** A signed, unexpired token verifies locally *forever* (until `exp`), regardless
of what happened server-side after issuance — admin ban, credential change,
`account_disabled` flip (`proxy.ts:581`), account deletion. The revocation lag stops being
60s and becomes the **full access-token lifetime**, which for this project is a Supabase
Auth dashboard setting that MUST be read and recorded before implementation (Supabase's
default is 3600s; do not assume — measure a live token's `iat`→`exp` spread).

Baseline to beat: the Director accepted a **60s** worst-case revocation lag in #2780. Any
implementation of this spec must not silently regress past that number. Options, in order
of preference:

| Design | First-sight hop | Revocation lag | Verdict |
|---|---|---|---|
| A. Hybrid (recommended): local verify admits; network `getUser()` re-check at most every 60s per token per instance | **Removed** | **60s (unchanged baseline)** | The point of this spec — keeps the win, keeps the bound |
| B. Local-only + short exp: rely on token `exp`, lower Supabase JWT expiry if needed | Removed | = token lifetime (likely 3600s) | Only acceptable with an explicit, Director-approved new lag number |
| C. Local-only + revocation list (denylist of revoked `sub`/`session_id` consulted locally) | Removed | ≈ denylist propagation | New moving part + storage; not justified while A exists |

Additional revocation notes:

- A user's **own sign-out** clears cookies client-side immediately in all designs — the
  browser stops presenting the token; nothing here changes that.
- `user_metadata.account_disabled` under local verify comes from **mint-time claims**, not
  live state. Design A preserves the 60s freshness by refreshing the snapshot on each
  re-check. Any design that drops the re-check must move the disabled-account gate to a
  server-side source the proxy already reads (e.g. the `profiles` fetch at
  `proxy.ts:437-449`) and state its own staleness bound.
- Refresh-token revocation is unaffected: refreshing an expired token still round-trips to
  the auth server in every design.

### 4. Clock skew tolerance

- jose validates `exp`/`nbf`/`iat` against local clock with **zero** default tolerance.
  Specify an explicit `clockTolerance` (recommended: 30–60s) — serverless instances have
  generally good NTP but are not immune to skew, and a hard-zero tolerance converts small
  skew into spurious auth redirects at token boundaries.
- The current cache already does local `exp` comparison against `Date.now()`
  (`token-validation-cache.ts:105`) with zero tolerance and no observed incidents — treat
  that as weak evidence skew is small, not proof it is zero.
- Tolerance must only ever *extend acceptance near boundaries*, never bypass `exp`
  entirely; cap it at 60s.

### 5. Secret handling

- Env only: `SUPABASE_JWT_SECRET` (and `_PREVIOUS` during rotation). **Never** a
  `NEXT_PUBLIC_` prefix, never bundled client-side, never logged (including in error
  messages, debug output, or thrown-error strings — a failed `jwtVerify` must log the
  error *class*, never key material or the token), never echoed by any diagnostic
  endpoint.
- Blast-radius honesty: whoever holds this secret can already mint arbitrary-identity
  tokens accepted by PostgREST directly — `lib/auth/impersonate.ts` is the in-repo proof.
  Local verification therefore does **not** grant a secret-holder any capability they lack
  today; it does add one more code path whose correctness depends on the secret staying
  secret, which is an argument for having the §2 rotation runbook rehearsed, not against
  the design.
- The verification key should be constructed once per instance (module scope), not
  re-encoded per request; the secret value must not transit any cache, header, or log.

### 6. Failure modes + kill switch

Env flag (naming per the `lib/config/feature-flags.ts` idiom, but **server-only** — this
flag must NOT be `NEXT_PUBLIC_`): e.g. `PROXY_LOCAL_JWT_VERIFY=true`.

| Condition | Behavior |
|---|---|
| Flag unset/false (default) | Exactly today's flow (#2780 cache over network validation). Zero new code in the hot path. |
| Flag on, secret missing/empty at boot | Log once (error class only), permanently fall back to network path for the instance lifetime. Misconfiguration degrades to today's latency, never to an outage and never to fail-open admission. |
| Flag on, signature invalid | Fall back to the network path (which independently rejects forgeries — fail-closed is preserved because *admission* only ever comes from a successful verification, local or network). During §2 rotation windows this fallback is what keeps old-secret tokens working. An attacker "forcing" the fallback gains only today's behavior. |
| Flag on, token expired / undecodable | Same as today: never admitted locally, falls through to the existing refresh/reject flow (`proxy.ts:390-402`). |
| Flag on, claims pin mismatch (iss/aud) | Reject via fallback path; alert-worthy (indicates cross-purpose token presentation, §1). |
| Emergency | Flip the flag off + redeploy → provably identical to the shipped #2780 behavior. No data to migrate, no state to unwind. |

### 7. What does NOT change

- Parent / schools / external portal JWT verification (`parent-jwt.ts`,
  `school-portal-jwt.ts`, `external-jwt.ts`) — already local HS256 with separate secrets;
  untouched.
- RLS, PostgREST, and every downstream authorization decision — this spec only changes
  *where the proxy verifies the access token*, not what any policy trusts.
- The expired→refresh flow, the logged-out redirect flow, and deep-link preservation
  (`proxy.ts:411-430`).

## Rollout plan

1. **Land flag-off.** Implementation PR ships with `PROXY_LOCAL_JWT_VERIFY` absent from all
   environments → dead code in production; CI + unit tests exercise the flag-on path.
2. **Staging/preview on.** Enable in the staging environment; run the full test plan there,
   including a live secret-rotation rehearsal (§2 runbook) and a disabled-account flip
   timed against the 60s bound.
3. **Production canary.** Enable in production for a bounded window with explicit watch:
   auth-redirect rate, `/auth/login?reason=disabled` rate, middleware p50/p95 TTFB, any
   local-verify fallback counter. Success = no auth-redirect anomaly + first-sight latency
   collapse visible in TTFB percentiles.
4. **Default on.** Flag remains as the permanent kill switch (§6 Emergency row).
5. Any anomaly at any stage: flag off, redeploy, investigate — no rollback migration
   exists because there is nothing to migrate.

## Test plan

Unit (jose wrapper):
- Accepts: a token HS256-signed with the current secret, correct iss/aud, future exp.
- Rejects: `alg: none`; RS256-signed token (downgrade); tampered payload (signature
  mismatch); expired beyond clockTolerance; `nbf` in future; wrong `iss`; wrong `aud`;
  an `impersonate.ts`-shaped token (`iss: 'supabase'`, no aud) — must NOT admit (§1).
- Dual-secret: old-secret token accepted only while `_PREVIOUS` is set; rejected after.
- Boundary: exp within clockTolerance accepted; exp beyond it rejected.

Integration (built server, per the #2780 verification style):
- Forged-cookie replay (structurally-valid JWT, real `sub`, future `exp`, bad signature)
  redirected to login on every attempt — reproducing #2780's live test under flag-on.
- Flag-off vs flag-on behavioral diff on a real session: identical outcomes, only timing
  differs.
- Secret-missing boot under flag-on: instance serves traffic via network path, one error
  log, no admission failures.
- Disabled-account flip under flag-on (design A): user locked out within 60s.
- Rotation rehearsal in staging: dashboard rotation + dual-secret window + redeploy, zero
  forced-logout anomalies beyond Supabase's own token invalidation.

Performance (repeat #2780's method — local prod build, real session, 25-sample medians):
- First-sight request under flag-on vs the 297ms flag-off baseline.
- Confirm no regression on cache-hit path (2.9ms / 9.0ms baselines).

Pre-implementation facts to record in the implementation PR (not assumptions):
- The project's actual access-token lifetime (`iat`→`exp` of a live token).
- Which runtime the proxy executes in on Vercel (Next `^16.2.2`, `proxy.ts` +
  `export const config` at `proxy.ts:694`) and that Web Crypto HMAC verify is available
  there (it is for both Node and Edge; record it, don't assume it).

## Review checklist (for the dedicated security review)

- [ ] Trust-model change sentence (§ opening) is understood and accepted by the reviewer.
- [ ] Algorithm allowlist `['HS256']` present at every verify call site; no header-derived
      algorithm anywhere; `iss` + `aud` pinned to this project's values (§1).
- [ ] Impersonation-token cross-reuse test (§1, §Test plan) exists and fails closed.
- [ ] Rotation runbook written, dual-secret window implemented, staging rehearsal recorded
      (§2).
- [ ] Revocation design is A (hybrid, 60s bound preserved) — or a different bound has an
      explicit, written Director sign-off with the new worst-case number (§3).
- [ ] `account_disabled` staleness bound stated and tested (§3).
- [ ] `clockTolerance` explicit, ≤60s, boundary-tested (§4).
- [ ] Secret never logged, never `NEXT_PUBLIC_`, never in error strings; grep-audit of the
      diff for the env var name in any logging path (§5).
- [ ] Kill-switch flag defaults OFF; flag-off path is byte-identical to #2780 behavior
      (§6).
- [ ] Fallback-to-network on local-verify failure verified fail-closed (admission only
      ever from a successful verification) (§6).
- [ ] Canary watch list (§Rollout step 3) wired before the production flag flip.
- [ ] **Requires a dedicated security review before any implementation PR.**

## DO NOT

- Do NOT implement any part of this spec in this PR — it is documentation only.
- Do NOT bundle the eventual implementation into a perf PR; it gets its own PR referencing
  this spec and the completed security review.
- Do NOT widen the secret's exposure (no new logging, no client bundles, no new services
  reading it) as part of implementing verification.
- Do NOT accept any algorithm other than HS256, under any configuration.
