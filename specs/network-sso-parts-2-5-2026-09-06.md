# Campus Wi-Fi captive-portal SSO — parts 2-5, re-planned on today's code

**Date:** 2026-09-06 · **Status:** SPEC ONLY — Director approves before anyone builds · **Part 1:** Draft PR #792 (`feat/network-sso-foundation`, May 2026)

## What changed since May (verified today, read-only)

| Fact | May plan said | Today |
|---|---|---|
| PR #792 | "merges week of 05-13" | Still Draft, 5,296 commits behind main, **never applied**: production has 0 `network_*` tables, 0 `fn_network_*` functions, no ledger row |
| Parts | 5 PRs | May 9 pivot **deleted the RouterOS client** (part 2) — the router speaks RADIUS natively. Parts became: RADIUS auth endpoint, portal pages, admin, VPS playbook |
| Colleges | "7 colleges, ~5,500 users" | `institutions` = **14 rows, all active**; 7,421 auth users, 6,415 profiles linked to a learner |
| Config | own table `network_module_config` (13 keys) | `platform_policies` + `fn_get_policy_int/bool/text/json` is the platform mechanism (**526 call sites** on main). #792's table is a parallel mechanism — must go |
| RLS | `profiles.role IN ('director', …)` | **`director` is not a role** (0 profiles carry it; the Director is one of 12 `super_admin`). Hardcoded role names are banned in RLS; policies must use `user_has_permission()` + `role_has_institution_access()` |
| Anon lock | none | Since 06-06 every SECURITY DEFINER function needs `REVOKE EXECUTE … FROM anon, PUBLIC` (#792 has 0 of 7) |
| Login | "username + password on the router page" | `/auth/login` is **Google-only**; 5,915 of 7,421 users have a password set, but no learner is ever shown one. What a learner types on the Wi-Fi page is an open decision (Q1 below) |
| Hardware | MikroTik hotspot + FreeRADIUS on a Hetzner VPS | MikroTik CCR2116 live; 30 Sophos APs dead since Feb; a 30 × EAP610 + **Omada controller** purchase was planned 05-09 — no PO or controller found in the vault. Which box runs the captive page is undecided (Q2) |
| Domain | `myjkkn.ai` in seeds and endpoints | Production is `www.jkkn.ai`; portal domain `wifi.jkkn.ai` is not provisioned |
| Route ceiling | n/a | Vercel hard cap 2,048 routes; **2,029 used** (headroom 19; 55 after PR #3295 merges). This build adds ~10 |
| Words | Learner / Senior Learner used | Terminology gate now blocks the four legacy people-words in `.ts/.tsx/.md` — spec and UI copy use learner, Senior Learner, team member, learning partner |

A Dec-2025 prototype at `~/PROJECTS/jkkn-network-sso` (RouterOS REST, `network_users`) predates the pivot and is not reused.

## Part 1 revision — make #792 land on today's main (prerequisite, not new scope)

Rebase onto `jicate/main`, renumber the migration to today's prefix, and fix in place (nothing is applied, so this is not a destructive change): rewrite all 14 policies to `is_super_admin() OR is_admin() OR (user_has_permission('network.…') AND role_has_institution_access(institution_id))`; add `REVOKE … FROM anon, PUBLIC` + `GRANT … TO authenticated` (service-role-only for the auth path) on all 7 functions; **drop `network_module_config`** and seed the 13 keys as `platform_policies` rows (`network.lockout.max_attempts` …); fix seed domains to `jkkn.ai`; keep tables, partitions, teleport trigger, master lists. Migration class: ADD_ONLY. Test: apply in `BEGIN…ROLLBACK`, then as `test.student` confirm `network_audit_log` is invisible and `network_sessions` shows only own rows; as `super_admin` confirm all rows.

## Part 2 — services + RADIUS authorization decision (the brain)

**For a real user:** nothing visible yet. When the router asks "may this person connect?", MyJKKN answers accept/reject, with speed tier and session length, in under 300 ms.
**Files (new):** `lib/services/network/{radius-auth,session,device,lockout,audit,config}-service.ts`, `types/network.ts`, `app/api/network/radius-auth/route.ts` (POST, called only by FreeRADIUS `rlm_rest`, authenticated by a per-server bearer from Supabase Vault + NAS-Identifier → `network_routers` → `institution_id`).
**Migration (additive):** `fn_network_authorize(p_username, p_nas_id, p_client_mac)` SECURITY DEFINER, service_role only — reads `fn_student_attendance_pct` (tier), `fn_aqs_billing_overdue_invoices` (fee block), `fn_network_is_user_locked`, device cap from policy; `network_sessions.acct_session_id TEXT` + index; `platform_policies` rows for `network.session.hours.<role>`.
**Tested:** unit tests in `__tests__/lib/network/` (CI runs `lib/` tests) for the five May smoke scenarios (accept tier A, tier C, fee-overdue reject, Senior Learner 24 h, locked reject); `scripts/network/radius-smoke/` re-creates the May `radclient → FreeRADIUS → route` harness against a `PORT=3104` main worktree.
**Risky:** the credential question (Q1) decides the whole request shape; fee and attendance RPCs were written for dashboards, not a 300 ms hot path — measure before wiring; a wrong answer here blocks 6,000 people from the internet.

## Part 3 — captive-portal pages at wifi.jkkn.ai (what the learner sees)

**For a real user:** a learner joins `JKKN-Campus`, sees a Tamil/English page, signs in once, gives DPDPA consent once, then reconnects with one tap on known devices; a blocked learner sees *why* (fee overdue, too many devices, locked out) and what to do; `wifi.jkkn.ai/devices` lets them name and remove their devices.
**Files (new):** `app/(public)/wifi/{page,blocked,consent,welcome,devices}/page.tsx` (5 routes) + `_components/`; OAuth subflow mirrors SAML: `app/api/network/sso/route.ts` writes `network_pending_requests`, `/auth/login` and `/auth/callback` learn a `networkReqId` param exactly as they handle `samlReqId` today. **Edits (shared files):** `proxy.ts` public-path allowlist (`/wifi/` prefix — being in `app/(public)` does not make a page public), `lib/guide/registry.ts` (help fragment), `lib/constants/carre-auditable-modules.ts`, `next.config` hostname for `wifi.jkkn.ai`.
**Migration (additive):** `network_consents (profile_id, version, consented_at, ip)`; if Q1 = Wi-Fi PIN: `network_credentials (profile_id, pin_hash, set_at, last_used_at)` + `fn_network_set_pin`.
**Tested:** persona sweep (workflow-test Mode E) on a main worktree as `test.student`, `test.faculty`, `test.hod`: sign in, consent, see own devices, remove one, hit `/wifi/blocked?reason=fee_overdue`; unauthenticated `curl` of every `/wifi/*` URL must return 200, not a login redirect; Tamil strings marked *needs native review*.
**Risky:** touches `proxy.ts` and the auth callback (High-risk class: full local build + browser test); `wifi.jkkn.ai` needs a Vercel domain + cert (May left this open); 5 routes against a 19-route headroom.

## Part 4 — admin: live sessions, routers, panic button, audit, settings

**For a real user:** a system admin sees who is on which access point right now, ends a session, registers a router, flips **emergency open Wi-Fi** when MyJKKN is down (auto-restores per decision 17), reads the audit trail; a principal or warden sees their own institution's sessions only.
**Files (new):** `app/(routes)/admin/network/page.tsx` with `?tab=sessions|routers|audit|settings|panic` (1 route, not 5 — headroom), `app/api/network/admin/{kick,panic}/route.ts`; settings reuse `components/shared/crud-master/` for the three master lists. **Edits (shared):** `lib/constants/permissions.ts` (`network.view`, `network.sessions.manage`, `network.routers.manage`, `network.audit.view`, `network.settings.manage`, `network.panic.manage`), `lib/sidebarMenuLink.ts`, `lib/guide/registry.ts`.
**Migration (additive):** none beyond `platform_policies` rows `network.emergency_open` (institution scope) — panic state is a policy row, panic events are audit rows.
**Tested:** as `super_admin` click every tab and action; as `test.hod` confirm `/admin/network` shows "You don't have access" (explicit, no silent redirect); as a `warden` persona confirm sessions are institution-scoped; catalog-sync gate (`node scripts/check-permissions-catalog.mjs`) green.
**Risky:** panic mode is a live-network switch reachable from a browser — needs a typed confirmation and an audit row; grant only to `super_admin` + `system_admin` until the Director names a network-admin role (Q4).

## Part 5 — the box outside the repo: FreeRADIUS VPS + router handoff (ops, no LOC)

**For a real user:** this is the wire that makes parts 2-4 real on campus. Without it every code part is a mock.
**Deliverables:** `docs/guides/network/2026-09-06-GUIDE-freeradius-vps-playbook.md` and `docs/guides/network/2026-09-06-GUIDE-mikrotik-hotspot-handoff.md` (Hetzner CCX13, RADSEC on 2083, `rlm_rest` → `/api/network/radius-auth`, CoA 3799, `clients.conf` one entry per router, cert pinning into `network_radius_servers.tls_cert_fingerprint`), a sysadmin handoff for the three RouterOS commands (already drafted in the vault), the `JKKN-RADIUS-Test` SSID for a 50-user parallel week before any cutover. Accounting (decision 28, direct DB writes from the VPS) needs a dedicated Postgres role with INSERT on `network_sessions` only — or an HTTPS `radius-acct` route; pick at Q3.
**Tested:** one real phone on the test SSID, one real learner account, Accept and Reject both observed on the router log and in `network_sessions`.
**Risky:** a public RADIUS endpoint is an attack surface (rate-limit, IP allow-list per router); JICATE-shared infra means one VPS outage takes every campus down — decision 17's auto-open must be tested, not assumed.

## Order and size

Part 1 revision → Part 2 → (Part 3 ∥ Part 4, different files; both edit the guide registry so serialize that hunk) → Part 5 in parallel from day one because it is people, not code. Roughly 8-12 builder days plus ops lead time. No cutover date is proposed until Q1-Q5 are answered and the hardware question is settled.

## Decisions taken 2026-09-06 00:20 (tap-interview) and what they change

| Q | Answer | Effect on the parts above |
|---|---|---|
| Scope | **Answer-independent work only** — the 00:05 ruling stands, nothing else builds | Three lanes started: Part 1 revision (new Draft PR superseding #792), the pure RADIUS decision core + local smoke harness (Part 2 logic without routes), the VPS playbook + router handoff (Part 5 docs) |
| Q1 credential | **Google sign-in via MyJKKN** | `network_pending_requests` stays. Flow: router hotspot → `/api/network/sso` → Google OAuth (mirrors `samlReqId`) → MyJKKN sends the browser back to the hotspot login URL with a one-time username/password it minted → router forwards it over RADIUS → `/api/network/radius-auth` validates the token and answers with tier and session length. Returning devices use MAC-cookie / MAC auth. No learner ever types a password |
| Q2 captive box | **MikroTik CCR2116 hotspot** (May decision 29 stands) | Part 3's entry contract is the RouterOS hotspot `$(mac)`, `$(link-login-only)`, `$(link-orig)` variables; Omada is out of scope |
| Q4 network admin | **Kavinkumar D (kavinkumar_d@jkkn.ac.in)** | He already holds `system_admin`, so: no new role, no database change. Admin surfaces grant to `super_admin` + `system_admin` |

**Review status 02:00 IST:** every lane passed two reviewers on two models (Fable reviewer A, then an Opus round that found real defects — a bypassable device cap, role maps keyed on non-role words, an inverted upload/download rate string, a browser-blocked login hop — all fixed in round 2 and re-verified by Opus). Still Draft, nothing applied, nothing merged.

**Lane PRs (all Draft, nothing applied, 2026-09-06 01:25 IST):** Part 1 revision → [#3303](https://github.com/Jicate-Solutions/MyJKKN/pull/3303) (supersedes #792) · Part 2 decision core + smoke harness → [#3302](https://github.com/Jicate-Solutions/MyJKKN/pull/3302) · Part 5 playbooks → [#3299](https://github.com/Jicate-Solutions/MyJKKN/pull/3299). Two things #3303 found in #792 worth knowing: `fn_network_register_device` let any signed-in person register a device for anyone (now self-or-permission only), and two of the seven functions were not actually SECURITY DEFINER. #3299 found that RouterOS forces the RADSEC shared secret to the literal `radsec`, so May decision 26's per-router unique secret cannot exist; tenancy rests on TLS plus a per-router IP allow-list.

Still open: **Q3** (who owns and pays for the RADIUS VPS; accounting direct-to-DB or via MyJKKN) and **Q5** (pilot one college first or all 14 at once). Parts 3 and 4 do not start until Q3 and Q5 are answered and the Director approves this plan.

## Questions the Director must answer before building

1. **What does a learner type on the Wi-Fi page?** (a) Google sign-in via MyJKKN (OAuth subflow, needs MAC-based re-auth on the router), (b) a 6-digit Wi-Fi PIN they set once inside MyJKKN, (c) their MyJKKN password (most have never seen it). This decides Part 2's shape.
2. **Which device runs the captive page — MikroTik hotspot (May decision 29) or the Omada controller?** Was the EAP610 + Omada purchase made? If Omada, the redirect contract changes and Part 3's entry route is different.
3. **Who pays for and owns the RADIUS VPS** (Hetzner, ~₹500/month, JICATE-shared)? And accounting: direct DB writes from that box (decision 28) or an HTTPS receiver in MyJKKN?
4. **Which role is "network admin"?** No such role exists; `system_admin` does. Grant admin to `super_admin` + `system_admin` only, or create `network_admin`?
5. **Is the big-bang still the plan?** 14 institutions are active, not 7. Pilot one college on the test SSID first, or all at once (decision 2)?
