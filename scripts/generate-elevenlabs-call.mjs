#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ENDPOINT = "https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128";
const DEFAULT_OUTPUT_DIR = "assets/audio";
const DEFAULT_SEED = 1975;

const VOICES = {
  guide: {
    name: "Man",
    id: "5j3KBMZetWLloYDOXIdX",
  },
  caller: {
    name: "Granny",
    id: "gMp85KKSj3ACCB5RGSw2",
  },
};

const DIALOGUE = [
  {
    speaker: "guide",
    text: "Namaste. You have reached Pension Restart, an independent pension-guidance prototype. Please do not share an Aadhaar number, OTP, PIN or bank password. Which language would you prefer?",
  },
  { speaker: "caller", text: "Hindi." },
  {
    speaker: "guide",
    text: "Theek hai. Aap batayiye, pension ke saath kya dikkat aa rahi hai?",
  },
  {
    speaker: "caller",
    text: "December se meri pension nahi aayi. Bank mein poocha tha, par mujhe samajh nahi aaya ki kya karna hai.",
  },
  {
    speaker: "guide",
    text: "Kya November 2025 ke baad pension account mein koi pension credit hua?",
  },
  { speaker: "caller", text: "Nahi." },
  {
    speaker: "guide",
    text: "Kya aapne 2025 mein life certificate ya Jeevan Pramaan jama kiya tha?",
  },
  {
    speaker: "caller",
    text: "Mujhe yaad nahi. Shayad nahi kiya.",
  },
  {
    speaker: "guide",
    text: "Aapki baat se lagta hai ki life certificate miss hua ho sakta hai. Yeh final decision nahi hai. PPO ka pehla panna aur redacted pension statement madad kar sakte hain. Aadhaar ki photo upload mat kijiye.",
  },
  {
    speaker: "caller",
    text: "Mujhe ab kya karna hoga?",
  },
  {
    speaker: "guide",
    text: "Call ke baad aapko ek written summary, document checklist aur suitable official routes milenge. Demo reference PR-2608-1042 taiyaar hai.",
  },
];

function printHelp() {
  console.log(`
Generate Pension Restart's fixed two-speaker ElevenLabs call.

Usage:
  node scripts/generate-elevenlabs-call.mjs --api-key <key> [options]

Required:
  --api-key <key>       ElevenLabs API key. It is used only for this request.

Options:
  --output-dir <path>   Output directory (default: ${DEFAULT_OUTPUT_DIR})
  --seed <integer>      Eleven v3 best-effort seed (default: ${DEFAULT_SEED})
  --dry-run             Validate inputs without spending ElevenLabs credits
  --help                Show this help

Outputs:
  pension-restart-call.mp3
  pension-restart-call-timings.json
`);
}

function parseArguments(argv) {
  const options = {
    apiKey: "",
    outputDir: DEFAULT_OUTPUT_DIR,
    seed: DEFAULT_SEED,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      printHelp();
      process.exit(0);
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    const [name, inlineValue] = argument.split("=", 2);
    if (["--api-key", "--output-dir", "--seed"].includes(name)) {
      const value = inlineValue ?? argv[index + 1];
      if (!value || (!inlineValue && value.startsWith("--"))) {
        throw new Error(`${name} requires a value.`);
      }
      if (inlineValue === undefined) index += 1;

      if (name === "--api-key") options.apiKey = value;
      if (name === "--output-dir") options.outputDir = value;
      if (name === "--seed") options.seed = Number(value);
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 4294967295) {
    throw new Error("--seed must be an integer from 0 to 4294967295.");
  }
  if (!options.dryRun && !options.apiKey) {
    throw new Error("Missing --api-key. Use --help for an example.");
  }

  return options;
}

function buildRequestBody(seed) {
  return {
    inputs: DIALOGUE.map((turn) => ({
      text: turn.text,
      voice_id: VOICES[turn.speaker].id,
    })),
    model_id: "eleven_v3",
    seed,
    apply_text_normalization: "auto",
  };
}

function roundSeconds(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function buildTimingManifest(response, seed) {
  const segmentsByTurn = new Map();
  for (const segment of response.voice_segments ?? []) {
    const inputIndex = Number(segment.dialogue_input_index);
    if (!segmentsByTurn.has(inputIndex)) segmentsByTurn.set(inputIndex, []);
    segmentsByTurn.get(inputIndex).push(segment);
  }

  const bubbles = DIALOGUE.map((turn, index) => {
    const segments = segmentsByTurn.get(index) ?? [];
    if (!segments.length) {
      throw new Error(`ElevenLabs returned no timing segment for dialogue turn ${index + 1}.`);
    }

    const start = Math.min(...segments.map((segment) => Number(segment.start_time_seconds)));
    const end = Math.max(...segments.map((segment) => Number(segment.end_time_seconds)));
    const voice = VOICES[turn.speaker];
    return {
      id: index + 1,
      dialogueInputIndex: index,
      speaker: turn.speaker,
      speakerName: turn.speaker === "guide" ? "Pension guide" : "Kamla Devi",
      voiceName: voice.name,
      voiceId: voice.id,
      start: roundSeconds(start),
      end: roundSeconds(end),
      text: turn.text,
    };
  });

  return {
    schemaVersion: 1,
    source: "ElevenLabs Text to Dialogue with timestamps",
    model: "eleven_v3",
    seed,
    outputFormat: "mp3_44100_128",
    duration: roundSeconds(Math.max(...bubbles.map((bubble) => bubble.end))),
    voices: VOICES,
    bubbles,
  };
}

async function generate(options) {
  const requestBody = buildRequestBody(options.seed);
  const characterCount = DIALOGUE.reduce((total, turn) => total + turn.text.length, 0);

  console.log(`Prepared ${DIALOGUE.length} turns (${characterCount} characters).`);
  console.log(`Guide: ${VOICES.guide.name} · Caller: ${VOICES.caller.name}`);

  if (options.dryRun) {
    console.log("Dry run complete. No API request was made and no credits were used.");
    return;
  }

  console.log("Requesting one Eleven v3 dialogue generation with timestamps…");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": options.apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`ElevenLabs returned ${response.status}: ${details.slice(0, 800)}`);
  }

  const result = await response.json();
  if (!result.audio_base64 || !Array.isArray(result.voice_segments)) {
    throw new Error("ElevenLabs returned an unexpected response without audio or voice segments.");
  }

  const outputDir = resolve(process.cwd(), options.outputDir);
  const audioPath = resolve(outputDir, "pension-restart-call.mp3");
  const timingsPath = resolve(outputDir, "pension-restart-call-timings.json");
  const timings = buildTimingManifest(result, options.seed);

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(audioPath, Buffer.from(result.audio_base64, "base64")),
    writeFile(timingsPath, `${JSON.stringify(timings, null, 2)}\n`, "utf8"),
  ]);

  console.log(`Wrote ${audioPath}`);
  console.log(`Wrote ${timingsPath}`);
  console.log(`Dialogue duration: ${timings.duration.toFixed(3)} seconds.`);
  console.log("The API key was not written to either output file.");
}

try {
  const options = parseArguments(process.argv.slice(2));
  await generate(options);
} catch (error) {
  const message = error?.name === "AbortError"
    ? "The ElevenLabs request exceeded the 120-second timeout."
    : error?.message || String(error);
  console.error(`Generation failed: ${message}`);
  process.exitCode = 1;
}
