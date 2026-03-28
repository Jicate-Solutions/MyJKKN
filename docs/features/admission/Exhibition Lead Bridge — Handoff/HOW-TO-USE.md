# Exhibition Lead Bridge — How to Use This Handoff

> For the project owner giving these files to an AI coding agent.
> **Google Drive**: [Exhibition Lead Bridge Handoff](https://drive.google.com/drive/folders/1I8ZP48vOJvJvmFUxESB8UA9tUZtoRLqy)
> **Updated**: 2026-03-28 (with Phase 3B production delta — corrected staging vs production gaps)

## The Situation

You have 9 exhibitions running THIS WEEK with 84 team members at booths. Zero digital leads captured. This spec bridges the existing expo system to the existing CRM.

## How to Give This to the AI Agent

### Option A: All at Once (Recommended — it's small enough)

```
Read specs/expo-lead-bridge-spec.md and implement Phase 1 first.

Key context:
- expo_events table EXISTS in production with 21 real events
- admission_leads table EXISTS with 81 real leads
- The ONLY schema change: add expo_event_id column to admission_leads
- The capture form is PUBLIC (no auth) — visitors scan QR at booth
- Build on omm-dev branch, target staging DB (hhprjbgknupaplivtoib)
```

### Option B: Phase by Phase

**Session 1 — Capture Bridge (most urgent):**
```
Read specs/expo-lead-bridge-spec.md, Phase 1 only.
Add expo_event_id to admission_leads on staging.
Build the public capture form at /admission/capture/[eventId].
Build the capture API route.
Test: QR scan → form fill → lead appears in CRM.
```

**Session 2 — Auto-Pipeline:**
```
Read specs/expo-lead-bridge-spec.md, Phase 2.
Auto-assign counselor, auto-schedule follow-up, trigger WhatsApp.
```

**Session 3 — Dashboard + Analytics:**
```
Read specs/expo-lead-bridge-spec.md, Phase 3 + 4.
Build live event dashboard and ROI analytics.
```

## Signs It's Working

- Capture form loads on mobile without login
- Submitting form creates a lead with `expo_event_id` set
- `expo_events.total_leads_collected` increments
- Lead appears in CRM lead list with "education_fair" source
- QR code page generates downloadable QR image

## Signs It's Going Wrong

- Creating new database tables for events → STOP, expo_events already exists
- Adding auth to capture form → STOP, it must be public
- Building a separate app → STOP, it's routes in the existing Next.js app
- Using getAuthUser in capture route → STOP, capture route has NO auth (use rate limiting instead)
