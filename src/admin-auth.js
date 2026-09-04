import crypto from "node:crypto";
import { config } from "./config.js";
import { parseCookies, timingSafeEqualText } from "./util.js";

const COOKIE = "pr_admin";
const attempts = new Map();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function signature(value) {
  return crypto.createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
}

function token() {
  const payload = Buffer.from(JSON.stringify({ user: config.adminUsername, exp: Date.now() + 12 * 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function verifyPassword(password) {
  if (!config.adminPasswordHash) return config.nodeEnv !== "production" && password === "admin";
  const [algorithm, salt, expected] = config.adminPasswordHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqualText(actual, expected);
}

export function loginAdmin(request, response) {
  const { username = "", password = "" } = request.body || {};
  const key = request.ip || request.socket?.remoteAddress || "unknown";
  const current = attempts.get(key);
  const entry = !current || current.resetAt < Date.now() ? { count: 0, resetAt: Date.now() + ATTEMPT_WINDOW_MS } : current;
  if (entry.count >= MAX_ATTEMPTS) {
    response.setHeader("Retry-After", String(Math.ceil((entry.resetAt - Date.now()) / 1000)));
    return response.status(429).json({ error: "Too many sign-in attempts. Try again later." });
  }
  if (!timingSafeEqualText(username, config.adminUsername) || !verifyPassword(password)) {
    entry.count += 1;
    attempts.set(key, entry);
    return response.status(401).json({ error: "Invalid username or password" });
  }
  attempts.delete(key);
  response.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token())}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${config.nodeEnv === "production" ? "; Secure" : ""}`);
  return response.json({ authenticated: true, username: config.adminUsername });
}

export function logoutAdmin(_request, response) {
  response.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${config.nodeEnv === "production" ? "; Secure" : ""}`);
  return response.json({ authenticated: false });
}

export function isAdmin(request) {
  const value = parseCookies(request.headers.cookie || "")[COOKIE];
  if (!value) return false;
  const [payload, providedSignature] = value.split(".");
  if (!payload || !providedSignature || !timingSafeEqualText(providedSignature, signature(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.user === config.adminUsername && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function requireAdmin(request, response, next) {
  if (!isAdmin(request)) return response.status(401).json({ error: "Admin authentication required" });
  return next();
}
