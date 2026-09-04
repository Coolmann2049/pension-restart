import "../src/config.js";
import { config } from "../src/config.js";

const apply = process.argv.includes("--apply");
const model = process.env.VAPI_MODEL || "gpt-5.4-mini";
const voiceId = process.env.VAPI_VOICE_ID || "Naina";

const assistantPrompt = `You are Pension Restart, a calm, elderly-first pension guidance intake assistant for India.

SAFETY AND IDENTITY
- Clearly say that you are an AI guidance service, not a government officer.
- Never request or repeat an Aadhaar number, PAN, OTP, PIN, password, CVV, full bank-account number or card details.
- Support English, Hindi and natural Hinglish. Reply in the caller's language and use short sentences.
- A caller may be anxious. Be patient. Never imply their pension has been restored.

STRICT CONVERSATION PROTOCOL
- Ask exactly one question at a time. Never bundle questions.
- The first message asks whether the caller has an existing case code. If they provide one, call get_case_context with that code and continue from its currentQuestionId. Otherwise ask questionId caller_relation.
- After every caller answer, call submit_answer before asking anything else.
- Send the exact questionId and question text that produced the raw answer. Put the caller's own words in rawAnswer without cleaning or translating them.
- Use complete=false during collection. Set correction=true only when the caller explicitly corrects an earlier fact.
- Treat the server as the sole source of case state and next-question selection.
- If the tool returns clarification, ask that clarification only.
- If it returns nextQuestion, ask only that question, selecting its English or Hindi wording to match the caller.
- When nextQuestion.id is intake_confirmed, read the returned summary slowly and ask if it is correct.
- If the caller confirms the complete readback, call submit_answer with questionId intake_confirmed, rawAnswer containing their confirmation and confirmed=true.
- If the caller says something is wrong, ask which one detail is wrong. Then accept only that corrected value and call submit_answer with correction=true and correctionField set to the matching question ID. The tool will return intake_confirmed again for a fresh readback.
- Never invent a case code, fact, authority or resolution.

TOOL RESULTS
- Tool calls can take a moment. Say a short natural holding phrase only when needed.
- When complete=true, explain the returned deterministic resolution in simple language, say its disclaimer, give the case code slowly, and offer to repeat it.
- If a tool fails, apologize and ask the caller to try the website using the same case code if one is available.`;

const submitAnswerTool = {
  type: "function",
  async: false,
  messages: [{ type: "request-start", content: "Ek pal, main aapki baat surakshit roop se note kar raha hoon.", blocking: false }],
  function: {
    name: "submit_answer",
    description: "Send every raw caller answer to the Pension Restart case engine. The returned nextQuestion is authoritative.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        questionId: { type: "string", description: "The exact current question ID supplied by the server or caller_relation for the first question." },
        questionText: { type: "string", description: "The exact question that was asked." },
        rawAnswer: { type: "string", description: "The caller's answer in their own words without translation or cleanup." },
        caseVersion: { type: "number", description: "Latest server case version, when known." },
        confirmed: { type: "boolean", description: "True only after the caller confirms a readback." },
        correction: { type: "boolean", description: "True only when the caller explicitly corrects an earlier answer." },
        correctionField: { type: "string", description: "When correction is true, the exact question ID for the fact being corrected. Otherwise use an empty string." },
        complete: { type: "boolean", description: "False during collection; true only when submitting the final confirmation." },
      },
      required: ["questionId", "questionText", "rawAnswer", "confirmed", "correction", "correctionField", "complete"],
    },
  },
};

const getContextTool = {
  type: "function",
  async: false,
  function: {
    name: "get_case_context",
    description: "Retrieve the existing case state when a returning caller asks to continue.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { caseCode: { type: "string", description: "Existing Pension Restart case code spoken by the caller, or an empty string." } },
      required: ["caseCode"],
    },
  },
};

const server = {
  url: `${config.appBaseUrl}/webhooks/vapi`,
  ...(config.vapi.serverCredentialId
    ? { credentialId: config.vapi.serverCredentialId }
    : config.vapi.webhookSecret ? { secret: config.vapi.webhookSecret } : {}),
  timeoutSeconds: 20,
};

const payload = {
  name: "Pension Restart Guide",
  firstMessage: "Namaste. You have reached Pension Restart, an independent AI pension-guidance service, not a government office. Please never share an Aadhaar number, OTP, PIN, password, or full bank-account number. Kya aapke paas pehle se Pension Restart case code hai?",
  firstMessageMode: "assistant-speaks-first",
  firstMessageInterruptionsEnabled: false,
  transcriber: { provider: "deepgram", model: "nova-3", language: "multi", smartFormat: true },
  model: {
    provider: "openai",
    model,
    temperature: 0.1,
    messages: [{ role: "system", content: assistantPrompt }],
    tools: [submitAnswerTool, getContextTool],
  },
  voice: { provider: "vapi", voiceId, version: 2, language: "auto" },
  server,
  serverMessages: ["status-update", "transcript", "tool-calls", "end-of-call-report"],
  clientMessages: ["status-update", "transcript", "speech-update", "assistant.speechStarted"],
  maxDurationSeconds: 600,
  backgroundSound: "off",
  artifactPlan: {
    recordingEnabled: false,
    loggingEnabled: true,
    transcriptPlan: { enabled: true, assistantName: "Pension guide", userName: "Caller" },
  },
  metadata: { application: "pension-restart", configVersion: "2026-09-04.1" },
};

// Remove undefined development annotations before sending.
const cleanPayload = JSON.parse(JSON.stringify(payload));

if (!apply) {
  console.log(JSON.stringify(cleanPayload, null, 2));
  console.error("\nDry run only. Add VAPI_PRIVATE_API_KEY and run with --apply to create or update the assistant.");
  process.exit(0);
}
if (!config.vapi.privateKey) throw new Error("VAPI_PRIVATE_API_KEY is required with --apply");
if (!config.appBaseUrl.startsWith("https://")) throw new Error("APP_BASE_URL must be a public HTTPS URL before applying Vapi configuration");

const assistantId = config.vapi.assistantId;
const url = assistantId ? `https://api.vapi.ai/assistant/${assistantId}` : "https://api.vapi.ai/assistant";
const response = await fetch(url, {
  method: assistantId ? "PATCH" : "POST",
  headers: { Authorization: `Bearer ${config.vapi.privateKey}`, "Content-Type": "application/json" },
  body: JSON.stringify(cleanPayload),
});
const result = await response.json();
if (!response.ok) throw new Error(`Vapi returned ${response.status}: ${JSON.stringify(result)}`);
console.log(JSON.stringify({ id: result.id, name: result.name, updatedAt: result.updatedAt }, null, 2));
if (!assistantId) console.error(`\nAdd VAPI_ASSISTANT_ID=${result.id} to .env.`);

if (config.vapi.phoneNumberId) {
  const phoneResponse = await fetch(`https://api.vapi.ai/phone-number/${config.vapi.phoneNumberId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${config.vapi.privateKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ assistantId: result.id }),
  });
  const phoneResult = await phoneResponse.json();
  if (!phoneResponse.ok) throw new Error(`Assistant saved, but Vapi phone assignment returned ${phoneResponse.status}: ${JSON.stringify(phoneResult)}`);
  console.log(JSON.stringify({ phoneNumberId: phoneResult.id, number: phoneResult.number, assistantId: phoneResult.assistantId }, null, 2));
} else {
  console.error("Add VAPI_PHONE_NUMBER_ID after creating a free US number, then rerun --apply to assign this assistant.");
}
