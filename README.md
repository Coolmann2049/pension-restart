# Pension Restart

Pension Restart is an independent, elderly-first pension guidance service. A caller can explain a pension problem in Hindi, English or Hinglish; the system gathers one answer at a time, keeps a correction-safe case record, and returns a deterministic guidance route. The same case can continue on the website, a Vapi telephone assistant or a Meta WhatsApp bot.

It is not a government service and never claims that a pension has been restarted.

## What works

- Express serves the public site, JSON APIs, provider webhooks and admin workspace.
- SQLite stores cases, channel identities, conversations, transcripts, append-only fact history and resolution plans.
- OpenAI Responses API interprets each raw answer into constrained facts; a conservative local fallback keeps development usable without a key.
- The deterministic guidance engine owns every route and resolution. The model cannot invent or directly mutate a case.
- Vapi supports a real inbound US number and browser microphone calls with live transcripts.
- Meta WhatsApp Cloud API supports buttons/lists, same-number continuity and case-code linking.
- Server-Sent Events update `/admin` as calls and messages arrive.
- A private `PR-XXXX-XXXXXX` code connects a case across channels. Same-channel callers resume by phone number, WhatsApp ID or browser cookie.

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

1. Create/select a Meta app with the WhatsApp product and add the production business phone number.
2. Gather the permanent system-user access token, phone-number ID, WABA ID and app secret.
3. Set the callback URL to `https://YOUR_DOMAIN/webhooks/whatsapp`, use `WHATSAPP_VERIFY_TOKEN`, and subscribe to `messages`.
4. Add all WhatsApp values to `.env` and restart the service.
5. The current guided intake replies inside WhatsApp's customer-service window. Configure the optional approved template variables only when proactive status notifications are enabled.

## Architecture

```text
Phone / browser voice ─ Vapi ─┐
Website ──────────────────────┼─ Express case service ─ SQLite ─ live admin SSE
WhatsApp ─ Meta Cloud API ────┘          │
                                         ├─ OpenAI constrained interpretation
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

Example files are in `deploy/`. On the server:

```bash
sudo mkdir -p /var/www/pension-restart/data
sudo chown -R www-data:www-data /var/www/pension-restart
sudo cp deploy/pension-restart.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pension-restart
sudo cp deploy/nginx.conf /etc/nginx/sites-available/pension-restart
sudo ln -s /etc/nginx/sites-available/pension-restart /etc/nginx/sites-enabled/pension-restart
sudo nginx -t
sudo systemctl reload nginx
```

Adjust the paths/user in the service file first. Use Certbot (or your existing certificate workflow) for TLS before connecting provider webhooks.

## Safety boundary

- Never request or store Aadhaar/PAN numbers, OTPs, PINs, passwords, CVVs or full bank-account/card numbers.
- Audio recording is disabled in the generated Vapi configuration; final transcript turns and case facts are stored.
- Public API keys are client-visible by design and must be restricted. Private provider keys stay server-side in `.env`.
- The admin cookie is signed, HTTP-only and secure in production.
- Case codes are bearer-like continuation secrets. Do not publish screenshots containing real codes.
- Guidance is informational. The relevant pension authority makes the decision.

## Built with Codex

This project was designed and implemented collaboratively with OpenAI Codex: architecture critique, pension-flow modelling, safety constraints, UI integration, Express/SQLite implementation, provider adapters, deterministic rule design, tests and deployment documentation. Product direction and final decisions were made by Yashdeep Jha. The repository deliberately keeps AI interpretation separate from deterministic case mutation so provider output remains auditable.

Original hero artwork was generated with OpenAI image generation. The legacy demonstration audio was generated with ElevenLabs and is no longer used by the live call screen.
