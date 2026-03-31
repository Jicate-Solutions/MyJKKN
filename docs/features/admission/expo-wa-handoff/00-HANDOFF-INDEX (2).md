# Expo Lead Capture + WhatsApp Go-Live — Developer Handoff

> **For:** Boobalan | **From:** omm-dev branch | **Date:** 2026-03-30
> **Urgency:** HIGH — Exhibition events running NOW with zero digital capture

## What You're Getting

Two modules, one handoff:

| Module | Status on omm-dev | Your Job |
|--------|-------------------|----------|
| **Expo Lead Capture** | CODE COMPLETE (24 files, 2,634 lines) | Merge to main + deploy |
| **WhatsApp Integration** | CODE COMPLETE (52 files, 11,572 lines) + API LIVE | Configure Meta webhook + first test send |

## Quick Start

```bash
# 1. Review the code
git fetch ommdev omm-dev
git log --oneline ommdev/omm-dev --not origin/main -- \
  "app/(capture)/" "lib/services/whatsapp/" "app/api/admission/capture/" | head -20

# 2. Read the specs
cat specs/expo-wa-handoff/01-ARCHITECTURE.md    # System design
cat specs/expo-wa-handoff/03-DATABASE-SCHEMAS.md # Live DB state
cat specs/WHATSAPP-INTEGRATION-SPEC.md           # Full WhatsApp spec

# 3. Merge expo code (if ready)
git cherry-pick <commits> OR git merge ommdev/omm-dev
```

## Files in This Handoff

| File | Read When |
|------|-----------|
| [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | Understand what's built + how it connects |
| [03-DATABASE-SCHEMAS.md](03-DATABASE-SCHEMAS.md) | Live table schemas from staging DB |
| [04-MIGRATION-GUIDE.md](04-MIGRATION-GUIDE.md) | Step-by-step: merge expo + configure WhatsApp |
| [05-MODULE-CONNECTIONS.md](05-MODULE-CONNECTIONS.md) | How expo + WhatsApp + CRM connect |
| [../WHATSAPP-INTEGRATION-SPEC.md](../WHATSAPP-INTEGRATION-SPEC.md) | Full WhatsApp spec (combined, replaces old 16-gaps spec) |
| [HOW-TO-USE.md](HOW-TO-USE.md) | Instructions for project owner (Omm) |

## Critical Facts

| Fact | Value |
|------|-------|
| Expo capture URL | `/capture/[eventId]` (NOT `/admission/capture/`) |
| Expo route group | `app/(capture)/` — separate from `(routes)`, no sidebar |
| WhatsApp API | Meta Cloud API v21.0 — LIVE, phone VERIFIED, GREEN quality |
| WhatsApp phone | +91 63803 10048 (JKKN Institutions) |
| Approved templates | `jkkn_welcome` + `exhibition_thankyou` |
| Messages sent | **ZERO** — never tested |
| Webhook URL | **NOT REGISTERED** with Meta — critical blocker |
| Staging DB | `hhprjbgknupaplivtoib` — all tables exist |
| Test event | `d8d6ae1f-aa44-4159-8565-0efaa90f1c50` (Chennai, active) |

## Rules

1. Expo capture form is at `/capture/[eventId]` — uses `(capture)` route group (no sidebar)
2. WhatsApp is Meta direct — **NOT via Exotel** (Exotel = voice only)
3. WhatsApp serves ALL modules (not just admission)
4. `wa_phone_numbers` table is EMPTY — must insert phone number before anything works
5. Never send WhatsApp without consent check (DPDPA 2023)
6. Target staging DB `hhprjbgknupaplivtoib` — NOT production
