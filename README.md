# Receipt Relay

A private, mobile-first receipt intelligence app. Upload up to three photos, require Claude to classify them as a transaction receipt before extraction, confirm the experience once, and let a private background browser complete the official survey while progress stays visible in Receipt Relay.

## Run locally

```bash
npm install
npx playwright install chromium
npm run dev
```

Open http://127.0.0.1:5173 and go to **Settings** to connect a model. Without one, receipt analysis and feedback generation are disabled and clearly labelled — the app never substitutes sample receipt details.

## Connecting a model

Settings accepts any one of these. The credential is verified with a single live request before it is saved, then sealed with AES-256-GCM under `.data/settings.key`. It is never sent to the browser, never written to the bundle, and only ever read back masked.

| Provider | Credential | Reads receipt photos |
| --- | --- | --- |
| Claude — Anthropic API key | `sk-ant-api…` from the Anthropic Console | Yes |
| Claude — Pro/Max subscription | `sk-ant-oat…` from `claude setup-token` | Yes |
| OpenAI (ChatGPT API) | `sk-…` from platform.openai.com | Yes |
| DeepSeek | `sk-…` from platform.deepseek.com | No — text only, feedback writing only |
| OpenRouter (Meta Llama and 300+ others) | `sk-or-…` | Yes |
| Groq (fast Llama hosting) | `gsk_…` | Yes |
| Custom OpenAI-compatible endpoint | Your bearer token + base URL | Depends on the model |

The model id is editable for every provider, so a newer model can be used without a code change. DeepSeek's chat models cannot see images, so Settings says so plainly and receipt analysis stays disabled while it is selected; it can still write the feedback draft from details you enter yourself.

To use a Claude subscription rather than Console billing, install the Claude Code CLI, run `claude setup-token`, sign in with the account holding your Pro or Max plan, and paste the token it prints. That token is yours and is issued by Anthropic's own tooling; Receipt Relay never touches claude.ai cookies or scrapes a browser session. Usage counts against your plan limits.

`ANTHROPIC_API_KEY` in `.env` still works as a fallback for headless setups, and is used only when nothing is saved in Settings.

## Background survey completion

There is no extension and no survey tab to open. After confirming the receipt and experience:

1. Check **Run the official survey for me** to confirm the answers are honest and accept the survey terms.
2. Choose **Approve & run survey**.
3. Stay in Receipt Relay or use another page. The app polls a persistent local job and reports success, failure, or a question that needs attention.

The server launches an isolated Chromium window off-screen, types the confirmed 12-character receipt code and purchase amount key by key, answers the grid questions from your confirmed ratings, pauses for a few seconds between pages, and submits only after every required field is filled. It never takes over your browser, guesses an unknown required answer, or bypasses CAPTCHAs or security checks. Jobs are serialized and persisted in SQLite; interrupted jobs are marked failed instead of remaining stuck.

**Receipt codes.** McDonald's UK prints a 12-character alphanumeric code under "Tell us how we did", grouped as `XXXX-XXXX-XXXX` — for example `MKYW-ZM3N-L9VG`. It is not 12 digits.

**Proof of submission.** Every finished run stores a full-page screenshot of the page it ended on and shows it in the app, together with a page-by-page record of what the survey asked and which answer was given. A run is only reported as completed when answers were actually filled *and* a thank-you page was reached — wording alone never counts.

**Practice runs.** *Practice run (stops before submitting)* does everything a real run does but halts at the submit button, so a receipt code can be rehearsed without being spent. The receipt stays ready to submit for real afterwards.

## Testing the real survey by hand

```bash
npm run survey:dry-run -- --code MKYW-ZM3N-L9VG --total 13.27
```

Opens a visible Chrome window you can watch, walks the live survey, screenshots every page into `.context/survey-dry-run/`, prints the question-by-question structure, and stops at the submit button. Add `--submit` only when you actually intend to submit.

Note that the survey host serves nothing at all to a headless browser and rate-limits rapid repeat sessions, so runs are headed and deliberately paced.

## Interface preview

`npm run build:preview` produces a static build of the client with
`VITE_PREVIEW_DEMO=1`. That flag — set nowhere else — loads
`src/lib/demo-backend.ts`, which answers the `/api` calls from memory so the
interface can be explored on static hosting without the local server, SQLite,
a model, or the Playwright worker.

The preview shows the layout and nothing more. It cannot read a receipt and has
no browser to run a survey with, so it says so instead of pretending: uploading
an image and pressing analyse reports that analysis is unavailable, and starting
a survey reports that no background browser exists. It never fabricates an
extraction or a completed survey.

`npm run dev`, `npm run build`, and `npm start` never set the flag, and the
demo module is tree-shaken out of those bundles, so the real app still refuses
to substitute receipt details it did not read.

## Data and privacy

SQLite, uploaded images, and survey screenshots live under `.data/`, which is excluded from Git. Files use randomized names and are served only through receipt-scoped API routes. Delete a receipt from its detail view or clear local data by removing the specific `.data` folder while the app is stopped.

Clicking **Approve & run survey** is the explicit instruction to submit the confirmed answers. Receipt Relay reports the official site's completion response in the app.

## Verify

```bash
npm run check
npx playwright install chromium
npm run test:e2e
```

Automated tests use a test-only deterministic provider. That provider is never selected in development or production.
