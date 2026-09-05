process.env.INTERPRETER_PROVIDER = "codex";

const { interpretAnswer, normalizeProposedFact } = await import("../src/interpreter.js");

const result = await interpretAnswer({
  expectedField: "scheme_family",
  question: "Do you know which pension scheme or department this pension is connected to?",
  rawAnswer: "Mujhe lagta hai EPS pension hai, EPFO se aati hai.",
  currentFacts: {},
  confirmed: false,
  correction: false,
});

console.log(JSON.stringify(result, null, 2));
if (result.provider !== "codex") {
  console.error("Codex was not used. Check that the CLI is installed, logged in, and reachable by this Unix user.");
  process.exitCode = 1;
}
const normalizedFacts = (result.facts || []).map(normalizeProposedFact).filter(Boolean);
if (!normalizedFacts.some(fact => fact.field === "scheme_family" && fact.value === "eps_95")) {
  console.error("Codex responded, but the sample fact did not pass deterministic normalization.");
  process.exitCode = 1;
}
