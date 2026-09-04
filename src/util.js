import crypto from "node:crypto";

export function id(prefix = "id") {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function now() {
  return new Date().toISOString();
}

export function normalizePhone(value = "") {
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export function safeJson(value, fallback = null) {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

export function timingSafeEqualText(left = "", right = "") {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function publicCaseCode(secret) {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const entropy = crypto.randomBytes(7);
  let body = "";
  for (let i = 0; i < 8; i += 1) body += alphabet[entropy[i % entropy.length] % alphabet.length];
  const checksum = crypto.createHmac("sha256", secret).update(body).digest("hex").slice(0, 2).toUpperCase();
  return `PR-${body.slice(0, 4)}-${body.slice(4)}${checksum}`;
}

export function redactPhone(phone = "") {
  if (phone.length < 6) return phone ? "••••" : "Unknown";
  return `${phone.slice(0, 3)}••••${phone.slice(-3)}`;
}

export function redactSensitiveText(value = "") {
  return String(value)
    .slice(0, 2000)
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, "[PAN REDACTED]")
    .replace(/\b(?:\d[ -]?){11}\d\b/g, "[AADHAAR REDACTED]")
    .replace(/\b(?:\d[ -]?){15}\d\b/g, "[CARD REDACTED]")
    .replace(/\b(otp|pin|cvv|password|passcode|account(?:\s+number)?|a\/c)\b\s*(?:is|number|no\.?|:|-)?\s*[A-Z0-9@._-]{3,}/gi, "$1 [REDACTED]")
    .trim();
}

export function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf("=");
    return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
  }));
}
