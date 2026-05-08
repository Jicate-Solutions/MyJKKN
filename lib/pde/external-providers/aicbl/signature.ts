import crypto from "crypto";

export function verifySignature(
  payload: unknown,
  signatureHex: string | null,
  secret: string
): boolean {
  if (!signatureHex) return false;

  // Canonical JSON: sort keys alphabetically so sender and receiver agree
  const canonical = JSON.stringify(
    payload,
    Object.keys(payload as Record<string, unknown>).sort()
  );

  const expected = crypto
    .createHmac("sha256", secret)
    .update(canonical)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signatureHex, "hex")
    );
  } catch {
    // Buffer lengths differ (malformed hex) → signature is invalid
    return false;
  }
}
