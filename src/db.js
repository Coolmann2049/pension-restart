import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { accessSubjectHash, displayCaseCode, id, now, publicCaseCode, safeJson } from "./util.js";

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    public_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'collecting',
    current_question_id TEXT,
    completeness INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 0,
    resolution_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channel_identities (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    identity_key TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    UNIQUE(channel, identity_key)
  );

  CREATE TABLE IF NOT EXISTS support_relationships (
    id TEXT PRIMARY KEY,
    supporter_identity_key TEXT NOT NULL,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL DEFAULT 'family',
    consent_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(supporter_identity_key, case_id)
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    external_id TEXT NOT NULL UNIQUE,
    identity_key TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    language TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    external_id TEXT UNIQUE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    question_id TEXT,
    is_final INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fact_events (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    field TEXT NOT NULL,
    value_json TEXT,
    raw_answer TEXT,
    confidence REAL NOT NULL DEFAULT 0,
    confirmed INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL,
    supersedes_id TEXT REFERENCES fact_events(id) ON DELETE SET NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS case_facts (
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    field TEXT NOT NULL,
    fact_event_id TEXT NOT NULL REFERENCES fact_events(id) ON DELETE CASCADE,
    value_json TEXT,
    confidence REAL NOT NULL DEFAULT 0,
    confirmed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(case_id, field)
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    received_at TEXT NOT NULL,
    UNIQUE(provider, external_id, event_type)
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    kind TEXT NOT NULL,
    recipient_masked TEXT,
    status TEXT NOT NULL,
    provider_message_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(case_id, channel, kind)
  );

  CREATE TABLE IF NOT EXISTS case_code_aliases (
    legacy_code TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS case_access_attempts (
    id TEXT PRIMARY KEY,
    subject_hash TEXT NOT NULL,
    channel TEXT NOT NULL,
    successful INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cases_updated ON cases(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_conversations_case ON conversations(case_id, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_case ON messages(case_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_fact_events_case ON fact_events(case_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_support_relationships_supporter ON support_relationships(supporter_identity_key, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_case_access_attempts_subject ON case_access_attempts(subject_hash, channel, created_at);
`);

const statements = {
  insertCase: db.prepare(`INSERT INTO cases
    (id, public_code, status, current_question_id, completeness, version, created_at, updated_at)
    VALUES (@id, @publicCode, @status, @currentQuestionId, 0, 0, @createdAt, @createdAt)`),
  caseById: db.prepare(`SELECT * FROM cases WHERE id = ? OR public_code = ? OR id =
    (SELECT case_id FROM case_code_aliases WHERE legacy_code = ?)`),
  cases: db.prepare("SELECT * FROM cases ORDER BY updated_at DESC LIMIT ?"),
  deleteExpiredCases: db.prepare("DELETE FROM cases WHERE updated_at < ?"),
  updateCaseProgress: db.prepare(`UPDATE cases SET status = @status, current_question_id = @currentQuestionId,
    completeness = @completeness, version = version + 1, updated_at = @updatedAt WHERE id = @id`),
  setResolution: db.prepare(`UPDATE cases SET status = 'guidance_prepared', resolution_json = ?, completeness = 100,
    current_question_id = NULL, version = version + 1, updated_at = ? WHERE id = ?`),
  identityByKey: db.prepare("SELECT * FROM channel_identities WHERE channel = ? AND identity_key = ?"),
  supportRelationship: db.prepare("SELECT * FROM support_relationships WHERE supporter_identity_key = ? AND case_id = ? AND consent_confirmed = 1"),
  supportedCases: db.prepare(`SELECT cases.* FROM cases
    JOIN support_relationships ON support_relationships.case_id = cases.id
    WHERE support_relationships.supporter_identity_key = ? AND support_relationships.consent_confirmed = 1
    ORDER BY cases.updated_at DESC`),
  upsertSupportRelationship: db.prepare(`INSERT INTO support_relationships
    (id, supporter_identity_key, case_id, relationship, consent_confirmed, created_at, updated_at)
    VALUES (@id, @supporterIdentityKey, @caseId, @relationship, @consentConfirmed, @at, @at)
    ON CONFLICT(supporter_identity_key, case_id) DO UPDATE SET
      relationship = excluded.relationship, consent_confirmed = excluded.consent_confirmed, updated_at = excluded.updated_at`),
  upsertIdentity: db.prepare(`INSERT INTO channel_identities
    (id, case_id, channel, identity_key, verified, created_at, last_seen_at)
    VALUES (@id, @caseId, @channel, @identityKey, @verified, @at, @at)
    ON CONFLICT(channel, identity_key) DO UPDATE SET case_id = excluded.case_id, verified = excluded.verified, last_seen_at = excluded.last_seen_at`),
  conversationByExternal: db.prepare("SELECT * FROM conversations WHERE external_id = ?"),
  insertConversation: db.prepare(`INSERT INTO conversations
    (id, case_id, channel, external_id, identity_key, status, language, started_at)
    VALUES (@id, @caseId, @channel, @externalId, @identityKey, 'active', @language, @at)`),
  updateConversation: db.prepare("UPDATE conversations SET status = ?, ended_at = COALESCE(?, ended_at) WHERE id = ?"),
  moveConversation: db.prepare("UPDATE conversations SET case_id = ?, identity_key = ? WHERE id = ?"),
  moveConversationMessages: db.prepare("UPDATE messages SET case_id = ? WHERE conversation_id = ?"),
  moveConversationFactEvents: db.prepare("UPDATE fact_events SET case_id = ? WHERE conversation_id = ?"),
  deleteEmptyCase: db.prepare(`DELETE FROM cases WHERE id = ?
    AND NOT EXISTS (SELECT 1 FROM conversations WHERE case_id = cases.id)
    AND NOT EXISTS (SELECT 1 FROM messages WHERE case_id = cases.id)
    AND NOT EXISTS (SELECT 1 FROM fact_events WHERE case_id = cases.id)`),
  caseFactEventCount: db.prepare("SELECT COUNT(*) AS count FROM fact_events WHERE case_id = ?"),
  conversationsForCase: db.prepare("SELECT * FROM conversations WHERE case_id = ? ORDER BY started_at"),
  insertMessage: db.prepare(`INSERT OR IGNORE INTO messages
    (id, case_id, conversation_id, external_id, role, content, question_id, is_final, created_at)
    VALUES (@id, @caseId, @conversationId, @externalId, @role, @content, @questionId, @isFinal, @at)`),
  messagesForCase: db.prepare("SELECT * FROM messages WHERE case_id = ? AND is_final = 1 ORDER BY created_at"),
  currentFacts: db.prepare("SELECT * FROM case_facts WHERE case_id = ? ORDER BY field"),
  insertFactEvent: db.prepare(`INSERT INTO fact_events
    (id, case_id, conversation_id, field, value_json, raw_answer, confidence, confirmed, state, supersedes_id, source, created_at)
    VALUES (@id, @caseId, @conversationId, @field, @valueJson, @rawAnswer, @confidence, @confirmed, @state, @supersedesId, @source, @at)`),
  currentFact: db.prepare("SELECT * FROM case_facts WHERE case_id = ? AND field = ?"),
  supersedeEvent: db.prepare("UPDATE fact_events SET state = 'superseded' WHERE id = ?"),
  upsertFact: db.prepare(`INSERT INTO case_facts
    (case_id, field, fact_event_id, value_json, confidence, confirmed, updated_at)
    VALUES (@caseId, @field, @factEventId, @valueJson, @confidence, @confirmed, @at)
    ON CONFLICT(case_id, field) DO UPDATE SET
      fact_event_id = excluded.fact_event_id, value_json = excluded.value_json,
      confidence = excluded.confidence, confirmed = excluded.confirmed, updated_at = excluded.updated_at`),
  factHistory: db.prepare("SELECT * FROM fact_events WHERE case_id = ? ORDER BY created_at"),
  insertWebhook: db.prepare(`INSERT OR IGNORE INTO webhook_events
    (id, provider, external_id, event_type, received_at) VALUES (?, ?, ?, ?, ?)`),
  insertAudit: db.prepare(`INSERT INTO audit_events (id, case_id, type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)`),
  insertNotification: db.prepare(`INSERT OR IGNORE INTO notifications
    (id, case_id, channel, kind, recipient_masked, status, created_at, updated_at)
    VALUES (@id, @caseId, @channel, @kind, @recipientMasked, 'pending', @at, @at)`),
  failedNotification: db.prepare(`UPDATE notifications SET status = 'pending', error = NULL, updated_at = @at
    WHERE case_id = @caseId AND channel = @channel AND kind = @kind AND status = 'failed'`),
  finishNotification: db.prepare(`UPDATE notifications SET status = @status, provider_message_id = @providerMessageId,
    error = @error, updated_at = @at WHERE case_id = @caseId AND channel = @channel AND kind = @kind`),
  notificationsForCase: db.prepare("SELECT * FROM notifications WHERE case_id = ? ORDER BY created_at"),
  notificationByProviderId: db.prepare("SELECT * FROM notifications WHERE provider_message_id = ?"),
  updateNotificationProviderStatus: db.prepare(`UPDATE notifications SET status = @status, error = @error, updated_at = @at
    WHERE provider_message_id = @providerMessageId`),
  legacyCases: db.prepare("SELECT id, public_code FROM cases WHERE public_code NOT GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'"),
  insertCodeAlias: db.prepare("INSERT OR IGNORE INTO case_code_aliases (legacy_code, case_id, created_at) VALUES (?, ?, ?)"),
  updatePublicCode: db.prepare("UPDATE cases SET public_code = ?, updated_at = ? WHERE id = ?"),
  recentAccessAttempts: db.prepare("SELECT COUNT(*) AS count FROM case_access_attempts WHERE subject_hash = ? AND channel = ? AND created_at >= ?"),
  insertAccessAttempt: db.prepare("INSERT INTO case_access_attempts (id, subject_hash, channel, successful, created_at) VALUES (?, ?, ?, ?, ?)"),
};

function uniquePublicCode() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = publicCaseCode();
    if (!statements.caseById.get(candidate, candidate, candidate)) return candidate;
  }
  throw new Error("Could not allocate a unique six-digit case code");
}

const migrateLegacyCodes = db.transaction(() => {
  for (const row of statements.legacyCases.all()) {
    const replacement = uniquePublicCode();
    const at = now();
    statements.insertCodeAlias.run(row.public_code, row.id, at);
    statements.updatePublicCode.run(replacement, at, row.id);
  }
});

migrateLegacyCodes();

function mapCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    publicCode: row.public_code,
    displayCode: displayCaseCode(row.public_code),
    status: row.status,
    currentQuestionId: row.current_question_id,
    completeness: row.completeness,
    version: row.version,
    resolution: safeJson(row.resolution_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createCaseRecord(currentQuestionId) {
  const publicCode = uniquePublicCode();
  const record = { id: id("case"), publicCode, status: "collecting", currentQuestionId, createdAt: now() };
  statements.insertCase.run(record);
  return getCaseRecord(record.id);
}

export function getCaseRecord(caseIdOrCode) {
  return mapCase(statements.caseById.get(caseIdOrCode, caseIdOrCode, caseIdOrCode));
}

export function listCaseRecords(limit = 100) {
  return statements.cases.all(Math.min(Math.max(limit, 1), 250)).map(mapCase);
}

export function purgeExpiredCases(days = config.dataRetentionDays) {
  if (!Number.isFinite(days) || days < 1) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return statements.deleteExpiredCases.run(cutoff).changes;
}

export function findCaseByIdentity(channel, identityKey) {
  const identity = statements.identityByKey.get(channel, identityKey);
  return identity ? getCaseRecord(identity.case_id) : null;
}

export function attachIdentity(caseId, channel, identityKey, verified = false) {
  if (!identityKey) return;
  statements.upsertIdentity.run({ id: id("identity"), caseId, channel, identityKey, verified: verified ? 1 : 0, at: now() });
}

export function grantSupportAccess({ caseId, supporterIdentityKey, relationship = "family", consentConfirmed = false }) {
  if (!supporterIdentityKey || !consentConfirmed) {
    throw Object.assign(new Error("Pensioner permission must be confirmed before linking a case"), { statusCode: 400 });
  }
  const record = getCaseRecord(caseId);
  if (!record) throw Object.assign(new Error("Case not found"), { statusCode: 404 });
  const allowedRelationships = new Set(["self", "spouse", "child", "grandchild", "relative", "helper", "family"]);
  const normalizedRelationship = allowedRelationships.has(relationship) ? relationship : "family";
  statements.upsertSupportRelationship.run({
    id: id("support"), supporterIdentityKey, caseId: record.id,
    relationship: normalizedRelationship, consentConfirmed: 1, at: now(),
  });
  return record;
}

export function hasSupportAccess(supporterIdentityKey, caseIdOrCode) {
  const record = getCaseRecord(caseIdOrCode);
  return Boolean(record && statements.supportRelationship.get(supporterIdentityKey, record.id));
}

export function listSupportedCases(supporterIdentityKey) {
  if (!supporterIdentityKey) return [];
  return statements.supportedCases.all(supporterIdentityKey).map(mapCase);
}

export function checkCaseAccessLimit({ channel, subject, maxAttempts = 5, windowMinutes = 15 }) {
  const subjectHash = accessSubjectHash(config.caseCodeSecret, channel, subject || "anonymous");
  const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const count = statements.recentAccessAttempts.get(subjectHash, channel, cutoff).count;
  if (count >= maxAttempts) {
    throw Object.assign(new Error(`Too many code attempts. Try again in ${windowMinutes} minutes.`), { statusCode: 429 });
  }
  return subjectHash;
}

export function recordCaseAccessAttempt({ channel, subjectHash, successful }) {
  statements.insertAccessAttempt.run(id("access"), subjectHash, channel, successful ? 1 : 0, now());
}

export function getOrCreateConversation({ caseId, channel, externalId, identityKey = "", language = "" }) {
  let row = statements.conversationByExternal.get(externalId);
  if (!row) {
    const record = { id: id("conv"), caseId, channel, externalId, identityKey, language, at: now() };
    statements.insertConversation.run(record);
    row = statements.conversationByExternal.get(externalId);
  }
  return row;
}

export function findConversation(externalId) {
  return statements.conversationByExternal.get(externalId) || null;
}

export function setConversationStatus(conversationId, status, endedAt = null) {
  statements.updateConversation.run(status, endedAt, conversationId);
}

export const moveConversationToCase = db.transaction(({ conversationId, targetCaseId, channel, identityKey = "" }) => {
  const conversation = db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const previousCaseId = conversation.case_id;
  if (previousCaseId !== targetCaseId && statements.caseFactEventCount.get(previousCaseId).count > 0) {
    throw Object.assign(new Error("This conversation already has case answers and cannot be merged automatically"), { statusCode: 409 });
  }
  statements.moveConversation.run(targetCaseId, identityKey, conversationId);
  statements.moveConversationMessages.run(targetCaseId, conversationId);
  statements.moveConversationFactEvents.run(targetCaseId, conversationId);
  if (identityKey) attachIdentity(targetCaseId, channel, identityKey, channel === "whatsapp");
  if (previousCaseId !== targetCaseId) statements.deleteEmptyCase.run(previousCaseId);
  return statements.conversationByExternal.get(conversation.external_id);
});

export function addMessage({ caseId, conversationId = null, externalId = null, role, content, questionId = null, isFinal = true }) {
  const message = { id: id("msg"), caseId, conversationId, externalId, role, content, questionId, isFinal: isFinal ? 1 : 0, at: now() };
  statements.insertMessage.run(message);
  return message;
}

export function getFacts(caseId) {
  return Object.fromEntries(statements.currentFacts.all(caseId).map(row => [row.field, {
    value: safeJson(row.value_json), confidence: row.confidence, confirmed: Boolean(row.confirmed),
    factEventId: row.fact_event_id, updatedAt: row.updated_at,
  }]));
}

export const commitFact = db.transaction(({ caseId, conversationId = null, field, value, rawAnswer = "", confidence = 1, confirmed = false, source = "system" }) => {
  const previous = statements.currentFact.get(caseId, field);
  const event = {
    id: id("fact"), caseId, conversationId, field, valueJson: JSON.stringify(value), rawAnswer,
    confidence: Math.max(0, Math.min(Number(confidence) || 0, 1)), confirmed: confirmed ? 1 : 0,
    state: "current", supersedesId: previous?.fact_event_id || null, source, at: now(),
  };
  if (previous) statements.supersedeEvent.run(previous.fact_event_id);
  statements.insertFactEvent.run(event);
  statements.upsertFact.run({ caseId, field, factEventId: event.id, valueJson: event.valueJson, confidence: event.confidence, confirmed: event.confirmed, at: event.at });
  return { ...event, value, superseded: previous?.fact_event_id || null };
});

export function addUncertainFact({ caseId, conversationId = null, field, rawAnswer, confidence = 0, source = "system" }) {
  const event = { id: id("fact"), caseId, conversationId, field, valueJson: null, rawAnswer, confidence, confirmed: 0, state: "uncertain", supersedesId: null, source, at: now() };
  statements.insertFactEvent.run(event);
  return event;
}

export function updateCaseProgress({ caseId, status = "collecting", currentQuestionId = null, completeness = 0 }) {
  statements.updateCaseProgress.run({ id: caseId, status, currentQuestionId, completeness, updatedAt: now() });
  return getCaseRecord(caseId);
}

export function saveResolution(caseId, resolution) {
  statements.setResolution.run(JSON.stringify(resolution), now(), caseId);
  return getCaseRecord(caseId);
}

export function recordWebhook(provider, externalId, eventType) {
  const result = statements.insertWebhook.run(id("hook"), provider, externalId, eventType, now());
  return result.changes === 1;
}

export function addAudit(caseId, type, payload) {
  statements.insertAudit.run(id("audit"), caseId || null, type, JSON.stringify(payload), now());
}

export function beginNotification({ caseId, channel, kind, recipientMasked = "" }) {
  const at = now();
  const inserted = statements.insertNotification.run({ id: id("notification"), caseId, channel, kind, recipientMasked, at });
  if (inserted.changes === 1) return true;
  return statements.failedNotification.run({ caseId, channel, kind, at }).changes === 1;
}

export function finishNotification({ caseId, channel, kind, status, providerMessageId = null, error = null }) {
  statements.finishNotification.run({ caseId, channel, kind, status, providerMessageId, error, at: now() });
}

export function updateNotificationByProviderId({ providerMessageId, status, error = null }) {
  const notification = statements.notificationByProviderId.get(providerMessageId);
  if (!notification) return null;
  statements.updateNotificationProviderStatus.run({ providerMessageId, status, error, at: now() });
  return { ...notification, status, error };
}

export function hydrateCase(caseIdOrCode) {
  const record = getCaseRecord(caseIdOrCode);
  if (!record) return null;
  return {
    ...record,
    facts: getFacts(record.id),
    conversations: statements.conversationsForCase.all(record.id).map(row => ({
      id: row.id, channel: row.channel, externalId: row.external_id, status: row.status,
      language: row.language, startedAt: row.started_at, endedAt: row.ended_at,
    })),
    messages: statements.messagesForCase.all(record.id).map(row => ({
      id: row.id, conversationId: row.conversation_id, role: row.role, content: row.content,
      questionId: row.question_id, createdAt: row.created_at,
    })),
    factHistory: statements.factHistory.all(record.id).map(row => ({
      id: row.id, field: row.field, value: safeJson(row.value_json), rawAnswer: row.raw_answer,
      confidence: row.confidence, confirmed: Boolean(row.confirmed), state: row.state,
      supersedesId: row.supersedes_id, source: row.source, createdAt: row.created_at,
    })),
    notifications: statements.notificationsForCase.all(record.id).map(row => ({
      id: row.id, channel: row.channel, kind: row.kind, recipientMasked: row.recipient_masked,
      status: row.status, providerMessageId: row.provider_message_id, error: row.error,
      createdAt: row.created_at, updatedAt: row.updated_at,
    })),
  };
}
