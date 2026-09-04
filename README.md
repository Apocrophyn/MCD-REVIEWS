# Receipt Relay

A private, mobile-first receipt intelligence app. Upload up to three photos, require Claude to classify them as a transaction receipt before extraction, confirm the experience once, and let a private background browser complete the official survey while progress stays visible in Receipt Relay.

## Run locally

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. Set `ANTHROPIC_API_KEY` in `.env` to enable receipt recognition and feedback generation. Without a key, the app clearly disables these actions; it never substitutes sample receipt details.

The key must be an Anthropic Console API key; a Claude.ai subscription is not an API credential.

## Background survey completion

There is no extension and no survey tab to open. After confirming the receipt and experience:

1. Check **Run the official survey for me** to confirm the answers are honest and accept the survey terms.
2. Choose **Approve & run survey**.
3. Stay in Receipt Relay or use another page. The app polls a persistent local job and reports success, failure, or a question that needs attention.

The server launches an isolated Chromium window off-screen, enters the confirmed 12-digit receipt code, purchase amount, and answers, advances at a human-scale rate, and submits only after every required field is filled. It never takes over the user's browser, guesses an unknown required answer, or bypasses CAPTCHAs/security checks. Jobs are serialized and persisted in SQLite; interrupted jobs are marked failed instead of remaining stuck.

## Interface preview

`npm run build:preview` produces a static build of the client with
`VITE_PREVIEW_DEMO=1`. That flag — set nowhere else — loads
`src/lib/demo-backend.ts`, which answers the `/api` calls from memory so the
interface can be explored on static hosting without the local server, SQLite,
Claude, or the Playwright worker. The preview labels itself in the UI.

`npm run dev`, `npm run build`, and `npm start` never set the flag, and the
demo module is tree-shaken out of those bundles, so the real app still refuses
to substitute receipt details it did not read.

## Data and privacy

SQLite and uploaded images live under `.data/`, which is excluded from Git. Files use randomized names and are served only through receipt-scoped API routes. Delete a receipt from its detail view or clear local data by removing the specific `.data` folder while the app is stopped.

Clicking **Approve & run survey** is the explicit instruction to submit the confirmed answers. Receipt Relay reports the official site's completion response in the app.

## Verify

```bash
npm run check
npx playwright install chromium
npm run test:e2e
```

Automated tests use a test-only deterministic provider. That provider is never selected in development or production.
