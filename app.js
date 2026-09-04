const STORAGE_KEY = "pension-restart-demo-v1";

const initialState = {
  callComplete: false,
  summaryConfirmed: false,
  documents: { ppo: false, statement: false, notice: false },
  documentsSent: false,
  reviewShown: false,
  routeSelected: "",
  pramaanRecorded: false,
  pensionProtected: false,
  formStep: 1,
  formAnswers: {},
};

let state = loadState();
let callAudio = null;
let callTimings = null;
let callTimingsPromise = null;
let callSyncFrame = null;
let callRenderedCount = 0;
let callAudioEnabled = true;
let callRunning = false;
let runtimeConfig = { providers: {} };
let liveVoice = null;
let liveCallStartedAt = null;
let liveCallTimer = null;
let liveMuted = false;
let webCase = null;
let webCaseLoading = false;

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

const caseData = {
  id: "PR-2608-1042",
  pensioner: "Kamla Devi",
  lastCredit: "November 2025",
  firstMissing: "December 2025",
  certificate: "Not remembered / probably not submitted",
  ppo: "Available",
  pramaan: "Not available",
  language: "Hindi",
};

const callScript = [
  { who: "guide", name: "Pension guide", text: "Namaste. You have reached Pension Restart, an independent pension-guidance service. Please do not share an Aadhaar number, OTP, PIN or bank password. Which language would you prefer?" },
  { who: "caller", name: "Kamla Devi", text: "Hindi." },
  { who: "guide", name: "Pension guide", text: "Theek hai. Aap batayiye, pension ke saath kya dikkat aa rahi hai?" },
  { who: "caller", name: "Kamla Devi", text: "December se meri pension nahi aayi. Bank mein poocha tha, par mujhe samajh nahi aaya ki kya karna hai." },
  { who: "guide", name: "Pension guide", text: "Kya November 2025 ke baad pension account mein koi pension credit hua?" },
  { who: "caller", name: "Kamla Devi", text: "Nahi." },
  { who: "guide", name: "Pension guide", text: "Kya aapne 2025 mein life certificate ya Jeevan Pramaan jama kiya tha?" },
  { who: "caller", name: "Kamla Devi", text: "Mujhe yaad nahi. Shayad nahi kiya." },
  { who: "guide", name: "Pension guide", text: "Aapki baat se lagta hai ki life certificate miss hua ho sakta hai. Yeh final decision nahi hai. PPO ka pehla panna aur redacted pension statement madad kar sakte hain. Aadhaar ki photo upload mat kijiye." },
  { who: "caller", name: "Kamla Devi", text: "Mujhe ab kya karna hoga?" },
  { who: "guide", name: "Pension guide", text: "Call ke baad aapko ek written summary, document checklist aur suitable official routes milenge. Demo reference PR-2608-1042 taiyaar hai." },
];

function loadState() {
  try {
    return { ...initialState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setState(patch) {
  state = { ...state, ...patch };
  saveState();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function navigate(route) {
  window.location.hash = route;
}

function pageHero(eyebrow, title, copy, extra = "") {
  return `
    <section class="page-hero">
      <div class="container">
        <div>
          <div class="breadcrumb"><a href="#/">Home</a> / ${eyebrow}</div>
          <span class="eyebrow">${eyebrow}</span>
          <h1>${title}</h1>
          <p class="lead">${copy}</p>
        </div>
        ${extra}
      </div>
    </section>`;
}

function homeView() {
  const phone = runtimeConfig.phoneNumber || "Number being connected";
  const phoneHref = runtimeConfig.phoneNumber ? `tel:${runtimeConfig.phoneNumber.replace(/[^+\d]/g, "")}` : "#/call";
  return `
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="eyebrow">Live AI voice guidance</span>
          <h1>When your pension stops, <em>one call</em> should tell you what to do next.</h1>
          <p class="lead">Explain the problem in your own words. Leave with a clear summary, a safe document checklist and a practical next step—without first understanding every portal.</p>
          <p class="hero-number-label">Call for pension guidance</p>
          <a class="hero-number" href="${phoneHref}" aria-label="Call Pension Restart">${escapeAttr(phone)}</a>
          <p class="hero-note">Independent AI guidance — not a government helpline. International calling charges may apply.</p>
          <div class="hero-actions">
            <a class="button button-primary" href="#/call">☎ Talk to the voice guide</a>
            <a class="button button-quiet" href="#/online">Continue online instead</a>
          </div>
          <div class="hero-safety"><span class="shield-dot"></span>Never share an Aadhaar number, OTP, PIN, CVV, full account number or bank password.</div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <picture>
            <source srcset="assets/hero-anchor.webp" type="image/webp" />
            <img src="assets/hero-anchor.png" alt="" width="1536" height="1024" />
          </picture>
        </div>
      </div>
    </section>

    <section class="section section-tight">
      <div class="value-strip">
        <div class="value-item"><span class="icon-box">1</span><div><h3>Speak naturally</h3><p>Describe what happened in Hindi or English.</p></div></div>
        <div class="value-item"><span class="icon-box teal">2</span><div><h3>Understand the problem</h3><p>Review one plain-language pension summary.</p></div></div>
        <div class="value-item"><span class="icon-box gold">3</span><div><h3>Know the next step</h3><p>Receive the checklist and available official routes.</p></div></div>
      </div>
    </section>

    <section class="section surface-white">
      <div class="container">
        <div class="section-heading centered">
          <span class="eyebrow">Start with what happened</span>
          <h2>You should not need to know the right department before asking for help.</h2>
          <p class="lead">Choose the sentence that sounds closest to your situation.</p>
        </div>
        <div class="card-grid">
          <article class="service-card"><span class="service-number">01</span><h3>My pension has stopped</h3><p>Organise the dates, likely causes and references needed for recovery.</p><a class="text-link" href="#/call">Get restart guidance</a></article>
          <article class="service-card"><span class="service-number">02</span><h3>I need a life certificate</h3><p>Compare mobile, bank, post office, centre and doorstep options.</p><a class="text-link" href="#/options">Compare options</a></article>
          <article class="service-card"><span class="service-number">03</span><h3>I am helping someone</h3><p>Prepare documents and deadlines while keeping the pensioner in control.</p><a class="text-link" href="#/family">Open family assistance</a></article>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container story-grid">
        <div class="story-visual" aria-hidden="true">
          <div class="calendar-art">
            <div class="calendar-top"><span>Pension record</span><span>2025</span></div>
            <div class="calendar-month">December</div>
            <div class="missed-payment">Expected pension credit not received</div>
          </div>
        </div>
        <div>
          <span class="eyebrow">The story behind the build</span>
          <h2>Pensions are not just payments.</h2>
          <p class="story-quote">“Her pension stopped in December. We only discovered the missed life certificate after the payment disappeared.”</p>
          <p class="lead">For many older people, a pension pays for food, medicine, rent and everyday independence. The first failure is often not a missing form. It is not knowing what went wrong.</p>
        </div>
      </div>
    </section>

    <section class="section surface-white">
      <div class="container">
        <div class="section-heading">
          <span class="eyebrow">Understand the requirement</span>
          <h2>What is a life certificate?</h2>
          <p class="lead">A life certificate confirms that a pensioner is alive and remains eligible for continued pension payments. Jeevan Pramaan is one Aadhaar-based digital route—not the only possible route.</p>
        </div>
        <div class="process-grid">
          <article class="process-card"><h3>Prepare the references</h3><p>Keep the PPO, pension account details and pension authority information ready.</p></article>
          <article class="process-card"><h3>Choose an eligible route</h3><p>Use mobile, an assisted centre, the pension agency or available doorstep help.</p></article>
          <article class="process-card"><h3>Complete proof of life</h3><p>The pensioner completes the authentication or declaration required by that route.</p></article>
          <article class="process-card"><h3>Keep the acknowledgement</h3><p>Save the Pramaan ID or receipt until acceptance and pension credit are confirmed.</p></article>
        </div>
        <div class="actions-row"><a class="button button-outline" href="#/options">See all submission routes</a><a class="button button-quiet" href="#/help">Read plain-language guides</a></div>
      </div>
    </section>

    <section class="section surface-terracotta">
      <div class="container split-grid">
        <div>
          <span class="eyebrow eyebrow-light">If pension already stopped</span>
          <h2>Do four things before starting another complaint.</h2>
          <p class="lead lead-light">Confirm the last credit, find the life-certificate evidence, identify the pension payer and keep one complete recovery record.</p>
          <a class="button button-secondary" href="#/online">Start a recovery record</a>
        </div>
        <div class="info-card">
          <ol class="check-list">
            <li>Note the last pension-credit month.</li>
            <li>Look for a Pramaan ID, receipt or rejection message.</li>
            <li>Check the PPO or statement for the pension payer.</li>
            <li>Carry the same dates and references into every follow-up.</li>
          </ol>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-heading centered"><span class="eyebrow">Bring what helps</span><h2>Never share what should remain private.</h2></div>
        <div class="card-grid two">
          <article class="info-card"><span class="icon-box teal">✓</span><h3>Helpful references</h3><ul class="check-list"><li>PPO or pension reference</li><li>Last pension-credit month</li><li>Pramaan ID or acknowledgement</li><li>Redacted pension-credit record</li></ul></article>
          <article class="info-card"><span class="icon-box">!</span><h3>Never requested here</h3><ul class="check-list"><li>Real Aadhaar or PAN</li><li>OTP, PIN, CVV or password</li><li>Payment-card details</li><li>Unredacted bank statements</li></ul></article>
        </div>
      </div>
    </section>

    <section class="section section-tight">
      <div class="container banner">
        <div><span class="eyebrow eyebrow-light">One clear beginning</span><h2>A pension problem should not begin with finding the right portal.</h2><p>Start with one guided conversation and leave with a next step your family can understand.</p></div>
        <a class="button button-primary" href="#/call">Talk to the guide</a>
      </div>
    </section>`;
}

function callView() {
  const phone = runtimeConfig.phoneNumber || "Phone number will appear after Vapi is configured";
  const phoneHref = runtimeConfig.phoneNumber ? `tel:${runtimeConfig.phoneNumber.replace(/[^+\d]/g, "")}` : "";
  const browserReady = runtimeConfig.providers?.vapiWebCall;
  return `${pageHero("Call for guidance", "Speak first. Sort out the forms later.", "Call the live helpline or speak through this browser. The AI asks one question at a time and creates a continuing Pension Restart case.")}
    <section class="section section-tight">
      <div class="container">
        <div class="live-call-options">
          <article class="summary-card call-option"><span class="eyebrow">Call from any phone</span><h2>${escapeAttr(phone)}</h2><p>Your caller number can reconnect you to the same case. A short case ID is provided for moving between phone, WhatsApp and web.</p>${phoneHref ? `<a class="button button-primary" href="${phoneHref}">Call the helpline</a>` : '<span class="status-badge neutral">Awaiting Vapi number</span>'}</article>
          <article class="summary-card call-option"><span class="eyebrow">Browser fallback</span><h2>Use your microphone</h2><p>The same Vapi assistant runs here if international calling is unavailable. Your browser will ask for microphone permission.</p><span class="status-badge ${browserReady ? "success" : "neutral"}">${browserReady ? "Ready" : "Awaiting Vapi public key"}</span></article>
        </div>
        <div class="spacer-md"></div>
        <div class="callout danger"><strong>Before you begin</strong><p>This is independent AI guidance, not a government service. Do not say an Aadhaar number, OTP, PIN, password, CVV or full bank-account number. Important details are read back for confirmation.</p></div>
        <div class="spacer-md"></div>
        <div class="phone-shell live-phone" id="phone-shell">
          <div class="phone-top"><span class="connected waiting" id="connection-state">Ready to connect</span><span id="call-duration">00:00</span></div>
          <div class="phone-body">
            <div class="caller-block"><span class="caller-avatar">PR</span><h2>Pension guide</h2><p>English · हिंदी · Hinglish</p></div>
            <div class="transcript-heading"><strong>Live transcript</strong><span id="voice-status">${browserReady ? "Microphone off" : "Provider not configured"}</span></div>
            <div class="transcript" id="transcript" aria-live="polite" aria-label="Call transcript">
              <div class="center" id="call-intro">
                <p class="lead-light">Start a private browser call. Your final transcript turns and interpreted case facts will appear in the live operations panel.</p>
                <button class="button button-primary" id="start-live-call" type="button" ${browserReady ? "" : "disabled"}>${browserReady ? "Start voice conversation" : "Vapi setup required"}</button>
              </div>
            </div>
          </div>
          <div class="phone-controls">
            <button class="round-control" id="toggle-live-mute" type="button" aria-label="Mute microphone" aria-pressed="false" disabled>🎙</button>
            <button class="round-control end" id="end-live-call" type="button" disabled>End call</button>
          </div>
        </div>
      </div>
    </section>`;
}

function summaryView() {
  return `${pageHero("Call summary", "Here is what we understood.", "Review this synthetic summary before continuing. Nothing has been submitted to a government system.", '<span class="status-badge">Guidance only · unconfirmed</span>')}
    <section class="section section-tight">
      <div class="container summary-grid">
        <article class="summary-card">
          <span class="eyebrow">Plain-language summary</span>
          <h2>Kamla Devi's pension has not been credited since December 2025.</h2>
          <p class="lead">She does not remember submitting her annual life certificate in 2025. She has a PPO document but does not currently have a Pramaan ID available.</p>
          <div class="callout"><strong>Likely next step</strong><p>Confirm whether the annual life certificate was missed, then choose an eligible assisted submission route.</p></div>
          <div class="actions-row">
            <button class="button button-primary" id="confirm-summary" type="button">Yes, this is correct</button>
            <button class="button button-quiet" id="edit-summary" type="button">Edit one detail</button>
          </div>
        </article>
        <aside class="summary-card">
          <h2>Extracted details</h2>
          <dl class="detail-list">
            ${detailRow("Pensioner", caseData.pensioner)}
            ${detailRow("Last credit", caseData.lastCredit)}
            ${detailRow("First missing", caseData.firstMissing)}
            ${detailRow("Life certificate", caseData.certificate)}
            ${detailRow("PPO", caseData.ppo)}
            ${detailRow("Pramaan ID", caseData.pramaan)}
            ${detailRow("Language", caseData.language)}
          </dl>
          <p class="tiny muted">This output is loaded from a hardcoded JSON fixture—not produced by speech recognition.</p>
        </aside>
      </div>
    </section>`;
}

function detailRow(label, value) {
  return `<div class="detail-row"><dt>${label}</dt><dd>${value}</dd></div>`;
}

const formSteps = [
  { title: "Who needs help?", question: "Who are you completing this for?", key: "person", options: ["Myself", "Parent or grandparent", "Spouse", "Another person I support"] },
  { title: "What happened?", question: "What best describes the problem?", key: "problem", options: ["Pension did not arrive", "I need to submit a life certificate", "A Digital Life Certificate was rejected", "I do not know"] },
  { title: "Pension details", question: "Who appears to pay the pension?", key: "payer", options: ["EPFO / EPS", "Central government", "State government", "Defence or Railways", "I do not know"] },
  { title: "Life certificate", question: "Was a life certificate submitted for the most recent period?", key: "certificate", options: ["Yes", "No", "I do not remember", "I do not know what this is"] },
  { title: "Documents", question: "Which supporting reference is available?", key: "document", options: ["PPO document", "Pramaan ID or receipt", "Pension-credit statement", "None yet"] },
  { title: "Review", question: "Create a synthetic recovery record?", key: "consent", options: ["Yes, create the demo record", "Go back and review"] },
];

const webQuestionOptions = {
  caller_relation: [["self", "My pension"], ["spouse", "My spouse"], ["child", "My parent"], ["grandchild", "My grandparent"], ["helper", "Someone I help"]],
  issue_type: [["stopped", "Pension stopped"], ["delayed", "Payment delayed"], ["reduced", "Amount reduced"], ["life_certificate_rejected", "Certificate rejected"], ["revision_pending", "Revision pending"], ["unknown", "I am not sure"]],
  scheme_family: [["central_civil", "Central government"], ["defence", "Defence / SPARSH"], ["railways", "Railways"], ["eps_95", "EPFO / EPS-95"], ["nps_ups_apy", "NPS / UPS / APY"], ["state_government", "State government"], ["social_assistance", "Old age / widow / disability"], ["private_annuity", "Insurance annuity"], ["employer_superannuation", "Employer pension"], ["unknown", "I am not sure"]],
  disbursement_channel: [["bank", "Bank"], ["post_office", "Post office"], ["treasury", "Treasury"], ["insurer", "Insurer"], ["employer", "Former employer"], ["unknown", "I am not sure"]],
  life_certificate_status: [["submitted_accepted", "Submitted and accepted"], ["submitted_pending", "Submitted, status unknown"], ["submitted_rejected", "Submitted but rejected"], ["not_submitted", "Not submitted"], ["not_remembered", "I do not remember"]],
  life_certificate_method: [["jeevan_pramaan_mobile", "Mobile / face app"], ["biometric_centre", "Biometric centre / CSC"], ["bank", "Bank"], ["post_office", "Post office"], ["doorstep", "Doorstep service"], ["paper", "Paper certificate"], ["unknown", "I am not sure"]],
  life_certificate_receipt_available: [["true", "Yes"], ["false", "No"]],
  changed_details: [["bank_account", "Bank account"], ["branch", "Bank branch"], ["address", "Address"], ["mobile", "Mobile number"], ["kyc", "KYC"], ["none", "Nothing changed"], ["unknown", "I am not sure"]],
  intake_confirmed: [["true", "Yes, this is correct"], ["false", "One detail is wrong"]],
};

function onlineView() {
  if (!webCase) return `${pageHero("Continue online", "One question at a time.", "The same secure case can continue through web, phone or WhatsApp.")}
    <section class="section section-tight"><div class="form-shell center"><span class="live-loader"></span><h2>Preparing your private case…</h2><p class="muted">No government, Aadhaar or bank system is being contacted.</p></div></section>`;
  if (webCase.complete && webCase.resolution) {
    const plan = webCase.resolution;
    return `${pageHero("Guidance prepared", `Your case ID is ${webCase.publicCode}.`, "Keep this ID to continue through phone, WhatsApp or this browser.", '<span class="status-badge success">Guidance ready</span>')}
      <section class="section section-tight"><div class="container summary-grid"><article class="summary-card"><span class="eyebrow">Likely explanation</span><h2>${escapeAttr(plan.likelyCause)}</h2><p class="muted">Confidence: ${escapeAttr(plan.confidence)} · ${plan.requiresHumanReview ? "Human review recommended" : "Matched to a deterministic guidance route"}</p><ol class="guidance-steps">${plan.nextSteps.map(step => `<li>${escapeAttr(step)}</li>`).join("")}</ol><div class="callout danger"><strong>Guidance, not a government decision</strong><p>${escapeAttr(plan.disclaimer)}</p></div></article><aside class="summary-card"><h2>Where to go</h2><dl class="detail-list">${detailRow("First contact", plan.primaryAuthority)}${detailRow("Escalation", plan.escalationAuthority)}${detailRow("Case ID", webCase.publicCode)}</dl><h3>Helpful documents</h3><ul>${plan.documents.map(item => `<li>${escapeAttr(item)}</li>`).join("")}</ul><a class="button button-outline button-block" href="/admin">View in operations</a></aside></div></section>`;
  }
  const question = webCase.nextQuestion;
  const options = webQuestionOptions[question?.id] || [];
  const correctionOptions = [
    ["pensioner_name", "Pensioner name"], ["issue_type", "What happened"], ["scheme_family", "Pension scheme"],
    ["former_employer", "Former employer"], ["disbursement_channel", "Payment channel"],
    ["disbursing_institution", "Paying institution"], ["last_credit_date", "Last payment"],
    ["pension_amount", "Monthly amount"], ["life_certificate_status", "Life certificate"], ["changed_details", "Changed details"],
  ];
  if (webCase.awaitingCorrection) return `${pageHero("Correct one detail", "Which answer should we change?", "The previous value stays in the audit history and the corrected value becomes current.", `<span class="status-badge neutral">${escapeAttr(webCase.publicCode)}</span>`)}
    <section class="section section-tight"><form class="form-shell" id="web-correction-form"><label for="web-correction-field"><strong>Detail to correct</strong></label><select id="web-correction-field" class="answer-input" required><option value="">Choose one detail</option>${correctionOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select><label for="web-correction-answer"><strong>Correct answer</strong></label><textarea id="web-correction-answer" class="answer-input" rows="4" required placeholder="Enter only the corrected answer…"></textarea><button class="button button-primary" type="submit">Save correction</button><p class="admin-error" id="web-answer-error" role="alert"></p></form></section>`;
  return `${pageHero("Continue online", "One question at a time.", "Your answer is stored in the same case engine used by phone and WhatsApp.", `<span class="status-badge neutral">${escapeAttr(webCase.publicCode)}</span>`)}
    <section class="section section-tight">
      <form class="form-shell" id="live-online-form">
        <div class="web-case-progress"><span style="width:${webCase.completeness || 0}%"></span></div>
        <p class="muted">${webCase.completeness || 0}% complete · Case ${escapeAttr(webCase.publicCode)}</p>
        <div class="question"><h2>${escapeAttr(question?.en || "Your guidance is being prepared")}</h2><p class="muted">${escapeAttr(question?.hi || "")}</p></div>
        ${options.length ? `<div class="choice-grid">${options.map(([value, label]) => `<button class="choice web-answer-option" data-answer="${escapeAttr(value)}" type="button"><span class="choice-dot"></span><span>${escapeAttr(label)}</span></button>`).join("")}</div>` : `<label class="sr-only" for="web-raw-answer">Your answer</label><textarea id="web-raw-answer" class="answer-input" rows="4" required placeholder="Answer in your own words…"></textarea><button class="button button-primary" type="submit">Save and continue</button>`}
        <div class="callout danger compact"><strong>Never enter an OTP, PIN, password, Aadhaar number or complete bank account number.</strong></div>
        <p class="admin-error" id="web-answer-error" role="alert"></p>
      </form>
    </section>`;
}

function documentsView() {
  const attachedCount = Object.values(state.documents).filter(Boolean).length;
  return `${pageHero("Demo documents", "Share only what helps explain the pension record.", "Use the supplied synthetic files. Do not upload real identity or banking documents.", `<span class="status-badge neutral">${attachedCount} of 3 attached</span>`)}
    <section class="section section-tight">
      <div class="container">
        <div class="callout danger"><strong>Do not upload real information.</strong><p>This deterministic prototype attaches bundled synthetic filenames only. It never reads a file from your device.</p></div>
        <div class="spacer-md"></div>
        <div class="upload-grid">
          ${uploadCard("ppo", "PPO first page", "Helps identify the pension reference and likely authority.", "kamla-devi-demo-ppo.pdf", false)}
          ${uploadCard("statement", "Redacted pension record", "Helps establish the last credited month.", "demo-pension-statement-nov-2025.pdf", false)}
          ${uploadCard("notice", "DLC receipt or notice", "Useful only if a Digital Life Certificate was attempted.", "demo-rejection-notice.txt", true)}
        </div>
        <div class="actions-row">
          <button class="button button-primary" id="send-documents" type="button" ${attachedCount >= 2 ? "" : "disabled"}>Send demo documents for review</button>
          <a class="button button-quiet" href="#/case">View case without documents</a>
        </div>
      </div>
    </section>`;
}

function uploadCard(key, title, reason, filename, optional) {
  const attached = state.documents[key];
  return `<article class="upload-card ${attached ? "attached" : ""}">
    <span class="status-badge ${attached ? "success" : "neutral"}">${optional ? "Optional" : "Requested"}</span>
    <h3>${title}</h3><p>${reason}</p>
    ${attached ? `<span class="file-pill">✓ ${filename}<br />Synthetic document</span>` : `<button class="button button-outline attach-doc" data-document="${key}" type="button">Attach synthetic file</button>`}
  </article>`;
}

function receivedView() {
  return `${pageHero("Documents received", "We received two synthetic demonstration files.", "They are attached to demo reference PR-2608-1042. Nothing has been sent outside this browser.", '<span class="status-badge success">✓ Received</span>')}
    <section class="section section-tight">
      <div class="narrow">
        <article class="summary-card center">
          <span class="icon-box teal" style="margin:0 auto 22px">✓</span>
          <h2>Thank you. The next action is visible.</h2>
          <p class="lead">In the proposed service, a pension-support reviewer would check the details and contact Kamla Devi with the appropriate official route.</p>
          <div class="callout danger"><strong>Documents received does not mean a life certificate was accepted or pension resumed.</strong></div>
          <div class="actions-row" style="justify-content:center"><a class="button button-primary" href="#/case">View case summary</a><a class="button button-quiet" href="#/options">Explore official routes</a></div>
        </article>
      </div>
    </section>`;
}

function caseView() {
  const docsDone = state.documentsSent;
  const reviewed = state.reviewShown;
  const protectedState = state.pensionProtected;
  return `${pageHero("Case record", `${caseData.pensioner} · ${caseData.id}`, "One synthetic record containing the dates, documents, guidance and next action.", `<span class="status-badge ${protectedState ? "success" : ""}">${protectedState ? "Pension protected" : reviewed ? "Guidance prepared" : docsDone ? "Documents received" : "Awaiting documents"}</span>`)}
    <section class="section section-tight">
      <div class="container case-layout">
        <article class="summary-card">
          <h2>Case timeline</h2>
          <div class="timeline">
            ${timelineItem("Guidance call completed", "27 August 2026 · 10:12 AM", true)}
            ${timelineItem("Problem summary reviewed", "The likely cause remains unconfirmed.", true)}
            ${timelineItem("Two demo documents received", docsDone ? "27 August 2026 · 10:17 AM" : "Not completed", docsDone)}
            ${timelineItem("Document review simulated", reviewed ? "Prototype control used" : "Not yet shown", reviewed)}
            ${timelineItem("Assisted route recommended", reviewed ? "Bank, post office, CSC or doorstep route" : "Waiting for review", reviewed, reviewed)}
            ${timelineItem("Pension credit confirmed", protectedState ? "Synthetic outcome recorded" : "Not confirmed", protectedState, protectedState)}
          </div>
          ${!docsDone ? '<a class="button button-primary" href="#/documents">Attach demo documents</a>' : !reviewed ? '<button class="button button-primary" id="show-review" type="button">Demo control: show review response</button>' : !protectedState ? '<button class="button button-primary" id="protect-pension" type="button">Demo control: show successful outcome</button>' : '<div class="callout success"><strong>Pension protected until November 2027</strong><p>This is a simulated future outcome—not a government or bank status.</p></div>'}
        </article>
        <aside>
          <article class="summary-card">
            <h2>Evidence</h2>
            <dl class="detail-list">
              ${detailRow("PPO document", state.documents.ppo ? "Received" : "Not attached")}
              ${detailRow("Credit record", state.documents.statement ? "Received" : "Not attached")}
              ${detailRow("Pramaan ID", state.pramaanRecorded ? "DEMO-3105-8421" : "Not available")}
              ${detailRow("DLC accepted", protectedState ? "Mock accepted" : "Not confirmed")}
              ${detailRow("Pension credit", protectedState ? "User-confirmed demo" : "Not confirmed")}
            </dl>
          </article>
          <div class="spacer-sm"></div>
          <article class="summary-card">
            <h2>Case actions</h2>
            <a class="button button-outline button-block" href="#/options">Compare official routes</a>
            <button class="button button-quiet button-block" id="record-pramaan" type="button">Record demo Pramaan ID</button>
            <button class="button button-quiet button-block" id="download-record" type="button">Download case JSON</button>
            <button class="button button-quiet button-block" onclick="window.print()" type="button">Print recovery record</button>
          </article>
        </aside>
      </div>
    </section>`;
}

function timelineItem(title, copy, done = false, current = false) {
  return `<div class="timeline-item ${done ? "done" : ""} ${current ? "current" : ""}"><h3>${title}</h3><p>${copy}</p></div>`;
}

function optionsView() {
  const routes = [
    ["Mobile face authentication", "At home", "A compatible phone, Jeevan Pramaan and AadhaarFaceRD. A trusted operator may assist; the pensioner completes authentication."],
    ["Fingerprint or iris", "Device required", "The Jeevan Pramaan application with a supported registered biometric device and its RD Service."],
    ["Bank, post office or treasury", "In person", "An assisted route through the pension-disbursing agency or another participating location."],
    ["Citizen Service Centre", "Operator assisted", "A centre operator helps enter pension information and complete the supported process."],
    ["Doorstep assistance", "Where available", "A participating post or bank representative assists at the pensioner's residence."],
    ["Conventional certificate", "Alternative route", "A prescribed certificate through an authorised official or pension-disbursing agency where applicable."],
  ];
  return `${pageHero("Life certificate help", "You do not have to solve it in only one way.", "Compare the route, required assistance and device needs before asking an elderly pensioner to travel.")}
    <section class="section section-tight">
      <div class="container">
        <div class="card-grid">
          ${routes.map(([title, tag, copy]) => `<article class="route-card"><span class="tag">${tag}</span><h3>${title}</h3><p>${copy}</p><button class="text-link select-route" data-route-name="${escapeAttr(title)}" type="button">Select for demo</button></article>`).join("")}
        </div>
        <div class="spacer-md"></div>
        <div class="callout"><strong>Availability depends on the pension category, authority, bank and location.</strong><p>Pension Restart provides guidance. The relevant authority makes the final decision.</p></div>
      </div>
    </section>`;
}

function familyView() {
  return `${pageHero("Family assistance", "Help without taking control away.", "Keep deadlines, documents, references and next actions together—with the pensioner's permission.", '<span class="status-badge neutral">Synthetic household</span>')}
    <section class="section section-tight">
      <div class="container">
        <div class="dashboard-header"><div><span class="eyebrow">Good morning, Arun</span><h2>Two people supported</h2></div><a class="button button-primary" href="#/online">Add demo record</a></div>
        <div class="stats-grid"><div class="stat"><strong>2</strong><span>People supported</span></div><div class="stat"><strong>1</strong><span>Action required</span></div><div class="stat"><strong>1</strong><span>Pension protected</span></div><div class="stat"><strong>${Object.values(state.documents).filter(Boolean).length}</strong><span>Demo files attached</span></div></div>
        <div class="card-grid two">
          <article class="dashboard-card person-card"><span class="person-avatar">KD</span><div><span class="status-badge">Pension interrupted</span><h3>Kamla Devi</h3><p>Current action: ${state.reviewShown ? "Choose assisted life-certificate route" : "Attach and review demo documents"}</p></div><a class="button button-outline" href="#/case">Open case</a></article>
          <article class="dashboard-card person-card"><span class="person-avatar">ML</span><div><span class="status-badge success">Pension protected</span><h3>Mohan Lal</h3><p>Life certificate accepted for the current period. Next expected action: October 2027.</p></div><button class="button button-quiet" type="button" data-toast="Protected record is ready.">View record</button></article>
        </div>
        <div class="spacer-md"></div>
        <div class="callout"><strong>The pensioner remains in control.</strong><p>A helper can prepare information and arrange assistance, but official authentication and personal declarations stay with the pensioner.</p></div>
      </div>
    </section>`;
}

function statusView() {
  return `${pageHero("Continue a case", "One reference. One understandable result.", "Enter the private case code given to you by phone, WhatsApp or this website.")}
    <section class="section section-tight">
      <div class="form-shell">
        <label for="status-id"><strong>Pension Restart case code</strong></label>
        <input id="status-id" placeholder="PR-XXXX-XXXXXX" autocomplete="off" style="width:100%;margin:12px 0 18px;padding:16px;border:2px solid var(--line);border-radius:14px" />
        <button class="button button-primary" id="check-status" type="button">Connect this case</button>
        <div id="status-result"></div>
      </div>
    </section>`;
}

function helpView() {
  const faqs = [
    ["Can Pension Restart issue my life certificate?", "No. It explains available routes and helps you prepare. The official process must be completed through an eligible authority, bank, post office, centre, mobile application or available doorstep channel."],
    ["Is the displayed phone number active?", runtimeConfig.providers?.vapiPhone ? "Yes. It is the Vapi number connected to the live Pension Restart voice assistant. It is a US number, so international charges may apply." : "Not yet. The number will appear as soon as the Vapi telephone setup is connected. You can use the online intake now."],
    ["Is the voice assistant using AI?", "Yes. Vapi handles the live conversation, while a constrained interpretation step proposes facts from each answer. Server-side validation and deterministic rules—not the voice model—control case updates and final guidance."],
    ["Are my documents sent anywhere?", "No. The prototype attaches only supplied synthetic filenames and does not read or transmit a file from your device."],
    ["Does documents received mean pension will restart?", "No. It only means the demonstration files were attached. The authority must accept the life certificate and the paying institution must credit pension."],
    ["Can a family member complete everything?", "A trusted person can prepare information and help operate eligible tools, but the pensioner must complete required authentication or personal declarations."],
    ["What is a Pramaan ID?", "It is the unique reference issued when a Jeevan Pramaan Digital Life Certificate is generated. Keep it until acceptance and pension credit are clear."],
    ["What should I never share on a call?", "Never share an OTP, UPI or ATM PIN, CVV, remote-access code or bank password."],
  ];
  return `${pageHero("Pension help centre", "Pension help, written in plain language.", "Understand the references, submission choices and safety boundaries before taking the next step.")}
    <section class="section section-tight"><div class="narrow faq-list">${faqs.map(([q,a]) => `<article class="faq-item"><button class="faq-question" type="button" aria-expanded="false"><span>${q}</span><span>+</span></button><div class="faq-answer"><p>${a}</p></div></article>`).join("")}</div></section>`;
}

function aboutView() {
  return `${pageHero("About Pension Restart", "Clear about what works. Clear about its limits.", "Pension Restart reorganises the journey around the citizen's real sentence: “My pension stopped.”")}
    <section class="section section-tight">
      <div class="container disclosure-grid">
        <article class="disclosure-card works"><h3>Working now</h3><ul><li>Live phone and browser voice agent</li><li>Hindi, English and Hinglish intake</li><li>Meta WhatsApp guided flow</li><li>Cross-channel case continuity</li><li>Online one-question form</li><li>Deterministic guidance engine</li><li>Live operations dashboard</li><li>Correction and audit history</li></ul></article>
        <article class="disclosure-card mocked"><h3>Demonstration only</h3><ul><li>Document attachment and review states</li><li>Family dashboard examples</li><li>Government and bank connections</li><li>Official case submission</li><li>Pension resumption</li></ul></article>
        <article class="disclosure-card future"><h3>Production safeguards</h3><ul><li>Verified pension research catalogue</li><li>Role-based human review</li><li>Encrypted managed database</li><li>Consent and deletion controls</li><li>Approved authority integrations</li><li>Operational escalation policy</li></ul></article>
      </div>
    </section>
    <section class="section surface-white"><div class="container split-grid"><div><span class="eyebrow">Why it exists</span><h2>A real family experience became a simpler starting point.</h2><p class="lead">An elderly relative's pension stopped because nobody knew that her life certificate was due. Pension Restart asks what changes when the pensioner can begin with one understandable conversation.</p></div><article class="summary-card"><h3>Independence statement</h3><p>Pension Restart is not affiliated with, approved by or operated by Jeevan Pramaan, UIDAI, EPFO, a bank, a post office or a government department.</p><h3>How Codex contributed</h3><p>Codex supported architecture critique, pension-flow modelling, product-state design, copy, implementation, provider adapters, tests and documentation. Product direction and decisions were made by Yashdeep Jha.</p></article></div></section>`;
}

function render() {
  stopCallPlayback();
  const route = (window.location.hash || "#/").slice(1).split("?")[0];
  const views = {
    "/": homeView,
    "/call": callView,
    "/summary": summaryView,
    "/online": onlineView,
    "/documents": documentsView,
    "/received": receivedView,
    "/case": caseView,
    "/options": optionsView,
    "/family": familyView,
    "/status": statusView,
    "/help": helpView,
    "/about": aboutView,
  };
  app.innerHTML = (views[route] || homeView)();
  bindViewEvents(route);
  window.scrollTo({ top: 0, behavior: "auto" });
  app.focus({ preventScroll: true });
}

function bindViewEvents(route) {
  document.querySelectorAll("[data-toast]").forEach(button => button.addEventListener("click", () => showToast(button.dataset.toast)));

  if (route === "/call") {
    initializeLiveCall();
    document.querySelector("#start-live-call")?.addEventListener("click", startLiveCall);
    document.querySelector("#toggle-live-mute")?.addEventListener("click", toggleLiveMute);
    document.querySelector("#end-live-call")?.addEventListener("click", endLiveCall);
  }

  if (route === "/online") {
    initializeWebCase();
    document.querySelector("#live-online-form")?.addEventListener("submit", event => {
      event.preventDefault();
      const answer = document.querySelector("#web-raw-answer")?.value.trim();
      if (answer) submitWebAnswer(answer, false);
    });
    document.querySelectorAll(".web-answer-option").forEach(button => button.addEventListener("click", () => submitWebAnswer(button.dataset.answer, true)));
    document.querySelector("#web-correction-form")?.addEventListener("submit", event => {
      event.preventDefault();
      const correctionField = document.querySelector("#web-correction-field")?.value;
      const answer = document.querySelector("#web-correction-answer")?.value.trim();
      if (correctionField && answer) submitWebAnswer(answer, true, correctionField);
    });
  }

  document.querySelector("#confirm-summary")?.addEventListener("click", () => { setState({ summaryConfirmed: true }); navigate("/documents"); });
  document.querySelector("#edit-summary")?.addEventListener("click", () => navigate("/online"));

  document.querySelectorAll(".choice[data-answer]").forEach(choice => choice.addEventListener("click", () => {
    state.formAnswers[choice.dataset.key] = choice.dataset.answer;
    saveState();
    render();
  }));
  document.querySelector("#form-back")?.addEventListener("click", () => { state.formStep = Math.max(1, state.formStep - 1); saveState(); render(); });
  document.querySelector("#form-next")?.addEventListener("click", () => {
    if (state.formStep < 6) { state.formStep += 1; saveState(); render(); }
    else if (state.formAnswers.consent === "Go back and review") { state.formStep = 5; saveState(); render(); }
    else { setState({ summaryConfirmed: true, formStep: 1 }); navigate("/summary"); }
  });

  document.querySelectorAll(".attach-doc").forEach(button => button.addEventListener("click", () => {
    state.documents[button.dataset.document] = true;
    saveState();
    showToast("Synthetic demo file attached.");
    render();
  }));
  document.querySelector("#send-documents")?.addEventListener("click", () => { setState({ documentsSent: true }); navigate("/received"); });

  document.querySelector("#show-review")?.addEventListener("click", () => { setState({ reviewShown: true }); showToast("Simulated review response is ready."); render(); });
  document.querySelector("#protect-pension")?.addEventListener("click", () => { setState({ pensionProtected: true }); showToast("Synthetic successful outcome recorded."); render(); });
  document.querySelector("#record-pramaan")?.addEventListener("click", () => { setState({ pramaanRecorded: true }); showToast("Demo Pramaan ID recorded."); render(); });
  document.querySelector("#download-record")?.addEventListener("click", downloadRecord);

  document.querySelectorAll(".select-route").forEach(button => button.addEventListener("click", () => {
    setState({ routeSelected: button.dataset.routeName });
    showToast(`${button.dataset.routeName} selected for this demo.`);
    navigate("/case");
  }));

  document.querySelector("#check-status")?.addEventListener("click", async () => {
    const id = document.querySelector("#status-id").value.trim();
    const result = document.querySelector("#status-result");
    if (!id) return;
    result.innerHTML = '<div class="spacer-md muted">Connecting securely…</div>';
    try {
      const response = await fetch("/api/cases/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicCode: id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Case not found");
      webCase = body;
      result.innerHTML = `<div class="spacer-md"></div><div class="callout success"><strong>Case ${escapeAttr(body.publicCode)} connected.</strong><p>${body.complete ? "Its guidance plan is ready." : `${body.completeness || 0}% of the guidance intake is complete.`}</p><a class="text-link" href="#/online">Continue this case</a></div>`;
    } catch (error) {
      result.innerHTML = `<div class="spacer-md"></div><div class="callout danger"><strong>We could not connect that case.</strong><p>${escapeAttr(error.message)}</p></div>`;
    }
  });

  document.querySelectorAll(".faq-question").forEach(button => button.addEventListener("click", () => {
    const item = button.closest(".faq-item");
    item.classList.toggle("open");
    button.setAttribute("aria-expanded", String(item.classList.contains("open")));
    button.querySelector("span:last-child").textContent = item.classList.contains("open") ? "−" : "+";
  }));
}

function initializeLiveCall() {
  if (!runtimeConfig.providers?.vapiWebCall || !window.PensionVoice) return;
  liveVoice = window.PensionVoice.create({
    publicKey: runtimeConfig.vapiPublicKey,
    assistantId: runtimeConfig.vapiAssistantId,
    onEvent: handleLiveVoiceEvent,
  });
}

async function initializeWebCase() {
  if (webCase || webCaseLoading) return;
  webCaseLoading = true;
  try {
    webCase = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "en-hi" }),
    }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not start the case");
      return body;
    });
    if ((window.location.hash || "#/online").startsWith("#/online")) render();
  } catch (error) {
    showToast(error.message);
  } finally {
    webCaseLoading = false;
  }
}

async function submitWebAnswer(rawAnswer, confirmed, correctionField = "") {
  if (!webCase?.nextQuestion) return;
  const form = document.querySelector("#live-online-form");
  form?.classList.add("is-submitting");
  form?.querySelectorAll("button, textarea").forEach(element => { element.disabled = true; });
  try {
    const response = await fetch(`/api/cases/${encodeURIComponent(webCase.caseId)}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: webCase.nextQuestion.id,
        questionText: webCase.nextQuestion.en,
        rawAnswer,
        caseVersion: webCase.caseVersion,
        confirmed,
        correction: Boolean(correctionField),
        correctionField,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The answer could not be saved");
    webCase = { ...webCase, ...result, resolution: result.resolution || null };
    if (result.clarification) showToast("One detail needs clarification.");
    render();
  } catch (error) {
    const errorElement = document.querySelector("#web-answer-error");
    if (errorElement) errorElement.textContent = error.message;
    form?.classList.remove("is-submitting");
    form?.querySelectorAll("button, textarea").forEach(element => { element.disabled = false; });
  }
}

async function startLiveCall() {
  const button = document.querySelector("#start-live-call");
  if (!liveVoice || !button) return;
  button.disabled = true;
  button.textContent = "Connecting…";
  setLiveCallStatus("Connecting", "Requesting microphone access…", false);
  try {
    await liveVoice.start();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Try again";
    setLiveCallStatus("Connection failed", "Check microphone permission and try again.", false);
    showToast(error?.message || "The browser call could not start.");
  }
}

function handleLiveVoiceEvent(type, payload) {
  if (type === "call-start") {
    liveCallStartedAt = Date.now();
    liveCallTimer = window.setInterval(updateLiveDuration, 1000);
    document.querySelector("#call-intro")?.remove();
    document.querySelector("#toggle-live-mute").disabled = false;
    document.querySelector("#end-live-call").disabled = false;
    setLiveCallStatus("Connected", "Listening for your answer", true);
    return;
  }
  if (type === "call-end") {
    completeLiveCall();
    return;
  }
  if (type === "speech-start") {
    setLiveCallStatus("Connected", "Pension guide is speaking…", true);
    return;
  }
  if (type === "speech-end") {
    setLiveCallStatus("Connected", "Listening for your answer", true);
    return;
  }
  if (type === "message" && payload?.type === "transcript") {
    renderLiveTranscript(payload);
    return;
  }
  if (type === "error") {
    setLiveCallStatus("Call problem", "The connection reported an error.", false);
    showToast(payload?.message || payload?.error?.message || "Voice connection error");
  }
}

function setLiveCallStatus(connection, detail, connected) {
  const stateElement = document.querySelector("#connection-state");
  const detailElement = document.querySelector("#voice-status");
  if (stateElement) {
    stateElement.textContent = connection;
    stateElement.classList.toggle("waiting", !connected);
  }
  if (detailElement) detailElement.textContent = detail;
}

function renderLiveTranscript(message) {
  const transcript = document.querySelector("#transcript");
  if (!transcript || !message.transcript) return;
  const role = message.role === "assistant" ? "guide" : "caller";
  const name = role === "guide" ? "Pension guide" : "You";
  const partial = message.transcriptType === "partial";
  let bubble = transcript.querySelector(`.speech[data-live-role="${role}"][data-partial="true"]`);
  if (!bubble) {
    transcript.insertAdjacentHTML("beforeend", `<div class="speech ${role}" data-live-role="${role}" data-partial="${partial}"><small><span>${name}</span><span class="speech-state">${partial ? "Listening…" : "Transcript"}</span></small><span class="speech-copy"></span></div>`);
    bubble = transcript.lastElementChild;
  }
  bubble.querySelector(".speech-copy").textContent = message.transcript;
  bubble.dataset.partial = String(partial);
  bubble.querySelector(".speech-state").textContent = partial ? "Listening…" : "Transcript";
  transcript.scrollTop = transcript.scrollHeight;
}

function updateLiveDuration() {
  const duration = document.querySelector("#call-duration");
  if (duration && liveCallStartedAt) duration.textContent = formatDuration(Math.floor((Date.now() - liveCallStartedAt) / 1000));
}

function toggleLiveMute() {
  if (!liveVoice) return;
  liveMuted = !liveMuted;
  liveVoice.setMuted(liveMuted);
  const button = document.querySelector("#toggle-live-mute");
  if (button) {
    button.textContent = liveMuted ? "🔇" : "🎙";
    button.setAttribute("aria-pressed", String(liveMuted));
    button.setAttribute("aria-label", liveMuted ? "Unmute microphone" : "Mute microphone");
  }
  setLiveCallStatus("Connected", liveMuted ? "Microphone muted" : "Listening for your answer", true);
}

function endLiveCall() {
  liveVoice?.stop();
  completeLiveCall();
}

function completeLiveCall() {
  window.clearInterval(liveCallTimer);
  liveCallTimer = null;
  setState({ callComplete: true });
  setLiveCallStatus("Call ended", "Your case remains available across channels", false);
  const mute = document.querySelector("#toggle-live-mute");
  const end = document.querySelector("#end-live-call");
  if (mute) mute.disabled = true;
  if (end) end.disabled = true;
  const transcript = document.querySelector("#transcript");
  if (transcript && !transcript.querySelector(".call-complete-actions")) transcript.insertAdjacentHTML("beforeend", '<div class="center spacer-md call-complete-actions"><a class="button button-primary" href="#/status">Continue with a case ID</a><a class="button button-quiet" href="/admin">Open live operations</a></div>');
}

function initializeRecordedCall() {
  callAudio = document.querySelector("#call-audio");
  if (!callAudio) return;
  callAudio.muted = !callAudioEnabled;
  callAudio.addEventListener("ended", () => finishCall(false));
  callAudio.addEventListener("error", () => setCallLoadError("The recorded call could not be loaded."));

  loadCallTimings()
    .then(data => {
      if (!document.querySelector("#call-audio")) return;
      callTimings = data;
      const start = document.querySelector("#start-call");
      const control = document.querySelector("#toggle-voice");
      if (start) {
        start.disabled = false;
        start.textContent = "Start recorded call";
      }
      if (control) control.disabled = false;
      updateCallAudioControl();
      const status = document.querySelector("#voice-status");
      if (status) status.textContent = `Recorded dialogue ready · ${formatDuration(Math.round(data.duration))}`;
    })
    .catch(error => setCallLoadError(error.message));
}

function loadCallTimings() {
  if (callTimingsPromise) return callTimingsPromise;
  callTimingsPromise = fetch("assets/audio/pension-restart-call-timings.json", { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error(`Transcript timing file returned ${response.status}.`);
      return response.json();
    })
    .then(data => {
      if (!Array.isArray(data.bubbles) || data.bubbles.length !== callScript.length) {
        throw new Error("Transcript timing data is incomplete.");
      }
      return data;
    });
  return callTimingsPromise;
}

function setCallLoadError(message) {
  const start = document.querySelector("#start-call");
  const control = document.querySelector("#toggle-voice");
  const status = document.querySelector("#voice-status");
  if (start) {
    start.disabled = true;
    start.textContent = "Call unavailable";
  }
  if (control) control.disabled = true;
  if (status) status.textContent = "Recorded call unavailable";
  showToast(message);
}

async function playCall() {
  if (!callAudio || !callTimings) return;
  stopCallPlayback();
  const transcript = document.querySelector("#transcript");
  const duration = document.querySelector("#call-duration");
  if (!transcript || !duration) return;

  transcript.innerHTML = "";
  callRenderedCount = 0;
  callRunning = true;
  callAudio.currentTime = 0;
  callAudio.muted = !callAudioEnabled;
  duration.textContent = "00:00";
  updateCallAudioControl();

  try {
    await callAudio.play();
    syncCallTranscript();
  } catch {
    callRunning = false;
    setCallLoadError("Playback was blocked. Tap the start button again.");
    const start = document.querySelector("#start-call");
    if (start) {
      start.disabled = false;
      start.textContent = "Start recorded call";
    }
  }
}

function syncCallTranscript() {
  if (!callRunning || !callAudio || !callTimings) return;
  const transcript = document.querySelector("#transcript");
  const duration = document.querySelector("#call-duration");
  if (!transcript || !duration) return;

  const currentTime = callAudio.currentTime;
  let addedBubble = false;
  while (callRenderedCount < callTimings.bubbles.length && currentTime >= callTimings.bubbles[callRenderedCount].start) {
    const bubble = callTimings.bubbles[callRenderedCount];
    transcript.insertAdjacentHTML("beforeend", transcriptBubbleMarkup(bubble, callRenderedCount));
    callRenderedCount += 1;
    addedBubble = true;
  }

  transcript.querySelectorAll(".speech[data-line]").forEach(element => {
    const bubble = callTimings.bubbles[Number(element.dataset.line)];
    const speaking = currentTime >= bubble.start && currentTime < bubble.end;
    element.classList.toggle("is-speaking", speaking);
    const label = element.querySelector(".speech-state");
    if (label) label.textContent = speaking ? "Speaking…" : "Transcript";
  });

  if (addedBubble) transcript.scrollTop = transcript.scrollHeight;
  duration.textContent = formatDuration(Math.floor(currentTime));
  callSyncFrame = window.requestAnimationFrame(syncCallTranscript);
}

function transcriptBubbleMarkup(bubble, index) {
  const speaker = bubble.speaker || bubble.who;
  const name = bubble.speakerName || bubble.name;
  return `<div class="speech ${speaker}" data-line="${index}"><small><span>${name}</span><span class="speech-state">Transcript</span></small><span>${bubble.text}</span></div>`;
}

function toggleCallAudio() {
  callAudioEnabled = !callAudioEnabled;
  if (callAudio) callAudio.muted = !callAudioEnabled;
  updateCallAudioControl();
}

function updateCallAudioControl() {
  const control = document.querySelector("#toggle-voice");
  const status = document.querySelector("#voice-status");
  if (control) {
    control.textContent = callAudioEnabled ? "🔊" : "🔇";
    control.setAttribute("aria-pressed", String(!callAudioEnabled));
    control.setAttribute("aria-label", callAudioEnabled ? "Mute recorded call" : "Unmute recorded call");
  }
  if (status && callTimings) status.textContent = callAudioEnabled ? "Recorded dialogue" : "Recorded dialogue muted";
}

function formatDuration(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function stopCallPlayback() {
  callRunning = false;
  if (callSyncFrame) window.cancelAnimationFrame(callSyncFrame);
  callSyncFrame = null;
  if (callAudio) {
    callAudio.pause();
    callAudio.currentTime = 0;
  }
  if (liveVoice) {
    liveVoice.stop();
    liveVoice = null;
  }
  window.clearInterval(liveCallTimer);
  liveCallTimer = null;
  liveCallStartedAt = null;
}

function finishCall(skipped = true) {
  const finalSeconds = callTimings?.duration || callAudio?.duration || 0;
  stopCallPlayback();
  setState({ callComplete: true });
  const transcript = document.querySelector("#transcript");
  if (!transcript) return;
  const bubbles = callTimings?.bubbles || callScript;
  transcript.innerHTML = bubbles.map((bubble, index) => transcriptBubbleMarkup(bubble, index)).join("") + `<div class="center spacer-md call-complete-actions"><a class="button button-primary" href="#/summary">Open written summary</a><button class="button button-quiet" id="replay-call" type="button">Replay recorded call</button></div>`;
  transcript.scrollTop = transcript.scrollHeight;
  document.querySelector("#call-duration").textContent = formatDuration(Math.round(finalSeconds));
  document.querySelector("#voice-status").textContent = skipped ? "Call skipped · transcript shown" : "Recorded call complete";
  document.querySelector("#replay-call")?.addEventListener("click", playCall);
}

function downloadRecord() {
  const record = {
    caseId: caseData.id,
    prototype: true,
    synthetic: true,
    pensioner: caseData.pensioner,
    issue: { lastCreditMonth: "2025-11", firstMissingMonth: "2025-12", lifeCertificateStatus: "probably_not_submitted", confirmed: false },
    documents: state.documents,
    status: state.pensionProtected ? "synthetic_pension_protected" : state.reviewShown ? "guidance_prepared" : state.documentsSent ? "documents_received" : "awaiting_documents",
    disclosure: "Synthetic demonstration record. Not for official submission.",
  };
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pension-restart-demo-PR-2608-1042.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Synthetic recovery record downloaded.");
}

function escapeAttr(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

window.addEventListener("hashchange", render);
document.querySelector("#text-size").addEventListener("click", () => {
  document.body.classList.toggle("large-text");
  showToast(document.body.classList.contains("large-text") ? "Larger text enabled." : "Standard text size enabled.");
});
document.querySelector("#menu-button").addEventListener("click", event => {
  const nav = document.querySelector("#nav-links");
  const open = nav.classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
});
document.querySelector("#nav-links").addEventListener("click", () => {
  document.querySelector("#nav-links").classList.remove("open");
  document.querySelector("#menu-button").setAttribute("aria-expanded", "false");
});
document.querySelector("#reset-demo").addEventListener("click", () => {
  state = structuredClone(initialState);
  saveState();
  showToast("Demonstration reset.");
  navigate("/");
});

fetch("/api/config")
  .then(response => response.ok ? response.json() : Promise.reject(new Error("Configuration unavailable")))
  .then(config => { runtimeConfig = config; })
  .catch(() => { runtimeConfig = { providers: {} }; })
  .finally(render);
