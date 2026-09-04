const login = document.querySelector("#admin-login");
const workspace = document.querySelector("#admin-workspace");
const caseFeed = document.querySelector("#case-feed");
const detail = document.querySelector("#case-detail");
const eventFeed = document.querySelector("#event-feed");
const stats = document.querySelector("#admin-stats");
let cases = [];
let selectedCaseId = null;
let stream = null;
let authEpoch = 0;

const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const factLabel = field => field.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
const displayValue = value => typeof value === "boolean" ? (value ? "Yes" : "No") : String(value ?? "Not known").replaceAll("_", " ");
const time = value => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function showAuthenticated(authenticated) {
  login.hidden = authenticated;
  workspace.hidden = !authenticated;
}

function channels(record) {
  return [...new Set(record.conversations.map(item => item.channel))];
}

function renderStats() {
  const active = cases.filter(record => record.conversations.some(item => item.channel === "voice" && ["in-progress", "ringing"].includes(item.status))).length;
  const review = cases.filter(record => record.resolution?.requiresHumanReview).length;
  const resolved = cases.filter(record => record.status === "guidance_prepared").length;
  stats.innerHTML = `
    <article><span>Cases</span><strong>${cases.length}</strong></article>
    <article><span>Connected now</span><strong>${active}</strong></article>
    <article><span>Guidance ready</span><strong>${resolved}</strong></article>
    <article><span>Human review</span><strong>${review}</strong></article>`;
}

function renderCases() {
  renderStats();
  if (!cases.length) {
    caseFeed.innerHTML = '<div class="empty-list">No cases yet. Start a website, phone or WhatsApp conversation.</div>';
    return;
  }
  caseFeed.innerHTML = cases.map(record => {
    const name = record.facts.pensioner_name?.value || "Unnamed pensioner";
    const issue = record.facts.issue_type?.value || "Collecting the problem";
    return `<button class="case-feed-item ${record.id === selectedCaseId ? "selected" : ""}" data-case-id="${escapeHtml(record.id)}">
      <span class="case-feed-top"><strong>${escapeHtml(record.publicCode)}</strong><small>${escapeHtml(time(record.updatedAt))}</small></span>
      <span class="case-feed-name">${escapeHtml(name)}</span>
      <span class="case-feed-bottom"><span>${channels(record).map(channel => `<i>${escapeHtml(channel)}</i>`).join("") || "web"}</span><em>${escapeHtml(displayValue(issue))}</em></span>
      <span class="case-progress"><i style="width:${record.completeness}%"></i></span>
    </button>`;
  }).join("");
  caseFeed.querySelectorAll("[data-case-id]").forEach(button => button.addEventListener("click", () => selectCase(button.dataset.caseId)));
}

function renderDetail(record) {
  const currentFacts = Object.entries(record.facts);
  const corrected = record.factHistory.filter(item => item.state === "superseded").length;
  detail.innerHTML = `
    <header class="case-detail-header">
      <div><span class="eyebrow">${escapeHtml(record.publicCode)}</span><h1>${escapeHtml(record.facts.pensioner_name?.value || "Pension case")}</h1></div>
      <span class="status-badge ${record.status === "guidance_prepared" ? "success" : ""}">${escapeHtml(displayValue(record.status))}</span>
    </header>
    <div class="case-meta"><span>${record.completeness}% complete</span><span>Version ${record.version}</span><span>${corrected} correction${corrected === 1 ? "" : "s"}</span></div>
    <div class="case-detail-grid">
      <article class="admin-card"><h2>Confirmed understanding</h2>
        <div class="facts-grid">${currentFacts.length ? currentFacts.map(([field, fact]) => `<div><small>${escapeHtml(factLabel(field))}</small><strong>${escapeHtml(displayValue(fact.value))}</strong><span>${Math.round(fact.confidence * 100)}% · ${fact.confirmed ? "confirmed" : "interpreted"}</span></div>`).join("") : '<p class="muted">Facts will appear as answers are interpreted.</p>'}</div>
      </article>
      <article class="admin-card"><h2>Live transcript</h2>
        <div class="admin-transcript">${record.messages.length ? record.messages.slice(-20).map(message => `<div class="admin-message ${escapeHtml(message.role)}"><small>${escapeHtml(message.role)} · ${escapeHtml(time(message.createdAt))}</small><p>${escapeHtml(message.content)}</p></div>`).join("") : '<p class="muted">No final transcript turns received yet.</p>'}</div>
      </article>
    </div>
    ${record.resolution ? `<article class="admin-card resolution-card"><div><span class="eyebrow">Resolution plan</span><h2>${escapeHtml(record.resolution.likelyCause)}</h2><p>Confidence: ${escapeHtml(record.resolution.confidence)} · ${record.resolution.requiresHumanReview ? "Human review required" : "Deterministic route available"}</p></div><ol>${record.resolution.nextSteps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol><div class="authority"><strong>${escapeHtml(record.resolution.primaryAuthority)}</strong><span>Escalation: ${escapeHtml(record.resolution.escalationAuthority)}</span></div></article>` : ""}
    <details class="admin-card"><summary>Fact correction history</summary><div class="history-list">${record.factHistory.map(item => `<div><span>${escapeHtml(factLabel(item.field))}</span><strong>${escapeHtml(displayValue(item.value))}</strong><em>${escapeHtml(item.state)}</em><small>${escapeHtml(item.rawAnswer || "")}</small></div>`).join("") || '<p class="muted">No fact events yet.</p>'}</div></details>`;
}

async function selectCase(caseId) {
  selectedCaseId = caseId;
  renderCases();
  renderDetail(await api(`/api/admin/cases/${encodeURIComponent(caseId)}`));
}

async function loadCases() {
  cases = await api("/api/admin/cases");
  renderCases();
  if (selectedCaseId) {
    const record = cases.find(item => item.id === selectedCaseId);
    if (record) renderDetail(record);
  } else if (cases[0]) selectCase(cases[0].id);
}

function addEvent(event) {
  const payload = event.payload || {};
  const row = document.createElement("article");
  row.className = `event-row ${event.type.includes("error") ? "error" : ""}`;
  const primary = payload.rawAnswer || payload.transcript || payload.status || payload.currentQuestionId || payload.publicCode || "Update received";
  row.innerHTML = `<span></span><div><strong>${escapeHtml(event.type.replaceAll(".", " "))}</strong><p>${escapeHtml(primary)}</p><small>${escapeHtml(time(event.at))}</small></div>`;
  eventFeed.prepend(row);
  while (eventFeed.children.length > 80) eventFeed.lastElementChild.remove();
}

function connectStream() {
  stream?.close();
  stream = new EventSource("/api/admin/events");
  const types = ["case.created", "case.connected", "conversation.connected", "answer.received", "answer.interpreting", "case.updated", "resolution.prepared", "transcript.final", "voice.status", "voice.ended", "whatsapp.outbound.preview", "integration.error"];
  for (const type of types) stream.addEventListener(type, message => {
    addEvent(JSON.parse(message.data));
    window.clearTimeout(connectStream.refresh);
    connectStream.refresh = window.setTimeout(loadCases, 250);
  });
}

document.querySelector("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  authEpoch += 1;
  const form = new FormData(event.currentTarget);
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    document.querySelector("#login-error").textContent = "";
    showAuthenticated(true);
    await loadCases();
    connectStream();
  } catch (error) { document.querySelector("#login-error").textContent = error.message; }
});

document.querySelector("#logout").addEventListener("click", async () => {
  authEpoch += 1;
  await api("/api/admin/logout", { method: "POST" });
  stream?.close();
  showAuthenticated(false);
});
document.querySelector("#refresh-cases").addEventListener("click", loadCases);

const bootstrapEpoch = authEpoch;
(async () => {
  const me = await api("/api/admin/me");
  if (authEpoch !== bootstrapEpoch) return;
  showAuthenticated(me.authenticated);
  if (me.authenticated) { await loadCases(); connectStream(); }
})().catch(() => showAuthenticated(false));
