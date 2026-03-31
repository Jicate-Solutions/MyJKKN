# How to Use This Handoff — For Omm

## What to Tell Boobalan

> "I have a handoff package for two modules — Expo Lead Capture and WhatsApp go-live.
> The code is already built on omm-dev. You need to:
> 1. Merge the expo capture code to main (18 new files, zero conflicts expected)
> 2. Configure WhatsApp in Meta Business Manager (register webhook URL)
> 3. Insert the phone number into wa_phone_numbers table
> 4. Send a test message to verify everything works
>
> All specs are in `specs/expo-wa-handoff/` — start with `00-HANDOFF-INDEX.md`."

## What to Send

Share the GitHub repo link. All handoff files are in:
- `specs/expo-wa-handoff/` — 5 handoff documents
- `specs/WHATSAPP-INTEGRATION-SPEC.md` — full WhatsApp spec (combined)

## After Boobalan Merges

### Verify Expo

1. Go to `https://myjkkn.vercel.app/capture/<event-id>` on your phone
2. Fill in a test lead (use your own phone number)
3. Check it appears in Admission → Leads
4. Check the Live Dashboard shows the count

### Verify WhatsApp

1. Ask Boobalan to confirm webhook is registered
2. Send a WhatsApp message to +91 63803 10048
3. Check if it appears in Admission → Chat inbox
4. Have a counselor reply — check if you receive it

## Known Issues to Mention

| Issue | Workaround |
|-------|------------|
| Programs don't load in capture form | Auth session issue in (capture) route group — needs AuthProvider fix or direct Supabase query for programs |
| 0 messages ever sent via WhatsApp | Infrastructure built but never tested against live Meta API |
| DB templates ≠ Meta templates | Need to run template sync after webhook is configured |
| wa_phone_numbers table is EMPTY | Must insert phone number (SQL in migration guide) |

## Future Work (After This Handoff)

- Submit more templates to Meta (billing, academic, etc.)
- Wire expo capture → auto WhatsApp welcome
- Add Echo Bubble floating chat widget
- Add funnel view in chat conversation list
- Add more WABA phone numbers for other institutions
