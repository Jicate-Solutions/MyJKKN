# Migration Guide — Step-by-Step

## Part A: Merge Expo Lead Capture to Production

### A1. Review the files (all NEW — no conflicts expected)

```bash
# These files exist on omm-dev but NOT on origin/main:
app/(capture)/layout.tsx
app/(capture)/capture/[eventId]/layout.tsx
app/(capture)/capture/[eventId]/loading.tsx
app/(capture)/capture/[eventId]/page.tsx
app/(capture)/capture/[eventId]/_components/rapid-capture-form.tsx
app/(capture)/capture/[eventId]/_components/capture-stats-bar.tsx
app/(capture)/capture/[eventId]/_components/offline-sync-badge.tsx
app/(routes)/admission/events/[eventId]/qr/page.tsx
app/(routes)/admission/events/[eventId]/live/page.tsx
app/(routes)/admission/events/analytics/page.tsx
app/api/admission/capture/route.ts
app/api/admission/capture/sync/route.ts
app/api/admission/events/[eventId]/stats/route.ts
app/api/admission/events/[eventId]/qr/route.ts
app/api/admission/events/analytics/route.ts
lib/services/admission/expo-capture-service.ts
hooks/admission/use-expo-capture.ts
types/expo-capture.ts
```

### A2. Cherry-pick or merge

```bash
# Option 1: Cherry-pick specific commits
git cherry-pick <commit-hash-for-expo-types>
git cherry-pick <commit-hash-for-expo-service>
git cherry-pick <commit-hash-for-expo-api-routes>
git cherry-pick <commit-hash-for-expo-hooks>
git cherry-pick <commit-hash-for-expo-ui>

# Option 2: Merge the branch (includes all changes)
git merge ommdev/omm-dev --no-ff -m "feat: Expo Lead Capture module"
```

### A3. Verify on production DB

The expo tables were synced from production → staging. They already exist on production. But verify:

```sql
-- Check expo tables exist on production
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'expo_%';

-- Create expo_lead_capture_links if missing
CREATE TABLE IF NOT EXISTS expo_lead_capture_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  expo_event_id uuid NOT NULL REFERENCES expo_events(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  short_code text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  scan_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE expo_lead_capture_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capture_links_access" ON expo_lead_capture_links FOR ALL
  USING (institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
```

### A4. Build and deploy

```bash
npm run build   # Should pass — tested on omm-dev
vercel --prod   # Deploy to production
```

### A5. Test

1. Log in to MyJKKN production
2. Navigate to `/capture/<any-event-id>` — should show capture form (no sidebar)
3. Navigate to `/admission/events/<event-id>/qr` — should show QR code
4. Navigate to `/admission/events/<event-id>/live` — should show dashboard
5. Navigate to `/admission/events/analytics` — should show ROI table

---

## Part B: Configure WhatsApp Go-Live

### B1. Insert phone number into database

```sql
-- Run on STAGING first, then production when ready
INSERT INTO wa_phone_numbers (
  institution_id,
  phone_number_id,
  business_account_id,
  display_number,
  verified_name,
  quality_rating,
  is_primary,
  is_active
) VALUES (
  'a1111111-1111-1111-1111-111111111111',  -- JKKN College of Pharmacy (test)
  '1043868105477092',
  '203800758166888',
  '+916380310048',
  'JKKN Institutions',
  'GREEN',
  true,
  true
);
```

### B2. Set environment variables on Vercel

Ensure these are set (some may already exist):

```
WHATSAPP_PHONE_NUMBER_ID=1043868105477092
WHATSAPP_BUSINESS_ACCOUNT_ID=203800758166888
WHATSAPP_APP_ID=437028995095541
WHATSAPP_DEDICATED_NUMBER=916380310048
WHATSAPP_ACCESS_TOKEN=<permanent token from .env.local>
WHATSAPP_VERIFY_TOKEN=<choose any secret string>
WHATSAPP_WEBHOOK_SECRET=<from Meta App Dashboard → App Secret>
```

### B3. Register webhook URL in Meta Business Manager

1. Go to https://business.facebook.com → Your App → WhatsApp → Configuration
2. **Callback URL:** `https://myjkkn.vercel.app/api/webhooks/whatsapp` (or your production URL)
3. **Verify token:** Same value as `WHATSAPP_VERIFY_TOKEN` env var
4. Click **Verify and Save**
5. Subscribe to events: `messages`, `message_template_status_update`

### B4. Sync templates from Meta → Database

```bash
# Call the template refresh endpoint (requires auth)
curl -X POST "https://your-app.vercel.app/api/admission/chat/templates/refresh-quality" \
  -H "Cookie: <your auth cookie>"
```

Or via the UI: Go to Admission → Chat → Settings → Refresh Templates

### B5. Send first test message

```bash
# Send a template message via the API
curl -X POST "https://graph.facebook.com/v21.0/1043868105477092/messages" \
  -H "Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "91XXXXXXXXXX",
    "type": "template",
    "template": {
      "name": "jkkn_welcome",
      "language": { "code": "en" }
    }
  }'
```

Expected: recipient gets WhatsApp message. API returns `{ messages: [{ id: "wamid.xxx" }] }`.

### B6. Test inbound webhook

1. From the test phone, reply to the WhatsApp message
2. Check Vercel logs: `vercel logs --follow`
3. Should see: `POST /api/webhooks/whatsapp 200`
4. Check `wa_messages` table: should have 1 record

### B7. Wire expo capture → WhatsApp welcome (P1)

In `lib/services/admission/expo-capture-service.ts`, add after lead creation:

```typescript
// After line 115 (auto-schedule follow-up)
// 7. Send WhatsApp welcome (if phone has WhatsApp)
try {
  const { WhatsAppApiClient } = await import('@/lib/services/whatsapp/whatsapp-api-client');
  const waClient = new WhatsAppApiClient();
  await waClient.sendTemplateMessage(
    `91${input.phone}`,
    'exhibition_thankyou',
    'en',
    [] // template parameters if needed
  );
} catch (waError) {
  // Don't fail the capture if WhatsApp fails
  console.warn('[expo-capture] WhatsApp welcome failed:', waError);
}
```

---

## Part C: Production Database Verification

### Tables that must exist on production

**Already exist (synced from production → staging):**
- All 16 expo/event tables
- All `admission_leads` columns (expo_event_id, referral fields)

**May need creating on production:**
- `expo_lead_capture_links` (new table — created on staging only)
- All `wa_*` tables (if WhatsApp code is merged to production)

**Check with:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('expo_lead_capture_links', 'wa_phone_numbers', 'wa_conversations', 'wa_messages')
ORDER BY table_name;
```
