# External Integrations

**Analysis Date:** 2026-03-22

## Data Storage

**Primary Database:**
- Supabase (PostgreSQL) — Project ID: `kvizhngldtiuufknvehv`
  - Connection env vars:
    - `NEXT_PUBLIC_SUPABASE_URL` (public, browser-safe)
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, RLS-enforced)
    - `SUPABASE_SERVICE_ROLE_KEY` (server-only, bypasses RLS)
  - Clients:
    - Browser: `lib/supabase/client.ts` — `createClientSupabaseClient()` (singleton, PKCE flow, typed via `types/supabase.ts`)
    - Server: `lib/supabase/server.ts` — `createServerSupabaseClient()` / `createServiceRoleClient()`
  - Row-Level Security (RLS) enabled on sensitive tables; multi-tenant via `institution_id`
  - Schema files: `supabase/setup/01_tables.sql`, `02_functions.sql`, `03_policies.sql`, `04_triggers.sql`, `05_views.sql`
  - Index: `supabase/SQL_FILE_INDEX.md`

**File Storage:**
- Supabase Storage — used for file uploads across modules
  - Client: `lib/supabase/storage-utils.ts` (`StorageUtils` class)
  - Files uploaded with UUID filenames, cached 1 hour
  - Public URLs via Supabase CDN at `kvizhngldtiuufknvehv.supabase.co`
  - Image domain whitelisted in `next.config.ts`

**Caching:**
- Next.js built-in caching (Cache Components, `s-maxage`, `stale-while-revalidate`)
- TanStack Query in-memory cache (client-side, configured per hook)
- No external Redis or distributed cache detected

## Authentication & Identity

**Primary Auth Provider:**
- Supabase Auth — handles sessions, JWT tokens, user management
  - PKCE flow enabled (`flowType: 'pkce'` in client config)
  - Session persistence: cookie-based (via `@supabase/ssr`)
  - Auto token refresh enabled

**OAuth:**
- Google OAuth — `lib/auth/auth-service.ts` (`AuthService.signInWithGoogle()`)
  - Redirects to `/auth/callback` after OAuth
  - Requires `offline` access type for refresh tokens

**SAML 2.0 (IdP):**
- MyJKKN acts as a SAML Identity Provider using `samlify` ^2.10.2
  - Service: `lib/services/saml/saml-idp-service.ts`, `saml-session-service.ts`
  - Endpoints: `app/api/saml/sso/route.ts` (GET/POST), `app/api/saml/metadata/route.ts`, `app/api/saml/logout/route.ts`
  - Keys (env vars): `SAML_PRIVATE_KEY`, `SAML_PUBLIC_CERTIFICATE`, `SAML_IDP_ENTITY_ID`

**API Key Auth (B2A/MCP):**
- Custom `jkkn_xxxx`-format API keys stored in `api_keys` table (SHA-256 hashed)
  - Auth bridge: `lib/mcp/auth-bridge.ts` — validates Bearer tokens on every MCP request
  - Scoping: `lib/mcp/scoping.ts` — student sees own data, faculty sees dept, admin sees institution
  - Key management: `app/api/api-management/` routes
  - Env var for admin endpoints: `ADMIN_SECRET_KEY`

## AI / LLM

**Anthropic Claude:**
- SDK: `@anthropic-ai/sdk` ^0.68.0
- Used in: `app/api/ai-query/route.ts` — natural language query processing with MCP tools
- Env vars: `CLAUDE_API_KEY` or `ANTHROPIC_API_KEY` (either accepted, `CLAUDE_API_KEY` checked first)
- Context limit: ~200K tokens; response capped at 80K chars / 100 records per tool result

**MCP Server (embedded):**
- Protocol: Model Context Protocol via `@modelcontextprotocol/sdk` ^1.27.1
- Transport: Streamable HTTP at `app/api/mcp/[transport]/route.ts`
- Mode: stateless (fresh `McpServer` per request)
- Tools registered: `lib/mcp/register-tools.ts`; tool helpers at `lib/mcp/tool-helpers.ts`
- Auth: Bearer token validated via `verifyMcpToken()` in `lib/mcp/auth-bridge.ts`
- Compatible with Claude and ChatGPT MCP clients

**Chatbot / Voice Agent:**
- `lib/services/ai/chatbot-service.ts` — stub, not yet implemented
- `lib/services/ai/voice-agent-service.ts` — stub, not yet implemented (designed for AI voice calling)

## Messaging & Communications

**WhatsApp (Business API — Cloud API):**
- Integration type: Meta WhatsApp Cloud API
- Env vars: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`
- Routes: `app/api/admission/whatsapp-personal/` (status, send endpoints)

**WhatsApp (BYOW — Bring Your Own WhatsApp):**
- Integration type: Self-hosted `whatsapp-web.js` Express service on Railway
- Client: `lib/whatsapp/personal-api-client.ts`
- Env vars: `WHATSAPP_PERSONAL_SERVICE_URL`, `WHATSAPP_PERSONAL_API_KEY`
- Auth: `X-API-Key` header
- Service directory: `whatsapp-service/` in project root

**SMS — MSG91 (Primary):**
- Provider: MSG91 (Indian SMS gateway, DLT-compliant)
- Service: `lib/services/admission/sms-campaign-service.ts`
- API endpoint: `https://api.msg91.com/api/v5/flow/`
- Env vars: `MSG91_AUTH_KEY`, `MSG91_SENDER_ID` (default: `JKKNAD`), `MSG91_DLT_ENTITY_ID`
- Provider selection: `NEXT_PUBLIC_SMS_PROVIDER` env var (defaults to `msg91`)

**SMS — Twilio (Secondary/Alternative):**
- Provider: Twilio
- Service: `lib/services/admission/sms-campaign-service.ts` (same service, provider-switched)
- Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

**Push Notifications (Web Push):**
- Protocol: Web Push API via `web-push` ^3.6.7 (VAPID)
- Subscribe endpoint: `app/api/notifications/subscribe/route.ts`
- Send endpoint: `app/api/notifications/send/route.ts`
- Subscriptions stored in `push_subscriptions` table
- Env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`

**Email — Resend (Stub):**
- Provider: Resend (planned, not yet implemented)
- Service: `lib/services/email/email-service.ts` — returns error until wired up
- Env var required: `RESEND_API_KEY`
- Status: stub with TODO comment; `isConfigured()` check gating all calls

## Payment Gateway

**HDFC SmartGateway:**
- Provider: HDFC Bank SmartGateway (MID: SG3726)
- Service: `lib/services/billing/payment-gateway-service.ts` (`PaymentGatewayService` class)
- Endpoints:
  - Initiate: `app/api/billing/payment/initiate/route.ts`
  - Callback: `app/api/billing/payment/callback/route.ts`
  - Webhook: `app/api/billing/payment/webhook/route.ts`
  - Status check: `app/api/billing/payment/status/[transactionId]/route.ts`
- Env vars:
  - `HDFC_MERCHANT_ID`, `HDFC_PAYMENT_PAGE_CLIENT_ID`
  - `HDFC_API_KEY`, `HDFC_API_SECRET`
  - `HDFC_RESPONSE_KEY`, `HDFC_CARD_ENCODING_KEY`
  - `HDFC_BASE_URL` (default: `https://smartgateway.hdfcuat.bank.in` — UAT)
  - `HDFC_TEST_MODE` (`"true"` for sandbox)
  - `HDFC_ENABLE_LOGGING`, `HDFC_WEBHOOK_USERNAME`, `HDFC_WEBHOOK_PASSWORD`, `HDFC_WEBHOOK_REQUIRE_SIGNATURE`
- Security: HMAC signature verification on webhooks, audit service at `lib/services/billing/security/payment-audit-service.ts`

## Telephony

**Exotel (Call Management):**
- Provider: Exotel (Indian cloud telephony, used in Admission CRM)
- Service: `lib/services/telephony/telephony-service.ts` (`TelephonyService.isConfigured()`)
- Env vars: `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_SID`
- Purpose: Outbound calls from counselors to admission leads; call logs stored in `admission_call_logs` table

## LTI (Learning Tools Interoperability)

**LTI 1.3 (Identity Provider):**
- Standard: IMS LTI 1.3 (supports MATLAB Grader, MATLAB Online, and other LTI consumers)
- Services: `lib/services/lti/` — `lti-tool-service.ts`, `lti-jwt-service.ts`, `lti-launch-service.ts`, `lti-grade-service.ts`, `lti-roster-service.ts`, `lti-context-service.ts`, `lti-role-service.ts`, `lti-audit-service.ts`
- Endpoints: `app/api/lti/` — `auth/`, `callback/`, `grades/`, `jwks/`, `launch/`, `names-roles/`, `token/`, `tools/`
- JWT signing: RS256 via `jose` (`importPKCS8`)
- Env vars: `LTI_PRIVATE_KEY` (PKCS8 PEM), `LTI_PUBLIC_KEY`, `LTI_KEY_ID`, `LTI_ISSUER`

## External Webhooks

**Incoming Webhooks:**
- HDFC Payment webhook: `POST /api/billing/payment/webhook` — payment status updates
- Admission webhook: secured via `ADMISSION_WEBHOOK_API_KEY`

**Outgoing Webhooks:**
- TMS (Transport Management System): `lib/services/service-requests/transport-webhook.ts`
  - Sends HMAC-SHA256 signed notifications to external TMS on transport request events
  - Env vars: `TMS_WEBHOOK_URL`, `TMS_WEBHOOK_SECRET`

## CRM Integration

**External CRM (Read-Only API Key):**
- Route: `app/api/crm/api-key/route.ts`
- Env var: `CRM_API_KEY`
- Purpose: Provides API key to external CRM systems for integration

## Performance Monitoring

**Vercel Speed Insights:**
- Package: `@vercel/speed-insights` ^1.2.0
- Integrated in app layout for Vercel-native performance monitoring
- Env vars: `VERCEL`, `VERCEL_ENV`, `VERCEL_URL` (auto-injected by Vercel platform)

## Feature Flags (Environment-Based)

The following env vars control which modules/features are enabled:

- `NEXT_PUBLIC_ENABLE_STUDENT_PORTAL` — enables student portal access
- `NEXT_PUBLIC_USE_LEARNERS_PROFILES` — enables learners profiles module
- `NEXT_PUBLIC_LEARNERS_PROFILES` — feature flag for learner profiles view
- `NEXT_PUBLIC_LEARNERS_ANALYTICS` — feature flag for learner analytics
- `NEXT_PUBLIC_LEARNERS_ALUMNI` — feature flag for alumni section
- `NEXT_PUBLIC_LEARNERS_ENQUIRIES` — feature flag for enquiries
- `NEXT_PUBLIC_LEARNERS_APPLICATIONS` — feature flag for applications

## Environment Configuration

**Required env vars (all environments):**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
```

**Required for AI features:**
```
CLAUDE_API_KEY or ANTHROPIC_API_KEY
```

**Required for payments:**
```
HDFC_MERCHANT_ID, HDFC_API_KEY, HDFC_API_SECRET, HDFC_RESPONSE_KEY
HDFC_CARD_ENCODING_KEY, HDFC_BASE_URL
```

**Required for push notifications:**
```
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
```

**Required for telephony:**
```
EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_SID
```

**Required for WhatsApp:**
```
WHATSAPP_ACCESS_TOKEN, WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_PERSONAL_SERVICE_URL, WHATSAPP_PERSONAL_API_KEY  (BYOW)
```

**Required for SMS:**
```
MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_DLT_ENTITY_ID  (or Twilio equivalents)
```

**Required for SAML:**
```
SAML_PRIVATE_KEY, SAML_PUBLIC_CERTIFICATE, SAML_IDP_ENTITY_ID
```

**Required for LTI:**
```
LTI_PRIVATE_KEY, LTI_PUBLIC_KEY, LTI_KEY_ID, LTI_ISSUER
```

**Optional/stub (not yet implemented):**
```
RESEND_API_KEY  (email — stub)
```

**Secrets location:** `.env` file (local), Vercel environment variables (production). `.env` file is git-ignored. Never committed.

---

*Integration audit: 2026-03-22*
