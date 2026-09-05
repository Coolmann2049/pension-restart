# Pension Restart

Pension Restart is an independent, elderly-first pension guidance service. A caller can explain a pension problem in Hindi, English or Hinglish; the system gathers one answer at a time, keeps a correction-safe case record, and returns a deterministic guidance route. The same case can continue on the website, a Vapi telephone assistant or a Meta WhatsApp bot.

It is not a government service and never claims that a pension has been restarted.

## What works

- Express serves the public site, JSON APIs, provider webhooks and admin workspace.
- SQLite stores cases, channel identities, conversations, transcripts, append-only fact history and resolution plans.
- A ChatGPT-authenticated Codex CLI process or the OpenAI Responses API can interpret each raw answer into constrained facts; a conservative local fallback keeps development usable without either provider.
- The deterministic guidance engine owns every route and resolution. The model cannot invent or directly mutate a case.
- Vapi supports a real inbound US number and browser microphone calls with live transcripts.
- Meta WhatsApp Cloud API supports buttons/lists, same-number continuity and case-code linking.
- Server-Sent Events update `/admin` as calls and messages arrive.
- A private six-digit code connects a case across channels. It is verified when entered and then remains the user-facing case reference; the database continues to use an internal UUID.
- Repeated incorrect code attempts are throttled. Legacy `PR-…` codes are migrated to six digits while remaining valid as hidden aliases.

The older document-review screens remain clearly labelled demonstration states. There is no government, Aadhaar, bank or Jeevan Pramaan integration.

## Local setup

Requires Node.js 20 or newer.

```bash
cp .env.example .env
npm install
npm run build
npm run hash-password -- "choose-a-long-admin-password"
# paste the printed hash into ADMIN_PASSWORD_HASH in .env
npm start
```

Open `http://localhost:3000`. The operations workspace is at `http://localhost:3000/admin`.

Without provider credentials, the online intake and admin dashboard still work. In development only, an absent `ADMIN_PASSWORD_HASH` enables `admin` / `admin`.

### Codex interpreter (hackathon mode)

This build can use a locally authenticated Codex CLI instead of an OpenAI Platform API key. Each answer starts an ephemeral, non-interactive run in a new temporary directory with read-only sandboxing and a strict JSON output schema. Application secrets are removed from the child-process environment. The result still passes through the same deterministic field validator and guidance engine. If Codex is unavailable, fails validation or exceeds the timeout, the conservative local interpreter takes over.

Install and sign in as the same Unix user that runs Node/PM2, then configure:

```dotenv
INTERPRETER_PROVIDER=codex
CODEX_BIN=/absolute/path/printed/by-command-v-codex
CODEX_MODEL=
CODEX_REASONING_EFFORT=low
CODEX_TIMEOUT_MS=15000
OPENAI_API_KEY=
```

Verify the complete bridge before starting PM2:

```bash
codex login status
npm run check:codex
```

`CODEX_MODEL` is intentionally blank by default so the authenticated account can use its current default. This bridge is for the short-lived hackathon deployment, not a general public Codex service. It does not expose a route that accepts arbitrary Codex prompts.

## Provider setup

### Vapi

1. Create Vapi private and public API keys. Restrict the public key to the production origin and assistant.
2. In **Integrations**, optionally connect your own OpenAI/Deepgram/voice provider keys. Vapi supports bring-your-own provider keys; their usage is then billed by that provider.
3. In **Server Configuration**, create a Bearer credential whose token is the same value as `VAPI_WEBHOOK_SECRET`; copy its ID into `VAPI_SERVER_CREDENTIAL_ID`.
4. Create the first free Vapi US number in the dashboard and copy its number ID and display number. The number is free, but calls/provider usage consume credits; free Vapi numbers are US-national only.
5. Set the Vapi values in `.env`, deploy the HTTPS backend, then run:

```bash
node scripts/configure-vapi.mjs --dry-run
node scripts/configure-vapi.mjs --apply
```

The second command creates or updates the assistant and, when `VAPI_PHONE_NUMBER_ID` is present, assigns it to the number. If it creates a new assistant, put the printed ID in `.env` and rerun it.

### Meta WhatsApp Cloud API

1. In Meta for Developers, create a **Business** app, add **WhatsApp**, and connect the WABA/production phone number. Copy the app secret, phone-number ID and WABA ID.
2. In Business Settings, create a system user, assign the app and WhatsApp account, and generate a permanent token with `whatsapp_business_messaging` and `whatsapp_business_management`.
3. In WhatsApp Manager, select the library template `verify_account_2` and note its exact language code. This hackathon build intentionally depends on that fixed library template.
4. The four variables are sent as `accessing`, `Pension Restart`, `your pension guidance case`, and the generated six-digit access code. Set `WHATSAPP_ACCESS_TEMPLATE_NAME=verify_account_2` and the exact approved language in `.env`.
5. Set the callback URL to `https://YOUR_DOMAIN/webhooks/whatsapp`, use the same random value as `WHATSAPP_VERIFY_TOKEN`, and subscribe the app to `messages`.
6. Add the remaining WhatsApp values to `.env`, restart the service, and call the helpline while consenting to the WhatsApp follow-up.

The end-of-call webhook sends `verify_account_2` only after explicit consent. Meta receives the raw six digits, such as `123456`; the website, admin panel and phone assistant display the branded case reference `PR-123456`. Either form reconnects the same case.

## Architecture

```text
Phone / browser voice ─ Vapi ─┐
Website ──────────────────────┼─ Express case service ─ SQLite ─ live admin SSE
WhatsApp ─ Meta Cloud API ────┘          │
                                         ├─ Codex/OpenAI constrained interpretation
                                         └─ deterministic guidance rules
```

Vapi and WhatsApp send the caller's raw phrase plus the current question. Interpretation proposes facts; server validation accepts, rejects or asks for clarification. Confirmed corrections supersede previous fact events without deleting history. After a final readback, deterministic rules choose the likely cause, authority, documents and next steps.

## Tests

```bash
npm run check
npm test
npm run build
```

Tests cover case resume, one-question advancement, ambiguous answers, boolean UI values, correction history, rejected readbacks, guidance routing, the Vapi tool-response contract and WhatsApp message deduplication.

## Deployment

The production process runs under PM2 in single-process fork mode because SQLite and the in-memory live event stream must not be clustered. Example files are in `deploy/`. On the server:

```bash
mkdir -p /var/www/pension-restart/data
npm install --global pm2
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
sudo cp deploy/nginx.conf /etc/nginx/sites-available/pension-restart
sudo ln -s /etc/nginx/sites-available/pension-restart /etc/nginx/sites-enabled/pension-restart
sudo nginx -t
sudo systemctl reload nginx
```

Use Certbot (or your existing certificate workflow) for TLS before connecting provider webhooks. The exact production sequence is in `deploy/GO-LIVE.md`.

## Safety boundary

- Never request or store Aadhaar/PAN numbers, bank or government OTPs, PINs, passwords, CVVs or full bank-account/card numbers. Pension Restart's own six-digit access code is the only supported credential.
- Audio recording is disabled in the generated Vapi configuration; final transcript turns and case facts are stored.
- Public API keys are client-visible by design and must be restricted. Private provider keys stay server-side in `.env`.
- The admin cookie is signed, HTTP-only and secure in production.
- Six-digit case codes are short-lived hackathon access credentials, not strong long-term authentication. Incorrect attempts are throttled; do not publish screenshots containing real codes or expose sensitive case details solely from a code in a production deployment.
- Guidance is informational. The relevant pension authority makes the decision.
- The Codex bridge runs ephemerally with a strict schema and no application secrets in its environment. Caller text remains untrusted input; keep the local fallback enabled and do not repurpose this bridge as a general prompt endpoint.

## Built with Codex

This project was designed and implemented collaboratively with OpenAI Codex: architecture critique, pension-flow modelling, safety constraints, UI integration, Express/SQLite implementation, provider adapters, deterministic rule design, tests and deployment documentation. Product direction and final decisions were made by Yashdeep Jha. The repository deliberately keeps AI interpretation separate from deterministic case mutation so provider output remains auditable.

Original hero artwork was generated with OpenAI image generation. The legacy demonstration audio was generated with ElevenLabs and is no longer used by the live call screen.
