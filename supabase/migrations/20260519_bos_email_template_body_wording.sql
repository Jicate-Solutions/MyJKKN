-- ─────────────────────────────────────────────────────────────────────────────
-- BoS meeting_invitation template — body wording + reply-to + contact line.
-- ─────────────────────────────────────────────────────────────────────────────
-- Follows 20260518_bos_email_template_tight_padding.sql. After the alignment
-- and signature work landed, the chairman reviewed a rendered notice for
-- meeting 73247d26-7064-4a65-8eef-47d6e91f8112 (JKKN Arts) and requested three
-- copy edits:
--
--   1. "Please find attached" → "Kindly find the attached"
--   2. Reply-to address bosarts@jkkn.ac.in → artsbos@jkkn.ac.in
--      (matches the inbox the BoS office actually monitors)
--   3. Contact line replaces the phone-number placeholder with the literal
--      phrase "Concerned Board Chairman". Reason: each meeting has a
--      different chairman, and routing replies to a generic cell number
--      added confusion. The phrase tells the recipient who to contact
--      without committing to a specific phone line.
--
-- The {{signoff_contact}} placeholder is unused by this template after this
-- change. We leave the TS-side wiring (lib/utils/internal-marks/institution-
-- header.ts → officials.contact_cell) in place because other templates and
-- the call-letter PDF still consume it.
--
-- Touches only the system-default row (institutions_id IS NULL AND is_active).
-- Per-institution overrides keep their custom body_html intact.

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

    <p>Kindly find the attached Board of Studies meeting notice for your reference.</p>

    <p>If you are not in a position to accept this offer, please inform us through mail at
       <a href="mailto:artsbos@jkkn.ac.in">artsbos@jkkn.ac.in</a> immediately.</p>

    <div class="signoff">
      <p>Warm Regards,</p>
      <p>{{signoff_name}},</p>
      <p class="institution">{{signoff_institution}},</p>
      <p>{{signoff_address}},</p>
      <p>Email: <a href="mailto:{{signoff_email}}">{{signoff_email}}</a>,</p>
      <p>Contact: Concerned Board Chairman</p>
    </div>
  </div>
</body>
</html>
$body$,
    updated_at = NOW()
WHERE template_code = 'meeting_invitation'
  AND institutions_id IS NULL
  AND is_active = true;
