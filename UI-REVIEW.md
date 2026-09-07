# Pension Restart - UI/UX redesign

A researched redesign of the existing service for the Build What Moves India presentation. The original ZIP in Downloads is unchanged. The extracted project is in this folder.

## What changed

- A consistent deep-blue identity, a new restart/check mark, Instrument Sans headings and Atkinson Hyperlegible reading text.
- A shorter homepage built around an illustrative bilingual conversation, three clear starting needs, and the actual guidance journey. The previous generated pensioner illustration, decorative gradients and pill navigation are no longer used.
- Focused online questions, quieter page headers, readable progress, clear answer choices, persistent error/retry feedback and a printable final guidance plan. Final confirmation presents the available case facts as a readable list with familiar answer labels, instead of a long machine-style heading.
- A redesigned voice session with legible status, transcript and microphone controls, plus useful alternatives when calling is unavailable.
- Refined case lookup, life-certificate options, family assistance, document demonstrations, help centre, case history and operations workspace.
- Tablet/mobile navigation, keyboard case lookup, linked FAQ disclosures, meaningful route titles, visible focus and persistent larger text.
- Fixed an overlapping click listener that let online choices rerender before their request finished. The UI now locks both answer and correction forms while saving and restores the user's input on failure.
- Responsive layouts at 320, 390, 900 and 1440 CSS pixels. Important public task screens also reflow at 200% text size.
- Fonts are served locally, with their license notices in `assets/fonts`. The design does not need Google Fonts at runtime.

## Research and design decisions

[W3C's guidance for older users](https://www.w3.org/WAI/older-users/) informed the contrast, control size, reading rhythm, reduced distraction and keyboard treatment. [GOV.UK's button guidance](https://design-system.service.gov.uk/components/button/) informed the clear main action. [GOV.UK's form guidance](https://www.gov.uk/service-manual/design/form-structure) supports the existing one-question-at-a-time intake.

The palette, type pairing and bilingual conversation composition are design decisions specific to this service, not requirements from those sources. The interface retains its independent-service statement and explicit demonstration labels. No official affiliation, fabricated outcome metrics or new pension-policy claims were added.

## Core logic preserved

Compared directly against the supplied ZIP: `server.js`, all `src/` files, `admin.js`, `package.json`, `package-lock.json`, the existing tests and `.env` are unchanged (18 files). Guidance rules, database services, provider adapters, API routes/payloads, answer values and original case/demo state are preserved. No dependencies were added to the application.

Changes are confined to HTML, CSS, frontend presentation and interaction handling, identity/font assets and these notes. The existing recorded-call assets remain available in the project.

## Verification

| Check | Result |
| --- | --- |
| JavaScript syntax (`npm run check`) | Passed |
| Existing test suite (`npm test`, local interpreter) | 18 passed |
| Browser bundle (`npm run build`) | Passed |
| All 12 public hash routes at four viewport widths | No horizontal overflow, broken ARIA references or browser JavaScript errors |
| axe scans of 12 public routes at desktop and 320px | Zero violations under the selected WCAG A/AA rules |
| Operations login/workspace at desktop, tablet and mobile | No overflow; zero axe violations in checked states |
| Repeated answer/correction clicks | One request; controls locked while saving |
| Failed correction / failed initial load | Input retained; controls restored / persistent Retry shown |
| Case lookup | Enter submission, required field, pending/result announcements work |
| A+, menu, FAQ, same-page updates | Preference persists; Escape/outside dismissal works; linked panels; scroll retained |
| Mocked browser voice session | Start, transcript, mute, end and completion actions work |
| Final confirmation review list | 13 fields displayed with readable labels; no overflow at 320, 390 or 1440px; zero axe violations |
| Real local online intake, no API mocks | Fictional case completed; guidance displayed; native print invoked; same case retrieved in a fresh browser by code |
| 200% text enlargement on seven main public routes | No horizontal overflow at 320px or 1440px |

Automated accessibility checks do not constitute a complete WCAG certification. Real telephone calls and WhatsApp deliveries were not sent during this UI review. Provider code and configuration remain unchanged.

## Run and review

The currently running UI preview is at `http://localhost:3100`. It uses a separate temporary database and the local interpreter, with external voice and WhatsApp providers disabled for testing. Unavailable calling states in this preview are intentional and do not change the supplied `.env`.

To run the extracted project with your existing configuration:

```bash
npm ci
npm run build
npm start
```

Run those commands from this project folder. Use the port configured in your `.env`; the original default is `http://localhost:3000`. Operations is available at `/admin`. The existing README contains full provider and deployment setup instructions.

The accompanying `build-what-moves-india-ui-improved.zip` is a clean source package. It excludes `.env`, existing case databases, Git history, dependencies and archived reference materials. The extracted working folder retains your original configuration and data. When using the clean ZIP, copy your existing `.env` into the extracted source before starting, or configure a new one from `.env.example`.
