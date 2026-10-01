/** Confirmation sent to an external candidate after a website application. Pure. */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildApplicationConfirmationEmail(d: {
  firstName: string; jobTitle: string; institutionName: string | null; reference: string;
}): { subject: string; html: string; text: string } {
  const where = d.institutionName ? ` at ${d.institutionName}` : '';
  const subject = `Application received: ${d.jobTitle}${where}`;
  const text = [
    `Dear ${d.firstName},`,
    '',
    `Thank you for applying for ${d.jobTitle}${where}.`,
    `Your application reference is ${d.reference}.`,
    '',
    'Our HR team will review your application and contact you if you are shortlisted.',
    '',
    'JKKN Institutions — HR',
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">
<p>Dear ${esc(d.firstName)},</p>
<p>Thank you for applying for <strong>${esc(d.jobTitle)}</strong>${esc(where)}.</p>
<p>Your application reference is <strong>${esc(d.reference)}</strong>.</p>
<p>Our HR team will review your application and contact you if you are shortlisted.</p>
<p>JKKN Institutions — HR</p>
</body></html>`;
  return { subject, html, text };
}
