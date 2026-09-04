import { config } from "./config.js";
import { addMessage, findConversation, hydrateCase, recordWebhook, setConversationStatus } from "./db.js";
import { connectConversationByCode, createOrResumeCase, submitAnswer } from "./case-service.js";
import { publish } from "./realtime.js";
import { normalizePhone, redactSensitiveText } from "./util.js";
import { sendCaseAccessTemplate } from "./whatsapp.js";

function callId(message) {
  return message.call?.id || message.callId || "";
}

function callerNumber(message) {
  return normalizePhone(message.customer?.number || message.call?.customer?.number || message.call?.phoneNumber?.number || "");
}

function ensureConversation(message) {
  const externalId = callId(message);
  let conversation = findConversation(externalId);
  if (conversation) return conversation;
  const created = createOrResumeCase({ channel: "voice", identityKey: callerNumber(message), externalConversationId: externalId });
  return created.conversation;
}

function validateSecret(request) {
  if (!config.vapi.webhookSecret) return config.nodeEnv !== "production";
  const authorization = request.headers.authorization || "";
  const legacy = request.headers["x-vapi-secret"] || "";
  return authorization === `Bearer ${config.vapi.webhookSecret}` || legacy === config.vapi.webhookSecret;
}

async function toolResult(tool, message) {
  const name = tool.name || tool.function?.name || tool.toolCall?.name;
  const toolCallId = tool.id || tool.toolCall?.id;
  const parameters = tool.parameters || tool.function?.arguments || tool.toolCall?.parameters || {};
  const args = typeof parameters === "string" ? JSON.parse(parameters) : parameters;
  const conversation = ensureConversation(message);
  const record = hydrateCase(conversation.case_id);

  if (name === "get_case_context") {
    const connected = args.caseCode
      ? connectConversationByCode({
        publicCode: args.caseCode, channel: "voice", identityKey: callerNumber(message),
        conversationId: conversation.id, accessSubject: callerNumber(message),
      }).case
      : record;
    return { name, toolCallId, result: JSON.stringify({
      caseId: connected.id, publicCode: connected.publicCode, caseVersion: connected.version,
      currentQuestionId: connected.currentQuestionId,
      currentFacts: Object.fromEntries(Object.entries(connected.facts).map(([field, fact]) => [field, fact.value])),
    }) };
  }
  if (name === "submit_answer") {
    const result = await submitAnswer({
      caseId: record.id,
      conversationId: conversation.id,
      questionId: args.questionId || record.currentQuestionId,
      questionText: args.questionText || "",
      rawAnswer: args.rawAnswer,
      expectedVersion: Number.isFinite(args.caseVersion) ? args.caseVersion : undefined,
      confirmed: Boolean(args.confirmed),
      correction: Boolean(args.correction),
      correctionField: args.correctionField || "",
      storeMessage: false,
      source: "voice",
    });
    return { name, toolCallId, result: JSON.stringify(result) };
  }
  return { name: name || "unknown", toolCallId, error: `Unknown tool: ${name}` };
}

export async function handleVapiWebhook(request, response) {
  if (!validateSecret(request)) return response.status(401).json({ error: "Invalid Vapi webhook credential" });
  const message = request.body?.message;
  if (!message?.type) return response.status(400).json({ error: "Missing Vapi message" });

  if (message.type === "tool-calls") {
    const calls = message.toolCallList || (message.toolWithToolCallList || []).map(item => ({ name: item.name, ...item.toolCall }));
    const results = [];
    for (const tool of calls) {
      try {
        results.push(await toolResult(tool, message));
      } catch (error) {
        results.push({ name: tool.name || tool.function?.name || tool.toolCall?.name || "unknown", toolCallId: tool.id || tool.toolCall?.id, error: error.message });
      }
    }
    return response.json({ results });
  }

  const externalId = callId(message);
  const uniqueEventId = `${externalId}:${message.type}:${message.timestamp || request.body?.timestamp || Date.now()}`;
  if (!recordWebhook("vapi", uniqueEventId, message.type)) return response.json({ received: true, duplicate: true });
  const conversation = externalId ? ensureConversation(message) : null;

  if (message.type === "status-update" && conversation) {
    setConversationStatus(conversation.id, message.status, message.status === "ended" ? new Date().toISOString() : null);
    const record = hydrateCase(conversation.case_id);
    publish("voice.status", { caseId: record.id, publicCode: record.publicCode, status: message.status });
  } else if (message.type === "transcript" && conversation && message.transcriptType !== "partial") {
    const transcript = redactSensitiveText(message.transcript);
    addMessage({
      caseId: conversation.case_id, conversationId: conversation.id,
      externalId: uniqueEventId, role: message.role || "unknown", content: transcript,
    });
    const record = hydrateCase(conversation.case_id);
    publish("transcript.final", { caseId: record.id, publicCode: record.publicCode, role: message.role, transcript, channel: "voice" });
  } else if (message.type === "end-of-call-report" && conversation) {
    setConversationStatus(conversation.id, "ended", new Date().toISOString());
    const record = hydrateCase(conversation.case_id);
    publish("voice.ended", { caseId: record.id, publicCode: record.publicCode, endedReason: message.endedReason || "unknown" });
    const recipient = callerNumber(message);
    if (recipient && record.facts.whatsapp_followup_consent?.value === true) {
      sendCaseAccessTemplate({ to: recipient, record }).catch(error => {
        publish("integration.error", { provider: "whatsapp", caseId: record.id, message: error.message });
      });
    }
  }
  return response.json({ received: true });
}
