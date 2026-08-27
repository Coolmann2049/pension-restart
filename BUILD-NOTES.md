# Pension Restart — Build notes

## Completed phases

1. **Foundation** — Static, dependency-free SPA; hash routing; deterministic local state.
2. **Public website** — Long-form elderly-first homepage, pension education, safety guidance and life-certificate routes.
3. **Guided call** — Scripted bilingual ElevenLabs recording, exact timestamp-synchronized bubbles and deterministic case extraction.
4. **Online alternative** — Six-step form with review branch and plain-language choices.
5. **Documents** — Synthetic filename attachments, receipt state and explicit no-upload disclosure.
6. **Case experience** — Timeline, evidence, review response, route choice, synthetic successful outcome and JSON export.
7. **Supporting views** — Family dashboard, status lookup, help centre and prototype disclosure.
8. **QA and polish** — Desktop/mobile browser testing, larger-text mode, responsive navigation, FAQ state, route audit and image compression.

## Deterministic demo fixture

- Case: `PR-2608-1042`
- Pensioner: Kamla Devi
- Last pension credit: November 2025
- First missing credit: December 2025
- Suggested possibility: missed annual life certificate, explicitly unconfirmed
- Requested demo references: synthetic PPO first page and redacted pension-credit record

## Judge path

1. Select **Simulate a call** on the homepage.
2. Start the transcript, then use the skip control if time is short.
3. Open the written summary and confirm it.
4. Attach the PPO and pension-record demo files.
5. Send them, open the case, and reveal the simulated review response.
6. Compare official routes or reveal the clearly labelled synthetic successful outcome.
7. Open **About** to show exactly what is working, simulated and future work.

## Production boundary

The prototype does not use OpenAI Realtime, speech recognition, telephony, document parsing, email delivery or government integrations. Those are deliberately deferred. Its call demonstration uses one pre-generated ElevenLabs MP3 and fixed transcript timestamps; no audio is recorded or interpreted. The working submission demonstrates the proposed journey and its safety boundaries without pretending that infrastructure exists.
