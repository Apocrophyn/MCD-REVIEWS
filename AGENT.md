# Agent guide

Receipt Relay is a local-first, mobile-first receipt intelligence application.

## Commands

- `npm run dev` starts the API on 8787 and Vite on 5173.
- `npm run check` runs type checking, tests, and the production build.
- `npm run build:preview` builds the static interface preview (sample data, no server).
- `npm run test:e2e` runs the browser workflow after Playwright Chromium is installed.
- `npm run survey:dry-run -- --code MKYW-ZM3N-L9VG --total 13.27` drives the live Food for Thoughts survey in a visible Chrome window, fills every page, and stops at the submit button. Add `--submit` only to really submit.

## Boundaries

- Keep every model credential server-only. Settings credentials are sealed with AES-256-GCM under `.data/settings.key` and only ever leave the server masked. Never expose one through Vite or browser code.
- Never read claude.ai cookies or scrape a browser session. The only accepted subscription credential is an OAuth token the user generated themselves with `claude setup-token`, pasted into Settings.
- Never report a survey as completed before answers were actually filled and a thank-you page was reached. Wording alone is not evidence.
- A practice run (`dryRun`) must stop at the submit control and post nothing.
- Background survey completion may use only user-confirmed answers after explicit terms acceptance. Serialize jobs, use human-scale pacing, stop on unknown required questions or security checks, and never bypass survey protections.
- Sample receipt data is confined to `src/lib/demo-backend.ts`, reachable only through the `VITE_PREVIEW_DEMO=1` preview build. Never import it from product code or set the flag in dev or production.
- Uploaded receipts are sensitive. Avoid logging content, use random filenames, and preserve deletion.
- All generated feedback must be constructed from claims whose `factKeys` exist in confirmed input.

## Architecture

- `src/`: React client and design system.
- `src/styles/app.css`: the Liquid Glass design system — tokens, the glass material recipe, and every screen's layout, in that order.
- `server/`: Express API, SQLite repository, providers, validation, and storage.
- `server/ai/catalog.ts`, `factory.ts`, `contract.ts`: provider list, credential-to-provider resolution, and the one receipt/feedback schema every provider answers.
- `server/settings.ts`: encrypted local settings, including the model credential.
- `server/survey/automation.ts`: private Playwright worker, matrix-aware field mapper, screenshot proof, and practice runs.
- `tests/`: unit, integration, and browser tests. `tests/survey-replica.test.ts` rebuilds the live survey's page shapes locally; `tests/live/` holds the supervised run against the real one.
- Never work around the survey host's rate limiting by changing address or identity. Slow down, back off, and report instead.
- `.data/`: runtime database and private uploads (gitignored).
