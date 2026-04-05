# Exotel Passthru Setup — Instructions for Ranjith

## What We Need

Add a **Passthru** applet to the IVR flows so that MyJKKN captures every step of the caller's journey — which option they pressed, which department they reached, and what happened at each step.

## What is Passthru?

Passthru sends a webhook (HTTP POST) to our server at each point in the call flow. It passes the call data (caller number, keypress, flow step) to MyJKKN, then continues the call normally. **The caller doesn't notice anything** — it's invisible to them.

## Step 1: Modify 1-JKKN-COLLEGES (App 642984)

1. Go to: https://my.exotel.com/jkkn1/flows/edit/642984
2. This is the live COLLEGES flow on ExoPhone 04446313503

## Step 2: Add Passthru BEFORE the IVR Menu

In the flow editor:

```
BEFORE (current):
  Call Start → IVR Menu → [branches]

AFTER (with Passthru):
  Call Start → Passthru → IVR Menu → [branches]
```

### How to add:
1. In the flow, click on "Call Start"
2. Remove the connection to "IVR Menu" (click the minus icon)
3. Drag **Passthru** from the right panel into the Call Start box
4. Configure the Passthru:
   - **URL**: `https://www.jkkn.ai/api/webhooks/telephony/passthru`
   - **Method**: POST
   - **Next applet (on success)**: Connect to the IVR Menu
   - **Next applet (on failure)**: Connect to the IVR Menu (so calls still work even if webhook fails)
5. Click SAVE

## Step 3: Add Passthru AFTER Each IVR Branch (Optional — Phase 2)

For full journey tracking, add Passthru after each IVR option:

```
IVR Menu
  Press 1 (Pharmacy) → Passthru (URL with ?dept=pharmacy) → Connect to Pharmacy agents
  Press 2 (Nursing)  → Passthru (URL with ?dept=nursing)  → Connect to Nursing agents
  Press 3 (Dental)   → Passthru (URL with ?dept=dental)   → Connect to Dental agents
  ...
```

Each Passthru URL can include the department as a query parameter:
- `https://www.jkkn.ai/api/webhooks/telephony/passthru?dept=pharmacy&press=1`
- `https://www.jkkn.ai/api/webhooks/telephony/passthru?dept=nursing&press=2`
- `https://www.jkkn.ai/api/webhooks/telephony/passthru?dept=dental&press=3`

## Step 4: Test

1. Connect the test app (0-JKKN-COLLEGES) to a test ExoPhone (04446310202 — currently unused)
2. Call the test ExoPhone
3. Navigate through the IVR (press options)
4. Check: does MyJKKN receive the webhook?

## What the Passthru Sends

Exotel sends a POST with these fields:
- `CallSid` — unique call identifier
- `From` — caller's phone number
- `To` — ExoPhone number
- `digits` — what the caller pressed (DTMF input)
- `Direction` — inbound
- `flow_id` — which flow is handling the call
- Custom query params we added (dept, press)

## Webhook URL

```
https://www.jkkn.ai/api/webhooks/telephony/passthru
```

This endpoint needs to:
1. Return a valid ExoML response (so the call continues)
2. Log the passthru data to MyJKKN
3. Respond within 2 seconds (or Exotel times out)

## Safety

- Test with `0-JKKN-COLLEGES` (960403) first
- NEVER modify `1-JKKN-COLLEGES` (642984) until the test works
- Always set "on failure → continue to next applet" so calls don't break
- The Passthru is invisible to callers — they hear nothing different

## Contact

If the webhook URL isn't working, contact Omm. The endpoint will be created on MyJKKN side before testing.
