-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: BoS meeting_invitation template body — left-align the letter.
-- ─────────────────────────────────────────────────────────────────────────────
-- Reason: the 20260516 seed used `max-width: 800px` + `margin: 0 auto` which
-- Gmail renders as a centered card inside its wider viewport. Recipients see
-- all the text shifted ~200px in from the message's left edge and read it as
-- "right-aligned". The letter style we want here is flush-left (like a Word
-- document), not a centered marketing card.
--
-- We also drop `text-align: justify` — it creates uneven word spacing that
-- worsens readability in narrow paragraphs, and a formal invitation letter
-- reads better with natural left-aligned ragged-right text.
--
-- This UPDATE only touches the system-default row (institutions_id IS NULL)
-- so per-institution overrides remain untouched.

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
      <p>
        Warm Regards,<br/>
        Principal<br/>
        {{institution_name}}
      </p>
    </div>
  </div>
</body>
</html>
$body$,
    updated_at = NOW()
WHERE template_code = 'meeting_invitation'
  AND institutions_id IS NULL
  AND is_active = true;
