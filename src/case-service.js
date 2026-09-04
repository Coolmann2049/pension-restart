import {
  addAudit, addMessage, addUncertainFact, attachIdentity, commitFact, createCaseRecord,
  findCaseByIdentity, getCaseRecord, getFacts, getOrCreateConversation, hydrateCase, moveConversationToCase,
  saveResolution, updateCaseProgress,
} from "./db.js";
import { config } from "./config.js";
import { completion, nextQuestion, questionById } from "./questions.js";
import { interpretAnswer, normalizeProposedFact } from "./interpreter.js";
import { resolveGuidance } from "./guidance-engine.js";
import { publish } from "./realtime.js";
import { publicCaseCode, redactSensitiveText } from "./util.js";

export function createOrResumeCase({ channel = "web", identityKey = "", externalConversationId, language = "" }) {
  let record = identityKey ? findCaseByIdentity(channel, identityKey) : null;
  let resumed = Boolean(record);
  if (!record || ["closed"].includes(record.status)) {
    record = createCaseRecord(publicCaseCode(config.caseCodeSecret), "caller_relation");
    if (identityKey) attachIdentity(record.id, channel, identityKey, channel === "whatsapp");
    resumed = false;
    publish("case.created", { caseId: record.id, publicCode: record.publicCode, channel });
  }
  const conversation = getOrCreateConversation({
    caseId: record.id, channel,
    externalId: externalConversationId || `${channel}:${record.id}:${Date.now()}`,
    identityKey, language,
  });
  publish("conversation.connected", { caseId: record.id, publicCode: record.publicCode, conversationId: conversation.id, channel, resumed });
  const facts = getFacts(record.id);
  return { case: hydrateCase(record.id), conversation, resumed, nextQuestion: nextQuestion(facts) };
}

export function connectConversationByCode({ publicCode, channel, identityKey = "", conversationId = null }) {
  const compact = String(publicCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const normalized = compact.startsWith("PR") && compact.length === 12
    ? `PR-${compact.slice(2, 6)}-${compact.slice(6)}`
    : String(publicCode || "").trim().toUpperCase();
  const target = getCaseRecord(normalized);
  if (!target) throw Object.assign(new Error("Case code not found"), { statusCode: 404 });
  if (conversationId) moveConversationToCase({ conversationId, targetCaseId: target.id, channel, identityKey });
  else if (identityKey) attachIdentity(target.id, channel, identityKey, channel === "whatsapp");
  const record = hydrateCase(target.id);
  publish("case.connected", { caseId: record.id, publicCode: record.publicCode, channel });
  return { case: record, nextQuestion: nextQuestion(record.facts) };
}

function localizedQuestion(question) {
  return question ? { id: question.id, field: question.field, en: question.en, hi: question.hi } : null;
}

function summaryForReadback(facts) {
  const entries = Object.entries(facts)
    .filter(([field]) => field !== "intake_confirmed")
    .map(([field, fact]) => `${field.replaceAll("_", " ")}: ${String(fact.value)}`);
  return entries.join("; ");
}

export async function submitAnswer({
  caseId, conversationId, questionId, questionText = "", rawAnswer, expectedVersion,
  confirmed = false, correction = false, correctionField = "", externalMessageId = null,
  storeMessage = true, source = "voice",
}) {
  const before = hydrateCase(caseId);
  if (!before) throw Object.assign(new Error("Case not found"), { statusCode: 404 });
  const safeAnswer = redactSensitiveText(rawAnswer);
  if (!safeAnswer) throw Object.assign(new Error("An answer is required"), { statusCode: 400 });
  if (Number.isFinite(expectedVersion) && expectedVersion !== before.version) {
    throw Object.assign(new Error("Case version conflict"), { statusCode: 409, currentCase: before });
  }
  const correctionQuestion = correctionField && correctionField !== "intake_confirmed"
    ? questionById(correctionField)
    : null;
  const question = correctionQuestion || questionById(questionId) || questionById(before.currentQuestionId);
  if (!question) throw Object.assign(new Error("Unknown or completed question"), { statusCode: 400 });

  if (storeMessage) {
    addMessage({ caseId: before.id, conversationId, externalId: externalMessageId, role: "user", content: safeAnswer, questionId: question.id });
  }
  publish("answer.received", { caseId: before.id, publicCode: before.publicCode, questionId: question.id, rawAnswer: safeAnswer, source });
  publish("answer.interpreting", { caseId: before.id, publicCode: before.publicCode, questionId: question.id });

  const interpretation = await interpretAnswer({
    expectedField: question.field,
    question: questionText || question.en,
    rawAnswer: safeAnswer,
    currentFacts: before.facts,
    confirmed,
    correction,
  });

  const latestBeforeCommit = hydrateCase(before.id);
  if (!latestBeforeCommit || latestBeforeCommit.version !== before.version) {
    throw Object.assign(new Error("Case changed while this answer was being interpreted; please retry the answer"), {
      statusCode: 409, currentCase: latestBeforeCommit,
    });
  }

  const accepted = [];
  const uncertain = [];
  let conflict = null;
  let rejectedReadback = false;
  for (const proposal of interpretation.facts || []) {
    const normalized = normalizeProposedFact(proposal);
    if (!normalized) continue;
    if (question.field === "intake_confirmed" && normalized.field === "intake_confirmed" && normalized.value === false) {
      rejectedReadback = true;
      continue;
    }
    const existing = before.facts[normalized.field];
    const isDifferent = existing && JSON.stringify(existing.value) !== JSON.stringify(normalized.value);
    const canReplace = correction || normalized.explicitCorrection || confirmed;
    if (isDifferent && !canReplace) {
      conflict = { field: normalized.field, previous: existing.value, proposed: normalized.value };
      continue;
    }
    if (normalized.confidence < 0.72 && !confirmed) {
      uncertain.push(addUncertainFact({
        caseId: before.id, conversationId, field: normalized.field,
        rawAnswer: safeAnswer, confidence: normalized.confidence, source,
      }));
      continue;
    }
    accepted.push(commitFact({
      caseId: before.id, conversationId, field: normalized.field, value: normalized.value,
      rawAnswer: safeAnswer, confidence: normalized.confidence, confirmed, source,
    }));
  }

  let facts = getFacts(before.id);
  if (question.field === "intake_confirmed" && facts.intake_confirmed?.value === true) {
    const resolution = resolveGuidance(facts);
    const completed = saveResolution(before.id, resolution);
    addAudit(before.id, "resolution.generated", { ruleVersion: resolution.ruleVersion });
    publish("resolution.prepared", { caseId: before.id, publicCode: before.publicCode, resolution });
    return {
      accepted: true, complete: true, caseId: before.id, publicCode: before.publicCode,
      caseVersion: completed.version, interpretationProvider: interpretation.provider,
      acceptedFacts: accepted.map(item => ({ field: item.field, value: item.value, confidence: item.confidence })),
      resolution,
    };
  }

  let upcoming = nextQuestion(facts);
  let clarification = null;
  if (rejectedReadback) {
    clarification = "Please ask which one detail is wrong, then submit the corrected answer with correctionField set to that detail's question ID.";
    upcoming = questionById("intake_confirmed");
  } else if (conflict) {
    clarification = `Earlier ${conflict.field.replaceAll("_", " ")} was ${conflict.previous}, but the new answer suggests ${conflict.proposed}. Please ask which answer is final.`;
    upcoming = question;
  } else if (interpretation.clarificationNeeded || (!accepted.length && uncertain.length)) {
    clarification = interpretation.suggestedQuestion || interpretation.clarificationReason || question.en;
    upcoming = question;
  }

  if (upcoming?.field === "intake_confirmed" && !facts.intake_confirmed) {
    upcoming = { ...upcoming, en: `${upcoming.en} The details are: ${summaryForReadback(facts)}`, hi: `${upcoming.hi} Details: ${summaryForReadback(facts)}` };
  }

  const progress = updateCaseProgress({
    caseId: before.id,
    currentQuestionId: upcoming?.id || null,
    completeness: completion(facts),
  });
  addAudit(before.id, "answer.interpreted", {
    questionId: question.id, provider: interpretation.provider,
    accepted: accepted.map(item => item.field), uncertain: uncertain.map(item => item.field), conflict,
  });
  publish("case.updated", {
    caseId: before.id, publicCode: before.publicCode, caseVersion: progress.version,
    completeness: progress.completeness, currentQuestionId: upcoming?.id,
    acceptedFacts: accepted.map(item => ({ field: item.field, value: item.value, superseded: item.superseded })),
    clarification, awaitingCorrection: rejectedReadback,
  });
  facts = getFacts(before.id);
  return {
    accepted: accepted.length > 0,
    complete: false,
    caseId: before.id,
    publicCode: before.publicCode,
    caseVersion: progress.version,
    completeness: progress.completeness,
    interpretationProvider: interpretation.provider,
    interpretationError: interpretation.providerError || null,
    acceptedFacts: accepted.map(item => ({ field: item.field, value: item.value, confidence: item.confidence, superseded: item.superseded })),
    uncertainFields: uncertain.map(item => item.field),
    clarification, awaitingCorrection: rejectedReadback,
    nextQuestion: localizedQuestion(upcoming),
    currentFacts: Object.fromEntries(Object.entries(facts).map(([field, fact]) => [field, fact.value])),
  };
}

export function manuallyResolve(caseId) {
  const record = hydrateCase(caseId);
  if (!record) throw Object.assign(new Error("Case not found"), { statusCode: 404 });
  const resolution = resolveGuidance(record.facts);
  const updated = saveResolution(record.id, resolution);
  publish("resolution.prepared", { caseId: record.id, publicCode: record.publicCode, resolution });
  return { ...updated, resolution };
}
