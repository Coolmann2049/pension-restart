import { config } from "./config.js";
import { FIELD_DEFINITIONS, validateFact } from "./questions.js";

const fieldNames = Object.keys(FIELD_DEFINITIONS);

const TOOL = {
  type: "function",
  name: "interpret_case_answer",
  description: "Propose only facts explicitly supported by the caller's raw answer and request clarification when the answer is ambiguous.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      facts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            field: { type: "string", enum: fieldNames },
            value: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            evidence: { type: "string" },
            explicitCorrection: { type: "boolean" },
          },
          required: ["field", "value", "confidence", "evidence", "explicitCorrection"],
        },
      },
      clarificationNeeded: { type: "boolean" },
      clarificationReason: { type: "string" },
      suggestedQuestion: { type: "string" },
    },
    required: ["facts", "clarificationNeeded", "clarificationReason", "suggestedQuestion"],
  },
};

const SYSTEM = `You interpret one answer in a pension-guidance intake. You are not a policy adviser and must not generate a resolution.
Use the interpret_case_answer tool exactly once. Extract only information explicitly supported by the raw answer.
Prefer the expected field. You may extract another field only if the caller states it explicitly in the same answer.
Never extract Aadhaar, PAN, OTP, PIN, password, full bank account or card information.
If alternatives are offered (for example "post office or central government"), do not choose one. Mark clarificationNeeded and suggest one short, respectful question.
Use supported enum values exactly. Use decimal digits for pension_amount. Use an approximate human-readable month for last_credit_date.
An answer does not become confirmed merely because it sounds confident. Set confidence based on semantic certainty.
Set explicitCorrection only when the caller clearly corrects an earlier answer.`;

function toolResultFromResponse(payload) {
  const call = payload?.output?.find(item => item.type === "function_call" && item.name === TOOL.name);
  if (!call) throw new Error("Interpretation model did not call the required tool");
  return JSON.parse(call.arguments);
}

async function interpretWithOpenAI(input) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.openai.model,
        instructions: SYSTEM,
        input: JSON.stringify({
          expectedField: input.expectedField,
          question: input.question,
          rawAnswer: input.rawAnswer,
          callerConfirmedReadback: Boolean(input.confirmed),
          correctionRequested: Boolean(input.correction),
          currentFacts: Object.fromEntries(Object.entries(input.currentFacts).map(([field, fact]) => [field, fact.value])),
        }),
        tools: [TOOL],
        tool_choice: { type: "function", name: TOOL.name },
        parallel_tool_calls: false,
        max_output_tokens: 500,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return { provider: "openai", ...(toolResultFromResponse(await response.json())) };
  } finally {
    clearTimeout(timeout);
  }
}

const contains = (text, words) => words.some(word => text.includes(word));

function enumFallback(field, text) {
  const rules = {
    caller_relation: [
      ["self", ["my own pension", "apni pension", "khud ki pension", "khud ke liye"]], ["spouse", ["wife", "husband", "patni", "pati"]],
      ["child", ["mother", "father", "maa", "papa", "mummy", "parent"]], ["grandchild", ["grandmother", "grandfather", "dadi", "nani", "dada", "nana"]],
    ],
    issue_type: [
      ["life_certificate_rejected", ["certificate rejected", "pramaan rejected", "reject ho"]], ["stopped", ["stopped", "band", "nahi aa"]],
      ["reduced", ["reduced", "kam ho", "less pension"]], ["delayed", ["late", "delay", "der se"]],
      ["family_pension", ["family pension", "widow pension"]], ["revision_pending", ["revision", "arrears"]], ["new_pension_pending", ["new pension", "start nahi"]],
    ],
    scheme_family: [
      ["eps_95", ["eps", "epfo", "provident fund"]], ["defence", ["defence", "army", "navy", "air force", "sparsh", "sena"]],
      ["railways", ["railway", "railways"]], ["nps_ups_apy", ["nps", "ups", "apy", "atal pension"]],
      ["central_civil", ["central government", "central govt", "kendra sarkar"]], ["state_government", ["state government", "rajya sarkar"]],
      ["social_assistance", ["old age pension", "widow pension", "disability pension", "vridha"]], ["private_annuity", ["insurance", "annuity", "lic"]],
    ],
    disbursement_channel: [
      ["post_office", ["post office", "dak ghar"]], ["bank", ["bank"]], ["treasury", ["treasury", "koshagar"]],
      ["insurer", ["insurance", "insurer", "lic"]], ["employer", ["employer", "company"]],
    ],
    life_certificate_status: [
      ["submitted_rejected", ["rejected", "reject"]], ["submitted_accepted", ["accepted", "accept ho"]],
      ["submitted_pending", ["pending", "processing"]], ["not_submitted", ["not submitted", "nahi kiya", "jama nahi"]],
      ["not_remembered", ["don't remember", "do not remember", "yaad nahi"]],
    ],
    life_certificate_method: [
      ["jeevan_pramaan_mobile", ["mobile", "app", "face"]], ["biometric_centre", ["biometric", "csc", "centre", "center"]],
      ["post_office", ["post office", "dak ghar"]], ["bank", ["bank"]], ["doorstep", ["doorstep", "home visit", "ghar aaye"]], ["paper", ["paper", "physical"]],
    ],
    changed_details: [
      ["bank_account", ["account changed", "bank account bad"]], ["branch", ["branch changed", "branch bad"]],
      ["address", ["address changed", "pata bad"]], ["mobile", ["mobile changed", "number bad"]], ["kyc", ["kyc"]], ["none", ["nothing", "none", "kuch nahi"]],
    ],
  };
  const matches = (rules[field] || []).filter(([, words]) => contains(text, words));
  return matches.length === 1 ? matches[0][0] : null;
}

function localInterpret(input) {
  const field = input.expectedField;
  const text = input.rawAnswer.toLowerCase().trim();
  const soundsAmbiguous = contains(text, ["maybe", "perhaps", "shayad", "kya pata", "or maybe", "ya fir", "ya phir"]);
  let candidate = null;
  if (FIELD_DEFINITIONS[field]?.type === "enum") candidate = FIELD_DEFINITIONS[field].values.includes(text) ? text : enumFallback(field, text);
  else if (FIELD_DEFINITIONS[field]?.type === "boolean") {
    if (text === "true" || contains(text, ["yes", "haan", "ha", "correct", "sahi"])) candidate = "true";
    if (text === "false" || contains(text, ["no", "nahi", "nahin", "wrong", "galat"])) candidate = candidate ? null : "false";
  } else if (field === "pension_amount") candidate = text.match(/[\d,]+(?:\.\d+)?/)?.[0]?.replaceAll(",", "") || null;
  else candidate = input.rawAnswer.trim();

  if (!candidate || soundsAmbiguous) return {
    provider: "local-fallback", facts: [], clarificationNeeded: true,
    clarificationReason: "The answer could not be normalized confidently without the configured interpretation model.",
    suggestedQuestion: input.question,
  };
  return {
    provider: "local-fallback",
    facts: [{ field, value: String(candidate), confidence: 0.78, evidence: input.rawAnswer, explicitCorrection: Boolean(input.correction) }],
    clarificationNeeded: false, clarificationReason: "", suggestedQuestion: "",
  };
}

export async function interpretAnswer(input) {
  if (!input.rawAnswer || !input.expectedField) throw new Error("rawAnswer and expectedField are required");
  try {
    return config.openai.apiKey ? await interpretWithOpenAI(input) : localInterpret(input);
  } catch (error) {
    return { ...localInterpret(input), provider: "local-fallback-after-error", providerError: error.message };
  }
}

export function normalizeProposedFact(proposal) {
  const result = validateFact(proposal.field, proposal.value);
  return result.valid ? { ...proposal, value: result.value } : null;
}
