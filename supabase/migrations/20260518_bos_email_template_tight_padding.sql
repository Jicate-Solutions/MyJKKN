-- ─────────────────────────────────────────────────────────────────────────────
-- BoS meeting_invitation template — tighten container padding.
-- ─────────────────────────────────────────────────────────────────────────────
-- Follows 20260518_bos_email_template_signoff.sql. After alignment + signature
-- landed, the chairman flagged a remaining gap: in Gmail's web view the body
-- content was offset ~48px from the left of the message area (32px of our
-- container's horizontal padding + Gmail's own ~16px wrapper). The user wants
-- the body flush with the sender header above it.
--
-- Fix: drop horizontal padding to 0, keep a small vertical padding (8px) just
-- so "Dear …" doesn't slam into the sender header. The institution name in
-- the signature is still indented visually by being bold + the address lines
-- being shorter — no horizontal padding is needed for visual hierarchy.
--
-- Touches only the system-default row (institutions_id IS NULL).

UPDATE bos_email_templates
SET body_html = $body$<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Times New Roman', serif; color: #333; margin: 0; padding: 0; }
    .container {
      max-width: 800px;
      margin: 0;
      padding: 8px 0;
      line-height: 1.65;
      font-size: 15px;
      text-align: left;
    }
    p { margin: 0 0 14px 0; }
    a { color: #0b5394; }
    .signoff { margin-top: 28px; text-align: left; }
    .signoff p { margin: 0; line-height: 1.55; }
    .signoff .institution { font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <p>Dear {{member_name}},</p>

    <p>Greetings from <strong>{{institution_name}}</strong>.</p>

    <p>Please find attached the Board of Studies meeting notice for your reference.</p>

    <p>If you are not in a position to accept this offer, please inform us through mail at
       <a href="mailto:bosarts@jkkn.ac.in">bosarts@jkkn.ac.in</a> immediately.</p>

    <div class="signoff">
      <p>Warm Regards,</p>
      <p>{{signoff_name}},</p>
      <p class="institution">{{signoff_institution}},</p>
      <p>{{signoff_address}},</p>
      <p>Email: <a href="mailto:{{signoff_email}}">{{signoff_email}}</a>,</p>
      <p>Contact: {{signoff_contact}}.</p>
    </div>
  </div>
</body>
</html>
$body$,
    updated_at = NOW()
WHERE template_code = 'meeting_invitation'
  AND institutions_id IS NULL
  AND is_active = true;
