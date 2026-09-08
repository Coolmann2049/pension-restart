import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config, configurationStatus, productionWarnings } from "./src/config.js";
import { findCaseByIdentity, hasSupportAccess, hydrateCase, listCaseRecords, listSupportedCases, purgeExpiredCases } from "./src/db.js";
import { connectConversationByCode, connectSupporterByCode, createOrResumeCase, submitAnswer } from "./src/case-service.js";
import { isAdmin, loginAdmin, logoutAdmin, requireAdmin } from "./src/admin-auth.js";
import { subscribe, publish } from "./src/realtime.js";
import { handleVapiWebhook } from "./src/vapi.js";
import { processWhatsAppPayload, verifyWhatsAppSignature, whatsappVerification } from "./src/whatsapp.js";
import { parseCookies } from "./src/util.js";
import { nextQuestion } from "./src/questions.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=(), usb=()");
  response.setHeader("X-Frame-Options", "DENY");
  next();
});

app.use(express.json({
  limit: "512kb",
  verify(request, _response, buffer) { request.rawBody = Buffer.from(buffer); },
}));

function browserIdentity(request, response) {
  let value = parseCookies(request.headers.cookie || "").pr_browser;
  if (!value || !/^browser_[a-f0-9]{32}$/.test(value)) {
    value = `browser_${crypto.randomBytes(16).toString("hex")}`;
    response.setHeader("Set-Cookie", `pr_browser=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${config.nodeEnv === "production" ? "; Secure" : ""}`);
  }
  return value;
}

function requireOwnedBrowserCase(request, response, next) {
  const identityKey = browserIdentity(request, response);
  const owned = findCaseByIdentity("web", identityKey);
  const ownsRequested = owned && (owned.id === request.params.caseId || owned.publicCode === request.params.caseId);
  if (!ownsRequested && !hasSupportAccess(identityKey, request.params.caseId)) {
    return response.status(404).json({ error: "Case not found for this browser" });
  }
  request.ownedCase = ownsRequested ? owned : null;
  return next();
}

function clientCase(record, upcoming = nextQuestion(record.facts)) {
  const currentFacts = Object.fromEntries(
    Object.entries(record.facts || {}).map(([field, fact]) => [field, fact.value]),
  );
  return {
    caseId: record.id,
    publicCode: record.publicCode,
    displayCode: record.displayCode,
    status: record.status,
    completeness: record.completeness,
    caseVersion: record.version,
    complete: record.status === "guidance_prepared",
    updatedAt: record.updatedAt,
    currentFacts,
    resolution: record.resolution,
    nextQuestion: upcoming && { id: upcoming.id, en: upcoming.en, hi: upcoming.hi },
  };
}

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "pension-restart", version: "0.2.0", providers: configurationStatus(), warnings: productionWarnings() });
});

app.get("/api/config", (_request, response) => {
  response.json({
    vapiPublicKey: config.vapi.publicKey,
    vapiAssistantId: config.vapi.assistantId,
    phoneNumber: config.vapi.phoneNumberDisplay,
    whatsappNumber: config.whatsapp.displayNumber,
    providers: configurationStatus(),
  });
});

app.post("/api/cases", (request, response) => {
  const identityKey = browserIdentity(request, response);
  const result = createOrResumeCase({
    channel: "web", identityKey,
    externalConversationId: request.body?.conversationId || `web:${identityKey}`,
    language: request.body?.language || "",
  });
  response.status(result.resumed ? 200 : 201).json({ ...clientCase(result.case, result.nextQuestion), resumed: result.resumed });
});

app.post("/api/cases/claim", (request, response, next) => {
  try {
    const identityKey = browserIdentity(request, response);
    const current = createOrResumeCase({ channel: "web", identityKey, externalConversationId: `web:${identityKey}` });
    const result = connectConversationByCode({
      publicCode: request.body?.publicCode, channel: "web", identityKey, conversationId: current.conversation.id,
      accessSubject: `${identityKey}:${request.ip}`,
    });
    response.json(clientCase(result.case, result.nextQuestion));
  } catch (error) { next(error); }
});

app.post("/api/cases/:caseId/answers", requireOwnedBrowserCase, async (request, response, next) => {
  try {
    const result = await submitAnswer({
      caseId: request.params.caseId,
      conversationId: request.body?.conversationId || null,
      questionId: request.body?.questionId,
      questionText: request.body?.questionText,
      rawAnswer: request.body?.rawAnswer,
      expectedVersion: request.body?.caseVersion,
      confirmed: Boolean(request.body?.confirmed),
      correction: Boolean(request.body?.correction),
      correctionField: request.body?.correctionField || "",
      source: "web",
    });
    response.json(result);
  } catch (error) { next(error); }
});

app.get("/api/cases/:caseId", requireOwnedBrowserCase, (request, response) => {
  const record = hydrateCase(request.params.caseId);
  if (!record) return response.status(404).json({ error: "Case not found" });
  return response.json(clientCase(record));
});

app.get("/api/family/cases", (request, response) => {
  const identityKey = browserIdentity(request, response);
  const cases = listSupportedCases(identityKey).map(record => clientCase(hydrateCase(record.id)));
  response.json({ private: true, cases });
});

app.post("/api/family/cases", (request, response, next) => {
  try {
    const identityKey = browserIdentity(request, response);
    const result = connectSupporterByCode({
      publicCode: request.body?.publicCode,
      supporterIdentityKey: identityKey,
      relationship: request.body?.relationship || "family",
      consentConfirmed: request.body?.consentConfirmed === true,
      accessSubject: `${identityKey}:${request.ip}`,
    });
    response.status(201).json({ case: clientCase(result.case, result.nextQuestion) });
  } catch (error) { next(error); }
});

app.post("/webhooks/vapi", handleVapiWebhook);
app.get("/webhooks/whatsapp", whatsappVerification);
app.post("/webhooks/whatsapp", (request, response) => {
  if (!verifyWhatsAppSignature(request)) return response.status(401).json({ error: "Invalid WhatsApp signature" });
  response.status(200).send("EVENT_RECEIVED");
  processWhatsAppPayload(request.body).catch(error => publish("integration.error", { provider: "whatsapp", message: error.message }));
});

app.post("/api/admin/login", loginAdmin);
app.post("/api/admin/logout", logoutAdmin);
app.get("/api/admin/me", (request, response) => response.json({ authenticated: isAdmin(request), username: isAdmin(request) ? config.adminUsername : null }));
app.get("/api/admin/cases", requireAdmin, (_request, response) => {
  response.json(listCaseRecords(100).map(record => hydrateCase(record.id)));
});
app.get("/api/admin/cases/:caseId", requireAdmin, (request, response) => {
  const record = hydrateCase(request.params.caseId);
  return record ? response.json(record) : response.status(404).json({ error: "Case not found" });
});
app.get("/api/admin/events", requireAdmin, (_request, response) => subscribe(response));

app.get("/admin", (_request, response) => response.sendFile(path.join(root, "admin.html")));
app.get("/project/architecture.pdf", (_request, response) => {
  response.sendFile(path.join(root, "output", "pdf", "pension-restart-architecture.pdf"));
});
app.use(express.static(root, {
  extensions: ["html"],
  setHeaders(response, file) {
    if (file.endsWith(".html") || file.endsWith(".js") || file.endsWith(".css")) response.setHeader("Cache-Control", "no-cache");
  },
}));

app.use((error, _request, response, _next) => {
  const status = error.statusCode || 500;
  if (status >= 500) console.error(error);
  response.status(status).json({ error: error.message || "Unexpected server error", currentCase: error.currentCase || undefined });
});

const retentionTimer = setInterval(() => purgeExpiredCases(), 86_400_000);
retentionTimer.unref();
purgeExpiredCases();

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Pension Restart listening on http://127.0.0.1:${config.port}`);
  const warnings = productionWarnings();
  if (warnings.length) console.warn(`Configuration warnings: ${warnings.join("; ")}`);
});
