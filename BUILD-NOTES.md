# Pension Restart - implementation notes

## Completed product layers

1. Public, responsive, elderly-first pension education and safety experience.
2. Express runtime serving both the frontend and JSON/webhook APIs.
3. SQLite data model for cases, channel identities, conversations, raw transcript turns, fact events and deterministic resolutions.
4. One-question-at-a-time intake shared by web, Vapi and Meta WhatsApp.
5. Constrained OpenAI answer interpretation with conservative local fallback.
6. Append-only corrections: prior values remain visible as superseded events.
7. Deterministic routing across central civil, defence, railway, EPS-95, NPS/UPS/APY, state-government, social-assistance, private-annuity and employer-superannuation families.
8. Vapi phone/browser-call assistant generator and webhook tool contract.
9. Meta WhatsApp webhook verification, interactive messages and same-number continuation.
10. Password-protected live operations panel driven by Server-Sent Events.
11. Cross-channel case-code claiming plus automatic same-channel reconnection.
12. Nginx/systemd deployment examples and automated state-machine/provider-contract tests.

## Current boundary

Pension Restart gathers information and prepares guidance. It does not authenticate a pensioner, generate a Digital Life Certificate, submit a grievance, inspect an official pension record or confirm a payment. The document upload/review screens inherited from the original submission remain synthetic until a reviewed storage and retention design is approved.

## Two-minute judge path

1. Start `/admin` on one side of the screen.
2. Call the Vapi number (or use the browser microphone fallback).
3. Answer in Hinglish and show each raw phrase, interpreted fact and progress event appearing live.
4. Give an ambiguous pension-family answer and show the assistant clarify rather than guess.
5. Correct one fact during final readback and show the superseded value in history.
6. Confirm the readback and show the deterministic route and official escalation authority.
7. Open WhatsApp, send the case code, and continue the same case.
8. Close on the public safety/independence statement: guidance, no government impersonation, no sensitive credentials.

## Remaining provider-dependent verification

- Apply the assistant payload to the actual Vapi organization and place a real inbound call.
- Validate Hindi/Hinglish speech recognition against the selected Vapi transcriber and voice.
- Complete Meta webhook verification and send/receive tests with the production WhatsApp number.
- Verify public-key origin restrictions and rotate any credential shown during the demo.
