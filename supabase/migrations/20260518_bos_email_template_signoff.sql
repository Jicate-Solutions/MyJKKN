-- ─────────────────────────────────────────────────────────────────────────────
-- BoS meeting_invitation template — add rich sign-off block.
-- ─────────────────────────────────────────────────────────────────────────────
-- Follows 20260518_bos_email_template_left_align.sql. That migration handled
-- the alignment fix (flush-left, no centered container). This one rewrites the
-- signature to match the format used by the COE app's appointment-letter email
-- (reference image submitted 2026-05-18):
--
--     Warm Regards,
--     <signoff_name>,                       (e.g. Dr.NAME, Qualifications, Designation)
--     <signoff_institution>,                (bold)
--     <signoff_address>,
--     Email: <signoff_email>,
--     Contact: <signoff_contact>.
--
-- The new {{signoff_*}} placeholders are populated at send time from
-- getInstitutionHeader(name).officials, so the same template body works for
-- every institution — no per-institution row needed unless an admin wants to
-- override.
--
-- Touches only the system-default row (institutions_id IS NULL). Per-
-- institution overrides keep their custom body_html intact.

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
      padding: 24px 32px;
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
