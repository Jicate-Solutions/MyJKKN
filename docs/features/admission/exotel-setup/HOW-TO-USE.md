# Exotel Setup Handoff — For Omm (Project Owner)

## What This Handoff Is

A complete package for your developer to set up Exotel telephony and SMS on production MyJKKN. All code is already built and tested — they just need to merge, configure, and test.

## How to Use This Handoff

### Step 1: Share with Developer

Send the developer these files (all in `specs/exotel-setup/`):

1. `00-HANDOFF-INDEX.md` — Where to start
2. `01-ARCHITECTURE.md` — How it works
3. `03-DATABASE-SCHEMAS.md` — SQL to run
4. `04-MIGRATION-GUIDE.md` — Step-by-step instructions

Plus the master spec: `specs/exotel-setup-spec.md`

### Step 2: Get Exotel Credentials

Before the developer can set up, you need these from your Exotel account:

| What | Where to Find |
|------|--------------|
| API Key | Exotel Dashboard → Settings → API |
| API Token | Exotel Dashboard → Settings → API |
| Account SID | Exotel Dashboard → Settings → API |
| ExoPhone Number | Exotel Dashboard → ExoPhones |
| DLT Entity ID | From your TRAI DLT registration |

**Share these securely** (not via email/chat — use a password manager or Vercel env vars directly).

### Step 3: What to Tell the Developer

Copy-paste this to your developer:

---

**Subject: Exotel Integration Setup for Production MyJKKN**

Hi,

The Exotel telephony + SMS integration is ready on `omm-dev` branch. Please set it up on production:

1. Read `specs/exotel-setup/00-HANDOFF-INDEX.md` for the quick start
2. Follow `specs/exotel-setup/04-MIGRATION-GUIDE.md` step by step
3. The Exotel credentials are: [share securely]
4. Production URL for webhooks: `https://[PRODUCTION-URL]`

**What the code does:**
- Click-to-call: Counselors can call leads directly from CRM
- SMS: Send SMS via Exotel (replaces MSG91/Twilio as default)
- Webhooks: Auto-updates call status, duration, recording
- Cost tracking: Logs per-call cost for billing reports

**Database changes needed:**
- Add `'exotel'` to `sms_provider` enum
- Create `communication_cost_log` table (SQL provided)

**Estimated time:** ~1.5 hours

---

### Step 4: Verify After Setup

Ask the developer to confirm:
- [ ] Can make a test call from CRM
- [ ] Call recording appears in call log
- [ ] Can send a test SMS
- [ ] Webhook health checks return "active"
- [ ] Cost appears in communication_cost_log

## What's NOT Included (Future Work)

| Feature | Status |
|---------|--------|
| Voice campaigns (bulk calling) | DB tables exist, service is stub |
| AI Voice Agents | DB tables exist, no service logic |
| Exotel MCP (Claude integration) | Available but separate setup |
