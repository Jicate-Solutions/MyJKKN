# AI Pulse — Microsoft Graph Teams Attendance Integration

**Date:** 2026-06-18
**Status:** Spec / IT-unblock (code blocked on Azure admin work)
**Decision owner:** Director (CAIO)
**Author:** Mac Claude

---

## Why this exists

AI Pulse measures weekly engagement via a 4-gate model (`joined`, `polls`, `stayed`, `quiz`).
The **`stayed` gate is structurally dead**: the AI Lab Hour runs in an *external* Teams
meeting, so learners click "Join", leave the in-app `/ai-pulse/live/[cycle]` page, the tab
backgrounds, and the `recordHeartbeat` sensor stops. `stayed_until` never reaches `ends_at`
→ the gate fails for everyone → engagement read **0% by construction** until the
2026-06-18 band-aid (PR #1503) added a quiz-as-presence *proxy*.

This integration replaces the proxy with **real presence** pulled from Microsoft Graph
Teams attendance reports.

### Verified ground truth (06-18 cycle `ac1eea6c…`, 199 attendees)
| Signal | Count | Note |
|---|---|---|
| Joined within 5 min | 105 | real (in-app Join click) |
| Took quiz | 22 | real |
| Passed quiz | 19 | real (only strong learning signal) |
| Polls responded | 0 | gate auto-passed for all 199 (no polls issued) |
| `stayed` (heartbeat) | ~0 | **dead sensor** — this is what Graph fixes |

---

## Locked decisions

1. **Keep Teams** (not on-platform hosting). — Director, 2026-06-18.
2. **Platform generates the Teams meeting** via Graph, so MyJKKN's organizer context
   can always read the attendance report. — forced by the Graph constraint that
   *attendance reports are accessible only to the meeting organizer/co-organizer*
   ([Get meetingAttendanceReport](https://learn.microsoft.com/en-us/graph/api/meetingattendancereport-get?view=graph-rest-1.0)).
3. **Cost: ₹0 recurring.** Graph API has no per-call charge; covered by the existing
   M365 license. Only one-time IT setup.

---

## Architecture (minimal blast radius)

The integration is **additive**. It does NOT change `evaluateGates` / `isEngagedFromGates`.
It only populates `engagement_signals.stayed_until` with the *real* leave time, which the
existing `isPresentAtEnd` already consumes. Once real data flows, the quiz-proxy branch in
`isPresentAtEnd` can be removed in a follow-up (separate PR, separate decision).

```
Cycle goes live ──► [NEW] graph-attendance-service.createMeeting()
                      POST /users/{SERVICE_ACCOUNT}/onlineMeetings
                      → store online_meeting_id + join_url + organizer_id
                        in startup_events.config.ai_pulse
                      → meet_url now platform-generated (Champion stops pasting)

Session ends ──► [NEW] cron /api/cron/ai-pulse-attendance-pull
                      GET /users/{organizer}/onlineMeetings/{id}/attendanceReports
                      GET .../attendanceReports/{rid}/attendanceRecords
                      for each record:
                        email → profiles.email → profile_id   (identity match)
                        last leave time → engagement_signals.stayed_until (IST HH:MM)
                        total minutes → engagement_signals.attendance_minutes (NEW field)
                      → existing evaluateGates() now reads a REAL stayed gate
```

### Integration points (exact)
| Concern | File / location |
|---|---|
| Cycle config (meet_url, host_user_id) | `lib/services/ai-pulse/cycles-service.ts:716` → `startup_events.config.ai_pulse` |
| Meet URL input (to be replaced) | `app/(routes)/ai-pulse/admin/cycles/_components/cycle-edit-form.tsx:386` |
| `stayed_until` writer (existing) | `lib/services/ai-pulse/live-session-service.ts:793` (`recordHeartbeat`) |
| Gate consumer (unchanged) | `live-session-service.ts:985` (`isPresentAtEnd`) |
| Attendance store | `ai_pulse_live_attendance.engagement_signals` JSONB |

---

## IT / Azure checklist (the long pole — start NOW, in parallel)

> Hand this to whoever administers the JKKN Microsoft 365 / Entra tenant.
> None of the code can function until steps 1–6 are complete.

1. **Entra ID → App registrations → New registration**
   - Name: `MyJKKN AI Pulse Attendance`
   - Account type: **Single tenant**
2. **API permissions** (type = **Application**, NOT delegated):
   - `OnlineMeetings.ReadWrite.All` — create meetings (platform-generated link)
   - `OnlineMeetingArtifact.Read.All` — read attendance reports
   - `OnlineMeetings.Read.All` — resolve meetings
   - ⚠️ Confirm exact current permission names in-portal; Microsoft has renamed Graph
     permissions before.
3. **Grant admin consent** for all three (the "Grant admin consent for <tenant>" button).
4. **Teams Application Access Policy** (Teams PowerShell) — *the most-missed step.*
   App-only access to a user's online meetings requires:
   ```powershell
   New-CsApplicationAccessPolicy -Identity "AiPulseAttendance" -AppIds "<CLIENT_ID>" -Description "AI Pulse attendance"
   Grant-CsApplicationAccessPolicy -PolicyName "AiPulseAttendance" -Identity "<SERVICE_ACCOUNT_UPN>"
   ```
   Grant it to the **service account** that will organize the meetings (step 6).
   Without this, Graph returns **403 even with admin consent granted**.
5. **Client secret** — Certificates & secrets → New client secret → copy the *value* once.
6. **Service account** — a tenant user (e.g. `ai-pulse@jkkn.ac.in`) licensed for Teams,
   which the platform uses as the meeting **organizer**. Note its **object id / UPN**.
7. **Hand to Mac Claude — securely, NEVER in chat:**
   - Tenant ID
   - Client ID
   - Client Secret (value)
   - Service account object id / UPN

---

## Env vars (set in Vercel after IT delivers; length-check before building on them)

| Var | Purpose |
|---|---|
| `MS_GRAPH_TENANT_ID` | tenant |
| `MS_GRAPH_CLIENT_ID` | app id |
| `MS_GRAPH_CLIENT_SECRET` | secret value (server-only, never client) |
| `MS_GRAPH_ORGANIZER_USER_ID` | service-account object id (meeting organizer) |

All Graph calls are **server-only** (cron + server actions). The secret never reaches the
browser bundle. Feature is **env-gated**: if any var is empty, the integration is inert and
the existing quiz-proxy gate keeps running (no regression).

---

## Identity matching (Graph attendee → MyJKKN learner)

Graph `attendanceRecord` gives `emailAddress` + `identity` (AAD object id) + `totalAttendanceInSeconds`
+ `attendanceIntervals[]` (join/leave pairs).

- Primary match: `attendanceRecord.emailAddress` → `profiles.email` (case-insensitive).
- Write per matched profile into `ai_pulse_live_attendance.engagement_signals`:
  - `stayed_until` = IST `HH:MM` of the **last** `leaveDateTime` (so `isPresentAtEnd` compares to `ends_at`)
  - `attendance_minutes` = `round(totalAttendanceInSeconds / 60)` (NEW signal, for richer reporting)
  - `presence_source` = `"graph"` (so anomaly-scan can distinguish real vs proxy)
- **Edge cases to handle:** external/guest attendees (no profile → skip + log), email mismatch
  (display-name-only records → unmatched bucket), dial-in (no email → skip), the organizer
  service account itself (skip).

---

## Build phases (after creds land)

1. **`graph-attendance-service.ts`** — client-credentials token (raw `/oauth2/v2.0/token`,
   no MSAL dep needed), `createOnlineMeeting()`, `getAttendanceReports()`, `getAttendanceRecords()`.
2. **Meeting creation on go-live** — wire into cycle activation; store ids in config;
   replace the paste input with a "Generate Teams meeting" action (keep paste as fallback).
3. **`/api/cron/ai-pulse-attendance-pull`** — runs ~30 min after each session end; idempotent
   (upsert by profile_id); `REVOKE`-safe (cron uses service role, no new anon-exposed RPC).
4. **Remove the quiz-as-presence proxy** from `isPresentAtEnd` (separate PR + Director sign-off,
   once real data is confirmed flowing).
5. **Optional backfill** — none for 06-18 (the proxy already credited those; backfill only
   future cycles).

---

## Verification plan (when activated)

- Create a test cycle, generate the meeting, hold a 2-min Teams call with 2 tenant accounts.
- Run the pull cron manually → assert 2 `ai_pulse_live_attendance` rows got real `stayed_until`
  + `attendance_minutes` + `presence_source='graph'`.
- Confirm `/ai-pulse/dept` engaged count now reflects real presence (not the proxy).
- Confirm anomaly-scan still reads RAW signals (it must NOT consume the proxy — it distinguishes
  `presence_source` to catch "quiz passed without attending").

---

## What does NOT change

- `evaluateGates` / `isEngagedFromGates` — untouched; they consume `stayed_until` as-is.
- The 06-18 numbers — already credited via the proxy; this is forward-looking.
- No new anon-exposed RPC (cron writes via service role; gate stays REVOKE-safe).
