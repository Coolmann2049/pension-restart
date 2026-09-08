import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const databasePath = `/tmp/pension-restart-test-${process.pid}.db`;
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = databasePath;
process.env.VAPI_WEBHOOK_SECRET = "";
process.env.WHATSAPP_ACCESS_TOKEN = "";
process.env.WHATSAPP_PHONE_NUMBER_ID = "";
process.env.META_APP_SECRET = "";
process.env.WHATSAPP_ACCESS_TEMPLATE_NAME = "verify_account_2";
process.env.WHATSAPP_ACCESS_TEMPLATE_LANGUAGE = "en";
delete process.env.OPENAI_API_KEY;

const { connectConversationByCode, connectSupporterByCode, createOrResumeCase, submitAnswer } = await import("../src/case-service.js");
const { beginNotification, commitFact, findCaseByIdentity, finishNotification, getCaseRecord, hasSupportAccess, hydrateCase, listSupportedCases } = await import("../src/db.js");
const { resolveGuidance } = await import("../src/guidance-engine.js");
const { handleVapiWebhook } = await import("../src/vapi.js");
const { buildCaseAccessTemplate, processWhatsAppPayload } = await import("../src/whatsapp.js");
const { redactSensitiveText } = await import("../src/util.js");
const { FIELD_DEFINITIONS } = await import("../src/questions.js");
const { normalizeProposedFact } = await import("../src/interpreter.js");

test.after(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(`${databasePath}${suffix}`); } catch {}
  }
});

test("Codex output schema stays synchronized with accepted case fields", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../config/codex-interpreter.schema.json", import.meta.url), "utf8"));
  assert.deepEqual(schema.properties.facts.items.properties.field.enum, Object.keys(FIELD_DEFINITIONS));
});

test("model-friendly pension labels are deterministically canonicalized", () => {
  const normalized = normalizeProposedFact({
    field: "scheme_family", value: "EPS", confidence: 0.84,
    evidence: "EPS pension from EPFO", explicitCorrection: false,
  });
  assert.equal(normalized.value, "eps_95");
});

test("creates a resumable case for the same channel identity", () => {
  const first = createOrResumeCase({ channel: "voice", identityKey: "+919999999999", externalConversationId: "call-one" });
  const second = createOrResumeCase({ channel: "voice", identityKey: "+919999999999", externalConversationId: "call-two" });
  assert.equal(second.resumed, true);
  assert.equal(second.case.id, first.case.id);
  assert.match(first.case.publicCode, /^\d{6}$/);
  assert.equal(first.case.displayCode, `PR-${first.case.publicCode}`);
  assert.equal(second.nextQuestion.id, "caller_relation");
});

test("builds the verify_account_2 body with the six-digit case access code", () => {
  const body = buildCaseAccessTemplate({ publicCode: "482731" });
  assert.equal(body.template.name, "verify_account_2");
  assert.deepEqual(body.template.components[0].parameters.map(parameter => parameter.text), [
    "accessing", "Pension Restart", "your pension guidance case", "482731",
  ]);
  assert.deepEqual(body.template.components[1], {
    type: "button",
    sub_type: "url",
    index: "0",
    parameters: [{ type: "text", text: "482731" }],
  });
});

test("moves a new channel conversation onto an existing case code", () => {
  const website = createOrResumeCase({ channel: "web", identityKey: "browser_cross_channel", externalConversationId: "web-cross" });
  const phone = createOrResumeCase({ channel: "voice", identityKey: "+919555555555", externalConversationId: "voice-cross" });
  const temporaryCaseId = phone.case.id;
  const connected = connectConversationByCode({
    publicCode: website.case.publicCode.toLowerCase().replaceAll("-", " "), channel: "voice",
    identityKey: "+919555555555", conversationId: phone.conversation.id,
  });
  assert.equal(connected.case.id, website.case.id);
  assert.equal(findCaseByIdentity("voice", "+919555555555").id, website.case.id);
  assert.equal(getCaseRecord(temporaryCaseId), null);
});

test("accepts the branded PR-123456 form of a six-digit case code", () => {
  const target = createOrResumeCase({ channel: "web", identityKey: "brand-source", externalConversationId: "brand-source-conversation" });
  const connected = connectConversationByCode({
    publicCode: `PR-${target.case.publicCode}`, channel: "voice", identityKey: "+919500000001",
    accessSubject: "+919500000001",
  });
  assert.equal(connected.case.id, target.case.id);
});

test("requires explicit pensioner permission before linking a family case", () => {
  const target = createOrResumeCase({ channel: "voice", identityKey: "+919500000011", externalConversationId: "family-consent-source" });
  assert.throws(() => connectSupporterByCode({
    publicCode: target.case.publicCode,
    supporterIdentityKey: "browser_family_without_consent",
    relationship: "child",
    consentConfirmed: false,
  }), error => error.statusCode === 400 && /permission/i.test(error.message));
  assert.equal(hasSupportAccess("browser_family_without_consent", target.case.id), false);
});

test("one private family dashboard can hold multiple consented cases", () => {
  const first = createOrResumeCase({ channel: "voice", identityKey: "+919500000012", externalConversationId: "family-case-one" });
  const second = createOrResumeCase({ channel: "voice", identityKey: "+919500000013", externalConversationId: "family-case-two" });
  const supporterIdentityKey = "browser_family_multiple_cases";
  connectSupporterByCode({
    publicCode: `PR-${first.case.publicCode}`,
    supporterIdentityKey,
    relationship: "child",
    consentConfirmed: true,
    accessSubject: `${supporterIdentityKey}:one`,
  });
  connectSupporterByCode({
    publicCode: second.case.publicCode,
    supporterIdentityKey,
    relationship: "grandchild",
    consentConfirmed: true,
    accessSubject: `${supporterIdentityKey}:two`,
  });
  const supportedCases = listSupportedCases(supporterIdentityKey);
  assert.deepEqual(new Set(supportedCases.map(record => record.id)), new Set([first.case.id, second.case.id]));
  assert.equal(hasSupportAccess(supporterIdentityKey, first.case.publicCode), true);
  assert.equal(hasSupportAccess(supporterIdentityKey, second.case.id), true);
});

test("rate limits repeated invalid six-digit code attempts", () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.throws(() => connectConversationByCode({
      publicCode: "000000", channel: "web", identityKey: "rate-browser", accessSubject: "rate-test",
    }), /Code not recognized/);
  }
  assert.throws(() => connectConversationByCode({
    publicCode: "000000", channel: "web", identityKey: "rate-browser", accessSubject: "rate-test",
  }), error => error.statusCode === 429);
});

test("stores a confirmed raw answer and advances exactly one question", async () => {
  const started = createOrResumeCase({ channel: "web", identityKey: "browser_test", externalConversationId: "web-one" });
  const result = await submitAnswer({
    caseId: started.case.id,
    conversationId: started.conversation.id,
    questionId: "caller_relation",
    rawAnswer: "Main apni dadi ki madad kar raha hoon",
    expectedVersion: 0,
    confirmed: true,
    source: "web",
  });
  assert.equal(result.accepted, true);
  assert.equal(result.currentFacts.caller_relation, "grandchild");
  assert.equal(result.nextQuestion.id, "whatsapp_followup_consent");
});

test("does not force an ambiguous pension family into a current fact", async () => {
  const started = createOrResumeCase({ channel: "web", identityKey: "browser_ambiguous", externalConversationId: "web-two" });
  commitFact({ caseId: started.case.id, conversationId: started.conversation.id, field: "caller_relation", value: "self", confirmed: true });
  commitFact({ caseId: started.case.id, conversationId: started.conversation.id, field: "pensioner_name", value: "Kamla", confirmed: true });
  commitFact({ caseId: started.case.id, conversationId: started.conversation.id, field: "issue_type", value: "stopped", confirmed: true });
  const current = hydrateCase(started.case.id);
  const result = await submitAnswer({
    caseId: started.case.id,
    conversationId: started.conversation.id,
    questionId: "scheme_family",
    rawAnswer: "Shayad post office ya central government ke saath ho",
    expectedVersion: current.version,
    confirmed: false,
    source: "web",
  });
  assert.equal(result.accepted, false);
  assert.equal(result.currentFacts.scheme_family, undefined);
  assert.ok(result.clarification);
});

test("accepts machine-readable boolean button values", async () => {
  const started = createOrResumeCase({ channel: "web", identityKey: "browser_boolean", externalConversationId: "web-boolean" });
  commitFact({ caseId: started.case.id, field: "caller_relation", value: "self", confirmed: true });
  commitFact({ caseId: started.case.id, field: "whatsapp_followup_consent", value: true, confirmed: true });
  commitFact({ caseId: started.case.id, field: "pensioner_name", value: "Kamla", confirmed: true });
  commitFact({ caseId: started.case.id, field: "issue_type", value: "stopped", confirmed: true });
  commitFact({ caseId: started.case.id, field: "scheme_family", value: "eps_95", confirmed: true });
  commitFact({ caseId: started.case.id, field: "disbursement_channel", value: "bank", confirmed: true });
  commitFact({ caseId: started.case.id, field: "disbursing_institution", value: "SBI", confirmed: true });
  commitFact({ caseId: started.case.id, field: "last_credit_date", value: "May 2026", confirmed: true });
  commitFact({ caseId: started.case.id, field: "pension_amount", value: 12000, confirmed: true });
  commitFact({ caseId: started.case.id, field: "life_certificate_status", value: "not_submitted", confirmed: true });
  commitFact({ caseId: started.case.id, field: "changed_details", value: "none", confirmed: true });
  commitFact({ caseId: started.case.id, field: "location_state", value: "Bihar", confirmed: true });
  const current = hydrateCase(started.case.id);
  const result = await submitAnswer({
    caseId: current.id, conversationId: started.conversation.id, questionId: "intake_confirmed",
    rawAnswer: "true", expectedVersion: current.version, confirmed: true, source: "web",
  });
  assert.equal(result.complete, true);
  assert.match(result.resolution.primaryAuthority, /EPFO/);
});

test("preserves the old fact as superseded when a correction is confirmed", () => {
  const started = createOrResumeCase({ channel: "web", identityKey: "browser_correction", externalConversationId: "web-three" });
  const first = commitFact({ caseId: started.case.id, field: "last_credit_date", value: "May 2026", confirmed: true });
  const second = commitFact({ caseId: started.case.id, field: "last_credit_date", value: "April 2026", confirmed: true });
  const record = hydrateCase(started.case.id);
  assert.equal(record.facts.last_credit_date.value, "April 2026");
  assert.equal(record.factHistory.find(item => item.id === first.id).state, "superseded");
  assert.equal(second.superseded, first.id);
});

test("a rejected final readback waits for a specific correction", async () => {
  const started = createOrResumeCase({ channel: "voice", identityKey: "+919888888888", externalConversationId: "call-correction" });
  for (const [field, value] of Object.entries({
    caller_relation: "self", whatsapp_followup_consent: true, pensioner_name: "Kamla", issue_type: "stopped", scheme_family: "eps_95",
    disbursement_channel: "bank", disbursing_institution: "SBI", last_credit_date: "May 2026",
    pension_amount: 12000, life_certificate_status: "not_submitted", changed_details: "none", location_state: "Bihar",
  })) commitFact({ caseId: started.case.id, field, value, confirmed: true });
  const current = hydrateCase(started.case.id);
  const rejected = await submitAnswer({
    caseId: current.id, conversationId: started.conversation.id, questionId: "intake_confirmed",
    rawAnswer: "No, one detail is wrong", expectedVersion: current.version, confirmed: true, source: "voice",
  });
  assert.equal(rejected.complete, false);
  assert.equal(rejected.awaitingCorrection, true);
  assert.equal(rejected.nextQuestion.id, "intake_confirmed");
  assert.equal(rejected.currentFacts.intake_confirmed, undefined);

  const corrected = await submitAnswer({
    caseId: current.id, conversationId: started.conversation.id, questionId: "intake_confirmed",
    correctionField: "last_credit_date", correction: true, rawAnswer: "Actually it was April 2026",
    expectedVersion: rejected.caseVersion, confirmed: true, source: "voice",
  });
  assert.equal(corrected.currentFacts.last_credit_date, "Actually it was April 2026");
  assert.equal(corrected.nextQuestion.id, "intake_confirmed");
});

test("deterministic guidance routes an EPS stoppage with a missing life certificate", () => {
  const facts = {
    scheme_family: { value: "eps_95" },
    issue_type: { value: "stopped" },
    life_certificate_status: { value: "not_submitted" },
    changed_details: { value: "none" },
  };
  const result = resolveGuidance(facts);
  assert.equal(result.confidence, "high");
  assert.match(result.primaryAuthority, /EPFO/);
  assert.ok(result.officialSources.some(source => source.url.includes("jeevanpramaan")));
  assert.ok(result.officialSources.some(source => source.url.includes("epfigms")));
});

test("Vapi tool calls return the named result contract", async () => {
  let statusCode = 200;
  let body;
  const request = {
    headers: {},
    body: { message: {
      type: "tool-calls",
      call: { id: "vapi-test-call", customer: { number: "+919777777777" } },
      toolCallList: [{ id: "tool-one", name: "submit_answer", parameters: {
        questionId: "caller_relation", questionText: "Who needs help?", rawAnswer: "self",
        confirmed: true, correction: false, correctionField: "", complete: false,
      } }],
    } },
  };
  const response = {
    status(value) { statusCode = value; return this; },
    json(value) { body = value; return this; },
  };
  await handleVapiWebhook(request, response);
  assert.equal(statusCode, 200);
  assert.equal(body.results[0].name, "submit_answer");
  assert.equal(body.results[0].toolCallId, "tool-one");
  assert.equal(JSON.parse(body.results[0].result).nextQuestion.id, "whatsapp_followup_consent");
});

test("WhatsApp stores an inbound answer once and advances via a button", async () => {
  const payload = message => ({ entry: [{ changes: [{ value: {
    messages: [message], contacts: [{ profile: { name: "Test caller" } }],
  } }] }] });
  await processWhatsAppPayload(payload({ id: "wamid-start", from: "919666666666", type: "text", text: { body: "Namaste" } }));
  await processWhatsAppPayload(payload({
    id: "wamid-answer", from: "919666666666", type: "interactive",
    interactive: { button_reply: { id: "answer:caller_relation:self", title: "My pension" } },
  }));
  const record = hydrateCase(findCaseByIdentity("whatsapp", "919666666666").id);
  assert.equal(record.facts.caller_relation.value, "self");
  assert.equal(record.messages.filter(message => message.content === "self").length, 1);
  assert.equal(record.currentQuestionId, "whatsapp_followup_consent");
});

test("WhatsApp connects an existing code without interpreting the code as an answer", async () => {
  const target = createOrResumeCase({ channel: "web", identityKey: "browser_wa_link", externalConversationId: "web-wa-link" });
  const payload = { entry: [{ changes: [{ value: {
    messages: [{ id: "wamid-link", from: "919444444444", type: "text", text: { body: target.case.publicCode } }],
    contacts: [{ profile: { name: "Returning caller" } }],
  } }] }] };
  await processWhatsAppPayload(payload);
  const linked = hydrateCase(findCaseByIdentity("whatsapp", "919444444444").id);
  assert.equal(linked.id, target.case.id);
  assert.ok(linked.conversations.some(conversation => conversation.channel === "whatsapp"));
  assert.equal(linked.facts.caller_relation, undefined);
  assert.ok(linked.messages.some(message => message.content === "Shared Pension Restart case code"));
});

test("WhatsApp delivery receipts update the matching outbound notification", async () => {
  const target = createOrResumeCase({ channel: "voice", identityKey: "+919400000001", externalConversationId: "delivery-source" });
  const kind = "case-access-code:verify_account_2:en";
  assert.equal(beginNotification({ caseId: target.case.id, channel: "whatsapp", kind }), true);
  finishNotification({ caseId: target.case.id, channel: "whatsapp", kind, status: "accepted", providerMessageId: "wamid.delivery-test" });
  await processWhatsAppPayload({ entry: [{ changes: [{ value: {
    statuses: [{ id: "wamid.delivery-test", status: "delivered", timestamp: "1788556800", recipient_id: "919400000001" }],
  } }] }] });
  assert.equal(hydrateCase(target.case.id).notifications[0].status, "delivered");
});

test("redacts sensitive identity and credential patterns before storage", () => {
  const safe = redactSensitiveText("PAN ABCDE1234F, Aadhaar 1234 5678 9012 and OTP is 482910");
  assert.doesNotMatch(safe, /ABCDE1234F|1234 5678 9012|482910/);
  assert.match(safe, /PAN REDACTED|AADHAAR REDACTED|REDACTED/);
});
