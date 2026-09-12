# Design for review — letting outside guests answer event feedback

**Status:** DESIGN ONLY. No code exists. Written 2026-09-07 for Director approval
before anything is built (his decision: *"design it, don't build it yet"*).

---

## The problem in one line

1,584 people who registered for JKKN events physically cannot answer any
feedback form, because every access rule requires a JKKN login and they have
none.

| Event | Registered | Cannot answer |
|---|---|---|
| Kumarapalayam Bypass Marathon | 1,600 | **1,559 (97%)** |
| Business Analytics workshop | 181 | 15 |
| School of Influencer | 76 | 2 |
| SEMINAR – Logistics | 45 | 7 |

Verified 2026-09-07: acting as role `anon`, PostgreSQL answers
*permission denied for table event_feedback_forms* — outsiders cannot see that
a form exists, let alone answer it.

## This is a gap, not a decision

The schema was designed for them. Its own header says a response keys on the
registration **"NOT on a profile"** precisely because
`participant_type='external'` rows "have no auth.users account at all", and
`profile_id` is documented as *"NULL for an external participant answering
through their registration link"*.

**That registration link was never built.** `app/p/event/[id]/` contains only
`register`. So the intent is already settled and recorded; what is missing is
the door.

## What cannot be reused

The obvious candidate is the registration QR — `events_registrations` carries
`qr_code_url` and `qr_generated_at`. It is **empty for every external
registrant on every live event** (0 of 1,559 marathon, 0 of 7 seminar). There
is no existing token to hang this on. Something new has to be issued.

## Are they reachable at all?

Yes, and this is the one part that needs no work:

| | Have it |
|---|---|
| Phone number | 1,584 of 1,584 (**100%**) |
| Email address | 1,571 of 1,584 (99.2%) |

## Proposed shape

A **one-time link**, sent by SMS or email when the form opens.

```
https://www.jkkn.ai/p/event/<event-id>/feedback?t=<token>
```

**A new table** holds the tokens — never the link itself:

| column | why |
|---|---|
| `token_hash` | SHA-256 of the token. The plaintext exists only in the message that was sent; a database leak yields nothing usable. |
| `registration_id` | who this link answers as — the identity, exactly as the schema intends |
| `form_id` | which single form it opens |
| `expires_at` | set to the form's `ends_at`; a link outlives nothing |
| `used_at` | stamped on submit |
| `sent_to` | the phone/email it went to, for support ("I never got it") |

**One SECURITY DEFINER function** is the entire gate —
`fn_redeem_event_feedback_token(p_token text)` — which returns the
`(form_id, registration_id)` pair for a token that is unexpired, unused, and
belongs to an open form, and NULL otherwise.

**Critically: no blanket `anon` grant on any table.** `anon` keeps zero direct
access to `event_feedback_forms`, `event_feedback_questions` and
`event_feedback_responses`, exactly as today. The public page reads and writes
only through that one function. This is the difference between "outsiders can
answer their own survey" and "outsiders can read the events database", and the
whole design rests on it.

## The decisions this needs from you

**1. Single-use, or reusable until the form closes?**
Single-use is safer (a forwarded link is already spent) but a dropped
connection mid-form loses the person's answers. Reusable-until-close is kinder
and lets someone finish later. *Recommendation: reusable until the form closes,
because a lost answer is a real cost and a shared link's worst case is one
wrong rating.*

**2. What happens if the link is shared?**
Whoever holds it answers as that registration. Mitigations: it opens exactly
one form, shows no personal data, and cannot read anything else. The realistic
harm is one dishonest rating, not a data breach. *No further mitigation
proposed — anything stronger (an OTP) costs more honesty than it buys.*

**3. SMS, email, or both?**
Everyone has a phone; 99.2% have email. SMS reaches everyone and costs money
per message (Exotel is already wired). Email is free and misses 13 people.
*Recommendation: email where present, SMS for the remainder.*

**4. Does this apply to the marathon's 1,559?**
Sending 1,559 messages is a visible, outward-facing act. It should be its own
explicit approval, separate from approving this design. *Recommendation: prove
it on the seminar's 7 first.*

**5. Who may issue these links?**
Suggested: whoever can already manage the event's feedback
(`fn_can_manage_event_feedback`) — no new permission concept. Note the seminar
had **nobody** in charge until this session, so in practice this means admins
until in-charges are routinely appointed.

## What this does NOT change

- Internal learners keep answering exactly as they do now, signed in.
- No existing policy is loosened. The change is additive.
- The attendance gate (see migration `20260907160000`) applies to both paths:
  if attendance was taken, an outside guest who was not checked in cannot
  answer either.

## Cost if approved

One table, one function, one public page, one send action. The public route
family (`app/p/event/[id]/register`) already exists and can be followed rather
than invented.

---

*Nothing here is built. Approve, amend, or reject the five decisions above and
the build can follow the shape already agreed.*
