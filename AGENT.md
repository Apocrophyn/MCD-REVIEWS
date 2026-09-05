# Agent guide

Receipt Relay is a local-first, mobile-first receipt intelligence application.

## Commands

- `npm run dev` starts the API on 8787 and Vite on 5173.
- `npm run check` runs type checking, tests, and the production build.
- `npm run build:preview` builds the static interface preview (sample data, no server).
- `npm run test:e2e` runs the browser workflow after Playwright Chromium is installed.

## Boundaries

- Keep `ANTHROPIC_API_KEY` server-only. Never expose it through Vite or browser code.
- Never read claude.ai cookies or session tokens. Claude subscriptions do not include API use.
- Background survey completion may use only user-confirmed answers after explicit terms acceptance. Serialize jobs, use human-scale pacing, stop on unknown required questions or security checks, and never bypass survey protections.
- Sample receipt data is confined to `src/lib/demo-backend.ts`, reachable only through the `VITE_PREVIEW_DEMO=1` preview build. Never import it from product code or set the flag in dev or production.
- Uploaded receipts are sensitive. Avoid logging content, use random filenames, and preserve deletion.
- All generated feedback must be constructed from claims whose `factKeys` exist in confirmed input.

## Architecture

- `src/`: React client and design system.
- `src/styles/app.css`: the Liquid Glass design system — tokens, the glass material recipe, and every screen's layout, in that order.
- `server/`: Express API, SQLite repository, providers, validation, and storage.
- `server/survey/automation.ts`: private Playwright worker and conservative visible-field mapper.
- `tests/`: unit, integration, and browser tests.
- `.data/`: runtime database and private uploads (gitignored).
