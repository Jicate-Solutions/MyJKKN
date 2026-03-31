# Architecture — Expo Lead Capture + WhatsApp

## System Map

```
┌─────────────────────────────────────────────────────────────────┐
│ EXPO LEAD CAPTURE (new — built on omm-dev)                      │
│                                                                  │
│  ┌──────────────────────┐    ┌─────────────────────────────┐    │
│  │ CAPTURE FORM          │    │ DASHBOARD + ANALYTICS        │    │
│  │ /capture/[eventId]    │    │ /admission/events/[id]/live  │    │
│  │ (capture) route group │    │ /admission/events/[id]/qr    │    │
│  │ No sidebar, mobile    │    │ /admission/events/analytics  │    │
│  │ 5 fields + bilingual  │    │ (routes) group, with sidebar │    │
│  └──────────┬───────────┘    └──────────────┬──────────────┘    │
│             │                                │                   │
│             ▼                                ▼                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ expo-capture-service.ts (467 lines)                       │   │
│  │ captureLead → auto-assign counselor → schedule follow-up  │   │
│  │ getEventStats, getLeaderboard, getOrCreateQrLink, getROI  │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                          │                                       │
│             ┌────────────┼────────────┐                         │
│             ▼            ▼            ▼                          │
│      admission_leads  expo_events  expo_lead_capture_links      │
│      (+expo_event_id) (21→22 events)  (QR short codes)         │
│      (+referred_by_id)                                          │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ ON CAPTURE → trigger WhatsApp welcome
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ WHATSAPP INTEGRATION (built on omm-dev, API live)               │
│                                                                  │
│  ┌──────────────────────┐    ┌─────────────────────────────┐    │
│  │ CHAT INBOX            │    │ META CLOUD API v21.0         │    │
│  │ /admission/chat/      │    │ graph.facebook.com           │    │
│  │ 3-panel: list+thread  │    │ Phone: +91 63803 10048       │    │
│  │   +lead sidebar       │    │ Quality: GREEN               │    │
│  └──────────┬───────────┘    │ Messages sent: 0             │    │
│             │                 └──────────────┬──────────────┘    │
│             ▼                                ▼                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 14 WhatsApp services (6,275 lines)                        │   │
│  │ whatsapp-api-client → chat → consent → routing → forms    │   │
│  │ templates → segments → analytics → reengagement → catalog │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                          │                                       │
│             ┌────────────┼──────────────┐                       │
│             ▼            ▼              ▼                        │
│      wa_conversations  wa_messages  wa_phone_numbers (EMPTY!)   │
│      (0 records)       (0 records)  ← MUST INSERT PHONE        │
└─────────────────────────────────────────────────────────────────┘
```

## Expo Capture — File Map

```
app/(capture)/                              ← Separate route group (NO sidebar)
├── layout.tsx                              ← QueryClientProvider + Toaster
└── capture/[eventId]/
    ├── layout.tsx                           ← Minimal mobile wrapper ('use client')
    ├── loading.tsx                          ← Suspense spinner
    ├── page.tsx                             ← Auth + event validation + form orchestration
    └── _components/
        ├── rapid-capture-form.tsx           ← 5 fields, bilingual, program chips
        ├── capture-stats-bar.tsx            ← Sticky bottom "You: X | Team: Y"
        └── offline-sync-badge.tsx           ← Pending sync count + auto-sync

app/(routes)/admission/events/[eventId]/
├── qr/page.tsx                             ← QR code + download + share
└── live/page.tsx                           ← Real-time dashboard + leaderboard

app/(routes)/admission/events/
└── analytics/page.tsx                      ← Event ROI comparison

app/api/admission/
├── capture/route.ts                        ← POST: capture single lead
├── capture/sync/route.ts                   ← POST: bulk sync offline leads
└── events/
    ├── [eventId]/stats/route.ts            ← GET: live stats + leaderboard
    ├── [eventId]/qr/route.ts               ← GET: QR link
    └── analytics/route.ts                  ← GET: ROI across events

lib/services/admission/expo-capture-service.ts  ← Core service (467 lines)
hooks/admission/use-expo-capture.ts             ← React Query hooks (202 lines)
types/expo-capture.ts                           ← TypeScript interfaces (131 lines)
```

## WhatsApp — File Map

```
lib/services/whatsapp/                      ← 14 services, 6,275 lines total
├── whatsapp-api-client.ts                  ← Meta Cloud API v21.0 client
├── whatsapp-chat-service.ts                ← Core 2-way messaging (1,064 lines)
├── whatsapp-connection-service.ts          ← Multi-WABA management
├── whatsapp-consent-service.ts             ← DPDPA 2023 compliance
├── whatsapp-template-service.ts            ← Meta template sync + quality
├── whatsapp-routing-service.ts             ← Smart categorization (7 intents)
├── whatsapp-settings-service.ts            ← Institution config
├── whatsapp-forms-service.ts               ← Interactive buttons/lists/flows
├── whatsapp-counselor-analytics-service.ts ← Performance metrics
├── whatsapp-message-log-service.ts         ← Message logging
├── whatsapp-document-catalog-service.ts    ← Shareable docs
├── whatsapp-segment-service.ts             ← Audience segmentation
├── whatsapp-reengagement-service.ts        ← Re-engagement automation
└── whatsapp-template-analytics-service.ts  ← Template performance

app/api/admission/chat/                     ← 18 API endpoints
app/api/webhooks/whatsapp/route.ts          ← Inbound webhook (435 lines)
app/api/admission/settings/whatsapp*/       ← Settings routes (4 files)
app/(routes)/admission/chat/                ← Chat UI (3 pages + 3 components)
hooks/admission/use-wa-*.ts + use-chat-*.ts ← 8 hooks (1,335 lines)
types/whatsapp.ts                           ← Type definitions (94 lines)
```

## Auth Patterns

| Module | Auth Pattern |
|--------|-------------|
| Expo capture API routes | `withAuth` — session or Bearer token |
| Expo capture page | Direct Supabase auth (no AuthProvider — route group limitation) |
| WhatsApp API routes | `withAuth` — all 18 endpoints |
| WhatsApp webhook | HMAC-SHA256 signature verification (Meta App Secret) |
| Dashboard/QR/Analytics pages | Standard `(routes)` layout with `useAuth()` |

## Key Design Decision: (capture) Route Group

The capture form lives at `/capture/[eventId]` in the `(capture)` route group — NOT `(routes)`.

**Why:** The `(routes)` group wraps everything in `AdminPanelLayout` (sidebar + navbar). Exhibition booth team members need a clean mobile form without sidebar. Next.js route groups can't share URL prefixes, so `/capture/` is separate from `/admission/`.

**Implication for developer:** When merging to main, ensure the `app/(capture)/` directory is included. It's a sibling to `app/(routes)/`, not nested inside it.
