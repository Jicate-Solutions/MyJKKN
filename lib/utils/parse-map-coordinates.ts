/**
 * Reads a latitude/longitude out of text pasted from Google Maps: a full map
 * link, the "11.4445, 77.1234" a right-click copies, or degrees-minutes-seconds
 * ("11°26'40.2"N 77°7'30.5"E"). Pure — no network, so a short link
 * (maps.app.goo.gl, goo.gl/maps) cannot be followed and is reported as such.
 */

export type ParsedCoordinates = { lat: number; lng: number };
export type ParseResult =
  | { ok: true; value: ParsedCoordinates }
  | { ok: false; reason: 'empty' | 'short_link' | 'not_found' };

const NUM = '-?\\d{1,3}(?:\\.\\d+)?';

const inRange = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const ok = (lat: number, lng: number): ParseResult =>
  inRange(lat, lng) ? { ok: true, value: { lat, lng } } : { ok: false, reason: 'not_found' };

function dmsToDecimal(deg: string, min: string | undefined, sec: string | undefined, hemi: string) {
  const v = Number(deg) + Number(min ?? 0) / 60 + Number(sec ?? 0) / 3600;
  return /[SW]/i.test(hemi) ? -v : v;
}

export function parseMapCoordinates(input: string): ParseResult {
  const text = input.trim();
  if (!text) return { ok: false, reason: 'empty' };

  if (/(?:maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(text)) {
    return { ok: false, reason: 'short_link' };
  }

  // Decode once so %2C-separated query strings (?q=11.4%2C77.1) read like plain text.
  let decoded = text;
  try { decoded = decodeURIComponent(text); } catch { /* keep the raw text */ }

  // Google's own pin: !3d<lat>!4d<lng> is the PLACE; @lat,lng is only the map centre,
  // so the pin wins when a link carries both.
  const pin = decoded.match(new RegExp(`!3d(${NUM})!4d(${NUM})`));
  if (pin) return ok(Number(pin[1]), Number(pin[2]));

  const at = decoded.match(new RegExp(`@(${NUM}),\\s*(${NUM})`));
  if (at) return ok(Number(at[1]), Number(at[2]));

  const param = decoded.match(new RegExp(`[?&](?:q|ll|query|destination|center)=\\+?(${NUM}),\\s*\\+?(${NUM})`));
  if (param) return ok(Number(param[1]), Number(param[2]));

  // 11°26'40.2"N 77°7'30.5"E (also ′ ″ and spaces instead of symbols).
  const dms = decoded.match(
    /(\d{1,3})\s*°\s*(?:(\d{1,2})\s*['′]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|″|'')\s*)?([NS])[\s,;]*(\d{1,3})\s*°\s*(?:(\d{1,2})\s*['′]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|″|'')\s*)?([EW])/i
  );
  if (dms) {
    return ok(
      dmsToDecimal(dms[1], dms[2], dms[3], dms[4]),
      dmsToDecimal(dms[5], dms[6], dms[7], dms[8])
    );
  }

  // "11.4445, 77.1234" — the whole string, nothing else around it.
  const plain = decoded.match(new RegExp(`^\\(?\\s*(${NUM})\\s*[,;\\s]\\s*(${NUM})\\s*\\)?$`));
  if (plain) return ok(Number(plain[1]), Number(plain[2]));

  return { ok: false, reason: 'not_found' };
}
