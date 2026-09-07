export const FIELD_DEFINITIONS = Object.freeze({
  caller_relation: { type: "enum", values: ["self", "spouse", "child", "grandchild", "relative", "helper", "other"] },
  whatsapp_followup_consent: { type: "boolean" },
  pensioner_name: { type: "string", maxLength: 100 },
  issue_type: { type: "enum", values: ["stopped", "delayed", "reduced", "life_certificate_rejected", "new_pension_pending", "revision_pending", "family_pension", "unknown"] },
  scheme_family: { type: "enum", values: ["central_civil", "defence", "railways", "eps_95", "nps_ups_apy", "state_government", "social_assistance", "private_annuity", "employer_superannuation", "unknown"] },
  scheme_name: { type: "string", maxLength: 160 },
  former_employer: { type: "string", maxLength: 160 },
  disbursement_channel: { type: "enum", values: ["bank", "post_office", "treasury", "insurer", "employer", "unknown"] },
  disbursing_institution: { type: "string", maxLength: 160 },
  last_credit_date: { type: "string", maxLength: 40 },
  pension_amount: { type: "number", min: 0, max: 10000000 },
  life_certificate_status: { type: "enum", values: ["submitted_accepted", "submitted_pending", "submitted_rejected", "not_submitted", "not_remembered", "not_applicable", "unknown"] },
  life_certificate_method: { type: "enum", values: ["jeevan_pramaan_mobile", "biometric_centre", "bank", "post_office", "doorstep", "paper", "unknown"] },
  life_certificate_receipt_available: { type: "boolean" },
  changed_details: { type: "enum", values: ["bank_account", "branch", "address", "mobile", "kyc", "none", "unknown"] },
  location_state: { type: "string", maxLength: 100 },
  intake_confirmed: { type: "boolean" },
});

const q = (id, field, en, hi, when = () => true) => ({ id, field, en, hi, when });

export const QUESTIONS = [
  q("caller_relation", "caller_relation", "Are you calling about your own pension, or are you helping someone else?", "Kya aap apni pension ke baare mein call kar rahe hain, ya kisi aur ki madad kar rahe hain?"),
  q("whatsapp_followup_consent", "whatsapp_followup_consent", "May we send this case ID and status to the same number on WhatsApp after the call?", "Kya call ke baad hum isi number par WhatsApp se case ID aur status bhej sakte hain?"),
  q("pensioner_name", "pensioner_name", "What name should I use for the pensioner? You may give only a first name.", "Pensioner ko main kis naam se bulaun? Aap sirf pehla naam bata sakte hain."),
  q("issue_type", "issue_type", "What has happened: has the pension stopped, become late or reduced, or is an application still pending?", "Kya dikkat hui hai-pension band ho gayi, der se aa rahi hai, kam ho gayi hai, ya application abhi pending hai?"),
  q("scheme_family", "scheme_family", "Do you know which pension scheme, former employer or government department this pension is connected to?", "Kya aapko pata hai ki pension kis scheme, purane employer, ya sarkari department se judi hai?"),
  q("former_employer", "former_employer", "Which department, service, company or organisation did the pensioner work for?", "Pensioner kis department, service, company, ya sanstha mein kaam karte the?", facts => ["central_civil", "defence", "railways", "state_government", "employer_superannuation", "unknown"].includes(facts.scheme_family?.value)),
  q("disbursement_channel", "disbursement_channel", "Does the pension normally arrive through a bank, post office, treasury, insurer or former employer?", "Pension aam taur par bank, post office, treasury, insurance company, ya purane employer se aati hai?"),
  q("disbursing_institution", "disbursing_institution", "Do you know the name of that bank, post office, insurer or paying institution? Do not tell me an account number.", "Kya aapko us bank, post office, insurance company, ya payment institution ka naam pata hai? Account number mat batayiyega."),
  q("last_credit_date", "last_credit_date", "When did the last normal pension payment arrive? An approximate month is enough.", "Aakhri baar poori pension lagbhag kis mahine mein aayi thi?"),
  q("pension_amount", "pension_amount", "Approximately how much pension normally arrives each month?", "Har mahine lagbhag kitni pension aati thi?"),
  q("life_certificate_status", "life_certificate_status", "Was a life certificate or Jeevan Pramaan submitted during the latest required period?", "Kya sabse naye required period mein life certificate ya Jeevan Pramaan jama kiya gaya tha?"),
  q("life_certificate_method", "life_certificate_method", "How was the life certificate submitted: mobile, biometric centre, bank, post office, doorstep service or paper?", "Life certificate kaise jama hua tha-mobile, biometric centre, bank, post office, doorstep service, ya paper se?", facts => String(facts.life_certificate_status?.value || "").startsWith("submitted_")),
  q("life_certificate_receipt_available", "life_certificate_receipt_available", "Do you still have its receipt or Pramaan acknowledgement? Please answer only yes or no; do not read the number aloud.", "Kya uski receipt ya Pramaan acknowledgement aapke paas hai? Sirf haan ya na batayein; number phone par mat boliye.", facts => String(facts.life_certificate_status?.value || "").startsWith("submitted_")),
  q("changed_details", "changed_details", "Since the last correct payment, did the bank account, branch, address, mobile number or KYC details change?", "Aakhri sahi payment ke baad bank account, branch, address, mobile number, ya KYC details badli thi?"),
  q("location_state", "location_state", "Which state does the pensioner currently live in?", "Pensioner abhi kis rajya mein rehte hain?"),
  q("intake_confirmed", "intake_confirmed", "I will now read back the important details. After listening, please tell me whether they are correct.", "Main ab zaroori jaankari dobara bataunga. Sunne ke baad kahiye kya sab sahi hai."),
];

export function validateFact(field, value) {
  const definition = FIELD_DEFINITIONS[field];
  if (!definition) return { valid: false, reason: "unknown_field" };
  if (value === null || value === undefined || value === "") return { valid: false, reason: "empty_value" };
  if (definition.type === "enum") {
    const normalized = String(value).trim().toLowerCase();
    return definition.values.includes(normalized) ? { valid: true, value: normalized } : { valid: false, reason: "invalid_enum" };
  }
  if (definition.type === "boolean") {
    if (typeof value === "boolean") return { valid: true, value };
    if (["true", "yes", "haan", "ha"].includes(String(value).toLowerCase())) return { valid: true, value: true };
    if (["false", "no", "nahi", "nahin"].includes(String(value).toLowerCase())) return { valid: true, value: false };
    return { valid: false, reason: "invalid_boolean" };
  }
  if (definition.type === "number") {
    const normalized = Number(String(value).replace(/[^0-9.]/g, ""));
    return Number.isFinite(normalized) && normalized >= definition.min && normalized <= definition.max
      ? { valid: true, value: normalized }
      : { valid: false, reason: "invalid_number" };
  }
  const normalized = String(value).trim().slice(0, definition.maxLength);
  return normalized ? { valid: true, value: normalized } : { valid: false, reason: "invalid_string" };
}

export function nextQuestion(facts) {
  return QUESTIONS.find(question => question.when(facts) && !facts[question.field]) || null;
}

export function completion(facts) {
  const applicable = QUESTIONS.filter(question => question.field !== "intake_confirmed" && question.when(facts));
  const answered = applicable.filter(question => facts[question.field]).length;
  return Math.min(95, Math.round((answered / Math.max(applicable.length, 1)) * 95));
}

export function questionById(questionId) {
  return QUESTIONS.find(question => question.id === questionId) || null;
}
