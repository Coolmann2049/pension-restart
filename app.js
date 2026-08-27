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
  { who: "guide", name: "Pension guide", text: "Namaste. You have reached Pension Restart, an independent pension-guidance prototype. Please do not share an Aadhaar number, OTP, PIN or bank password. Which language would you prefer?" },
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
  return `
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="eyebrow">Proposed voice guidance service</span>
          <h1>When your pension stops, <em>one call</em> should tell you what to do next.</h1>
          <p class="lead">Explain the problem in your own words. Leave with a clear summary, a safe document checklist and a practical next step—without first understanding every portal.</p>
          <p class="hero-number-label">Call for pension guidance</p>
          <a class="hero-number" href="#/call" aria-label="Prototype number 1800 000 1975">1800 · 000 · 1975</a>
          <p class="hero-note">Prototype demonstration number — not an active telephone service.</p>
          <div class="hero-actions">
            <a class="button button-primary" href="#/call">☎ Simulate a call</a>
            <a class="button button-quiet" href="#/online">Continue online instead</a>
          </div>
          <div class="hero-safety"><span class="shield-dot"></span>Never share an OTP, PIN, CVV or bank password. This prototype uses synthetic information only.</div>
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
          <a class="button button-secondary" href="#/online">Create a demo recovery record</a>
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
          <article class="info-card"><span class="icon-box teal">✓</span><h3>Helpful references</h3><ul class="check-list"><li>Synthetic PPO first page</li><li>Last pension-credit month</li><li>Pramaan ID or acknowledgement</li><li>Redacted pension-credit record</li></ul></article>
          <article class="info-card"><span class="icon-box">!</span><h3>Never requested here</h3><ul class="check-list"><li>Real Aadhaar or PAN</li><li>OTP, PIN, CVV or password</li><li>Payment-card details</li><li>Unredacted bank statements</li></ul></article>
        </div>
      </div>
    </section>

    <section class="section section-tight">
      <div class="container banner">
        <div><span class="eyebrow eyebrow-light">One clear beginning</span><h2>A pension problem should not begin with finding the right portal.</h2><p>Start with one guided conversation and leave with a next step your family can understand.</p></div>
        <a class="button button-primary" href="#/call">Simulate the call</a>
      </div>
    </section>`;
}

function callView() {
  return `${pageHero("Call for guidance", "Speak first. Sort out the forms later.", "Hear a fixed two-speaker demonstration recorded for this prototype. No microphone, live AI reasoning or government system is involved.")}
    <section class="section section-tight">
      <div class="container">
        <div class="prototype-card narrow"><strong>Voiced, but still deterministic</strong><p class="muted">This is a fixed ElevenLabs recording with supplied timestamps, so every reviewer hears the same conversation and sees the same matching transcript. No speech is recorded, uploaded or interpreted.</p></div>
        <div class="spacer-md"></div>
        <div class="phone-shell" id="phone-shell">
          <audio id="call-audio" preload="auto" src="assets/audio/pension-restart-call.mp3" aria-hidden="true"></audio>
          <div class="phone-top"><span class="connected">Connected</span><span id="call-duration">00:00</span></div>
          <div class="phone-body">
            <div class="caller-block"><span class="caller-avatar">KD</span><h2>Kamla Devi</h2><p>Synthetic pensioner · Hindi selected</p></div>
            <div class="transcript-heading"><strong>Live transcript</strong><span id="voice-status">Loading recorded dialogue…</span></div>
            <div class="transcript" id="transcript" aria-live="polite" aria-label="Call transcript">
              <div class="center" id="call-intro">
                <p class="lead-light">Tap start to hear the recorded conversation while each matching transcript bubble appears.</p>
                <button class="button button-primary" id="start-call" type="button" disabled>Loading call…</button>
              </div>
            </div>
          </div>
          <div class="phone-controls">
            <button class="round-control" id="toggle-voice" type="button" aria-label="Mute recorded call" aria-pressed="false" disabled>🔊</button>
            <button class="round-control" id="skip-call" type="button" aria-label="Skip to result">≫</button>
            <button class="round-control end" id="end-call" type="button">End call</button>
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

function onlineView() {
  const step = Math.max(1, Math.min(6, state.formStep));
  const config = formSteps[step - 1];
  const selected = state.formAnswers[config.key] || "";
  return `${pageHero("Continue online", "One question at a time.", "You do not need to know the name of the right portal. Review everything before creating a synthetic record.")}
    <section class="section section-tight">
      <div class="form-shell">
        <p class="muted">Step ${step} of 6 · ${config.title}</p>
        <div class="progress">${Array.from({ length: 6 }, (_, i) => `<span class="progress-step ${i < step ? "active" : ""}"></span>`).join("")}</div>
        <div class="question">
          <h2>${config.question}</h2>
          <p class="muted">Choose the closest answer. You can continue even if you are unsure.</p>
        </div>
        <div class="choice-grid">
          ${config.options.map(option => `<button class="choice ${selected === option ? "selected" : ""}" data-answer="${escapeAttr(option)}" data-key="${config.key}" type="button"><span class="choice-dot"></span><span>${option}</span></button>`).join("")}
        </div>
        ${step === 4 ? '<div class="spacer-sm"></div><div class="callout">Some pensioners may need a conventional life-certificate process. This prototype will not recommend a digital route as a final decision.</div>' : ""}
        ${step === 6 ? '<div class="spacer-sm"></div><label class="choice"><input type="checkbox" id="prototype-consent" checked /> I understand that this prototype does not submit to a government system.</label>' : ""}
        <div class="form-actions">
          <button class="button button-quiet" id="form-back" type="button" ${step === 1 ? "disabled" : ""}>Back</button>
          <button class="button button-primary" id="form-next" type="button" ${selected ? "" : "disabled"}>${step === 6 ? "Create demo record" : "Continue"}</button>
        </div>
      </div>
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
  return `${pageHero("Check demo status", "One reference. One understandable result.", "This page searches only the synthetic record bundled into the prototype.")}
    <section class="section section-tight">
      <div class="form-shell">
        <label for="status-id"><strong>Demonstration reference</strong></label>
        <input id="status-id" value="PR-2608-1042" style="width:100%;margin:12px 0 18px;padding:16px;border:2px solid var(--line);border-radius:14px" />
        <button class="button button-primary" id="check-status" type="button">Check demo status</button>
        <div id="status-result"></div>
      </div>
    </section>`;
}

function helpView() {
  const faqs = [
    ["Can Pension Restart issue my life certificate?", "No. It explains available routes and helps you prepare. The official process must be completed through an eligible authority, bank, post office, centre, mobile application or available doorstep channel."],
    ["Is the displayed phone number active?", "No. It is a prototype number. Select “Simulate a call” to experience the working scripted journey."],
    ["Is the voice assistant using AI in this prototype?", "No live reasoning model is running. The call is a pre-generated ElevenLabs recording; its transcript and case extraction remain fixed. A production version could use a multilingual voice model with human oversight."],
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
  return `${pageHero("About this prototype", "Clear about what works. Clear about what is proposed.", "Pension Restart reorganises the journey around the citizen's real sentence: “My pension stopped.”")}
    <section class="section section-tight">
      <div class="container disclosure-grid">
        <article class="disclosure-card works"><h3>Working now</h3><ul><li>Responsive citizen journey</li><li>Fixed two-speaker recorded call</li><li>Timestamp-synchronized transcript</li><li>Deterministic case summary</li><li>Online step-by-step form</li><li>Synthetic document states</li><li>Family dashboard</li><li>Downloadable case JSON</li></ul></article>
        <article class="disclosure-card mocked"><h3>Simulated</h3><ul><li>Speech recognition</li><li>AI issue classification</li><li>Human document review</li><li>Government and bank connections</li><li>SMS and telephone delivery</li><li>Pension resumption</li></ul></article>
        <article class="disclosure-card future"><h3>Production pilot</h3><ul><li>Multilingual voice assistant</li><li>Secure consent controls</li><li>Approved integrations</li><li>Human-review process</li><li>Audit and data retention</li><li>Grievance routing</li></ul></article>
      </div>
    </section>
    <section class="section surface-white"><div class="container split-grid"><div><span class="eyebrow">Why it exists</span><h2>A real family experience became a simpler starting point.</h2><p class="lead">An elderly relative's pension stopped because nobody knew that her life certificate was due. The prototype asks what would change if the pensioner could begin with one understandable conversation.</p></div><article class="summary-card"><h3>Independence statement</h3><p>Pension Restart is not affiliated with, approved by or operated by Jeevan Pramaan, UIDAI, EPFO, a bank, a post office or a government department.</p><h3>How Codex contributed</h3><p>Codex supported research, product-state design, copy, deterministic fixtures, responsive implementation, accessibility checks and documentation.</p></article></div></section>`;
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
    initializeRecordedCall();
    document.querySelector("#start-call")?.addEventListener("click", playCall);
    document.querySelector("#toggle-voice")?.addEventListener("click", toggleCallAudio);
    document.querySelector("#skip-call")?.addEventListener("click", () => finishCall(true));
    document.querySelector("#end-call")?.addEventListener("click", () => finishCall(true));
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

  document.querySelector("#check-status")?.addEventListener("click", () => {
    const id = document.querySelector("#status-id").value.trim();
    const result = document.querySelector("#status-result");
    result.innerHTML = id.toUpperCase() === caseData.id
      ? `<div class="spacer-md"></div><div class="callout ${state.pensionProtected ? "success" : ""}"><strong>${state.pensionProtected ? "Pension protected" : state.reviewShown ? "Guidance prepared" : state.documentsSent ? "Documents received" : "Awaiting documents"}</strong><p>${state.pensionProtected ? "A synthetic successful outcome has been recorded." : "No Digital Life Certificate acceptance or pension credit has been confirmed."}</p><a class="text-link" href="#/case">Open complete case</a></div>`
      : `<div class="spacer-md"></div><div class="callout danger"><strong>No synthetic record found.</strong><p>Try PR-2608-1042. This does not search any government database.</p></div>`;
  });

  document.querySelectorAll(".faq-question").forEach(button => button.addEventListener("click", () => {
    const item = button.closest(".faq-item");
    item.classList.toggle("open");
    button.setAttribute("aria-expanded", String(item.classList.contains("open")));
    button.querySelector("span:last-child").textContent = item.classList.contains("open") ? "−" : "+";
  }));
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

render();
