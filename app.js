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
let webCaseError = "";
let webAnswerSubmitting = false;
let familyCases = null;
let familyCasesLoading = false;
let familyCasesError = "";
let familyCaseLinking = false;
let publicCase = null;
let publicCaseLoading = false;
let publicCaseError = "";
let publicCaseRequestedCode = "";
let renderedRoute = null;

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

const caseData = {
  id: "PR-260810",
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
  { who: "guide", name: "Pension guide", text: "Call ke baad aapko ek written summary, document checklist aur suitable official routes milenge. Aapka Pension Restart reference PR-260810 taiyaar hai. Iska access code 260810 hai." },
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
          <nav class="breadcrumb" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">/</span><span>${eyebrow}</span></nav>
          <h1>${title}</h1>
          <p class="lead">${copy}</p>
        </div>
        ${extra}
      </div>
    </section>`;
}

function uiIcon(name, className = "") {
  const paths = {
    phone: '<path d="M8 3H5a2 2 0 0 0-2 2c0 8.84 7.16 16 16 16a2 2 0 0 0 2-2v-3l-5-2-2 2a14 14 0 0 1-6-6l2-2-2-5Z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/>',
    shield: '<path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
    message: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5Z"/><path d="M7 9h8M7 14h5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  };
  return `<svg class="ui-icon ${className}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
}

function configuredPhone() {
  return String(runtimeConfig.phoneNumber || "").trim();
}

function phoneLink(phone = configuredPhone()) {
  const dialable = phone.replace(/[^+\d]/g, "");
  return dialable ? `tel:${dialable}` : "";
}

function directCallCard(context = "home") {
  const phone = configuredPhone();
  const href = phoneLink(phone);
  const contextClass = `direct-call-card--${context}`;
  if (!phone || !href) {
    return `
      <aside class="direct-call-card ${contextClass} is-pending" aria-label="Phone line status">
        <div class="direct-call-card-top">
          <span class="direct-call-kicker">${uiIcon("phone")}Call the pension guide</span>
          <span class="phone-line-status">Phone line pending</span>
        </div>
        <span class="direct-call-number">Awaiting VAPI number</span>
        <p>The answerable phone line will appear here as soon as it is connected. Browser voice and online guidance are available now.</p>
      </aside>`;
  }
  return `
    <aside class="direct-call-card ${contextClass}" aria-label="Call Pension Restart">
      <div class="direct-call-card-top">
        <span class="direct-call-kicker">${uiIcon("phone")}Call the pension guide</span>
        <span class="phone-line-status">Phone line ready</span>
      </div>
      <a class="direct-call-number" href="${href}" aria-label="Call Pension Restart at ${escapeAttr(phone)}">${escapeAttr(phone)}</a>
      <p>Call this number to speak with the AI pension guide. English, Hindi and Hinglish are supported. International calling charges may apply.</p>
    </aside>`;
}

function syncRuntimeShell() {
  const phone = configuredPhone();
  const href = phoneLink(phone) || "#/call";
  const headerCall = document.querySelector("#header-call-link");
  if (headerCall) {
    headerCall.href = href;
    headerCall.innerHTML = `${uiIcon("phone")}<span class="header-call-label">${phone ? "Call now" : "Call the guide"}</span>`;
    headerCall.setAttribute("aria-label", phone ? `Call Pension Restart at ${phone}` : "Open phone guidance options");
  }
  const footerCall = document.querySelector("#footer-call-link");
  if (footerCall) {
    footerCall.href = href;
    footerCall.textContent = phone ? `Call ${phone}` : "Talk to the pension guide";
  }
}

function homeView() {
  const phone = configuredPhone();
  const phoneHref = phoneLink(phone) || "#/call";
  const whatsappDigits = String(runtimeConfig.whatsappNumber || "").replace(/\D/g, "");
  const whatsappHref = whatsappDigits ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent("Namaste, I need pension guidance")}` : "";
  return `
    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-copy">
          <h1>A stopped pension.<br>A clearer way<br>forward.</h1>
          <p class="lead">Call our AI pension guide and tell us what happened, in your own words. We’ll help you understand the problem and prepare your next step.</p>
          ${directCallCard("home")}
          <div class="hero-actions">
            <a class="button button-quiet" href="#/call">${uiIcon("mic")}Use browser voice</a>
            <a class="button button-quiet" href="#/online">Get help online</a>
          </div>
          <p class="language-note">Speak in <strong>English</strong>, <strong lang="hi">हिंदी</strong> or <strong>Hinglish</strong></p>
          <div class="hero-return">Already spoken with us? <a href="#/status">Continue your case</a></div>
        </div>
        <div class="conversation-preview" aria-label="Illustrative pension guidance conversation">
          <div class="preview-heading"><span class="preview-symbol">${uiIcon("message")}</span><span>A conversation is a beginning.</span></div>
          <div class="example-conversation">
            <span class="example-label">For example</span>
            <p class="example-hindi" lang="hi">“मेरी पेंशन नहीं आई।<br>अब मैं क्या करूँ?”</p>
            <p class="example-translation">“My pension hasn’t arrived.<br>What should I do now?”</p>
          </div>
          <div class="example-connector" aria-hidden="true"><span></span>${uiIcon("arrow")}</div>
          <div class="guidance-preview">
            <div class="guidance-preview-title"><span class="document-icon">${uiIcon("file")}</span><div><h2>Let’s work out your next step.</h2><p>A clear plan to take with you</p></div></div>
            <ul><li>${uiIcon("check")}A summary of what happened</li><li>${uiIcon("check")}The references to keep ready</li><li>${uiIcon("check")}Where to ask for help</li></ul>
            <div class="preview-footnote">Your situation. Your language. Your next step.</div>
          </div>
          <p class="illustration-caption">Illustrative guidance. Your plan depends on your answers.</p>
        </div>
      </div>
    </section>
    <div class="trust-strip"><div class="container">${uiIcon("shield")}<p><strong>Guidance you can understand.</strong> Independent support. No Aadhaar numbers, bank passwords or OTPs requested.</p><a href="#/about">About this service</a></div></div>

    <section class="section needs-section">
      <div class="container">
        <div class="section-heading heading-row"><div><h2>What brings you here?</h2><p>Start with the situation that feels closest to yours.</p></div><a class="text-link" href="#/help">Visit the help centre ${uiIcon("arrow")}</a></div>
        <div class="need-grid">
          <a class="need-card" href="#/call"><span class="need-icon">${uiIcon("message")}</span><h3>My pension has stopped</h3><p>Make sense of a missing payment and find out what to do next.</p><span class="need-action">Get pension guidance ${uiIcon("arrow")}</span></a>
          <a class="need-card" href="#/options"><span class="need-icon">${uiIcon("file")}</span><h3>I need a life certificate</h3><p>Explore ways to submit it, at home or with help in person.</p><span class="need-action">Explore your options ${uiIcon("arrow")}</span></a>
          <a class="need-card" href="#/family"><span class="need-icon">${uiIcon("people")}</span><h3>I’m helping a loved one</h3><p>Keep their information together, with them in control.</p><span class="need-action">Find family assistance ${uiIcon("arrow")}</span></a>
        </div>
      </div>
    </section>

    <section class="section journey-section">
      <div class="container journey-layout">
        <div class="journey-intro"><h2>Less running around.<br>More understanding.</h2><p class="lead">You shouldn’t have to know the right department before asking for help.</p><a class="text-link" href="#/online">Start with one question ${uiIcon("arrow")}</a></div>
        <ol class="journey-steps">
          <li><span class="step-number">1</span><div><h3>Tell us what happened</h3><p>Speak to the AI guide or answer online, one question at a time. It’s okay if you don’t know every detail.</p></div></li>
          <li><span class="step-number">2</span><div><h3>Check we’ve understood</h3><p>Review your details and correct anything that doesn’t sound right.</p></div></li>
          <li><span class="step-number">3</span><div><h3>Leave with a practical next step</h3><p>Keep your guidance, document checklist and private case code for the next conversation.</p></div></li>
        </ol>
      </div>
      <div class="container continuity-note">${uiIcon("file")}<p><strong>One case, wherever you continue.</strong> Use your private code to pick up on phone, WhatsApp or the website.</p></div>
    </section>

    <section class="section">
      <div class="container learning-layout">
        <div class="certificate-note"><span class="note-icon">${uiIcon("file")}</span><h2>A small certificate.<br>An important next step.</h2><p>A life certificate confirms that the pensioner is alive. Jeevan Pramaan is one digital route; assisted and conventional routes may also be available.</p><a class="text-link" href="#/options">Understand the options ${uiIcon("arrow")}</a></div>
        <div class="helpful-list"><h2>Before you begin</h2><p>It helps to have these nearby. You can still start if you’re unsure.</p><ul><li><span>Pension reference</span><span>Your PPO, if available</span></li><li><span>Last payment</span><span>The last month you received pension</span></li><li><span>Certificate receipt</span><span>A Pramaan ID or acknowledgement</span></li></ul><p class="privacy-note">${uiIcon("shield")}Keep identity numbers and bank details private.</p></div>
      </div>
    </section>

    <section class="section final-help-section"><div class="container final-help"><div><h2>You don’t have to figure<br>it out all at once.</h2><p>Begin with a conversation. Take the next step with clarity.</p></div><div class="final-help-actions"><a class="button button-primary" href="${phoneHref}">${uiIcon("phone")}${phone ? `Call ${escapeAttr(phone)}` : "View phone guidance"}</a><a class="text-link" href="#/online">Prefer to type? Continue online</a>${whatsappHref ? `<a class="text-link" href="${whatsappHref}" target="_blank" rel="noopener noreferrer">Continue on WhatsApp</a>` : ""}</div></div>
    ${phone ? '<p class="container phone-alternative">The displayed number connects directly to the Pension Restart AI guide.<span>International calling charges may apply.</span></p>' : ""}</section>`;
}

function callView() {
  const browserReady = runtimeConfig.providers?.vapiWebCall;
  return `${pageHero("Talk to the pension guide", "One number. A clearer next step.", "Call the Pension Restart AI guide from any phone, or use the browser voice option below.")}
    <section class="section section-tight">
      <div class="container">
        ${directCallCard("call")}
        <div class="call-browser-heading"><span class="eyebrow">Browser option</span><h2>Prefer to speak without leaving this page?</h2><p>Use your microphone for the same guided conversation.</p></div>
        <div class="call-session-layout">
          <div class="phone-shell live-phone" id="phone-shell">
          <div class="phone-top"><span class="connected waiting" id="connection-state">${browserReady ? "Ready when you are" : "Browser calling unavailable"}</span><span id="call-duration">00:00</span></div>
          <div class="phone-body">
            <div class="caller-block"><span class="caller-avatar">${uiIcon("phone")}</span><h2>Your pension guide</h2><p>English · <span lang="hi">हिंदी</span> · Hinglish</p></div>
            <div class="transcript-heading"><strong>Your conversation</strong><span id="voice-status" role="status">${browserReady ? "Microphone off" : "Please use online guidance"}</span></div>
            <div class="transcript" id="transcript" aria-live="polite" aria-label="Call transcript">
              <div class="center" id="call-intro">
                <p>${browserReady ? "Your browser will ask to use your microphone. Read along here as you speak with the guide." : "Browser calling is being connected. You can get the same pension guidance by answering questions online."}</p>
                ${browserReady ? `<button class="button button-primary" id="start-live-call" type="button">${uiIcon("mic")}Start voice conversation</button><a class="text-link" href="#/online">Prefer to type? Continue online</a>` : '<button class="button button-quiet" id="start-live-call" type="button" disabled>Browser calling unavailable</button><a class="text-link" href="#/online">Get help online</a>'}
              </div>
            </div>
          </div>
          <div class="phone-controls">
            <button class="round-control" id="toggle-live-mute" type="button" aria-label="Mute microphone" aria-pressed="false" disabled>${uiIcon("mic")}</button>
            <button class="round-control end" id="end-live-call" type="button" disabled>End call</button>
          </div>
        </div>
          <aside class="call-help">
            <article class="summary-card"><h2>A little preparation helps</h2><ul class="check-list"><li>Find a quiet place to speak.</li><li>Think of when your pension last arrived.</li><li>Keep your private case code, if you already have one.</li></ul><a class="text-link" href="#/status">Continue an existing case</a></article>
            <div class="callout danger"><strong>Keep your personal details safe</strong><p>Never say an Aadhaar number, bank or government OTP, PIN, password, CVV or full bank-account number. This is independent guidance, not a government service.</p></div>
          </aside>
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
            <button class="button button-quiet" id="edit-summary" type="button">Get guidance for my situation</button>
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
          <p class="tiny muted">This is an example summary using fictional details. Your own guidance is based on the answers you provide.</p>
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
  whatsapp_followup_consent: [["true", "Yes, send it"], ["false", "No WhatsApp follow-up"]],
  issue_type: [["stopped", "Pension stopped"], ["delayed", "Payment delayed"], ["reduced", "Amount reduced"], ["life_certificate_rejected", "Certificate rejected"], ["revision_pending", "Revision pending"], ["unknown", "I am not sure"]],
  scheme_family: [["central_civil", "Central government"], ["defence", "Defence / SPARSH"], ["railways", "Railways"], ["eps_95", "EPFO / EPS-95"], ["nps_ups_apy", "NPS / UPS / APY"], ["state_government", "State government"], ["social_assistance", "Old age / widow / disability"], ["private_annuity", "Insurance annuity"], ["employer_superannuation", "Employer pension"], ["unknown", "I am not sure"]],
  disbursement_channel: [["bank", "Bank"], ["post_office", "Post office"], ["treasury", "Treasury"], ["insurer", "Insurer"], ["employer", "Former employer"], ["unknown", "I am not sure"]],
  life_certificate_status: [["submitted_accepted", "Submitted and accepted"], ["submitted_pending", "Submitted, status unknown"], ["submitted_rejected", "Submitted but rejected"], ["not_submitted", "Not submitted"], ["not_remembered", "I do not remember"]],
  life_certificate_method: [["jeevan_pramaan_mobile", "Mobile / face app"], ["biometric_centre", "Biometric centre / CSC"], ["bank", "Bank"], ["post_office", "Post office"], ["doorstep", "Doorstep service"], ["paper", "Paper certificate"], ["unknown", "I am not sure"]],
  life_certificate_receipt_available: [["true", "Yes"], ["false", "No"]],
  changed_details: [["bank_account", "Bank account"], ["branch", "Bank branch"], ["address", "Address"], ["mobile", "Mobile number"], ["kyc", "KYC"], ["none", "Nothing changed"], ["unknown", "I am not sure"]],
  intake_confirmed: [["true", "Yes, this is correct"], ["false", "One detail is wrong"]],
};

function onlineQuestionMarkup(question) {
  if (question?.id === "intake_confirmed" && webCase.currentFacts && Object.keys(webCase.currentFacts).length) {
    const labels = {
      caller_relation: "Who needs help", whatsapp_followup_consent: "WhatsApp follow-up",
      pensioner_name: "Pensioner name", issue_type: "What happened", scheme_family: "Pension scheme",
      former_employer: "Former employer", disbursement_channel: "Payment channel",
      disbursing_institution: "Paying institution", last_credit_date: "Last pension payment",
      pension_amount: "Monthly pension amount", life_certificate_status: "Life certificate",
      life_certificate_method: "Submission method", life_certificate_receipt_available: "Certificate receipt",
      changed_details: "Recent changes", state: "State or union territory", state_ut: "State or union territory",
    };
    const rows = Object.entries(webCase.currentFacts).filter(([field]) => field !== "intake_confirmed").map(([field, value]) => {
      const readable = item => webQuestionOptions[field]?.find(([key]) => key === String(item))?.[1] || (typeof item === "boolean" ? (item ? "Yes" : "No") : String(item ?? "Not provided"));
      const answer = Array.isArray(value) ? value.map(readable).join(", ") : readable(value);
      return detailRow(escapeAttr(labels[field] || field.replaceAll("_", " ")), escapeAttr(answer));
    }).join("");
    return `<div class="question"><h2 id="online-question" tabindex="-1">Check your details</h2><p class="muted" id="online-question-hindi" lang="hi">कृपया जानकारी जाँचें। क्या सब सही है?</p><p class="muted">Review the answers below before we prepare your guidance. You can correct a detail if needed.</p></div><dl class="detail-list readback-details">${rows}</dl>`;
  }
  return `<div class="question"><h2 id="online-question" tabindex="-1">${escapeAttr(question?.en || "Your guidance is being prepared")}</h2><p class="muted" id="online-question-hindi" lang="hi-Latn">${escapeAttr(question?.hi || "")}</p></div>`;
}

function onlineView() {
  if (!webCase) return `${pageHero("Continue online", "One question at a time.", "Begin here, then continue with the same case by phone or WhatsApp whenever you need.")}
    <section class="section section-tight"><div class="form-shell center" ${webCaseError ? "" : 'role="status" aria-live="polite" aria-busy="true"'}>${webCaseError ? `<div class="online-error" role="alert"><h2 id="online-question" tabindex="-1">We could not start your case.</h2><p>${escapeAttr(webCaseError)}</p><p class="muted">Please try again. You can also return to the help centre.</p></div><div class="actions-row"><button class="button button-primary" id="retry-web-case" type="button">Try again</button><a class="button button-quiet" href="#/help">Visit help centre</a></div>` : '<span class="live-loader" aria-hidden="true"></span><h2>Preparing your private case…</h2><p class="muted">This usually takes a moment. Keep this page open.</p>'}</div></section>`;
  if (webCase.complete && webCase.resolution) {
    const plan = webCase.resolution;
    return `${pageHero("Guidance prepared", `Your case is ${displayCaseCode(webCase)}.`, `Keep access code ${webCase.publicCode} to continue through phone, WhatsApp or this browser.`, '<span class="status-badge success">Guidance ready</span>')}
      <section class="section section-tight"><div class="container summary-grid"><article class="summary-card"><span class="eyebrow">Likely explanation</span><h2>${escapeAttr(plan.likelyCause)}</h2><p class="muted">Confidence: ${escapeAttr(plan.confidence)} · ${plan.requiresHumanReview ? "Human review recommended" : "Based on the details you confirmed"}</p><ol class="guidance-steps">${plan.nextSteps.map(step => `<li>${escapeAttr(step)}</li>`).join("")}</ol><div class="callout danger"><strong>Guidance, not a government decision</strong><p>${escapeAttr(plan.disclaimer)}</p></div></article><aside class="summary-card"><h2>Where to go</h2><dl class="detail-list">${detailRow("First contact", plan.primaryAuthority)}${detailRow("Escalation", plan.escalationAuthority)}${detailRow("Case reference", displayCaseCode(webCase))}${detailRow("Access code", webCase.publicCode)}</dl><h3>Helpful documents</h3><ul>${plan.documents.map(item => `<li>${escapeAttr(item)}</li>`).join("")}</ul><button class="button button-outline button-block" type="button" onclick="window.print()">Print your guidance</button><a class="text-link" href="#/status">Continue this case later</a></aside></div></section>`;
  }
  const question = webCase.nextQuestion;
  const options = webQuestionOptions[question?.id] || [];
  const correctionOptions = [
    ["whatsapp_followup_consent", "WhatsApp follow-up"], ["pensioner_name", "Pensioner name"], ["issue_type", "What happened"], ["scheme_family", "Pension scheme"],
    ["former_employer", "Former employer"], ["disbursement_channel", "Payment channel"],
    ["disbursing_institution", "Paying institution"], ["last_credit_date", "Last payment"],
    ["pension_amount", "Monthly amount"], ["life_certificate_status", "Life certificate"], ["changed_details", "Changed details"],
  ];
  if (webCase.awaitingCorrection) return `${pageHero("Correct one detail", "Which answer should we change?", "Choose the detail, then tell us the correct answer. We will update your case.", `<span class="status-badge neutral">${escapeAttr(displayCaseCode(webCase))}</span>`)}
    <section class="section section-tight"><form class="form-shell" id="web-correction-form" aria-labelledby="online-question"><h2 id="online-question" tabindex="-1">Update an answer</h2><label for="web-correction-field"><strong>Detail to correct</strong></label><select id="web-correction-field" class="answer-input" required><option value="">Choose one detail</option>${correctionOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select><label for="web-correction-answer"><strong>Correct answer</strong></label><textarea id="web-correction-answer" class="answer-input" rows="4" required placeholder="Enter only the corrected answer…"></textarea><button class="button button-primary" type="submit">Save correction</button><p class="form-save-status sr-only" role="status" aria-live="polite"></p><p class="admin-error" id="web-answer-error" role="alert"></p></form></section>`;
  const completeness = Math.min(100, Math.max(0, Number(webCase.completeness) || 0));
  return `${pageHero("Continue online", "One question at a time.", "Answer in English or Hindi. Each answer helps us understand what happened and what to do next.", `<span class="status-badge neutral">${escapeAttr(displayCaseCode(webCase))}</span>`)}
    <section class="section section-tight">
      <form class="form-shell" id="live-online-form" aria-labelledby="online-question">
        <div class="web-case-progress" role="progressbar" aria-label="Case details completed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${completeness}"><span style="width:${completeness}%"></span></div>
        <p class="muted">${completeness}% complete · Case ${escapeAttr(displayCaseCode(webCase))}</p>
        ${onlineQuestionMarkup(question)}
        ${options.length ? `<p class="answer-hint muted">Choose one answer to continue.</p><div class="choice-grid" role="group" aria-labelledby="online-question" aria-describedby="online-question-hindi">${options.map(([value, label]) => `<button class="choice web-answer-option" data-answer="${escapeAttr(value)}" type="button"><span class="choice-dot" aria-hidden="true"></span><span>${escapeAttr(label)}</span></button>`).join("")}</div>` : `<label class="sr-only" for="web-raw-answer">Your answer</label><textarea id="web-raw-answer" class="answer-input" rows="4" required aria-labelledby="online-question" aria-describedby="online-question-hindi" placeholder="Answer in your own words…"></textarea><button class="button button-primary" type="submit">Save and continue</button>`}
        <div class="callout danger compact"><strong>Never enter a bank or government OTP, PIN, password, Aadhaar number or complete bank account number.</strong></div>
        <p class="form-save-status sr-only" role="status" aria-live="polite"></p>
        <p class="admin-error" id="web-answer-error" role="alert"></p>
      </form>
    </section>`;
}

function documentsView() {
  const attachedCount = Object.values(state.documents).filter(Boolean).length;
  return `${pageHero("Demo documents", "Share only what helps explain the pension record.", "Use the supplied synthetic files. Do not upload real identity or banking documents.", `<span class="status-badge neutral">${attachedCount} of 3 attached</span>`)}
    <section class="section section-tight">
      <div class="container">
        <div class="callout danger"><strong>Do not upload real information.</strong><p>Only the supplied example files can be attached. No file is read from your device.</p></div>
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
  return `${pageHero("Documents received", `We received ${Object.values(state.documents).filter(Boolean).length} demonstration files.`, "They are attached to demo code 260810. Nothing has been sent outside this browser.", '<span class="status-badge success">✓ Received</span>')}
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

function requestedCaseCode() {
  return new URLSearchParams((window.location.hash.split("?")[1] || "")).get("case") || "";
}

function readableCaseValue(field, value) {
  const option = webQuestionOptions[field]?.find(([key]) => key === String(value));
  if (option) return option[1];
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value ?? "Not provided");
}

function caseStatus(record) {
  if (record.complete || record.status === "guidance_prepared") return { label: "Guidance ready", className: "success" };
  if ((record.completeness || 0) > 0) return { label: `${record.completeness}% complete`, className: "neutral" };
  return { label: "Ready to begin", className: "neutral" };
}

function realCaseView(record) {
  const facts = record.currentFacts || {};
  const name = facts.pensioner_name || "Pensioner";
  const status = caseStatus(record);
  const plan = record.resolution;
  const updated = record.updatedAt ? new Date(record.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not available";
  const factRows = [
    ["Pensioner", name],
    ["What happened", readableCaseValue("issue_type", facts.issue_type)],
    ["Pension scheme", readableCaseValue("scheme_family", facts.scheme_family)],
    ["Last pension payment", readableCaseValue("last_credit_date", facts.last_credit_date)],
    ["Life certificate", readableCaseValue("life_certificate_status", facts.life_certificate_status)],
    ["State", readableCaseValue("location_state", facts.location_state)],
  ];
  return `${pageHero("Case dashboard", `${escapeAttr(name)} · ${escapeAttr(displayCaseCode(record))}`, "A private, continuable view of this pension-guidance case.", `<span class="status-badge ${status.className}">${escapeAttr(status.label)}</span>`)}
    <section class="section section-tight">
      <div class="container case-layout real-case-dashboard">
        <article class="summary-card">
          <span class="eyebrow">Current next step</span>
          <h2>${escapeAttr(plan?.nextSteps?.[0] || record.nextQuestion?.en || "Continue the guided intake")}</h2>
          <div class="web-case-progress" role="progressbar" aria-label="Case details completed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Number(record.completeness) || 0}"><span style="width:${Number(record.completeness) || 0}%"></span></div>
          <p class="muted">${Number(record.completeness) || 0}% complete · Last updated ${escapeAttr(updated)}</p>
          ${plan ? `<div class="callout"><strong>${escapeAttr(plan.likelyCause)}</strong><p>${escapeAttr(plan.disclaimer)}</p></div><h3>Guidance steps</h3><ol class="guidance-steps">${plan.nextSteps.map(step => `<li>${escapeAttr(step)}</li>`).join("")}</ol>` : '<p>Continue the conversation so Pension Restart can prepare a guidance route from the details you confirm.</p>'}
          <div class="actions-row"><a class="button button-primary" href="#/online">${record.complete ? "Review and update answers" : "Continue this case"}</a><button class="button button-quiet" type="button" onclick="window.print()">Print case dashboard</button></div>
        </article>
        <aside>
          <article class="summary-card"><h2>Case details</h2><dl class="detail-list">${factRows.map(([label, value]) => detailRow(label, escapeAttr(value))).join("")}</dl></article>
          <div class="spacer-sm"></div>
          <article class="summary-card"><h2>Keep this reference</h2><p class="case-reference-large">${escapeAttr(displayCaseCode(record))}</p><p class="muted">Use this six-digit reference to continue by phone, WhatsApp or the website.</p>${plan ? `<dl class="detail-list">${detailRow("First contact", escapeAttr(plan.primaryAuthority))}${detailRow("Escalation", escapeAttr(plan.escalationAuthority))}</dl>` : ""}</article>
          <div class="spacer-sm"></div>
          <div class="callout danger"><strong>Private on this browser</strong><p>This dashboard contains only current case facts and guidance. Raw transcripts and internal audit history are not shown.</p></div>
        </aside>
      </div>
    </section>`;
}

function caseView() {
  const code = requestedCaseCode();
  if (code) {
    const compactCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const numericCode = /^PR\d{6}$/.test(compactCode) ? compactCode.slice(2) : compactCode;
    const candidates = [publicCase, webCase].filter(Boolean);
    const record = candidates.find(candidate => candidate.publicCode === numericCode || candidate.displayCode?.toUpperCase().replace(/[^A-Z0-9]/g, "") === compactCode || candidate.caseId === code);
    if (record) return realCaseView(record);
    if (publicCaseError) return `${pageHero("Case dashboard", "We could not open this case.", publicCaseError)}<section class="section section-tight"><div class="narrow"><a class="button button-primary" href="#/status">Enter the case code again</a></div></section>`;
    return `${pageHero("Case dashboard", "Opening your private case…", "Checking this browser's access to the requested case.")}<section class="section section-tight"><div class="form-shell center" role="status" aria-live="polite" aria-busy="true"><span class="live-loader" aria-hidden="true"></span><p class="muted">Keep this page open.</p></div></section>`;
  }
  return demoCaseView();
}

function demoCaseView() {
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
          ${!docsDone ? '<a class="button button-primary" href="#/documents">Attach demo documents</a>' : !reviewed ? '<button class="button button-primary" id="show-review" type="button">Demo control: show review response</button>' : !protectedState ? '<button class="button button-primary" id="protect-pension" type="button">Demo control: show successful outcome</button>' : '<div class="callout success"><strong>Pension protected until November 2027</strong><p>This is a simulated future outcome-not a government or bank status.</p></div>'}
        </article>
        <aside>
          <article class="summary-card">
            <h2>Evidence</h2>
            <dl class="detail-list">
              ${detailRow("PPO document", state.documents.ppo ? "Received" : "Not attached")}
              ${detailRow("Credit record", state.documents.statement ? "Received" : "Not attached")}
              ${detailRow("Selected route", state.routeSelected || "Not yet selected")}
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
  const cases = familyCases || [];
  const actionNeeded = cases.filter(record => !record.complete || record.resolution?.requiresHumanReview).length;
  const guidanceReady = cases.filter(record => record.complete).length;
  const caseCards = cases.map(record => {
    const facts = record.currentFacts || {};
    const name = facts.pensioner_name || "Pensioner";
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "PR";
    const status = caseStatus(record);
    const nextAction = record.resolution?.nextSteps?.[0] || record.nextQuestion?.en || "Review the case details";
    return `<article class="family-case-card">
      <div class="family-case-top"><span class="person-avatar" aria-hidden="true">${escapeAttr(initials)}</span><div><span class="status-badge ${status.className}">${escapeAttr(status.label)}</span><h3>${escapeAttr(name)}</h3><p class="family-case-code">${escapeAttr(displayCaseCode(record))}</p></div></div>
      <p><strong>Next action:</strong> ${escapeAttr(nextAction)}</p>
      <a class="button button-outline button-block" href="#/case?case=${encodeURIComponent(record.publicCode)}">Open private case</a>
    </article>`;
  }).join("");
  return `${pageHero("Family assistance", "Help without taking control away.", "Keep consented case references and next actions together on this browser.", '<span class="status-badge neutral">Private to this browser</span>')}
    <section class="section section-tight">
      <div class="container">
        <div class="dashboard-header"><div><span class="eyebrow">Consented case access</span><h2>${cases.length ? `${cases.length} ${cases.length === 1 ? "case" : "cases"} supported` : "Your family case dashboard"}</h2></div><a class="button button-primary" href="#/online">Get guidance online</a></div>
        ${familyCases === null && !familyCasesError ? '<div class="form-shell center family-loading" role="status" aria-live="polite" aria-busy="true"><span class="live-loader" aria-hidden="true"></span><h3>Opening your private dashboard…</h3></div>' : `
        <div class="stats-grid family-stats"><div class="stat"><strong>${cases.length}</strong><span>Cases linked</span></div><div class="stat"><strong>${actionNeeded}</strong><span>Need a next step</span></div><div class="stat"><strong>${guidanceReady}</strong><span>Guidance ready</span></div></div>
        <div class="family-dashboard-layout">
          <div class="family-case-list">
            ${familyCasesError ? `<div class="callout danger"><strong>We could not load the private dashboard.</strong><p>${escapeAttr(familyCasesError)}</p><button class="button button-outline" id="retry-family-cases" type="button">Try again</button></div>` : caseCards || '<article class="family-empty"><span class="icon-box teal">'+uiIcon("people")+'</span><h3>No family cases linked yet</h3><p>Ask the pensioner for their six-digit Pension Restart case reference, then confirm their permission before adding it here.</p></article>'}
          </div>
          <form class="family-link-card" id="family-link-form">
            <span class="eyebrow">Add an existing case</span>
            <h3>Link with permission</h3>
            <p>Enter the continuable reference shared by the pensioner.</p>
            <label for="family-case-code"><strong>Six-digit case code</strong></label>
            <input class="answer-input status-input" id="family-case-code" name="case-code" placeholder="For example, PR-123456" maxlength="9" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required />
            <label for="family-relationship"><strong>Your relationship</strong></label>
            <select class="answer-input" id="family-relationship" name="relationship" required>
              <option value="">Choose one</option><option value="spouse">Spouse</option><option value="child">Child</option><option value="grandchild">Grandchild</option><option value="relative">Other relative</option><option value="helper">Trusted helper</option><option value="self">The case is mine</option>
            </select>
            <label class="consent-check" for="family-consent"><input id="family-consent" name="consent" type="checkbox" required /><span>I confirm I have the pensioner's permission to view and continue this case.</span></label>
            <button class="button button-primary button-block" id="family-link-case" type="submit">Link this case</button>
            <p class="admin-error" id="family-link-error" role="alert">${escapeAttr(familyCasesError && cases.length ? familyCasesError : "")}</p>
          </form>
        </div>
        `}
        <div class="spacer-md"></div><div class="callout"><strong>The pensioner remains in control.</strong><p>Linking allows this browser to view current case facts and continue the guidance. It does not authorise official authentication, personal declarations or access to raw transcripts. Clearing this browser's cookies removes the browser-bound access.</p></div>
      </div>
    </section>`;
}

function statusView() {
  const caseFromLink = new URLSearchParams((window.location.hash.split("?")[1] || "")).get("case") || "";
  return `${pageHero("Continue a case", "One reference. One understandable result.", "Enter the private case code given to you by phone, WhatsApp or this website.")}
    <section class="section section-tight">
      <form class="form-shell" id="status-form">
        <label for="status-id"><strong>Six-digit Pension Restart code</strong></label>
        <p class="muted status-hint" id="status-hint">You can enter the six digits on their own, or include PR- at the beginning.</p>
        <input class="answer-input status-input" id="status-id" name="case-code" value="${escapeAttr(caseFromLink)}" placeholder="For example, PR-123456" maxlength="9" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required aria-describedby="status-hint" />
        <button class="button button-primary" id="check-status" type="submit">Connect this case</button>
        <div id="status-result" role="status" aria-live="polite" aria-atomic="true"></div>
      </form>
    </section>`;
}

function helpView() {
  const phone = configuredPhone();
  const phoneHref = phoneLink(phone);
  const faqs = [
    ["Can Pension Restart issue my life certificate?", "No. It explains available routes and helps you prepare. The official process must be completed through an eligible authority, bank, post office, centre, mobile application or available doorstep channel."],
    ["Is the displayed phone number active?", phoneHref ? `Yes. Call <a class="inline-phone-link" href="${phoneHref}">${escapeAttr(phone)}</a> to reach the Pension Restart AI guide. International calling charges may apply.` : "The phone line is awaiting its Vapi number. You can get guidance through browser voice or online now."],
    ["Is the voice assistant using AI?", "Yes. An AI guide helps you explain the problem. You can check and correct important details before receiving guidance. The service applies defined pension guidance rules; the relevant authority makes the official decision."],
    ["Are my documents sent anywhere?", "No. The prototype attaches only supplied synthetic filenames and does not read or transmit a file from your device."],
    ["Does documents received mean pension will restart?", "No. It only means the demonstration files were attached. The authority must accept the life certificate and the paying institution must credit pension."],
    ["Can a family member complete everything?", "A trusted person can prepare information and help operate eligible tools, but the pensioner must complete required authentication or personal declarations."],
    ["What is a Pramaan ID?", "It is the unique reference issued when a Jeevan Pramaan Digital Life Certificate is generated. Keep it until acceptance and pension credit are clear."],
    ["What should I never share on a call?", "Never share an OTP, UPI or ATM PIN, CVV, remote-access code or bank password."],
  ];
  return `${pageHero("Pension help centre", "Pension help, written in plain language.", "Understand the references, submission choices and safety boundaries before taking the next step.")}
    <section class="section section-tight"><div class="narrow faq-list">${faqs.map(([q,a], i) => `<article class="faq-item"><button class="faq-question" type="button" aria-expanded="false" aria-controls="faq-answer-${i}"><span>${q}</span><span>+</span></button><div class="faq-answer" id="faq-answer-${i}"><p>${a}</p></div></article>`).join("")}</div></section>`;
}

function aboutView() {
  return `${pageHero("About Pension Restart", "Clear about what works. Clear about its limits.", "Pension Restart reorganises the journey around the citizen's real sentence: “My pension stopped.”")}
    <section class="section section-tight">
      <div class="container disclosure-grid">
        <article class="disclosure-card works"><h3>Working now</h3><ul><li>Phone and browser voice guidance when connected</li><li>Hindi, English and Hinglish intake</li><li>WhatsApp guided flow when connected</li><li>Cross-channel case continuity</li><li>Online one-question form</li><li>User-facing case dashboard</li><li>Browser-bound consented family dashboard</li><li>Deterministic guidance engine</li><li>Live operations dashboard</li><li>Correction and audit history</li></ul></article>
        <article class="disclosure-card mocked"><h3>Demonstration only</h3><ul><li>Document attachment and review states</li><li>Government and bank connections</li><li>Official case submission</li><li>Pension resumption</li></ul></article>
        <article class="disclosure-card future"><h3>Production safeguards</h3><ul><li>Verified pension research catalogue</li><li>Role-based human review</li><li>Encrypted managed database</li><li>Consent and deletion controls</li><li>Approved authority integrations</li><li>Operational escalation policy</li></ul></article>
      </div>
    </section>
    <section class="section surface-white"><div class="container split-grid"><div><span class="eyebrow">Why it exists</span><h2>A real family experience became a simpler starting point.</h2><p class="lead">An elderly relative's pension stopped because nobody knew that her life certificate was due. Pension Restart asks what changes when the pensioner can begin with one understandable conversation.</p></div><article class="summary-card"><h3>Independence statement</h3><p>Pension Restart is not affiliated with, approved by or operated by Jeevan Pramaan, UIDAI, EPFO, a bank, a post office or a government department.</p><h3>How Codex contributed</h3><p>Codex supported architecture critique, pension-flow modelling, product-state design, copy, implementation, provider adapters, tests and documentation. Product direction and decisions were made by Yashdeep Jha.</p></article></div></section>`;
}

function render(options = {}) {
  stopCallPlayback();
  syncRuntimeShell();
  const route = (window.location.hash || "#/").slice(1).split("?")[0];
  const routeChanged = route !== renderedRoute;
  const previousScroll = { left: window.scrollX, top: window.scrollY };
  const focusedId = document.activeElement?.id;
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
  const titles = {
    "/": "One call. Clear guidance.", "/call": "Talk to a pension guide",
    "/summary": "Review your summary", "/online": "Online pension guidance",
    "/documents": "Demonstration documents", "/received": "Documents received",
    "/case": "Case record", "/options": "Life certificate options",
    "/family": "Family assistance", "/status": "Continue your case",
    "/help": "Pension help centre", "/about": "About Pension Restart",
  };
  renderedRoute = route;
  app.dataset.route = route;
  app.innerHTML = (views[route] || homeView)();
  document.title = `Pension Restart - ${titles[route] || titles["/"]}`;
  document.querySelectorAll('.site-header a[href^="#/"]').forEach(link => {
    const current = link.getAttribute("href") === `#${route}`;
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  bindViewEvents(route);
  if (routeChanged) {
    closeNavigation();
    window.scrollTo({ top: 0, behavior: "instant" });
    app.focus({ preventScroll: true });
  } else {
    window.scrollTo({ ...previousScroll, behavior: "instant" });
    const focusTarget = options.focusQuestion
      ? document.querySelector("#online-question") || document.querySelector(".page-hero h1")
      : options.focusSelector
        ? document.querySelector(options.focusSelector)
        : focusedId ? document.getElementById(focusedId) : null;
    if (focusTarget && !focusTarget.disabled) {
      if (!focusTarget.matches("button, input, select, textarea, a, [tabindex]")) focusTarget.tabIndex = -1;
      focusTarget.focus({ preventScroll: !options.focusQuestion });
    }
  }
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
    document.querySelector("#retry-web-case")?.addEventListener("click", () => {
      webCaseError = "";
      render();
    });
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

  if (route === "/family") {
    initializeFamilyCases();
    document.querySelector("#retry-family-cases")?.addEventListener("click", () => {
      familyCasesError = "";
      familyCases = null;
      render();
    });
    document.querySelector("#family-link-form")?.addEventListener("submit", linkFamilyCase);
  }

  if (route === "/case" && requestedCaseCode()) initializePublicCase();

  document.querySelector("#confirm-summary")?.addEventListener("click", () => { setState({ summaryConfirmed: true }); navigate("/documents"); });
  document.querySelector("#edit-summary")?.addEventListener("click", () => navigate("/online"));

  document.querySelectorAll(".choice[data-key][data-answer]").forEach(choice => choice.addEventListener("click", () => {
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
    render({ focusSelector: '.attach-doc:not(:disabled), #send-documents:not(:disabled)' });
  }));
  document.querySelector("#send-documents")?.addEventListener("click", () => { setState({ documentsSent: true }); navigate("/received"); });

  document.querySelector("#show-review")?.addEventListener("click", () => { setState({ reviewShown: true }); showToast("Simulated review response is ready."); render({ focusSelector: "#protect-pension" }); });
  document.querySelector("#protect-pension")?.addEventListener("click", () => { setState({ pensionProtected: true }); showToast("Synthetic successful outcome recorded."); render({ focusSelector: ".case-layout .callout.success" }); });
  document.querySelector("#record-pramaan")?.addEventListener("click", () => { setState({ pramaanRecorded: true }); showToast("Demo Pramaan ID recorded."); render(); });
  document.querySelector("#download-record")?.addEventListener("click", downloadRecord);

  document.querySelectorAll(".select-route").forEach(button => button.addEventListener("click", () => {
    setState({ routeSelected: button.dataset.routeName });
    showToast(`${button.dataset.routeName} selected for this demo.`);
    navigate("/case");
  }));

  document.querySelector("#status-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("#check-status");
    if (button.disabled) return;
    const id = document.querySelector("#status-id").value.trim();
    const result = document.querySelector("#status-result");
    if (!id) {
      result.textContent = "Enter the case code you were given to continue.";
      form.querySelector("#status-id").focus();
      return;
    }
    button.disabled = true;
    button.textContent = "Connecting…";
    form.setAttribute("aria-busy", "true");
    result.innerHTML = '<div class="spacer-md muted">Connecting securely…</div>';
    try {
      const response = await fetch("/api/cases/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicCode: id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Case not found");
      webCase = body;
      publicCase = body;
      publicCaseError = "";
      publicCaseRequestedCode = body.publicCode;
      showToast(`Case ${displayCaseCode(body)} connected.`);
      navigate(`/case?case=${encodeURIComponent(body.publicCode)}`);
    } catch (error) {
      result.innerHTML = `<div class="spacer-md"></div><div class="callout danger"><strong>We could not connect that case.</strong><p>${escapeAttr(error.message)}</p></div>`;
    } finally {
      button.disabled = false;
      button.textContent = "Connect this case";
      form.removeAttribute("aria-busy");
    }
  });

  document.querySelectorAll(".faq-question").forEach((button, index) => {
    const item = button.closest(".faq-item");
    const panel = item.querySelector(".faq-answer");
    button.id = `faq-question-${index}`;
    panel.id = `faq-answer-${index}`;
    button.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-labelledby", button.id);
    panel.hidden = !item.classList.contains("open");
    button.addEventListener("click", () => {
      const open = item.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
      button.querySelector("span:last-child").textContent = open ? "−" : "+";
      panel.hidden = !open;
    });
  });
}

function initializeLiveCall() {
  if (!runtimeConfig.providers?.vapiWebCall || !window.PensionVoice) return;
  liveVoice = window.PensionVoice.create({
    publicKey: runtimeConfig.vapiPublicKey,
    assistantId: runtimeConfig.vapiAssistantId,
    onEvent: handleLiveVoiceEvent,
  });
}

async function initializeFamilyCases() {
  if (Array.isArray(familyCases) || familyCasesLoading || familyCasesError) return;
  familyCasesLoading = true;
  try {
    const response = await fetch("/api/family/cases", { headers: { "Accept": "application/json" } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load the family dashboard");
    familyCases = Array.isArray(body.cases) ? body.cases : [];
  } catch (error) {
    familyCasesError = error.message || "The private dashboard could not be loaded.";
  } finally {
    familyCasesLoading = false;
    if ((window.location.hash || "#/family").startsWith("#/family")) render({ focusSelector: familyCasesError ? "#retry-family-cases" : ".family-dashboard-layout" });
  }
}

async function linkFamilyCase(event) {
  event.preventDefault();
  if (familyCaseLinking) return;
  const form = event.currentTarget;
  const button = form.querySelector("#family-link-case");
  const errorElement = form.querySelector("#family-link-error");
  const publicCode = form.querySelector("#family-case-code")?.value.trim();
  const relationship = form.querySelector("#family-relationship")?.value;
  const consentConfirmed = Boolean(form.querySelector("#family-consent")?.checked);
  if (!publicCode || !relationship || !consentConfirmed) {
    if (errorElement) errorElement.textContent = "Enter the case code, choose your relationship and confirm the pensioner's permission.";
    return;
  }
  familyCaseLinking = true;
  button.disabled = true;
  button.textContent = "Linking securely…";
  form.setAttribute("aria-busy", "true");
  if (errorElement) errorElement.textContent = "";
  try {
    const response = await fetch("/api/family/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicCode, relationship, consentConfirmed }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "The case could not be linked");
    familyCases = [body.case, ...(familyCases || []).filter(record => record.caseId !== body.case.caseId)];
    familyCasesError = "";
    showToast(`Case ${displayCaseCode(body.case)} added to this browser.`);
    render({ focusSelector: ".family-case-card a" });
  } catch (error) {
    if (errorElement) errorElement.textContent = error.message || "The case could not be linked.";
  } finally {
    familyCaseLinking = false;
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = "Link this case";
    }
    if (form?.isConnected) form.removeAttribute("aria-busy");
  }
}

async function initializePublicCase() {
  const requested = requestedCaseCode().trim();
  if (!requested || publicCaseLoading || (publicCaseRequestedCode === requested && (publicCase || publicCaseError))) return;
  publicCaseLoading = true;
  publicCaseError = "";
  publicCase = null;
  publicCaseRequestedCode = requested;
  const compact = requested.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const lookup = /^PR\d{6}$/.test(compact) ? compact.slice(2) : compact;
  try {
    const response = await fetch(`/api/cases/${encodeURIComponent(lookup)}`, { headers: { "Accept": "application/json" } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "This case is not available to this browser");
    publicCase = body;
    webCase = body;
  } catch (error) {
    publicCaseError = error.message || "This private case could not be opened.";
  } finally {
    publicCaseLoading = false;
    if ((window.location.hash || "#/case").startsWith("#/case") && requestedCaseCode().trim() === requested) render({ focusSelector: ".real-case-dashboard, .page-hero h1" });
  }
}

async function initializeWebCase() {
  if (webCase || webCaseLoading || webCaseError) return;
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
  } catch (error) {
    webCaseError = error.message || "The connection was interrupted.";
  } finally {
    webCaseLoading = false;
    if ((window.location.hash || "#/online").startsWith("#/online")) render({ focusQuestion: true });
  }
}

async function submitWebAnswer(rawAnswer, confirmed, correctionField = "") {
  if (!webCase?.nextQuestion || webAnswerSubmitting) return;
  webAnswerSubmitting = true;
  const form = document.querySelector(correctionField ? "#web-correction-form" : "#live-online-form");
  form?.classList.add("is-submitting");
  form?.setAttribute("aria-busy", "true");
  form?.querySelectorAll("button, input, select, textarea").forEach(element => { element.disabled = true; });
  const saveStatus = form?.querySelector(".form-save-status");
  const errorElement = form?.querySelector("#web-answer-error");
  if (saveStatus) saveStatus.textContent = "Saving your answer…";
  if (errorElement) errorElement.textContent = "";
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
    if ((window.location.hash || "#/online").startsWith("#/online")) render({ focusQuestion: true });
  } catch (error) {
    if (errorElement) errorElement.textContent = error.message;
    if (saveStatus) saveStatus.textContent = "Your answer has not been saved. Please try again.";
  } finally {
    webAnswerSubmitting = false;
    form?.classList.remove("is-submitting");
    form?.removeAttribute("aria-busy");
    form?.querySelectorAll("button, input, select, textarea").forEach(element => { element.disabled = false; });
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
    button.innerHTML = uiIcon("mic");
    button.classList.toggle("is-muted", liveMuted);
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
  if (transcript && !transcript.querySelector(".call-complete-actions")) transcript.insertAdjacentHTML("beforeend", '<div class="center spacer-md call-complete-actions"><a class="button button-primary" href="#/status">Continue with a case ID</a><a class="button button-quiet" href="#/options">Explore life certificate options</a></div>');
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
  link.download = "pension-restart-demo-260810.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Synthetic recovery record downloaded.");
}

function escapeAttr(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function displayCaseCode(record) {
  return record?.displayCode || (record?.publicCode ? `PR-${record.publicCode}` : "PR-000000");
}

function applyTextSize(enabled) {
  document.body.classList.toggle("large-text", enabled);
  document.documentElement.style.fontSize = enabled ? "112.5%" : "";
  const button = document.querySelector("#text-size");
  button.setAttribute("aria-pressed", String(enabled));
  button.setAttribute("aria-label", enabled ? "Use standard text size" : "Increase text size");
  button.setAttribute("title", enabled ? "Use standard text size" : "Increase text size");
  try { localStorage.setItem("pension-restart-large-text", String(enabled)); } catch { /* The preference still works when browser storage is unavailable. */ }
}

function closeNavigation(restoreFocus = false) {
  const button = document.querySelector("#menu-button");
  document.querySelector("#nav-links").classList.remove("open");
  button.setAttribute("aria-expanded", "false");
  const label = button.querySelector(".sr-only");
  if (label) label.textContent = "Open menu";
  if (restoreFocus) button.focus();
}

let savedLargeText = false;
try { savedLargeText = localStorage.getItem("pension-restart-large-text") === "true"; } catch { /* Use the standard size when browser storage is unavailable. */ }
applyTextSize(savedLargeText);

window.addEventListener("hashchange", render);
document.querySelector("#text-size").addEventListener("click", () => {
  const enabled = !document.body.classList.contains("large-text");
  applyTextSize(enabled);
  showToast(enabled ? "Larger text enabled." : "Standard text size enabled.");
});
document.querySelector("#menu-button").addEventListener("click", event => {
  const nav = document.querySelector("#nav-links");
  const open = nav.classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
  const label = event.currentTarget.querySelector(".sr-only");
  if (label) label.textContent = open ? "Close menu" : "Open menu";
});
document.querySelector("#nav-links").addEventListener("click", event => {
  if (event.target.closest("a")) closeNavigation();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && document.querySelector("#nav-links").classList.contains("open")) {
    closeNavigation(true);
  }
});
document.addEventListener("click", event => {
  if (!event.target.closest("#nav-links, #menu-button")) closeNavigation();
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
