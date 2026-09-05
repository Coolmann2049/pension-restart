import fs from "node:fs";
import path from "node:path";

function loadDotEnv(file = path.resolve(".env")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const integer = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  port: integer(process.env.PORT, 3000),
  appBaseUrl: (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
  databasePath: path.resolve(process.env.DATABASE_PATH || "./data/pension-restart.db"),
  sessionSecret: process.env.SESSION_SECRET || "development-session-secret-change-before-deploying",
  caseCodeSecret: process.env.CASE_CODE_SECRET || "development-case-code-secret-change-before-deploying",
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
  dataRetentionDays: integer(process.env.DATA_RETENTION_DAYS, 30),
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
  },
  vapi: {
    privateKey: process.env.VAPI_PRIVATE_API_KEY || "",
    publicKey: process.env.VAPI_PUBLIC_API_KEY || "",
    assistantId: process.env.VAPI_ASSISTANT_ID || "",
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || "",
    phoneNumberDisplay: process.env.VAPI_PHONE_NUMBER_DISPLAY || "",
    serverCredentialId: process.env.VAPI_SERVER_CREDENTIAL_ID || "",
    webhookSecret: process.env.VAPI_WEBHOOK_SECRET || "",
  },
  whatsapp: {
    appSecret: process.env.META_APP_SECRET || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
    apiVersion: process.env.WHATSAPP_API_VERSION || "v23.0",
    displayNumber: process.env.WHATSAPP_DISPLAY_NUMBER || "",
    accessTemplateName: process.env.WHATSAPP_ACCESS_TEMPLATE_NAME || process.env.WHATSAPP_STATUS_TEMPLATE_NAME || "",
    accessTemplateLanguage: process.env.WHATSAPP_ACCESS_TEMPLATE_LANGUAGE || process.env.WHATSAPP_STATUS_TEMPLATE_LANGUAGE || "en",
    accessTemplateAction: process.env.WHATSAPP_ACCESS_TEMPLATE_ACTION || "accessing",
    accessTemplateAccount: process.env.WHATSAPP_ACCESS_TEMPLATE_ACCOUNT || "Pension Restart",
    accessTemplateLinkTarget: process.env.WHATSAPP_ACCESS_TEMPLATE_LINK_TARGET || "your pension guidance case",
  },
});

export function configurationStatus() {
  return {
    environment: config.nodeEnv,
    interpretation: config.openai.apiKey ? "openai" : "local-fallback",
    vapi: Boolean(config.vapi.privateKey && config.vapi.assistantId),
    vapiWebCall: Boolean(config.vapi.publicKey && config.vapi.assistantId),
    vapiPhone: Boolean(config.vapi.phoneNumberDisplay),
    whatsapp: Boolean(config.whatsapp.accessToken && config.whatsapp.phoneNumberId),
    whatsappAccessTemplate: Boolean(config.whatsapp.accessTemplateName),
    adminAuth: Boolean(config.adminPasswordHash),
  };
}

export function productionWarnings() {
  if (config.nodeEnv !== "production") return [];
  const warnings = [];
  if (config.sessionSecret.startsWith("development-")) warnings.push("SESSION_SECRET uses the development default");
  if (config.caseCodeSecret.startsWith("development-")) warnings.push("CASE_CODE_SECRET uses the development default");
  if (!config.adminPasswordHash) warnings.push("ADMIN_PASSWORD_HASH is not configured");
  if (!config.vapi.webhookSecret) warnings.push("VAPI_WEBHOOK_SECRET is not configured");
  if (config.whatsapp.accessToken && !config.whatsapp.appSecret) warnings.push("META_APP_SECRET is required to verify WhatsApp webhook signatures");
  if (config.whatsapp.accessToken && !config.whatsapp.verifyToken) warnings.push("WHATSAPP_VERIFY_TOKEN is not configured");
  if (config.whatsapp.accessToken && !config.whatsapp.phoneNumberId) warnings.push("WHATSAPP_PHONE_NUMBER_ID is not configured");
  return warnings;
}
