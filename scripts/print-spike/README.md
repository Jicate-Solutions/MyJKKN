# Print counter — conversion spike

Answers one question before any of the print-counter module gets built:

**Can we take what a learner uploads, turn it into a print-ready PDF, and count
and price it without a human retyping anything?**

Run `./verify.sh`. It exits non-zero if the answer is no on this machine.

## What it checks

1. **Conversion** — DOCX to PDF via LibreOffice headless.
2. **Font resolution** — every font the source asks for resolves to *itself*.
   This is the check that matters. See below.
3. **Page count** — exact, from the rendered PDF.
4. **Colour split** — per page, via Ghostscript `inkcov`.

## The font trap

Conversion does not fail when a font is missing. LibreOffice silently
substitutes, the job converts, the page count is right, and the text still
extracts as correct Unicode — so every automated check passes while the printed
Tamil is wrong.

Measured on a Tamil fixture requesting `Noto Sans Tamil`:

| Fonts installed | Converts | Pages | Text extracts | Embedded font | Printed result |
|---|---|---|---|---|---|
| none (base image) | yes | 3 ✓ | yes, correct Unicode | `FreeSans`, `DejaVuSans` | wrong — broken clusters, `ஒன்று` split as `ஒன் று` |
| `fonts-noto-core` | yes | 3 ✓ | yes, correct Unicode | `NotoSansTamil-Regular/Bold` | correct |

Both rows look identical to any check that reads text or counts pages. Only the
embedded font name and the pixels tell them apart.

**So the font set is part of the deployment contract, not a nice-to-have.** Any
image that runs this conversion must install the Tamil fonts, and `verify.sh`
must pass in CI against that image — otherwise a base-image bump silently
degrades every Tamil document printed at every counter, with nothing failing.

## Where this can run

LibreOffice is roughly 400 MB installed and cannot run in a Vercel serverless
function. The conversion step therefore belongs in a sidecar container, the same
shape as `whatsapp-service/` in this repo. The analysis and pricing code
(`lib/print/`) is pure and runs anywhere.
