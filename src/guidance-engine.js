const SOURCES = Object.freeze({
  jeevanPramaan: { label: "Jeevan Pramaan FAQ", url: "https://jeevanpramaan.gov.in/v2.0/misc/faq" },
  epfigms: { label: "EPFO grievance portal", url: "https://epfigms.gov.in/" },
  epfoHelp: { label: "EPFO pension help", url: "https://www.epfindia.gov.in/site_en/Help.php" },
  cpao: { label: "Central Pension Accounting Office", url: "https://cpao.nic.in/" },
  cpengrams: { label: "CPENGRAMS", url: "https://pgportal.gov.in/pension/" },
  pfrda: { label: "PFRDA Pension Sahayak", url: "https://pensionsahayak.pfrda.org.in/" },
  nsap: { label: "National Social Assistance Programme", url: "https://nsap.nic.in/" },
  sparsh: { label: "SPARSH defence pension portal", url: "https://sparsh.defencepension.gov.in/" },
  insurer: { label: "IRDAI Bima Bharosa", url: "https://bimabharosa.irdai.gov.in/" },
});

const ROUTES = Object.freeze({
  central_civil: { authority: "Pension-paying bank/CPPC or CPAO", escalation: "CPENGRAMS", sources: [SOURCES.cpao, SOURCES.cpengrams] },
  defence: { authority: "SPARSH or the relevant defence pension disbursing authority", escalation: "SPARSH grievance channel", sources: [SOURCES.sparsh] },
  railways: { authority: "Pension-paying bank and the pensioner's former railway pension authority", escalation: "Railway grievance channel or CPENGRAMS", sources: [SOURCES.cpengrams] },
  eps_95: { authority: "EPFO field office or pension-paying institution", escalation: "EPFiGMS", sources: [SOURCES.epfoHelp, SOURCES.epfigms] },
  nps_ups_apy: { authority: "NPS/APY intermediary or nodal office", escalation: "PFRDA Pension Sahayak", sources: [SOURCES.pfrda] },
  state_government: { authority: "State treasury, pension directorate or pension-paying institution", escalation: "The state's official grievance portal", sources: [] },
  social_assistance: { authority: "State/UT social-welfare or rural-development authority", escalation: "District/state grievance channel", sources: [SOURCES.nsap] },
  private_annuity: { authority: "The issuing insurer", escalation: "IRDAI Bima Bharosa", sources: [SOURCES.insurer] },
  employer_superannuation: { authority: "Former employer or superannuation trust", escalation: "Trust/insurer grievance officer", sources: [SOURCES.insurer] },
  unknown: { authority: "The institution shown beside the most recent pension credit", escalation: "Human-assisted scheme identification", sources: [] },
});

function value(facts, field, fallback = null) {
  return facts[field]?.value ?? fallback;
}

export function resolveGuidance(facts) {
  const scheme = value(facts, "scheme_family", "unknown");
  const issue = value(facts, "issue_type", "unknown");
  const certificate = value(facts, "life_certificate_status", "unknown");
  const changed = value(facts, "changed_details", "unknown");
  const route = ROUTES[scheme] || ROUTES.unknown;
  const steps = [];
  const documents = ["Pension payment order or pension reference, if available", "A redacted record showing the last pension credit"];
  const sources = [...route.sources];
  let likelyCause = "The available information is not enough to identify a single cause.";
  let confidence = "low";
  let requiresHumanReview = scheme === "unknown" || issue === "unknown";

  if (["not_submitted", "not_remembered"].includes(certificate) && ["stopped", "delayed"].includes(issue)) {
    likelyCause = "A missing or expired life certificate may have interrupted payment.";
    confidence = certificate === "not_submitted" ? "high" : "medium";
    steps.push("Confirm when the last life certificate was accepted by the pension-paying institution.");
    steps.push("Use an eligible Jeevan Pramaan, assisted, doorstep or conventional life-certificate route.");
    steps.push("Keep the acknowledgement until the paying institution confirms acceptance and pension credit.");
    documents.push("Life-certificate or Jeevan Pramaan acknowledgement after submission");
    sources.unshift(SOURCES.jeevanPramaan);
  } else if (certificate === "submitted_rejected") {
    likelyCause = "The submitted life certificate may contain mismatched pension particulars or may not have been accepted by the disbursing authority.";
    confidence = "high";
    steps.push("Check the rejection message without sharing Aadhaar, OTP or full bank details.");
    steps.push("Verify the pension authority, disbursing authority and pension reference before regenerating the certificate.");
    steps.push(`Contact ${route.authority} if the corrected certificate remains rejected.`);
    documents.push("Rejection message or acknowledgement");
    sources.unshift(SOURCES.jeevanPramaan);
  } else if (["submitted_accepted", "submitted_pending"].includes(certificate) && ["stopped", "delayed"].includes(issue)) {
    likelyCause = "The life certificate appears to have been submitted, so the paying institution or pension authority should trace the payment status.";
    confidence = certificate === "submitted_accepted" ? "medium" : "low";
    steps.push("Confirm the certificate status and acknowledgement date.");
    steps.push(`Ask ${route.authority} to trace the missing payment using the same dates and references.`);
    steps.push(`Escalate through ${route.escalation} if the institution does not resolve it.`);
    documents.push("Life-certificate acknowledgement or acceptance status");
  } else if (["bank_account", "branch", "kyc"].includes(changed)) {
    likelyCause = "A bank, branch or KYC change may have interrupted the payment mapping.";
    confidence = "medium";
    steps.push("Ask the paying institution to confirm which account and branch are mapped to the pension record.");
    steps.push("Complete only the official account-transfer or KYC correction process requested by that institution.");
    steps.push("Keep a written acknowledgement of the correction request.");
    documents.push("Acknowledgement of the bank, branch or KYC update");
  } else if (issue === "reduced" || issue === "revision_pending") {
    likelyCause = "The case may concern pension calculation, revision or arrears rather than life-certificate acceptance.";
    confidence = "medium";
    steps.push("Compare the latest credit with the pension order and the last correct credit.");
    steps.push(`Request a calculation or revision explanation from ${route.authority}.`);
    steps.push(`Use ${route.escalation} if the written explanation does not resolve the discrepancy.`);
    documents.push("Pension revision order, if any", "Redacted comparison of the expected and received amounts");
  } else if (issue === "family_pension") {
    likelyCause = "Family-pension commencement or conversion normally requires authority-specific documents and human review.";
    confidence = "medium";
    requiresHumanReview = true;
    steps.push(`Contact ${route.authority} for the applicable family-pension conversion checklist.`);
    steps.push("Do not upload unredacted identity, death or bank documents until the official destination is verified.");
    documents.push("Family-pension application acknowledgement, if already submitted");
  } else {
    steps.push("Identify the paying institution from the pension order or narration beside the most recent credit.");
    steps.push(`Contact ${route.authority} with the last-credit date and pension reference.`);
    steps.push(`Use ${route.escalation} if the responsible institution cannot be identified or does not respond.`);
  }

  if (scheme === "unknown") {
    steps.unshift("Ask a trusted person or reviewer to identify the pension family from a redacted pension order or bank narration.");
  }

  return {
    title: "Pension guidance plan",
    likelyCause,
    confidence,
    nextSteps: [...new Set(steps)],
    documents: [...new Set(documents)],
    primaryAuthority: route.authority,
    escalationAuthority: route.escalation,
    officialSources: [...new Map(sources.map(source => [source.url, source])).values()],
    requiresHumanReview,
    safetyNotice: "Never share an OTP, PIN, password, full Aadhaar number or unredacted bank account details on a call.",
    disclaimer: "This is a guidance plan, not a government decision or confirmation that pension has restarted.",
    ruleVersion: "2026-09-04.1",
    generatedAt: new Date().toISOString(),
  };
}
