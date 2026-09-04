import crypto from "node:crypto";
import { config } from "./config.js";
import {
  addAudit, addMessage, beginNotification, finishNotification, hydrateCase, recordWebhook, updateCaseProgress,
} from "./db.js";
import { connectConversationByCode, createOrResumeCase, submitAnswer } from "./case-service.js";
import { questionById } from "./questions.js";
import { publish } from "./realtime.js";
import { normalizePhone, redactPhone, redactSensitiveText, timingSafeEqualText } from "./util.js";

const BUTTON_OPTIONS = {
  caller_relation: [["self", "My pension"], ["child", "Parent's pension"], ["helper", "Helping someone"]],
  whatsapp_followup_consent: [["true", "Yes, send it"], ["false", "No, thank you"]],
  issue_type: [["stopped", "Pension stopped"], ["delayed", "Payment delayed"], ["reduced", "Amount reduced"]],
  disbursement_channel: [["bank", "Bank"], ["post_office", "Post office"], ["unknown", "Not sure"]],
  life_certificate_status: [["submitted_accepted", "Submitted"], ["not_submitted", "Not submitted"], ["not_remembered", "Don't remember"]],
  life_certificate_receipt_available: [["true", "Yes"], ["false", "No"]],
  intake_confirmed: [["true", "Yes, correct"], ["false", "Change a detail"]],
};

const LIST_OPTIONS = {
  scheme_family: [
    ["central_civil", "Central government"], ["defence", "Defence / SPARSH"], ["railways", "Railways"],
    ["eps_95", "EPFO / EPS-95"], ["nps_ups_apy", "NPS / UPS / APY"], ["state_government", "State government"],
    ["social_assistance", "Old age / widow / disability"], ["private_annuity", "Insurance annuity"],
    ["employer_superannuation", "Employer pension"], ["unknown", "I am not sure"],
  ],
  life_certificate_method: [
    ["jeevan_pramaan_mobile", "Mobile / face app"], ["biometric_centre", "Biometric centre / CSC"], ["bank", "Bank"],
    ["post_office", "Post office"], ["doorstep", "Doorstep service"], ["paper", "Paper certificate"], ["unknown", "Not sure"],
  ],
  changed_details: [["bank_account", "Bank account"], ["branch", "Bank branch"], ["address", "Address"], ["mobile", "Mobile number"], ["kyc", "KYC"], ["none", "Nothing changed"], ["unknown", "Not sure"]],
};

const CORRECTION_OPTIONS = [
  ["whatsapp_followup_consent", "WhatsApp follow-up"], ["pensioner_name", "Pensioner name"],
  ["issue_type", "What happened"], ["scheme_family", "Pension scheme"], ["disbursement_channel", "Payment channel"],
  ["disbursing_institution", "Paying institution"], ["last_credit_date", "Last payment"],
  ["pension_amount", "Pension amount"], ["life_certificate_status", "Life certificate"], ["changed_details", "Changed details"],
];

export function verifyWhatsAppSignature(request) {
  if (!config.whatsapp.appSecret) return config.nodeEnv !== "production";
  const expected = `sha256=${crypto.createHmac("sha256", config.whatsapp.appSecret).update(request.rawBody || Buffer.from("")).digest("hex")}`;
  return timingSafeEqualText(request.headers["x-hub-signature-256"] || "", expected);
}

async function graphSend(to, body) {
  if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) {
    publish("whatsapp.outbound.preview", { to, body });
    return { preview: true, body };
  }
  const response = await fetch(`https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.whatsapp.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...body }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`WhatsApp returned ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`);
  return payload;
}

export function buildCaseAccessTemplate(record) {
  return {
    type: "template",
    template: {
      name: config.whatsapp.accessTemplateName,
      language: { code: config.whatsapp.accessTemplateLanguage },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: config.whatsapp.accessTemplateAction },
          { type: "text", text: config.whatsapp.accessTemplateAccount },
          { type: "text", text: config.whatsapp.accessTemplateLinkTarget },
          { type: "text", text: record.publicCode },
        ],
      }],
    },
  };
}

export async function sendCaseAccessTemplate({ to, record }) {
  if (record?.facts?.whatsapp_followup_consent?.value !== true) return { skipped: "consent_not_given" };
  if (!config.whatsapp.accessTemplateName || !config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) {
    return { skipped: "template_not_configured" };
  }
  const normalized = normalizePhone(to).replace(/^\+/, "");
  if (!normalized) return { skipped: "missing_recipient" };
  const kind = `case-access-code:${config.whatsapp.accessTemplateName}:${config.whatsapp.accessTemplateLanguage}`;
  if (!beginNotification({ caseId: record.id, channel: "whatsapp", kind, recipientMasked: redactPhone(`+${normalized}`) })) {
    return { skipped: "already_sent" };
  }
  try {
    const result = await graphSend(normalized, buildCaseAccessTemplate(record));
    const providerMessageId = result.messages?.[0]?.id || null;
    finishNotification({ caseId: record.id, channel: "whatsapp", kind, status: "sent", providerMessageId });
    addAudit(record.id, "notification.sent", { channel: "whatsapp", kind, providerMessageId });
    publish("notification.sent", { caseId: record.id, publicCode: record.publicCode, channel: "whatsapp", kind });
    return { sent: true, providerMessageId };
  } catch (error) {
    finishNotification({ caseId: record.id, channel: "whatsapp", kind, status: "failed", error: error.message.slice(0, 500) });
    addAudit(record.id, "notification.failed", { channel: "whatsapp", kind, error: error.message.slice(0, 500) });
    publish("notification.failed", { caseId: record.id, publicCode: record.publicCode, channel: "whatsapp", kind, error: error.message });
    throw error;
  }
}

export const sendCaseFollowupTemplate = sendCaseAccessTemplate;

function questionMessage(question) {
  const buttons = BUTTON_OPTIONS[question.id];
  if (buttons) return {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: `${question.hi}\n\n${question.en}` },
      action: { buttons: buttons.map(([value, title]) => ({ type: "reply", reply: { id: `answer:${question.id}:${value}`, title } })) },
    },
  };
  const list = LIST_OPTIONS[question.id];
  if (list) return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: `${question.hi}\n\n${question.en}` },
      action: { button: "Choose one", sections: [{ title: "Pension guidance", rows: list.map(([value, title]) => ({ id: `answer:${question.id}:${value}`, title })) }] },
    },
  };
  return { type: "text", text: { body: `${question.hi}\n\n${question.en}` } };
}

function inboundMessages(payload) {
  const messages = [];
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    for (const message of change.value?.messages || []) messages.push({ message, metadata: change.value?.metadata, contact: change.value?.contacts?.[0] });
  }
  return messages;
}

function answerFromMessage(message) {
  const interactive = message.interactive?.button_reply || message.interactive?.list_reply;
  if (interactive?.id?.startsWith("correct:")) {
    return { selectCorrection: interactive.id.slice("correct:".length), rawAnswer: redactSensitiveText(interactive.title || "Selected a detail to correct") };
  }
  if (interactive?.id?.startsWith("answer:")) {
    const [, questionId, ...valueParts] = interactive.id.split(":");
    return { questionId, rawAnswer: redactSensitiveText(valueParts.join(":")), confirmed: true };
  }
  const originalAnswer = message.text?.body || message.button?.text || "";
  return { rawAnswer: redactSensitiveText(originalAnswer), originalAnswer: String(originalAnswer) };
}

function suppliedCaseCode(value = "") {
  const trimmed = String(value).trim();
  if (/^\d{6}$/.test(trimmed)) return trimmed;
  return trimmed.match(/PR[-\s][A-Z0-9]{4}[-\s][A-Z0-9]{6}/i)?.[0]?.replaceAll(" ", "-") || "";
}

function correctionMessage() {
  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Which one detail should we correct?\nKaunsi ek jaankari badalni hai?" },
      action: {
        button: "Choose detail",
        sections: [{ title: "Case details", rows: CORRECTION_OPTIONS.map(([field, title]) => ({ id: `correct:${field}`, title })) }],
      },
    },
  };
}

export async function processWhatsAppPayload(payload) {
  for (const { message, contact } of inboundMessages(payload)) {
    if (!recordWebhook("whatsapp", message.id, "message")) continue;
    const waId = message.from;
    const answer = answerFromMessage(message);
    let existing = createOrResumeCase({ channel: "whatsapp", identityKey: waId, externalConversationId: `wa:${waId}` });
    let record = hydrateCase(existing.case.id);
    const suppliedCode = !record.messages.length && !Object.keys(record.facts).length
      ? suppliedCaseCode(answer.originalAnswer || answer.rawAnswer)
      : "";
    let linkedByCode = false;
    let codeError = null;
    if (suppliedCode) {
      try {
        const connected = connectConversationByCode({
          publicCode: suppliedCode, channel: "whatsapp", identityKey: waId,
          conversationId: existing.conversation.id, accessSubject: waId,
        });
        existing = { ...existing, case: connected.case, nextQuestion: connected.nextQuestion };
        linkedByCode = true;
      }
      catch (error) { codeError = error; }
    }
    record = hydrateCase(existing.case.id);
    if (codeError) {
      await graphSend(waId, { type: "text", text: { body: codeError.statusCode === 429
        ? "Too many code attempts. Please wait 15 minutes and try again."
        : "That six-digit Pension Restart code was not recognized. Please check the WhatsApp message and try again." } });
      continue;
    }
    if (linkedByCode) {
      addMessage({ caseId: record.id, conversationId: existing.conversation.id, externalId: message.id, role: "user", content: "Shared Pension Restart case code" });
      await graphSend(waId, { type: "text", text: { body: `Code ${record.publicCode} is verified and this pension case is now connected to your WhatsApp number.` } });
      if (record.resolution) {
        await graphSend(waId, { type: "text", text: { body: `${record.resolution.likelyCause}\n\nCase: ${record.publicCode}` } });
      } else {
        const current = existing.nextQuestion || questionById(record.currentQuestionId);
        if (current) await graphSend(waId, questionMessage(current));
      }
      continue;
    }
    if (!record.messages.length || !answer.rawAnswer) {
      addMessage({ caseId: record.id, conversationId: existing.conversation.id, externalId: message.id, role: "user", content: answer.rawAnswer || "Started WhatsApp guidance" });
      publish("transcript.final", { caseId: record.id, publicCode: record.publicCode, role: "user", transcript: answer.rawAnswer, channel: "whatsapp", profileName: contact?.profile?.name });
      const first = existing.nextQuestion || questionById(record.currentQuestionId);
      await graphSend(waId, { type: "text", text: { body: `Namaste. Your Pension Restart code is ${record.publicCode}. You may use this six-digit code only with Pension Restart. Never send a bank or government OTP, PIN, password, Aadhaar number or full bank-account number here.` } });
      await graphSend(waId, questionMessage(first));
      continue;
    }

    if (answer.selectCorrection) {
      const selected = questionById(answer.selectCorrection);
      if (!selected || !record.facts[selected.field]) {
        await graphSend(waId, { type: "text", text: { body: "That detail is not in this case yet. Please choose another detail." } });
        await graphSend(waId, correctionMessage());
        continue;
      }
      addMessage({ caseId: record.id, conversationId: existing.conversation.id, externalId: message.id, role: "user", content: answer.rawAnswer, questionId: "intake_confirmed" });
      updateCaseProgress({ caseId: record.id, currentQuestionId: selected.id, completeness: record.completeness });
      await graphSend(waId, { type: "text", text: { body: `Please give the corrected answer.\n\n${selected.hi}\n${selected.en}` } });
      continue;
    }

    const questionId = answer.questionId || record.currentQuestionId;
    const currentQuestion = questionById(questionId);
    const isCorrection = Boolean(currentQuestion && record.facts[currentQuestion.field]);
    const result = await submitAnswer({
      caseId: record.id, conversationId: existing.conversation.id, questionId,
      questionText: currentQuestion?.en || "", rawAnswer: answer.rawAnswer,
      expectedVersion: record.version, confirmed: Boolean(answer.confirmed), source: "whatsapp",
      correction: isCorrection, correctionField: isCorrection ? currentQuestion.id : "",
      externalMessageId: message.id,
    });
    publish("transcript.final", { caseId: record.id, publicCode: record.publicCode, role: "user", transcript: answer.rawAnswer, channel: "whatsapp", profileName: contact?.profile?.name });
    if (result.complete) {
      const lines = [result.resolution.likelyCause, "", ...result.resolution.nextSteps.map((step, index) => `${index + 1}. ${step}`), "", `Case: ${result.publicCode}`];
      await graphSend(waId, { type: "text", text: { body: lines.join("\n") } });
    } else if (result.awaitingCorrection) {
      await graphSend(waId, correctionMessage());
    } else if (result.clarification) {
      await graphSend(waId, { type: "text", text: { body: result.clarification } });
    } else if (result.nextQuestion) {
      await graphSend(waId, questionMessage(questionById(result.nextQuestion.id)));
    }
  }
}

export function whatsappVerification(request, response) {
  if (request.query["hub.mode"] === "subscribe" && request.query["hub.verify_token"] === config.whatsapp.verifyToken) {
    return response.status(200).send(request.query["hub.challenge"]);
  }
  return response.sendStatus(403);
}
