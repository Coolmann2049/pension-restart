# Pension Restart

An independent, elderly-first pension-guidance prototype built for Build What Moves India.

## Run locally

This is a dependency-free static site. Serve the folder with any static server:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Main demonstration

1. Open **Simulate a call**.
2. Play or skip the fixed two-speaker recording while its timestamp-synchronized transcript appears.
3. Review the deterministic summary.
4. Attach the two supplied synthetic filenames.
5. Send the demo documents.
6. Open the case and use the visible demo-review control.
7. Compare official routes or show the synthetic successful outcome.

Use **Reset demonstration** in the footer to return every state to its initial value.

## Included pages

- Public pension-guidance homepage
- Simulated call and deterministic summary
- Six-step online alternative
- Synthetic document and receipt flow
- Case timeline and status lookup
- Life-certificate route comparison
- Family-assistance dashboard
- Plain-language help centre
- Working/simulated/future disclosure

See `BUILD-NOTES.md` for the completed phase plan and short judge runbook.

## Honesty and safety

- No reasoning model or external AI API is used in the citizen experience.
- A pre-generated ElevenLabs MP3 reads only the fixed script; no microphone audio is captured or transmitted.
- No government, Aadhaar, banking or Jeevan Pramaan system is contacted.
- No real files are read or uploaded.
- All records, names, references and dates are synthetic.
- The phone number is a non-operational prototype number.

## Dependencies

- Google Fonts: Atkinson Hyperlegible and Fraunces
- Original smartphone hero illustration generated with OpenAI image generation; WebP is served with a PNG fallback
- Pre-generated ElevenLabs MP3 with a fixed timestamp manifest
- No JavaScript frameworks or runtime packages

## Generate the fixed ElevenLabs call

The one-off generator uses Man (`5j3KBMZetWLloYDOXIdX`) for the pension guide and Granny (`gMp85KKSj3ACCB5RGSw2`) for Kamla Devi. It calls ElevenLabs Text to Dialogue with timestamps and writes a static MP3 plus bubble-ready timing JSON. Node.js 18 or newer is required; no npm install is needed.

Validate without spending credits:

```bash
node scripts/generate-elevenlabs-call.mjs --dry-run
```

Generate the audio:

```bash
node scripts/generate-elevenlabs-call.mjs --api-key "YOUR_ELEVENLABS_API_KEY"
```

Outputs are written to `assets/audio/pension-restart-call.mp3` and `assets/audio/pension-restart-call-timings.json`. The API key is not persisted by the script. Supplying a secret directly in a command can leave it in shell history; use a temporary shell variable or remove the command from history afterward.
